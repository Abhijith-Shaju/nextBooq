const Reservation = require('../models/Reservation');

/**
 * Finds another reservation currently SEATED at any table this reservation
 * is about to be seated at. CHECKED_IN doesn't count — a checked-in guest is
 * waiting at the host stand, not physically occupying the table yet, and the
 * whole point of this check is to catch the case where two parties would be
 * seated at the same physical table at once, not to restrict a host's
 * flexibility to seat a table early relative to its booked time.
 */
const findSeatedOccupancyConflict = async (cafeId, tableIds, excludeReservationId) => {
  return Reservation.findOne({
    cafe_id: cafeId,
    _id: { $ne: excludeReservationId },
    table_ids: { $in: tableIds },
    status: 'SEATED',
  })
    .populate('user_id', 'name')
    .populate('table_ids', 'table_number');
};

/**
 * Collects every table currently held by a SEATED reservation at this cafe,
 * other than the one being seated. Deliberately ignores the reservations'
 * booked time windows: a party that is physically at a table still occupies
 * it after their slot has nominally ended, which is exactly the situation the
 * seating-conflict flow exists to surface.
 */
const getSeatedTableIds = async (cafeId, excludeReservationId, session = null) => {
  const query = Reservation.find({
    cafe_id: cafeId,
    _id: { $ne: excludeReservationId },
    status: 'SEATED',
  }).select('table_ids');

  if (session) {
    query.session(session);
  }

  const seatedReservations = await query.exec();

  const tableIds = new Set();
  for (const reservation of seatedReservations) {
    for (const tableId of reservation.table_ids) {
      tableIds.add(tableId.toString());
    }
  }

  return tableIds;
};

module.exports = {
  findSeatedOccupancyConflict,
  getSeatedTableIds,
};
