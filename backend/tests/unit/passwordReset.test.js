const { generateResetToken, hashResetToken, RESET_TOKEN_TTL_MS } = require('../../src/utils/passwordReset');

describe('passwordReset token utility', () => {
  test('generateResetToken returns a raw token whose hash matches tokenHash', () => {
    const { rawToken, tokenHash } = generateResetToken();
    expect(hashResetToken(rawToken)).toBe(tokenHash);
  });

  test('generateResetToken sets an expiry roughly 30 minutes in the future', () => {
    const before = Date.now();
    const { expiresAt } = generateResetToken();
    const after = Date.now();
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + RESET_TOKEN_TTL_MS - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + RESET_TOKEN_TTL_MS + 1000);
  });

  test('two generated tokens are different', () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a.rawToken).not.toBe(b.rawToken);
  });

  test('hashResetToken is deterministic', () => {
    expect(hashResetToken('abc123')).toBe(hashResetToken('abc123'));
  });

  test('hashResetToken differs for different inputs', () => {
    expect(hashResetToken('abc123')).not.toBe(hashResetToken('xyz789'));
  });
});
