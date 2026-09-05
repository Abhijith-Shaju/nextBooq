const mongoose = require('mongoose');
const Reservation = require('../../models/Reservation');
const CafeCustomer = require('../../models/CafeCustomer');
const { transitionState } = require('../../services/stateMachine');
const { findSeatedOccupancyConflict } = require('../../services/tableOccupancyService');
const { suggestAlternateTable } = require('../../services/allocationEngine');
const { assignReservationToTable } = require('../../services/tableAssignmentService');
const { localTimeToUTC, getLocalTimeDetails } = require('../../utils/operatingHours');
const { BadRequestError, NotFoundError } = require('../../utils/errors');
const { logAuditEvent } = require('../../services/auditService');

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
      .sort({ start_time: 1 })
      .lean();

    const withGuestHistory = await attachGuestHistory(cafeId, reservations);

    res.status(200).json({
      status: 'success',
      count: withGuestHistory.length,
      data: withGuestHistory,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Attaches each guest's visit and no-show history at this cafe to the
 * reservations being returned.
 *
 * stateMachine.js has always accumulated these counters (COMPLETED bumps
 * total_visits, NO_SHOW bumps total_no_shows), but nothing ever read them
 * back, so the data sat in CafeCustomer where no host could see it. The
 * Privacy Policy justifies collecting it as "letting a cafe recognise repeat
 * guests and manage no-shows" -- a purpose that was not real while the
 * numbers were invisible. Surfacing them here is what makes that true.
 *
 * One query for the whole page rather than one per reservation: a busy
 * service can render fifty rows, and the same guest often appears more than
 * once in a day.
 */
const attachGuestHistory = async (cafeId, reservations) => {
  const userIds = [
    ...new Set(
      reservations
        .map((r) => (r.user_id && (r.user_id._id || r.user_id))?.toString())
        .filter(Boolean)
    ),
  ];
  if (userIds.length === 0) return reservations;

  const records = await CafeCustomer.find({ cafe_id: cafeId, user_id: { $in: userIds } })
    .select('user_id total_visits total_no_shows')
    .lean();

  const byUserId = new Map(records.map((c) => [c.user_id.toString(), c]));

  return reservations.map((r) => {
    const key = (r.user_id && (r.user_id._id || r.user_id))?.toString();
    const record = key ? byUserId.get(key) : null;
    return {
      ...r,
      // Always present, so the client never has to distinguish "no history
      // yet" from "the server did not send it".
      guest_history: {
        total_visits: record?.total_visits ?? 0,
        total_no_shows: record?.total_no_shows ?? 0,
      },
    };
  });
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

/**
 * The cafe's own refunds-owed queue.
 *
 * nextBooq never moves money out of a cafe's Razorpay account, so a
 * cancellation cannot issue the refund itself -- it flags the reservation
 * instead (see stateMachine.js). Without somewhere for staff to see that
 * flag, the published promise that a cancelled booking is refunded has
 * nothing behind it: the money just sits there until somebody happens to
 * notice.
 */
const getRefundsOwed = async (req, res, next) => {
  try {
    const reservations = await Reservation.find({
      cafe_id: req.tenantId,
      'payment_data.requires_manual_refund': true,
    })
      .populate('user_id', 'name email phone')
      .sort({ updated_at: -1 })
      .limit(200)
      .lean();

    res.status(200).json({
      status: 'success',
      data: reservations.map((r) => ({
        _id: r._id,
        status: r.status,
        start_time: r.start_time,
        party_size: r.party_size,
        guest: r.user_id,
        amount: r.payment_data?.amount ?? 0,
        currency: r.payment_data?.currency || 'INR',
        payment_id: r.payment_data?.payment_id || null,
        cancelled_at: r.cancelled_at,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clears the refunds-owed flag once staff have refunded from Razorpay.
 *
 * Deliberately records who marked it settled: this is the point where the
 * cafe asserts a guest has been paid back, and that assertion is exactly what
 * a later dispute turns on.
 */
/**
 * Refunds this cafe has already settled.
 *
 * Settling an entry removes it from the owed queue, which is right for a
 * worklist but leaves the reference -- the only evidence the guest was
 * actually paid back -- readable nowhere but the database. If a guest ever
 * disputes a refund, the person who has to answer them should not need a
 * mongo shell to do it.
 *
 * Same permission as reading the owed queue: this is a read of the same
 * facts, just after the fact.
 */
const getRefundsSettled = async (req, res, next) => {
  try {
    const reservations = await Reservation.find({
      cafe_id: req.tenantId,
      'payment_data.refund_reference': { $nin: [null, ''] },
    })
      .populate('user_id', 'name email phone')
      .sort({ 'payment_data.refund_settled_at': -1 })
      .limit(50)
      .lean();

    res.status(200).json({
      status: 'success',
      data: reservations.map((r) => ({
        _id: r._id,
        status: r.status,
        start_time: r.start_time,
        guest: r.user_id,
        amount: r.payment_data?.amount ?? 0,
        currency: r.payment_data?.currency || 'INR',
        payment_id: r.payment_data?.payment_id || null,
        refund_reference: r.payment_data?.refund_reference || null,
        refund_settled_at: r.payment_data?.refund_settled_at || null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

const MAX_REFUND_REFERENCE_LENGTH = 100;

const markRefundSettled = async (req, res, next) => {
  try {
    const { resId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(resId)) {
      throw new BadRequestError('Invalid reservation ID');
    }

    // Clearing an entry asserts that a guest has had their money back, and
    // nothing in nextBooq can verify that -- the refund happens in the cafe's
    // own Razorpay account. Requiring a reference is what makes the claim
    // checkable afterwards instead of being somebody's unsupported word.
    // Deliberately not pattern-matched to `rfnd_`: a refund settled by UPI or
    // bank transfer has a perfectly good reference of a different shape.
    const reference =
      typeof req.body?.refund_reference === 'string' ? req.body.refund_reference.trim() : '';
    if (!reference) {
      throw new BadRequestError(
        'refund_reference is required — record the Razorpay refund id, or the reference of however the guest was paid back'
      );
    }
    if (reference.length > MAX_REFUND_REFERENCE_LENGTH) {
      throw new BadRequestError(
        `refund_reference must be ${MAX_REFUND_REFERENCE_LENGTH} characters or fewer`
      );
    }

    const reservation = await Reservation.findOneAndUpdate(
      {
        _id: resId,
        cafe_id: req.tenantId,
        'payment_data.requires_manual_refund': true,
      },
      {
        $set: {
          'payment_data.requires_manual_refund': false,
          'payment_data.refund_reference': reference,
          'payment_data.refund_settled_at': new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!reservation) {
      throw new NotFoundError('No outstanding refund found for this reservation');
    }

    await logAuditEvent({
      cafeId: req.tenantId,
      entityType: 'Reservation',
      entityId: reservation._id,
      action: 'REFUND_MARKED_SETTLED',
      afterState: {
        amount: reservation.payment_data?.amount ?? 0,
        payment_id: reservation.payment_data?.payment_id || null,
        refund_reference: reference,
      },
      performedByUserId: req.user._id,
    });

    res.status(200).json({ status: 'success', data: { reservation_id: reservation._id } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDailyManifest,
  updateReservationStatus,
  assignTable,
  getRefundsOwed,
  getRefundsSettled,
  markRefundSettled,
};
