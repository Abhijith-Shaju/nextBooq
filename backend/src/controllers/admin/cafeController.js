const Cafe = require('../../models/Cafe');
const Organization = require('../../models/Organization');
const User = require('../../models/User');
const { BadRequestError, NotFoundError } = require('../../utils/errors');

const createCafe = async (req, res, next) => {
  try {
    const { org_name, cafe_name, slug, timezone, reservation_rules } = req.body;

    if (!org_name || !cafe_name || !slug) {
      throw new BadRequestError('org_name, cafe_name, and slug are required');
    }

    const existingSlug = await Cafe.findOne({ slug: slug.toLowerCase() });
    if (existingSlug) {
      throw new BadRequestError(`Cafe slug '${slug}' is already taken`);
    }

    const org = new Organization({ name: org_name });
    await org.save();

    const cafe = new Cafe({
      org_id: org._id,
      name: cafe_name,
      slug: slug.toLowerCase(),
      timezone: timezone || 'UTC',
      reservation_rules: reservation_rules || {},
      subscription_status: 'active',
    });
    await cafe.save();

    // Assign owner role to requesting user for this cafe
    if (req.user) {
      await User.updateOne(
        { _id: req.user._id },
        {
          $push: {
            staff_memberships: {
              cafe_id: cafe._id,
              role: 'owner',
              permissions: [
                'manage_staff',
                'edit_tables',
                'edit_settings',
                'view_reservations',
                'edit_reservations',
                'cancel_reservations',
                'manage_billing',
              ],
            },
          },
        }
      );
    }

    res.status(201).json({
      status: 'success',
      data: {
        organization: org,
        cafe: cafe,
      },
    });
  } catch (error) {
    next(error);
  }
};

const POSITIVE_INT_RULES = ['default_turn_time_minutes', 'max_party_size', 'hold_duration_minutes'];
const NON_NEGATIVE_INT_RULES = ['booking_lead_time_hours'];

const VALID_DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME_STRING_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const validateOperatingHoursInput = (operatingHours) => {
  if (!Array.isArray(operatingHours)) {
    throw new BadRequestError('operating_hours must be an array');
  }

  const seenDays = new Set();

  for (const entry of operatingHours) {
    const { day_of_week, open_time, close_time, is_closed } = entry || {};

    if (!VALID_DAYS_OF_WEEK.includes(day_of_week)) {
      throw new BadRequestError(`operating_hours.day_of_week must be one of: ${VALID_DAYS_OF_WEEK.join(', ')}`);
    }
    if (seenDays.has(day_of_week)) {
      throw new BadRequestError(`operating_hours has a duplicate entry for ${day_of_week}`);
    }
    seenDays.add(day_of_week);

    if (open_time !== undefined && !TIME_STRING_PATTERN.test(open_time)) {
      throw new BadRequestError(`operating_hours.open_time must be a HH:mm time string (got "${open_time}")`);
    }
    if (close_time !== undefined && !TIME_STRING_PATTERN.test(close_time)) {
      throw new BadRequestError(`operating_hours.close_time must be a HH:mm time string (got "${close_time}")`);
    }
    if (is_closed !== undefined && typeof is_closed !== 'boolean') {
      throw new BadRequestError('operating_hours.is_closed must be a boolean');
    }

    // A closed day's open/close values are never read (see utils/operatingHours.js),
    // so an inverted range only matters — and must be rejected — when the day is open.
    if (!is_closed && open_time !== undefined && close_time !== undefined && close_time <= open_time) {
      throw new BadRequestError(`operating_hours.close_time must be after open_time for ${day_of_week}`);
    }
  }
};

const updateCafe = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const { reservation_rules, operating_hours } = req.body;

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      throw new NotFoundError('Cafe not found');
    }

    if (reservation_rules && typeof reservation_rules === 'object') {
      for (const field of POSITIVE_INT_RULES) {
        if (reservation_rules[field] === undefined) continue;
        const value = reservation_rules[field];
        if (!Number.isInteger(value) || value <= 0) {
          throw new BadRequestError(`reservation_rules.${field} must be a positive integer`);
        }
      }
      for (const field of NON_NEGATIVE_INT_RULES) {
        if (reservation_rules[field] === undefined) continue;
        const value = reservation_rules[field];
        if (!Number.isInteger(value) || value < 0) {
          throw new BadRequestError(`reservation_rules.${field} must be a non-negative integer`);
        }
      }

      cafe.reservation_rules = {
        ...cafe.reservation_rules.toObject(),
        ...reservation_rules,
      };
    }

    if (operating_hours !== undefined) {
      validateOperatingHoursInput(operating_hours);
      cafe.operating_hours = operating_hours;
    }

    await cafe.save();

    res.status(200).json({
      status: 'success',
      data: cafe,
    });
  } catch (error) {
    next(error);
  }
};

const getCafeBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const lowerSlug = slug.toLowerCase();

    // Ignore static asset requests matching dynamic slug route
    if (['favicon.ico', 'sw.js', 'robots.txt', 'site.webmanifest'].includes(lowerSlug)) {
      return res.status(404).json({ status: 'fail', message: 'Resource not found' });
    }

    const cafe = await Cafe.findOne({ slug: lowerSlug, is_deleted: false });
    if (!cafe) {
      throw new NotFoundError('Cafe not found');
    }

    res.status(200).json({
      status: 'success',
      data: cafe,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCafe,
  updateCafe,
  getCafeBySlug,
};
