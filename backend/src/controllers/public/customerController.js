const Reservation = require('../../models/Reservation');
const { BadRequestError } = require('../../utils/errors');

const getCustomerReservations = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const reservations = await Reservation.find({ user_id: userId })
      .populate('cafe_id', 'name slug timezone brand_primary brand_accent')
      .populate('table_ids', 'table_number capacity')
      .sort({ start_time: -1 });

    res.status(200).json({
      status: 'success',
      data: reservations,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCustomerReservations,
};
