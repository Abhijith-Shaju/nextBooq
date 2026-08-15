const crypto = require('crypto');

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

const hashResetToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');

const generateResetToken = () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  return { rawToken, tokenHash, expiresAt };
};

module.exports = { generateResetToken, hashResetToken, RESET_TOKEN_TTL_MS };
