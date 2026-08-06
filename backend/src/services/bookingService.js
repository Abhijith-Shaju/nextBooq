const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const Cafe = require('../models/Cafe');
const Table = require('../models/Table');
const { allocateTables } = require('./allocationEngine');
const { validateOperatingHours } = require('../utils/operatingHours');
const { ConflictError, NotFoundError, UnprocessableEntityError } = require('../utils/errors');

/**
 * Creates a HOLD reservation using a MongoDB Multi-Document Transaction with auto-retry logic.
 */
const createHoldReservation = async ({
  cafeId,
  userId,
  startTime,
  endTime,
  partySize,
  reservationTimezone,
}) => {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Fetch cafe rules for hold duration
      const cafe = await Cafe.findById(cafeId).session(session);
      if (!cafe) {
        throw new NotFoundError('Cafe not found');
      }

      // Validate operating hours against requested reservation time
      validateOperatingHours(cafe, startTime, endTime);

      const holdDuration = cafe.reservation_rules?.hold_duration_minutes || 10;
      const holdExpiresAt = new Date(Date.now() + holdDuration * 60 * 1000);

      // Run allocation algorithm within transaction session
      const allocation = await allocateTables(
        cafeId,
        new Date(startTime),
        new Date(endTime),
        partySize,
        session
      );

      // Invariant Check
      if (allocation.totalCapacity < partySize) {
        throw new UnprocessableEntityError(
          'Capacity invariant failed: Allocated tables capacity is less than party size'
        );
      }

      // Create HOLD reservation document
      const reservation = new Reservation({
        cafe_id: cafeId,
        user_id: userId,
        table_ids: allocation.tableIds,
        start_time: new Date(startTime),
        end_time: new Date(endTime),
        party_size: partySize,
        reservation_timezone: reservationTimezone || cafe.timezone,
        hold_expires_at: holdExpiresAt,
        status: 'HOLD',
        status_history: [
          {
            status: 'HOLD',
            timestamp: new Date(),
            updated_by: userId,
          },
        ],
      });

      // Touch allocated tables inside transaction to trigger WiredTiger MVCC WriteConflict lock for concurrent requests
      await Table.updateMany(
        { _id: { $in: allocation.tableIds }, cafe_id: cafeId },
        { $inc: { __v: 1 } },
        { session }
      );

      await reservation.save({ session });

      await session.commitTransaction();
      session.endSession();

      return reservation;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      const isTransientError =
        error.hasOwnProperty('errorLabels') &&
        error.errorLabels.includes('TransientTransactionError');
      const isWriteConflict = error.code === 112 || error.codeName === 'WriteConflict';

      if ((isTransientError || isWriteConflict) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 50; // Exponential backoff: 100ms, 200ms...
        console.warn(`[MVCC CONFLICT] Retrying booking transaction attempt ${attempt}/${maxRetries} after ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (isTransientError || isWriteConflict) {
        throw new ConflictError(
          'High booking concurrency detected. Please retry your reservation.'
        );
      }

      throw error;
    }
  }
};

module.exports = {
  createHoldReservation,
};
