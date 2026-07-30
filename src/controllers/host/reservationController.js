const Reservation = require('../../models/Reservation');
const { transitionState } = require('../../services/stateMachine');
const { BadRequestError } = require('../../utils/errors');

const getDailyManifest = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const { date } = req.query;

    let dateQuery = {};
    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      dateQuery = {
        start_time: { $gte: startOfDay, $lte: endOfDay },
      };
    }

    const reservations = await Reservation.find({
      cafe_id: cafeId,
      ...dateQuery,
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

const updateReservationStatus = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const { resId } = req.params;
    const { status, version } = req.body;

    if (!status || version === undefined) {
      throw new BadRequestError('status and version token (__v) are required');
    }

    const updatedReservation = await transitionState({
      reservationId: resId,
      tenantId: cafeId,
      targetStatus: status,
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
};
