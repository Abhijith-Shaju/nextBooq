const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const Cafe = require('../models/Cafe');
const Table = require('../models/Table');
const { allocateTables } = require('./allocationEngine');
const { validateOperatingHours } = require('../utils/operatingHours');
const { ConflictError, NotFoundError, UnprocessableEntityError } = require('../utils/errors');

/**
 * Rejects a new hold if the same user already holds an active reservation at this
 * cafe whose time window overlaps the requested one (expired HOLDs are excluded,
 * mirroring allocationEngine's own overlap-exclusion rules).
 */
const assertNoUserOverlap = async (cafeId, userId, startTime, endTime, session = null) => {
  const now = new Date();
  const query = Reservation.findOne({
    cafe_id: cafeId,
    user_id: userId,
    status: { $in: ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'SEATED'] },
    start_time: { $lt: endTime },
    end_time: { $gt: startTime },
    $or: [{ status: { $ne: 'HOLD' } }, { hold_expires_at: { $gt: now } }],
  });

  if (session) {
    query.session(session);
  }

  const existing = await query.exec();
  if (existing) {
    throw new ConflictError('You already have a reservation that overlaps this time slot');
  }
};

/**
 * Fallback for non-replica set standalone MongoDB instances (development/testing).
 */
const createHoldReservationNonTransactional = async ({
  cafeId,
  userId,
  startTime,
  endTime,
  partySize,
  reservationTimezone,
}) => {
  const cafe = await Cafe.findById(cafeId);
  if (!cafe) {
    throw new NotFoundError('Cafe not found');
  }

  validateOperatingHours(cafe, startTime, endTime);

  await assertNoUserOverlap(cafeId, userId, new Date(startTime), new Date(endTime));

  const holdDuration = cafe.reservation_rules?.hold_duration_minutes || 10;
  const holdExpiresAt = new Date(Date.now() + holdDuration * 60 * 1000);

  const allocation = await allocateTables(
    cafeId,
    new Date(startTime),
    new Date(endTime),
    partySize
  );

  if (allocation.totalCapacity < partySize) {
    throw new UnprocessableEntityError(
      'Capacity invariant failed: Allocated tables capacity is less than party size'
    );
  }

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

  await Table.updateMany(
    { _id: { $in: allocation.tableIds }, cafe_id: cafeId },
    { $inc: { __v: 1 } }
  );

  await reservation.save();

  return reservation;
};

/**
 * Creates a HOLD reservation using a MongoDB Multi-Document Transaction with auto-retry logic,
 * with fallback for standalone non-replica set MongoDB instances.
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
    let session;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch (sessionErr) {
      // If MongoDB is not a replica set, fallback gracefully to non-transactional creation
      if (
        sessionErr.code === 20 ||
        sessionErr.codeName === 'IllegalOperation' ||
        (sessionErr.message && sessionErr.message.includes('replica set'))
      ) {
        console.warn(
          '[MONGOOSE WARN] Multi-document transactions not supported by standalone MongoDB instance. Using non-transactional fallback.'
        );
        return await createHoldReservationNonTransactional({
          cafeId,
          userId,
          startTime,
          endTime,
          partySize,
          reservationTimezone,
        });
      }
      throw sessionErr;
    }

    try {
      // Fetch cafe rules for hold duration
      const cafe = await Cafe.findById(cafeId).session(session);
      if (!cafe) {
        throw new NotFoundError('Cafe not found');
      }

      // Validate operating hours against requested reservation time
      validateOperatingHours(cafe, startTime, endTime);

      await assertNoUserOverlap(cafeId, userId, new Date(startTime), new Date(endTime), session);

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
      if (session) {
        try {
          await session.abortTransaction();
          session.endSession();
        } catch (_) {}
      }

      // Check if error is due to MongoDB standalone non-replica set restriction
      if (
        error.code === 20 ||
        error.codeName === 'IllegalOperation' ||
        (error.message && error.message.includes('replica set'))
      ) {
        console.warn(
          '[MONGOOSE WARN] Multi-document transactions not supported by standalone MongoDB instance. Using non-transactional fallback.'
        );
        return await createHoldReservationNonTransactional({
          cafeId,
          userId,
          startTime,
          endTime,
          partySize,
          reservationTimezone,
        });
      }

      const isTransientError =
        error.hasOwnProperty('errorLabels') &&
        error.errorLabels.includes('TransientTransactionError');
      const isWriteConflict = error.code === 112 || error.codeName === 'WriteConflict';

      if ((isTransientError || isWriteConflict) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 50; // Exponential backoff: 100ms, 200ms...
        console.warn(
          `[MVCC CONFLICT] Retrying booking transaction attempt ${attempt}/${maxRetries} after ${delay}ms...`
        );
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
  createHoldReservationNonTransactional,
};
