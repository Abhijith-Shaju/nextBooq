const { BadRequestError } = require('./errors');

const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'auth',
  'onboarding',
  'pricing',
  '_next',
  // Added with self-serve onboarding: a static Next.js segment always wins
  // over the [tenant] dynamic segment, so a cafe on either of these slugs
  // could never render.
  'org',
  'profile',
]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INDIAN_PIN_PATTERN = /^[1-9][0-9]{5}$/;

const MAX_MAP_URL_LENGTH = 500;
const ADDRESS_MAX_LENGTHS = {
  line1: 200,
  line2: 200,
  landmark: 120,
  city: 100,
  state: 100,
  country: 100,
};

const requiredName = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError(`${field} is required`);
  }
  return value.trim();
};

const normalizeSlug = (value) => {
  if (typeof value !== 'string') {
    throw new BadRequestError('cafe.slug is required');
  }
  const slug = value.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 63 || !SLUG_PATTERN.test(slug)) {
    throw new BadRequestError('cafe.slug must be a 3-63 character kebab-case value');
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new BadRequestError('cafe.slug is reserved');
  }
  return slug;
};

const validateTimezone = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError('cafe.timezone is required');
  }
  const timezone = value.trim();
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch (_) {
    throw new BadRequestError('cafe.timezone must be a valid IANA timezone');
  }
  return timezone;
};

const isValidHttpsUrl = (value) => {
  if (typeof value !== 'string' || !value.startsWith('https://')) {
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

const optionalAddressField = (value, field) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new BadRequestError(`address.${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > ADDRESS_MAX_LENGTHS[field]) {
    throw new BadRequestError(`address.${field} must be ${ADDRESS_MAX_LENGTHS[field]} characters or fewer`);
  }
  return trimmed;
};

const requiredAddressField = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError(`address.${field} is required`);
  }
  return optionalAddressField(value, field);
};

/**
 * The single validator for a cafe's postal address, shared by cafe
 * provisioning and by self-serve cafe applications so the two can never
 * drift. Returns every key present as a trimmed string.
 */
const validateAddress = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestError('address is required');
  }

  const postalCode = typeof value.postal_code === 'string' ? value.postal_code.trim() : '';
  if (!postalCode) {
    throw new BadRequestError('address.postal_code is required');
  }
  if (!INDIAN_PIN_PATTERN.test(postalCode)) {
    throw new BadRequestError('address.postal_code must be a 6-digit Indian PIN code');
  }

  let mapUrl = '';
  if (value.map_url !== undefined && value.map_url !== null && value.map_url !== '') {
    if (typeof value.map_url !== 'string') {
      throw new BadRequestError('address.map_url must be a string');
    }
    mapUrl = value.map_url.trim();
    if (mapUrl.length > MAX_MAP_URL_LENGTH) {
      throw new BadRequestError(`address.map_url must be ${MAX_MAP_URL_LENGTH} characters or fewer`);
    }
    if (!isValidHttpsUrl(mapUrl)) {
      throw new BadRequestError('address.map_url must be an https URL');
    }
  }

  return {
    line1: requiredAddressField(value.line1, 'line1'),
    line2: optionalAddressField(value.line2, 'line2'),
    landmark: optionalAddressField(value.landmark, 'landmark'),
    city: requiredAddressField(value.city, 'city'),
    state: requiredAddressField(value.state, 'state'),
    postal_code: postalCode,
    country: optionalAddressField(value.country, 'country') || 'India',
    map_url: mapUrl,
  };
};

module.exports = {
  RESERVED_SLUGS,
  SLUG_PATTERN,
  INDIAN_PIN_PATTERN,
  requiredName,
  normalizeSlug,
  validateTimezone,
  isValidHttpsUrl,
  validateAddress,
};
