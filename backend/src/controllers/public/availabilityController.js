const { allocateTables } = require('../../services/allocationEngine');
const {
  validateOperatingHours,
  getDaySchedule,
  localTimeToUTC,
  generateSlotTimes,
  dayOfWeekForDateKey,
} = require('../../utils/operatingHours');
const { BadRequestError } = require('../../utils/errors');

const getAvailableSlots = async (req, res, next) => {
  try {
    const { date, time, partySize, durationMinutes } = req.query;
    const cafeId = req.tenantId;

    if (!date || !partySize) {
      throw new BadRequestError('date (YYYY-MM-DD) and partySize are required');
    }

    const party = parseInt(partySize, 10);
    if (isNaN(party) || party <= 0) {
      throw new BadRequestError('partySize must be a positive integer');
    }

    const duration = parseInt(durationMinutes || req.cafe?.reservation_rules?.default_turn_time_minutes || 90, 10);
    const timeZone = req.cafe?.timezone || 'UTC';

    // If specific time parameter is provided, check that single slot
    if (time) {
      const startTime = localTimeToUTC(date, time, timeZone);
      if (isNaN(startTime.getTime())) {
        throw new BadRequestError('Invalid date or time format');
      }

      const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
      let isAvailable = false;
      try {
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

    for (const slotTime of candidateSlotTimes) {
      const startTime = localTimeToUTC(date, slotTime, timeZone);
      const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

      let available = false;
      let reason = undefined;

      try {
        if (req.cafe) {
          validateOperatingHours(req.cafe, startTime, endTime);
        }
        await allocateTables(cafeId, startTime, endTime, party);
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
