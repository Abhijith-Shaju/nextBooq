const Reservation = require('../../models/Reservation');
const { BadRequestError } = require('../../utils/errors');

// A guest's own history grows without bound over years of visits, with no
// limit and two populates per row (L-09). This is a safety cap, not a
// pagination feature -- a customer-facing "load more" UI is future work,
// out of scope for this fix.
const MAX_CUSTOMER_RESERVATIONS = 200;

const getCustomerReservations = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const reservations = await Reservation.find({ user_id: userId })
      .populate('cafe_id', 'name slug timezone brand_primary brand_accent')
      .populate('table_ids', 'table_number capacity')
      .sort({ start_time: -1 })
      .limit(MAX_CUSTOMER_RESERVATIONS);

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
