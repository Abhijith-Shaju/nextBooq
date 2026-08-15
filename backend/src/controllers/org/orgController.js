const Cafe = require('../../models/Cafe');
const Reservation = require('../../models/Reservation');

const NON_COUNTED_STATUSES = ['CANCELLED', 'EXPIRED'];

const getCafes = async (req, res, next) => {
  try {
    const cafes = await Cafe.find({ org_id: req.ownerOrgId, is_deleted: false })
      .sort({ name: 1 })
      .lean();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const cafeIds = cafes.map((cafe) => cafe._id);
    const counts = await Reservation.aggregate([
      {
        $match: {
          cafe_id: { $in: cafeIds },
          start_time: { $gte: startOfDay, $lte: endOfDay },
          status: { $nin: NON_COUNTED_STATUSES },
        },
      },
      { $group: { _id: '$cafe_id', count: { $sum: 1 } } },
    ]);
    const countByCafeId = new Map(counts.map((entry) => [entry._id.toString(), entry.count]));

    const data = cafes.map((cafe) => ({
      _id: cafe._id.toString(),
      name: cafe.name,
      slug: cafe.slug,
      subscription_status: cafe.subscription_status,
      today_reservation_count: countByCafeId.get(cafe._id.toString()) || 0,
    }));

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCafes };
