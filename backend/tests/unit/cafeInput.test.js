const {
  normalizeSlug,
  validateTimezone,
  validateAddress,
  RESERVED_SLUGS,
  isValidHttpsUrl,
} = require('../../src/utils/cafeInput');

const validAddress = () => ({
  line1: '12 Church Street',
  line2: 'Ashok Nagar',
  landmark: 'Opposite the bookstore',
  city: 'Bengaluru',
  state: 'Karnataka',
  postal_code: '560001',
  map_url: 'https://maps.google.com/?q=12+Church+Street',
});

describe('normalizeSlug', () => {
  test('lowercases and trims a valid slug', () => {
    expect(normalizeSlug('  Filter-Kaapi  ')).toBe('filter-kaapi');
  });

  test('rejects slugs that are reserved', () => {
    for (const reserved of ['admin', 'api', 'auth', 'onboarding', 'pricing', 'org', 'profile']) {
      expect(() => normalizeSlug(reserved)).toThrow(/reserved/);
    }
  });

  test('rejects slugs outside the 3-63 character kebab-case shape', () => {
    expect(() => normalizeSlug('ab')).toThrow(/kebab-case/);
    expect(() => normalizeSlug('Not_Kebab')).toThrow(/kebab-case/);
    expect(() => normalizeSlug('-leading')).toThrow(/kebab-case/);
  });
});

describe('validateTimezone', () => {
  test('accepts a real IANA zone', () => {
    expect(validateTimezone('Asia/Kolkata')).toBe('Asia/Kolkata');
  });

  test('rejects a made-up zone', () => {
    expect(() => validateTimezone('Mars/Olympus')).toThrow(/IANA/);
  });
});

describe('isValidHttpsUrl', () => {
  test('accepts https and rejects everything else', () => {
    expect(isValidHttpsUrl('https://maps.google.com/?q=x')).toBe(true);
    expect(isValidHttpsUrl('http://maps.google.com')).toBe(false);
    expect(isValidHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isValidHttpsUrl('not a url')).toBe(false);
  });
});

describe('validateAddress', () => {
  test('returns every key trimmed, defaulting country to India', () => {
    const result = validateAddress({ ...validAddress(), line1: '  12 Church Street  ' });
    expect(result).toEqual({
      line1: '12 Church Street',
      line2: 'Ashok Nagar',
      landmark: 'Opposite the bookstore',
      city: 'Bengaluru',
      state: 'Karnataka',
      postal_code: '560001',
      country: 'India',
      map_url: 'https://maps.google.com/?q=12+Church+Street',
    });
  });

  test('allows the optional fields to be omitted entirely', () => {
    const result = validateAddress({
      line1: '12 Church Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      postal_code: '560001',
    });
    expect(result.line2).toBe('');
    expect(result.landmark).toBe('');
    expect(result.map_url).toBe('');
  });

  test.each(['line1', 'city', 'state', 'postal_code'])('requires %s', (field) => {
    const address = validAddress();
    delete address[field];
    expect(() => validateAddress(address)).toThrow(new RegExp(`address.${field}`));
  });

  test('rejects a PIN with a leading zero', () => {
    expect(() => validateAddress({ ...validAddress(), postal_code: '060001' })).toThrow(/6-digit/);
  });

  test('rejects a PIN that is not six digits', () => {
    expect(() => validateAddress({ ...validAddress(), postal_code: '56001' })).toThrow(/6-digit/);
    expect(() => validateAddress({ ...validAddress(), postal_code: '5600011' })).toThrow(/6-digit/);
  });

  test('rejects a non-https map_url', () => {
    expect(() => validateAddress({ ...validAddress(), map_url: 'http://maps.google.com' })).toThrow(/https/);
    expect(() => validateAddress({ ...validAddress(), map_url: 'javascript:alert(1)' })).toThrow(/https/);
  });

  test('rejects a map_url longer than 500 characters', () => {
    const long = `https://maps.google.com/?q=${'a'.repeat(500)}`;
    expect(() => validateAddress({ ...validAddress(), map_url: long })).toThrow(/500/);
  });

  test('rejects a non-object', () => {
    expect(() => validateAddress(null)).toThrow(/address is required/);
    expect(() => validateAddress('12 Church Street')).toThrow(/address is required/);
  });
});

describe('RESERVED_SLUGS', () => {
  test('covers every top-level control-plane route', () => {
    for (const reserved of ['admin', 'api', 'auth', 'onboarding', 'pricing', '_next', 'org', 'profile']) {
      expect(RESERVED_SLUGS.has(reserved)).toBe(true);
    }
  });
});
