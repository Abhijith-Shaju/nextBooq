const mongoose = require('mongoose');
const Reservation = require('../../models/Reservation');
const { transitionState } = require('../../services/stateMachine');
const { findSeatedOccupancyConflict } = require('../../services/tableOccupancyService');
const { suggestAlternateTable } = require('../../services/allocationEngine');
const { assignReservationToTable } = require('../../services/tableAssignmentService');
const { localTimeToUTC, getLocalTimeDetails } = require('../../utils/operatingHours');
const { BadRequestError, NotFoundError } = require('../../utils/errors');

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The day after `dateKey`, as a YYYY-MM-DD string. Timezone-independent —
// operates on the plain calendar date, same convention as
// operatingHours.js's dayOfWeekForDateKey.
const nextDateKey = (dateKey) => {
  const next = new Date(`${dateKey}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

const getDailyManifest = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const timeZone = req.cafe?.timezone || 'UTC';
    // Defaults to the café's own "today" rather than returning every
    // reservation the café has ever taken when the caller omits `date` --
    // the frontend always passes one explicitly, so this only changes
    // behavior for a caller (a script, a stray API client) that doesn't (L-09).
    const date = req.query.date || getLocalTimeDetails(new Date(), timeZone).dateKey;

    if (!DATE_KEY_PATTERN.test(date)) {
      throw new BadRequestError('date must be a YYYY-MM-DD string');
    }
    // The manifest is "today" in the café's own local calendar day, not
    // UTC's — matching every other place this app resolves a booking
    // date (e.g. availabilityController.js). Hardcoding UTC boundaries
    // here split the evening service across two pages for any café not
    // on UTC (M-03).
    const startOfDay = localTimeToUTC(date, '00:00', timeZone);
    const endOfDayExclusive = localTimeToUTC(nextDateKey(date), '00:00', timeZone);
    const dateQuery = {
      start_time: { $gte: startOfDay, $lt: endOfDayExclusive },
    };

    const reservations = await Reservation.find({
      cafe_id: cafeId,
      ...dateQuery,
      // A HOLD whose expiry has passed but hasn't been swept to EXPIRED yet
      // (see reservationExpiryService.js) shouldn't clutter the host's
      // manifest as if it were still a live hold.
      $or: [{ status: { $ne: 'HOLD' } }, { hold_expires_at: { $gt: new Date() } }],
    })
      .populate('user_id', 'name email phone')
      .populate('table_ids', 'table_number capacity')
      .sort({ start_time: 1 });

    res.status(200).json({
      status: 'success',
      count: reservations.length,
      data: reservations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Builds the 409 body for a seating occupancy conflict, including an
 * auto-suggested free table when one exists so the host can reassign instead
 * of force-seating two parties onto the same table. The `alternate` key is
 * omitted entirely when nothing else fits — the UI hides the option rather
 * than offering a dead end.
 */
const buildOccupancyConflictPayload = async (cafeId, reservation, conflict) => {
  const thisReservationTableIds = new Set(reservation.table_ids.map((id) => id.toString()));
  const sharedTableNumbers = conflict.table_ids
    .filter((t) => thisReservationTableIds.has(t._id.toString()))
    .map((t) => t.table_number);
  const guestName = conflict.user_id?.name || 'Guest';

  const alternate = await suggestAlternateTable(cafeId, reservation);

  return {
    status: 'fail',
    statusCode: 409,
    message: `Table is currently occupied by ${guestName}`,
    error: {
      code: 'TABLE_OCCUPIED',
      message: `Table is currently occupied by ${guestName}`,
    },
    conflict: {
      reservationId: conflict._id,
      guestName,
      tableNumbers: sharedTableNumbers,
      seatedAt: conflict.seated_at,
    },
    ...(alternate && {
      alternate: {
        tableNumbers: alternate.tables.map((t) => t.table_number),
        totalCapacity: alternate.totalCapacity,
      },
    }),
  };
};

const updateReservationStatus = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const { resId } = req.params;
    const { status, version, force, reassign } = req.body;

    if (!resId || resId === 'undefined' || !mongoose.Types.ObjectId.isValid(resId)) {
      throw new BadRequestError('Invalid or missing reservation ID');
    }

    if (!status || version === undefined) {
      throw new BadRequestError('status and version token (__v) are required');
    }

    // Seating is the moment a table becomes physically occupied — warn (but
    // don't hard-block, per product decision) if another reservation is
    // already SEATED at a table this one is about to use. From that warning
    // the host can either force through (`force: true`) or move this party to
    // a free table the system picks for them (`reassign: true`).
    let tableIdsUpdate = null;

    if (status === 'SEATED' && !force) {
      const reservation = await Reservation.findOne({ _id: resId, cafe_id: cafeId });
      if (!reservation) {
        throw new NotFoundError('Reservation not found');
      }

      const conflict = await findSeatedOccupancyConflict(cafeId, reservation.table_ids, resId);

      if (conflict) {
        if (!reassign) {
          return res.status(409).json(
            await buildOccupancyConflictPayload(cafeId, reservation, conflict)
          );
        }

        // Re-resolve the alternate at confirm time rather than trusting the
        // one shown in the dialog — another host may have taken it while this
        // one was deciding.
        const alternate = await suggestAlternateTable(cafeId, reservation);
        if (!alternate) {
          return res.status(409).json(
            await buildOccupancyConflictPayload(cafeId, reservation, conflict)
          );
        }

        tableIdsUpdate = alternate.tableIds;
      }
      // No conflict: seat on the originally assigned tables, even when the
      // host asked to reassign — whatever was blocking the table has cleared.
    }

    const updatedReservation = await transitionState({
      reservationId: resId,
      tenantId: cafeId,
      targetStatus: status,
      expectedVersion: version,
      updatedByUserId: req.user._id,
      tableIdsUpdate,
    });

    res.status(200).json({
      status: 'success',
      data: updatedReservation,
    });
  } catch (error) {
    next(error);
  }
};

const assignTable = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const { resId } = req.params;
    const { table_id, version } = req.body;

    if (!resId || resId === 'undefined' || !mongoose.Types.ObjectId.isValid(resId)) {
      throw new BadRequestError('Invalid or missing reservation ID');
    }
    if (!table_id || version === undefined) {
      throw new BadRequestError('table_id and version token (__v) are required');
    }

    const updatedReservation = await assignReservationToTable({
      reservationId: resId,
      tenantId: cafeId,
      tableId: table_id,
      expectedVersion: version,
      updatedByUserId: req.user._id,
    });

    res.status(200).json({
      status: 'success',
      data: updatedReservation,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDailyManifest,
  updateReservationStatus,
  assignTable,
};
