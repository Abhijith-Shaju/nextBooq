const { generateVerificationCode, hashVerificationCode, VERIFICATION_CODE_TTL_MS } = require('../../src/utils/emailVerification');

describe('emailVerification code utility', () => {
  test('generateVerificationCode returns a 6-digit numeric code whose hash matches codeHash', () => {
    const { code, codeHash } = generateVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(hashVerificationCode(code)).toBe(codeHash);
  });

  test('generateVerificationCode sets an expiry roughly 15 minutes in the future', () => {
    const before = Date.now();
    const { expiresAt } = generateVerificationCode();
    const after = Date.now();
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + VERIFICATION_CODE_TTL_MS - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + VERIFICATION_CODE_TTL_MS + 1000);
  });

  test('generated codes are not all identical across many calls', () => {
    // With a 6-digit code space, a 20-sample collision-to-1-unique-value is
    // astronomically unlikely (not a real flake risk) — this just guards
    // against a broken generator that returns a constant.
    const codes = new Set();
    for (let i = 0; i < 20; i++) {
      codes.add(generateVerificationCode().code);
    }
    expect(codes.size).toBeGreaterThan(1);
  });

  test('hashVerificationCode is deterministic', () => {
    expect(hashVerificationCode('123456')).toBe(hashVerificationCode('123456'));
  });

  test('hashVerificationCode differs for different inputs', () => {
    expect(hashVerificationCode('123456')).not.toBe(hashVerificationCode('654321'));
  });
});
