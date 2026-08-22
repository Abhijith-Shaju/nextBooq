const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const Table = require('../models/Table');
const { BadRequestError, NotFoundError, ConflictError, UnprocessableEntityError } = require('../utils/errors');
const { getBlockedTableIds } = require('./allocationEngine');
const { getSeatedTableIds } = require('./tableOccupancyService');
const { logAuditEvent } = require('./auditService');
const { notifyCafeRoom } = require('./socketService');

// HOLD/PENDING_PAYMENT haven't committed to a real booking yet (still mid
// checkout), and every other status is terminal — a staff-chosen table only
// makes sense for a reservation that's actually going to be seated.
const ASSIGNABLE_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'SEATED'];

// A party that has arrived will occupy the table from NOW, whatever their
// booked slot says, so the conflict window has to cover when they will
// actually be sitting there.
const PRESENT_STATUSES = ['CHECKED_IN', 'SEATED'];

const OCC_MESSAGE =
  'OCC Conflict: this reservation has already been modified by someone else. Please refresh and try again.';

/**
 * A conflict the host can act on immediately — the table simply isn't free —
 * as opposed to a stale-version conflict, where the only useful advice is to
 * refresh. Tagging it lets the client show this wording verbatim instead of a
 * generic "something changed" toast, the same way TABLE_OCCUPIED is handled
 * on the seating path.
 */
const tableUnavailableError = (message) => {
  const error = new ConflictError(message);
  error.name = 'TABLE_UNAVAILABLE';
  return error;
};

const isStandaloneMongoError = (error) =>
  error.code === 20 ||
  error.codeName === 'IllegalOperation' ||
  (error.message && error.message.includes('replica set'));

/**
 * The span of time the table must be free for.
 *
 * For a party that hasn't arrived yet, that is simply their booked slot.
 * Widening it — as the seat-now conflict flow deliberately does — would block
 * a host from pre-assigning an evening booking to any table that happens to
 * have a lunch booking, because the widened span swallows everything between
 * now and that reservation's end.
 *
 * Once a party is CHECKED_IN or SEATED they are physically here, so the span
 * widens to the union of their booked slot and "starting now", matching
 * suggestAlternateTable's reasoning (see allocationEngine.js).
 */
const resolveConflictWindow = (reservation) => {
  if (!PRESENT_STATUSES.includes(reservation.status)) {
    return { windowStart: reservation.start_time, windowEnd: reservation.end_time };
  }

  const now = new Date();
  const duration = reservation.end_time.getTime() - reservation.start_time.getTime();
  const nowWindowEnd = new Date(now.getTime() + duration);

  return {
    windowStart: now < reservation.start_time ? now : reservation.start_time,
    windowEnd: reservation.end_time > nowWindowEnd ? reservation.end_time : nowWindowEnd,
  };
};

/**
 * Validates a host's chosen table and moves the reservation onto it.
 *
 * Runs against an optional session so the caller can execute it inside a
 * transaction; every read is session-scoped so it sees a consistent snapshot.
 */
const performAssignment = async ({
  reservationId,
  tenantId,
  tableId,
  expectedVersion,
  updatedByUserId,
  session = null,
}) => {
  const withSession = (query) => (session ? query.session(session) : query);

  const reservation = await withSession(Reservation.findOne({ _id: reservationId, cafe_id: tenantId }));
  if (!reservation) {
    throw new NotFoundError('Reservation not found');
  }

  if (expectedVersion !== undefined && expectedVersion !== null && reservation.__v !== expectedVersion) {
    throw new ConflictError(OCC_MESSAGE);
  }

  if (!ASSIGNABLE_STATUSES.includes(reservation.status)) {
    throw new UnprocessableEntityError(
      `Cannot assign a table to a reservation in state ${reservation.status}`
    );
  }

  const table = await withSession(Table.findOne({ _id: tableId, cafe_id: tenantId, is_deleted: false }));
  if (!table) {
    throw new NotFoundError('Table not found');
  }
  if (table.status !== 'active') {
    throw new BadRequestError('This table is out of service');
  }

  if (reservation.party_size > table.capacity) {
    throw new UnprocessableEntityError(
      `This table seats ${table.capacity}, but the reservation is for a party of ${reservation.party_size}`
    );
  }

  const { windowStart, windowEnd } = resolveConflictWindow(reservation);

  const blockedBySchedule = await getBlockedTableIds(
    tenantId,
    windowStart,
    windowEnd,
    session,
    reservation._id
  );
  const blockedBySeating = await getSeatedTableIds(tenantId, reservation._id, session);

  const tableIdStr = table._id.toString();
  if (blockedBySchedule.has(tableIdStr) || blockedBySeating.has(tableIdStr)) {
    throw tableUnavailableError("This table isn't free for this reservation's time.");
  }

  // Touch the target table inside the transaction so that two hosts assigning
  // two DIFFERENT reservations to the SAME table collide at the document
  // level (WiredTiger write conflict) and one is forced to retry. The
  // reservation-level OCC guard below cannot catch that case on its own —
  // those two writes land on different reservation documents, so neither
  // invalidates the other's version. Same mechanism bookingService uses to
  // serialize concurrent allocations.
  await withSession(Table.updateOne({ _id: table._id, cafe_id: tenantId }, { $inc: { __v: 1 } }));

  const beforeTableIds = reservation.table_ids.map((id) => id.toString());

  const updated = await withSession(
    Reservation.findOneAndUpdate(
      { _id: reservationId, cafe_id: tenantId, __v: expectedVersion },
      {
        $set: { table_ids: [table._id] },
        $inc: { __v: 1 },
        // Not a status change — the entry records who moved the party and
        // when, so a table move is visible on the reservation's own timeline
        // rather than happening invisibly.
        $push: {
          status_history: {
            status: reservation.status,
            timestamp: new Date(),
            updated_by: updatedByUserId,
          },
        },
      },
      { returnDocument: 'after', runValidators: true }
    )
  );

  if (!updated) {
    throw new ConflictError(OCC_MESSAGE);
  }

  return { reservation: updated, beforeTableIds, afterTableIds: [tableIdStr] };
};

/**
 * Lets a host point a reservation at a specific table they picked from the
 * floorplan — distinct from suggestAlternateTable (allocationEngine.js),
 * which the system uses to auto-pick a table during a seating conflict. Here
 * the host is the one choosing, so this only has to validate their choice:
 * capacity fits, and the table is genuinely free for the window this
 * reservation will occupy.
 */
const assignReservationToTable = async ({
  reservationId,
  tenantId,
  tableId,
  expectedVersion,
  updatedByUserId = null,
}) => {
  const maxRetries = 3;
  let attempt = 0;
  let outcome = null;

  while (attempt < maxRetries) {
    attempt++;
    let session;

    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch (sessionErr) {
      if (isStandaloneMongoError(sessionErr)) {
        console.warn(
          '[MONGOOSE WARN] Multi-document transactions not supported by standalone MongoDB instance. Using non-transactional fallback.'
        );
        outcome = await performAssignment({
          reservationId,
          tenantId,
          tableId,
          expectedVersion,
          updatedByUserId,
        });
        break;
      }
      throw sessionErr;
    }

    try {
      outcome = await performAssignment({
        reservationId,
        tenantId,
        tableId,
        expectedVersion,
        updatedByUserId,
        session,
      });

      await session.commitTransaction();
      session.endSession();
      break;
    } catch (error) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (_) {}

      if (isStandaloneMongoError(error)) {
        console.warn(
          '[MONGOOSE WARN] Multi-document transactions not supported by standalone MongoDB instance. Using non-transactional fallback.'
        );
        outcome = await performAssignment({
          reservationId,
          tenantId,
          tableId,
          expectedVersion,
          updatedByUserId,
        });
        break;
      }

      const isTransientError =
        Object.prototype.hasOwnProperty.call(error, 'errorLabels') &&
        error.errorLabels.includes('TransientTransactionError');
      const isWriteConflict = error.code === 112 || error.codeName === 'WriteConflict';

      if ((isTransientError || isWriteConflict) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 50;
        console.warn(
          `[MVCC CONFLICT] Retrying table assignment attempt ${attempt}/${maxRetries} after ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Losing the race repeatedly means another host took this table first —
      // report it the same way an availability conflict is reported, so the
      // host is told to pick another table rather than shown a stack trace.
      if (isTransientError || isWriteConflict) {
        throw tableUnavailableError(
          'This table was just taken by someone else. Please pick another table.'
        );
      }

      throw error;
    }
  }

  const { reservation, beforeTableIds, afterTableIds } = outcome;

  // Logged after commit: the audit service opens its own write and swallows
  // its own failures, so it must never be able to roll back a completed move.
  await logAuditEvent({
    cafeId: tenantId,
    entityType: 'Reservation',
    entityId: reservation._id,
    action: 'ASSIGN_TABLE',
    beforeState: { table_ids: beforeTableIds },
    afterState: { table_ids: afterTableIds },
    performedByUserId: updatedByUserId,
  });

  notifyCafeRoom(tenantId.toString(), 'reservation_updated', {
    reservationId: reservation._id.toString(),
    status: reservation.status,
  });

  return reservation.populate('table_ids', 'table_number capacity');
};

module.exports = { assignReservationToTable, ASSIGNABLE_STATUSES };
