const crypto = require('crypto');
const config = require('../config/env');

// AES-256-GCM needs a 32-byte key. ENCRYPTION_KEY may be any length/format
// (a passphrase, a hex string, etc.) so it's hashed down to exactly 32 bytes
// via SHA-256 rather than requiring the operator to generate key bytes in a
// specific encoding.
const getKey = () => crypto.createHash('sha256').update(config.ENCRYPTION_KEY).digest();

const IV_LENGTH = 12; // recommended IV length for GCM

const encrypt = (plaintext) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
};

const decrypt = (encoded) => {
  const parts = typeof encoded === 'string' ? encoded.split(':') : [];
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted value');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
};

module.exports = { encrypt, decrypt };
