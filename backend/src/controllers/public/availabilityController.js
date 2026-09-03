const { allocateTables, prefetchAvailabilityData, allocateTablesFromPrefetched } = require('../../services/allocationEngine');
const {
  validateOperatingHours,
  getDaySchedule,
  localTimeToUTC,
  generateSlotTimes,
  dayOfWeekForDateKey,
  isValidDateKey,
} = require('../../utils/operatingHours');
const { BadRequestError } = require('../../utils/errors');

// Bounds the requested reservation duration. Without this, an unvalidated
// durationMinutes fed into generateSlotTimes()'s loop bound let a caller pick
// values (negative, zero, or absurdly large) that produced hundreds of
// thousands of candidate slots — each one running allocateTables()'s DB
// queries — from a single unauthenticated request.
const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 720; // 12 hours — generous upper bound for any single reservation


const getAvailableSlots = async (req, res, next) => {
  try {
    const { date, time, partySize, durationMinutes } = req.query;
    const cafeId = req.tenantId;

    if (!date || !partySize) {
      throw new BadRequestError('date (YYYY-MM-DD) and partySize are required');
    }

    if (!isValidDateKey(date)) {
      throw new BadRequestError('date must be a real calendar date in YYYY-MM-DD format');
    }

    const party = parseInt(partySize, 10);
    if (isNaN(party) || party <= 0) {
      throw new BadRequestError('partySize must be a positive integer');
    }

    const duration = parseInt(durationMinutes || req.cafe?.reservation_rules?.default_turn_time_minutes || 90, 10);
    if (
      isNaN(duration) ||
      duration < MIN_DURATION_MINUTES ||
      duration > MAX_DURATION_MINUTES
    ) {
      throw new BadRequestError(
        `durationMinutes must be an integer between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES}`
      );
    }
    const timeZone = req.cafe?.timezone || 'UTC';

    // Mirrors the lead-time check in bookingController.js's createReservation so a
    // slot shown here as selectable never turns out to be rejected for the same
    // reason once the diner actually tries to book it.
    const leadTimeHours = req.cafe?.reservation_rules?.booking_lead_time_hours ?? 24;
    const leadTimeGraceMs = 60 * 1000;
    const earliestAllowedStart = new Date(Date.now() + leadTimeHours * 60 * 60 * 1000 - leadTimeGraceMs);
    const leadTimeReason = `Reservations must be made at least ${leadTimeHours} hour(s) in advance`;

    // If specific time parameter is provided, check that single slot
    if (time) {
      const startTime = localTimeToUTC(date, time, timeZone);
      if (isNaN(startTime.getTime())) {
        throw new BadRequestError('Invalid date or time format');
      }

      const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
      let isAvailable = false;
      try {
        if (startTime < earliestAllowedStart) {
          throw new Error(leadTimeReason);
        }
        if (req.cafe) {
          validateOperatingHours(req.cafe, startTime, endTime);
        }
        await allocateTables(cafeId, startTime, endTime, party);
        isAvailable = true;
      } catch (err) {
        isAvailable = false;
      }

      return res.status(200).json({
        status: 'success',
        data: {
          cafe_id: cafeId,
          requested: {
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            party_size: party,
          },
          available: isAvailable,
          available_slots: isAvailable
            ? [
                {
                  start_time: startTime.toISOString(),
                  end_time: endTime.toISOString(),
                  time,
                  available: true,
                },
              ]
            : [],
        },
      });
    }

    // Generate the candidate slot times from the cafe's actual operating hours
    // for this calendar date's day of week, instead of a fixed 09:00-22:00 list,
    // so slots line up with whatever the cafe owner has configured.
    const dayOfWeek = dayOfWeekForDateKey(date);
    const daySchedule = req.cafe ? getDaySchedule(req.cafe, dayOfWeek) : null;

    if (daySchedule?.is_closed) {
      return res.status(200).json({
        status: 'success',
        data: [],
      });
    }

    const candidateSlotTimes = generateSlotTimes(
      daySchedule?.open_time || '09:00',
      daySchedule?.close_time || '22:00',
      duration
    );

    const availableSlots = [];

    // One pair of queries covering the whole day's candidate slots, instead
    // of allocateTables() re-querying tables + reservations from scratch for
    // every candidate slot (52+ round trips for a 13-hour day at a 30-min
    // turn time) — the per-slot decision itself is then made in memory (L-04).
    if (candidateSlotTimes.length > 0) {
      const slotStarts = candidateSlotTimes.map((slotTime) => localTimeToUTC(date, slotTime, timeZone));
      const windowStart = new Date(Math.min(...slotStarts.map((d) => d.getTime())));
      const windowEnd = new Date(Math.max(...slotStarts.map((d) => d.getTime())) + duration * 60 * 1000);
      const { tables, reservations } = await prefetchAvailabilityData(cafeId, windowStart, windowEnd);

      candidateSlotTimes.forEach((slotTime, idx) => {
        const startTime = slotStarts[idx];
        const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

        let available = false;
        let reason = undefined;

        try {
          if (startTime < earliestAllowedStart) {
            throw new Error(leadTimeReason);
          }
          if (req.cafe) {
            validateOperatingHours(req.cafe, startTime, endTime);
          }
          allocateTablesFromPrefetched(tables, reservations, startTime, endTime, party);
          available = true;
        } catch (allocErr) {
          available = false;
          reason = allocErr.message || 'Unavailable';
        }

        availableSlots.push({
          time: slotTime,
          available,
          ...(reason && { reason }),
        });
      });
    }

    res.status(200).json({
      status: 'success',
      data: availableSlots,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAvailableSlots,
};
