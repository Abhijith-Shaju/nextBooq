const { allocateTables } = require('../../services/allocationEngine');
const { BadRequestError } = require('../../utils/errors');

const getAvailableSlots = async (req, res, next) => {
  try {
    const { date, time, partySize, durationMinutes } = req.query;
    const cafeId = req.tenantId;

    if (!date || !time || !partySize) {
      throw new BadRequestError('date (YYYY-MM-DD), time (HH:mm), and partySize are required');
    }

    const party = parseInt(partySize, 10);
    if (isNaN(party) || party <= 0) {
      throw new BadRequestError('partySize must be a positive integer');
    }

    const duration = parseInt(durationMinutes || req.cafe.reservation_rules?.default_turn_time_minutes || 90, 10);

    const startIso = `${date}T${time}:00Z`;
    const startTime = new Date(startIso);
    if (isNaN(startTime.getTime())) {
      throw new BadRequestError('Invalid date or time format');
    }

    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    let isAvailable = false;
    let allocationDetails = null;

    try {
      allocationDetails = await allocateTables(cafeId, startTime, endTime, party);
      isAvailable = true;
    } catch (allocError) {
      isAvailable = false;
    }

    res.status(200).json({
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
              },
            ]
          : [],
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAvailableSlots,
};
