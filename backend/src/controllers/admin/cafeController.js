const Cafe = require('../../models/Cafe');
const { BadRequestError, NotFoundError } = require('../../utils/errors');

const POSITIVE_INT_RULES = ['default_turn_time_minutes', 'max_party_size', 'hold_duration_minutes'];
const NON_NEGATIVE_INT_RULES = ['booking_lead_time_hours'];

const VALID_DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME_STRING_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const isValidHttpsUrl = (value) => {
  if (!value.startsWith('https://')) {
    return false;
  }
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

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

const validateMenuInput = (menu) => {
  if (!Array.isArray(menu)) {
    throw new BadRequestError('menu must be an array');
  }

  for (const category of menu) {
    const { category: categoryName, items } = category || {};

    if (typeof categoryName !== 'string' || categoryName.trim().length === 0) {
      throw new BadRequestError('menu.category is required and must be a non-empty string');
    }
    if (!Array.isArray(items)) {
      throw new BadRequestError(`menu.items must be an array for category "${categoryName}"`);
    }

    for (const item of items) {
      const { name, price } = item || {};

      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new BadRequestError(`menu item name is required and must be a non-empty string (category "${categoryName}")`);
      }
      if (price !== undefined && price !== null && (typeof price !== 'number' || !Number.isFinite(price) || price < 0)) {
        throw new BadRequestError(`menu item price must be a non-negative number (item "${name}")`);
      }
    }
  }
};

const updateCafe = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const { reservation_rules, operating_hours, description, hero_image_url, menu } = req.body;

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

    if (description !== undefined) {
      if (typeof description !== 'string') {
        throw new BadRequestError('description must be a string');
      }
      cafe.description = description;
    }

    if (hero_image_url !== undefined) {
      if (typeof hero_image_url !== 'string') {
        throw new BadRequestError('hero_image_url must be a string');
      }
      if (hero_image_url.length > 0 && !isValidHttpsUrl(hero_image_url)) {
        throw new BadRequestError('hero_image_url must be a valid https URL');
      }
      cafe.hero_image_url = hero_image_url;
    }

    if (menu !== undefined) {
      validateMenuInput(menu);
      cafe.menu = menu;
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
  updateCafe,
  getCafeBySlug,
};
