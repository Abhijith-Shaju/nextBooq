const { allocateTables } = require('../../services/allocationEngine');
const { validateOperatingHours } = require('../../utils/operatingHours');
const { BadRequestError } = require('../../utils/errors');

const DEFAULT_TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
  '21:00', '21:30', '22:00'
];

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

    // If specific time parameter is provided, check that single slot
    if (time) {
      const startIso = `${date}T${time}:00Z`;
      const startTime = new Date(startIso);
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

    // Generate full-day slot availability list for requested date
    const availableSlots = [];

    for (const slotTime of DEFAULT_TIME_SLOTS) {
      const startIso = `${date}T${slotTime}:00Z`;
      const startTime = new Date(startIso);
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
