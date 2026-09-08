const Reservation = require('../../models/Reservation');
const { BadRequestError, NotFoundError } = require('../../utils/errors');
const { transitionState } = require('../../services/stateMachine');

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

// Once a guest has checked in or been seated they are at the cafe, and
// cancelling is no longer a thing the app should do for them.
const GUEST_CANCELLABLE_STATUSES = ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED'];

/**
 * Lets a guest cancel their own booking.
 *
 * Until this existed the only way out was to phone the cafe, which the terms
 * said plainly but which still left a guest who could not get through holding
 * a table they knew they would not use.
 *
 * Ownership is the query, not a check after the fact: the reservation is
 * looked up by id *and* user, so another guest's booking is simply not found
 * rather than found and then refused.
 */
const cancelCustomerReservation = async (req, res, next) => {
  try {
    const reservation = await Reservation.findOne({
      _id: req.params.reservationId,
      user_id: req.user._id,
    });

    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    if (!GUEST_CANCELLABLE_STATUSES.includes(reservation.status)) {
      throw new BadRequestError(
        `This booking can no longer be cancelled online (it is ${reservation.status.toLowerCase().replace(/_/g, ' ')}). Please contact the cafe.`
      );
    }

    const updated = await transitionState({
      reservationId: reservation._id,
      tenantId: reservation.cafe_id,
      targetStatus: 'CANCELLED',
      expectedVersion: reservation.__v,
      updatedByUserId: req.user._id,
    });

    res.status(200).json({
      status: 'success',
      data: {
        _id: updated._id,
        status: updated.status,
        // So the guest is told what happens to their money rather than left to
        // wonder. Whether a refund is due depends on the cafe's terms and how
        // much notice was given -- the state machine has already decided.
        refund_due: Boolean(updated.payment_data?.requires_manual_refund),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCustomerReservations,
  cancelCustomerReservation,
};
