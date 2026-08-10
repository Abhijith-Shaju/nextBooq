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

module.exports = {
  findSeatedOccupancyConflict,
};
