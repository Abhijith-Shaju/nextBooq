const Reservation = require('../models/Reservation');
const { ConflictError, UnprocessableEntityError, NotFoundError } = require('../utils/errors');

const VALID_TRANSITIONS = {
  HOLD: ['PENDING_PAYMENT', 'EXPIRED'],
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'SEATED', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['SEATED', 'LEFT_BEFORE_SEATING'],
  SEATED: ['COMPLETED'],
  // Terminal states (no transitions allowed out)
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
  NO_SHOW: [],
  LEFT_BEFORE_SEATING: [],
};

const TIMESTAMP_FIELDS = {
  CONFIRMED: 'confirmed_at',
  CHECKED_IN: 'checked_in_at',
  SEATED: 'seated_at',
  COMPLETED: 'completed_at',
  CANCELLED: 'cancelled_at',
};

/**
 * Transitions a reservation to a target status using strict matrix checks and OCC versioning.
 */
const transitionState = async ({
  reservationId,
  tenantId,
  targetStatus,
  expectedVersion,
  updatedByUserId = null,
  paymentDataUpdates = null,
}) => {
  const reservation = await Reservation.findOne({ _id: reservationId, cafe_id: tenantId });
  if (!reservation) {
    throw new NotFoundError('Reservation not found');
  }

  // Check OCC version before state validation
  if (expectedVersion !== undefined && expectedVersion !== null && reservation.__v !== expectedVersion) {
    throw new ConflictError(
      `OCC Conflict: Reservation version ${expectedVersion} has already been modified by another request. Please refresh and try again.`
    );
  }

  const currentStatus = reservation.status;

  // Validate state transition matrix
  const allowedNextStates = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowedNextStates.includes(targetStatus)) {
    throw new UnprocessableEntityError(
      `Illegal status transition from ${currentStatus} to ${targetStatus}`
    );
  }

  // Prepare update payload
  const updateQuery = {
    status: targetStatus,
    $inc: { __v: 1 },
    $push: {
      status_history: {
        status: targetStatus,
        timestamp: new Date(),
        updated_by: updatedByUserId,
      },
    },
  };

  // Set relevant lifecycle timestamp field if applicable
  const timestampField = TIMESTAMP_FIELDS[targetStatus];
  if (timestampField) {
    updateQuery[timestampField] = new Date();
  }

  if (paymentDataUpdates) {
    Object.keys(paymentDataUpdates).forEach((key) => {
      updateQuery[`payment_data.${key}`] = paymentDataUpdates[key];
    });
  }

  // Execute OCC Update
  const updatedReservation = await Reservation.findOneAndUpdate(
    {
      _id: reservationId,
      cafe_id: tenantId,
      __v: expectedVersion,
    },
    updateQuery,
    { new: true, runValidators: true }
  );

  if (!updatedReservation) {
    throw new ConflictError(
      `OCC Conflict: Reservation version ${expectedVersion} has already been modified by another request. Please refresh and try again.`
    );
  }

  return updatedReservation;
};

module.exports = {
  VALID_TRANSITIONS,
  transitionState,
};
