const crypto = require('crypto');
const Cafe = require('../../models/Cafe');
const { BadRequestError, NotFoundError } = require('../../utils/errors');
const { encrypt } = require('../../utils/encryption');
const { createRazorpayClient } = require('../../config/razorpay');
const config = require('../../config/env');

const POSITIVE_INT_RULES = ['default_turn_time_minutes', 'max_party_size', 'hold_duration_minutes'];
const NON_NEGATIVE_INT_RULES = ['booking_lead_time_hours'];
// Rupees, not paise — decimals allowed (e.g. 149.50), unlike the other rules above.
const POSITIVE_NUMBER_RULES = ['reservation_fee'];
const MAX_RESERVATION_FEE_RUPEES = 100000;

const VALID_DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME_STRING_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_CONTACT_PHONE_LENGTH = 30;

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

const validateRazorpayCredentials = async (razorpayKeyId, razorpayKeySecret) => {
  const client = createRazorpayClient({ key_id: razorpayKeyId, key_secret: razorpayKeySecret });
  try {
    await client.payments.all({ count: 1 });
  } catch {
    throw new BadRequestError(
      'These Razorpay credentials could not be verified. Double-check the Key ID and Key Secret from your Razorpay dashboard.'
    );
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
    // so an identical open/close only matters — and must be rejected — when
    // the day is open. close_time < open_time is a legitimate overnight
    // schedule (e.g. a bar open 18:00, closing 02:00) — utils/operatingHours.js
    // rolls it forward by 24h rather than treating it as inverted (M-09).
    // Only a zero-length day (open === close) is genuinely ambiguous.
    if (!is_closed && open_time !== undefined && close_time !== undefined && close_time === open_time) {
      throw new BadRequestError(
        `operating_hours.open_time and close_time cannot be identical for ${day_of_week}`
      );
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
    const { reservation_rules, operating_hours, description, hero_image_url, contact_phone, menu } = req.body;

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
      for (const field of POSITIVE_NUMBER_RULES) {
        if (reservation_rules[field] === undefined) continue;
        const value = reservation_rules[field];
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_RESERVATION_FEE_RUPEES) {
          throw new BadRequestError(
            `reservation_rules.${field} must be a positive number no greater than ${MAX_RESERVATION_FEE_RUPEES}`
          );
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

    if (contact_phone !== undefined) {
      if (typeof contact_phone !== 'string') {
        throw new BadRequestError('contact_phone must be a string');
      }
      if (contact_phone.length > MAX_CONTACT_PHONE_LENGTH) {
        throw new BadRequestError(`contact_phone must be ${MAX_CONTACT_PHONE_LENGTH} characters or fewer`);
      }
      cafe.contact_phone = contact_phone.trim();
    }

    if (menu !== undefined) {
      validateMenuInput(menu);
      cafe.menu = menu;
    }

    await cafe.save();

    res.status(200).json({
      status: 'success',
      data: cafe.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

// Payment credentials are deliberately a separate endpoint from the rest of
// cafe settings, gated on the manage_billing permission rather than
// edit_settings — a manager (who gets edit_settings by default) must not be
// able to redirect a cafe's Razorpay payouts to an account of their own
// choosing (H-03). manage_billing is not granted to any role by default, so
// only the owner (who bypasses per-permission checks entirely — see rbac.js)
// can reach this today.
const updateCafePayments = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const { razorpay_key_id: razorpayKeyId, razorpay_key_secret: razorpayKeySecret } = req.body || {};

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      throw new NotFoundError('Cafe not found');
    }

    const hasKeyId = typeof razorpayKeyId === 'string' && razorpayKeyId.length > 0;
    const hasKeySecret = typeof razorpayKeySecret === 'string' && razorpayKeySecret.length > 0;

    if (!hasKeyId || !hasKeySecret) {
      throw new BadRequestError('Both razorpay_key_id and razorpay_key_secret are required');
    }

    await validateRazorpayCredentials(razorpayKeyId, razorpayKeySecret);

    const webhookSecretPlaintext = crypto.randomBytes(32).toString('hex');

    cafe.payments = {
      razorpay_key_id: razorpayKeyId,
      razorpay_key_secret_encrypted: encrypt(razorpayKeySecret),
      razorpay_webhook_secret_encrypted: encrypt(webhookSecretPlaintext),
      configured: true,
    };

    await cafe.save();

    const responseData = cafe.toJSON();
    responseData.payments_webhook = {
      url: `${config.FRONTEND_URL}/api/v1/webhooks/razorpay/${cafe.slug}`,
      secret: webhookSecretPlaintext,
    };

    res.status(200).json({
      status: 'success',
      data: responseData,
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
  updateCafePayments,
  getCafeBySlug,
};
