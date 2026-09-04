const crypto = require('crypto');
const Cafe = require('../../models/Cafe');
const User = require('../../models/User');
const { BadRequestError, NotFoundError } = require('../../utils/errors');
const { encrypt } = require('../../utils/encryption');
const { hashStepUpOtp } = require('../../utils/stepUpAuth');
const { createRazorpayClient } = require('../../config/razorpay');
const { logAuditEvent } = require('../../services/auditService');
const { isValidHttpsUrl, validateAddress } = require('../../utils/cafeInput');
const config = require('../../config/env');

const POSITIVE_INT_RULES = [
  'default_turn_time_minutes',
  'max_party_size',
  'hold_duration_minutes',
  'payment_timeout_minutes',
];
const NON_NEGATIVE_INT_RULES = [
  'booking_lead_time_hours',
  'cancellation_cutoff_hours',
  'no_show_grace_minutes',
];
// Fee terms disclosed to the guest before payment. Booleans need their own
// check: the numeric loops below skip anything they don't recognise, so
// without this a `"maybe"` or a `1` would reach the schema and be coerced
// into a policy the cafe never chose.
const BOOLEAN_RULES = ['fee_adjusted_against_bill', 'refund_on_cancellation'];
const MAX_CANCELLATION_CUTOFF_HOURS = 24 * 30; // a month's notice is already absurd
const MAX_NO_SHOW_GRACE_MINUTES = 240; // four hours late is not "running late"
// Format per the CBIC spec: 2-digit state code, 10-char PAN, entity digit,
// 'Z', then a checksum character.
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
// Rupees, not paise — decimals allowed (e.g. 149.50), unlike the other rules above.
const POSITIVE_NUMBER_RULES = ['reservation_fee'];
const MAX_RESERVATION_FEE_RUPEES = 100000;

const VALID_DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME_STRING_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_CONTACT_PHONE_LENGTH = 30;

// The brand colours land in a CSS custom property that Tailwind reads
// directly (`var(--brand-primary)`), so anything stored here is injected into
// a stylesheet verbatim. Restricting them to a plain 3- or 6-digit hex colour
// keeps that injection safe and rules out the bare "220 89% 53%" HSL triplet
// form, which is valid-looking but produces no colour when used unwrapped.
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const HERO_OVERLAY_VALUES = ['subtle', 'balanced', 'vivid'];

// The same fields validateAddress inspects, minus `country` — country
// defaults to 'India' whether or not it was supplied, so its presence alone
// must never count as "this address has content" (an object with only a
// country would otherwise dodge the all-blank check and get rejected by
// validateAddress's line1-is-required check instead of being treated as a
// clear).
const ADDRESS_CONTENT_FIELDS = ['line1', 'line2', 'landmark', 'city', 'state', 'postal_code', 'map_url'];

const isAddressAllBlank = (value) =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  ADDRESS_CONTENT_FIELDS.every((field) => {
    const fieldValue = value[field];
    return fieldValue === undefined || fieldValue === null || (typeof fieldValue === 'string' && fieldValue.trim() === '');
  });

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
    const {
      reservation_rules,
      operating_hours,
      description,
      hero_image_url,
      hero_overlay,
      contact_phone,
      gstin,
      logo_url,
      brand_primary,
      brand_accent,
      menu,
      address,
    } = req.body;

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
      for (const field of BOOLEAN_RULES) {
        if (reservation_rules[field] === undefined) continue;
        if (typeof reservation_rules[field] !== 'boolean') {
          throw new BadRequestError(`reservation_rules.${field} must be true or false`);
        }
      }
      if (
        reservation_rules.cancellation_cutoff_hours !== undefined &&
        reservation_rules.cancellation_cutoff_hours > MAX_CANCELLATION_CUTOFF_HOURS
      ) {
        throw new BadRequestError(
          `reservation_rules.cancellation_cutoff_hours must be no greater than ${MAX_CANCELLATION_CUTOFF_HOURS}`
        );
      }
      if (
        reservation_rules.no_show_grace_minutes !== undefined &&
        reservation_rules.no_show_grace_minutes > MAX_NO_SHOW_GRACE_MINUTES
      ) {
        throw new BadRequestError(
          `reservation_rules.no_show_grace_minutes must be no greater than ${MAX_NO_SHOW_GRACE_MINUTES}`
        );
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

    if (hero_overlay !== undefined) {
      if (!HERO_OVERLAY_VALUES.includes(hero_overlay)) {
        throw new BadRequestError(`hero_overlay must be one of: ${HERO_OVERLAY_VALUES.join(', ')}`);
      }
      cafe.hero_overlay = hero_overlay;
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

    if (gstin !== undefined) {
      if (typeof gstin !== 'string') {
        throw new BadRequestError('gstin must be a string');
      }
      const cleaned = gstin.trim().toUpperCase();
      // Blank is legitimate -- a business below the registration threshold has
      // no GSTIN -- but a value that is present must be a real one, or it is
      // worse than leaving it empty.
      if (cleaned && !GSTIN_PATTERN.test(cleaned)) {
        throw new BadRequestError('gstin must be a valid 15-character GSTIN, or blank');
      }
      cafe.gstin = cleaned;
    }

    // Same shape the onboarding application captured — validated by the one
    // shared validator so settings and provisioning can't diverge. Omitting
    // the key leaves the stored address untouched. Sending the key with every
    // field blank is how a cafe clears a previously-saved address (the
    // settings UI always sends this key once the address section has been
    // rendered, whether or not anything is filled in) — that must bypass
    // validateAddress, whose line1/city/state-required checks exist for a
    // *populated* address, not to prevent clearing one. A partial address
    // (say city filled, line1 blank) still goes through validateAddress and
    // is rejected exactly as before.
    if (address !== undefined) {
      cafe.address = isAddressAllBlank(address) ? {} : validateAddress(address);
    }

    if (logo_url !== undefined) {
      if (typeof logo_url !== 'string') {
        throw new BadRequestError('logo_url must be a string');
      }
      if (logo_url.length > 0 && !isValidHttpsUrl(logo_url)) {
        throw new BadRequestError('logo_url must be a valid https URL');
      }
      cafe.logo_url = logo_url;
    }

    // An empty string is meaningful here — it clears the override and puts the
    // cafe back on the platform default palette.
    for (const [field, value] of [
      ['brand_primary', brand_primary],
      ['brand_accent', brand_accent],
    ]) {
      if (value === undefined) continue;
      if (typeof value !== 'string') {
        throw new BadRequestError(`${field} must be a string`);
      }
      if (value.length > 0 && !HEX_COLOR_PATTERN.test(value.trim())) {
        throw new BadRequestError(`${field} must be a hex colour such as #C8102E`);
      }
      cafe[field] = value.trim();
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
//
// Also requires a step-up otp_code (from POST /auth/request-step-up-otp,
// sent to the caller's own email) — permission + password/session alone
// isn't enough here, since a compromised owner session is exactly the
// scenario that would otherwise let an attacker redirect this cafe's payouts.
const updateCafePayments = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const {
      razorpay_key_id: razorpayKeyId,
      razorpay_key_secret: razorpayKeySecret,
      otp_code: otpCode,
    } = req.body || {};

    const actingUser = await User.findById(req.user._id);
    if (!otpCode || typeof otpCode !== 'string') {
      throw new BadRequestError('Security code is required');
    }
    if (
      !actingUser.step_up_code_hash ||
      !actingUser.step_up_expires_at ||
      actingUser.step_up_expires_at.getTime() < Date.now() ||
      hashStepUpOtp(otpCode) !== actingUser.step_up_code_hash
    ) {
      throw new BadRequestError('Invalid or expired security code.');
    }
    actingUser.step_up_code_hash = null;
    actingUser.step_up_expires_at = null;
    await actingUser.save();

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

    // Never a secret in afterState — only the key ID (public) and the fact
    // that credentials are now configured.
    await logAuditEvent({
      cafeId: cafe._id,
      entityType: 'Cafe',
      entityId: cafe._id,
      action: 'RAZORPAY_SETTINGS_UPDATED',
      afterState: { razorpay_key_id: razorpayKeyId, configured: true },
      performedByUserId: req.user._id,
    });

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
