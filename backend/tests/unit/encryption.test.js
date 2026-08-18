const { encrypt, decrypt } = require('../../src/utils/encryption');

describe('encryption utility (AES-256-GCM)', () => {
  test('round-trips a plaintext string through encrypt then decrypt', () => {
    const plaintext = 'rzp_live_super_secret_key_12345';
    const encrypted = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  test('produces a different ciphertext each time (random IV) for the same plaintext', () => {
    const plaintext = 'same input twice';
    const first = encrypt(plaintext);
    const second = encrypt(plaintext);

    expect(first).not.toBe(second);
    expect(decrypt(first)).toBe(plaintext);
    expect(decrypt(second)).toBe(plaintext);
  });

  test('throws when the ciphertext has been tampered with', () => {
    const encrypted = encrypt('some secret');
    const [iv, authTag, ciphertext] = encrypted.split(':');
    // Flip the last hex character of the ciphertext, keep iv/authTag identical.
    const tamperedCiphertext = ciphertext.slice(0, -1) + (ciphertext.slice(-1) === '0' ? '1' : '0');
    const tampered = `${iv}:${authTag}:${tamperedCiphertext}`;

    expect(() => decrypt(tampered)).toThrow();
  });

  test('throws on a malformed encoded string', () => {
    expect(() => decrypt('not-the-right-format')).toThrow();
  });
});
