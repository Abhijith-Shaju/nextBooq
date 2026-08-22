const Reservation = require('../models/Reservation');
const Table = require('../models/Table');
const { BadRequestError, NotFoundError, ConflictError, UnprocessableEntityError } = require('../utils/errors');
const { getBlockedTableIds } = require('./allocationEngine');
const { getSeatedTableIds } = require('./tableOccupancyService');
const { notifyCafeRoom } = require('./socketService');

// HOLD/PENDING_PAYMENT haven't committed to a real booking yet (still mid
// checkout), and every other status is terminal — a staff-chosen table only
// makes sense for a reservation that's actually going to be seated.
const ASSIGNABLE_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'SEATED'];

/**
 * Lets a host point a reservation at a specific table they picked from the
 * floorplan — distinct from suggestAlternateTable (allocationEngine.js),
 * which the system uses to auto-pick a table during a seating conflict. Here
 * the host is the one choosing, so this only has to validate their choice:
 * capacity fits, and the table is actually free for the window this
 * reservation will occupy.
 *
 * Reuses the same widened-window conflict check as suggestAlternateTable: a
 * host can seat a party early or late, so schedule conflicts are checked over
 * the union of the booked window and "starting now," not just
 * [start_time, end_time) — see the comment on suggestAlternateTable for why.
 */
const assignReservationToTable = async ({ reservationId, tenantId, tableId, expectedVersion, updatedByUserId = null }) => {
  const reservation = await Reservation.findOne({ _id: reservationId, cafe_id: tenantId });
  if (!reservation) {
    throw new NotFoundError('Reservation not found');
  }

  if (expectedVersion !== undefined && expectedVersion !== null && reservation.__v !== expectedVersion) {
    throw new ConflictError(
      'OCC Conflict: this reservation has already been modified by someone else. Please refresh and try again.'
    );
  }

  if (!ASSIGNABLE_STATUSES.includes(reservation.status)) {
    throw new UnprocessableEntityError(
      `Cannot assign a table to a reservation in state ${reservation.status}`
    );
  }

  const table = await Table.findOne({ _id: tableId, cafe_id: tenantId, is_deleted: false });
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

  const now = new Date();
  const duration = reservation.end_time.getTime() - reservation.start_time.getTime();
  const nowWindowEnd = new Date(now.getTime() + duration);
  const windowStart = now < reservation.start_time ? now : reservation.start_time;
  const windowEnd = reservation.end_time > nowWindowEnd ? reservation.end_time : nowWindowEnd;

  const [blockedBySchedule, blockedBySeating] = await Promise.all([
    getBlockedTableIds(tenantId, windowStart, windowEnd, null, reservation._id),
    getSeatedTableIds(tenantId, reservation._id),
  ]);

  if (blockedBySchedule.has(table._id.toString()) || blockedBySeating.has(table._id.toString())) {
    throw new ConflictError("This table isn't free for this reservation's time.");
  }

  const updatedReservation = await Reservation.findOneAndUpdate(
    { _id: reservationId, cafe_id: tenantId, __v: expectedVersion },
    { $set: { table_ids: [table._id] }, $inc: { __v: 1 } },
    { returnDocument: 'after', runValidators: true }
  ).populate('table_ids', 'table_number capacity');

  if (!updatedReservation) {
    throw new ConflictError(
      'OCC Conflict: this reservation has already been modified by someone else. Please refresh and try again.'
    );
  }

  notifyCafeRoom(tenantId.toString(), 'reservation_updated', {
    reservationId: updatedReservation._id.toString(),
    status: updatedReservation.status,
  });

  return updatedReservation;
};

module.exports = { assignReservationToTable, ASSIGNABLE_STATUSES };
