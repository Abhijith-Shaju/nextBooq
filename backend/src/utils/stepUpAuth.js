const crypto = require('crypto');

// Deliberately a separate, shorter-lived pair of fields from
// email_verification_code_hash (emailVerification.js) — this gates re-proving
// identity for an already-trusted session before a high-value change
// (verified-account email change, Razorpay settings), not proving inbox
// ownership. Generic across those call sites: it's tied to the user, not to
// what they're about to do.
const STEP_UP_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

const hashStepUpOtp = (code) => crypto.createHash('sha256').update(code).digest('hex');

const generateStepUpOtp = () => {
  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const codeHash = hashStepUpOtp(code);
  const expiresAt = new Date(Date.now() + STEP_UP_OTP_TTL_MS);
  return { code, codeHash, expiresAt };
};

module.exports = { generateStepUpOtp, hashStepUpOtp, STEP_UP_OTP_TTL_MS };
