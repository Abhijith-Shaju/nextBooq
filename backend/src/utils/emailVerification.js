const crypto = require('crypto');

const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const hashVerificationCode = (code) => crypto.createHash('sha256').update(code).digest('hex');

const generateVerificationCode = () => {
  // crypto.randomInt is cryptographically secure (unlike Math.random),
  // matching the same security posture as passwordReset.js's token generation.
  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const codeHash = hashVerificationCode(code);
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
  return { code, codeHash, expiresAt };
};

module.exports = { generateVerificationCode, hashVerificationCode, VERIFICATION_CODE_TTL_MS };
