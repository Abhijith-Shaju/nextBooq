const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const config = require('../config/env');
const { BadRequestError, UnauthorizedError } = require('../utils/errors');
const { logAuditEvent } = require('../services/auditService');
const { ACTIVE_STAFF_MEMBERSHIP_POPULATE, buildAuthUserPayload } = require('../utils/authUserResponse');
const { getOwnedOrgId } = require('../services/orgOwnershipService');
const { getLatestApplicationSummary } = require('../services/cafeApplicationService');
const { generateResetToken, hashResetToken } = require('../utils/passwordReset');
const { generateVerificationCode, hashVerificationCode } = require('../utils/emailVerification');
const { generateStepUpOtp, hashStepUpOtp } = require('../utils/stepUpAuth');
const { sendPasswordResetEmail, sendVerificationEmail, sendStepUpOtpEmail } = require('../services/emailService');

const SESSION_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

// tokenVersion is embedded as `tv` and compared against the user's current
// token_version by middleware/auth.js on every request — bumping
// token_version (done on password reset) invalidates every token minted
// with the old value, even though JWTs are otherwise stateless (H-05).
const generateToken = (userId, tokenVersion) => {
  return jwt.sign({ id: userId, tv: tokenVersion }, config.JWT_SECRET, { expiresIn: '7d' });
};

// Socket tokens used to reuse generateToken and inherit its 7-day expiry —
// a token deliberately handed to browser JS (unlike the httpOnly session
// cookie) staying valid for a week turned any XSS or log capture into a
// full week of account access rather than just a socket connection (H-04).
// Short TTL plus a distinct `aud` claim: socketAuth.js's handshake requires
// aud === 'socket' (so a leaked session token can't open a socket) and
// middleware/auth.js's REST authenticate rejects aud === 'socket' (so this
// token can't be replayed against the REST API either).
const SOCKET_TOKEN_TTL_SECONDS = 120;
const generateSocketToken = (userId) => {
  return jwt.sign({ id: userId }, config.JWT_SECRET, {
    expiresIn: SOCKET_TOKEN_TTL_SECONDS,
    audience: 'socket',
  });
};

// Only applied when *creating* a new account — never on login/auth of an
// existing user, since retroactively rejecting a pre-existing (weaker)
// password on login would lock out real customers rather than protect them.
const assertPasswordStrength = (password) => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
};

// Browser clients authenticate via this httpOnly cookie exclusively — the
// frontend never reads or stores the raw token (see
// frontend/src/lib/session.ts). It's scoped to COOKIE_DOMAIN
// (".nextbooq.in" in production, see config/env.js), so both the app's
// origin (www) and the API's own origin (api) receive it — that's what
// makes it visible to the Next.js route middleware as well as the API,
// without the two needing to be same-origin.
// The token is still also returned in the JSON body for non-browser/API clients.
//
// Both helpers must stay attribute-identical. A clearCookie whose domain,
// path, sameSite or secure flags differ from the cookie that was set does
// not match it, so the browser keeps the original and logout silently
// fails.
const SESSION_COOKIE_NAME = 'nb_session';

const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax',
  domain: config.COOKIE_DOMAIN || undefined,
  path: '/',
});

const setAuthCookie = (res, token) => {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(),
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
};

const registerUser = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!email || !phone || !password || !name) {
      throw new BadRequestError('Name, email, phone, and password are required');
    }
    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof phone !== 'string' ||
      typeof password !== 'string'
    ) {
      throw new BadRequestError('name, email, phone, and password must all be strings');
    }
    assertPasswordStrength(password);

    // One generic message for either conflict (L-06) -- distinguishing "email
    // taken" from "phone taken" would let a caller enumerate which specific
    // emails/phone numbers are already registered, the same enumeration
    // forgotPassword is deliberately careful to avoid.
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    const existingPhone = existingEmail ? null : await User.findOne({ phone: phone.trim() });
    if (existingEmail || existingPhone) {
      throw new BadRequestError('An account with this email or phone number already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const { code, codeHash, expiresAt } = generateVerificationCode();

    const user = new User({
      name: name.trim(),
      email: email.toLowerCase(),
      phone: phone.trim(),
      password_hash,
      staff_memberships: [],
      email_verification_code_hash: codeHash,
      email_verification_expires_at: expiresAt,
    });

    await user.save();
    const token = generateToken(user._id, user.token_version);
    setAuthCookie(res, token);

    // Fire-and-forget, same rationale as forgotPassword: verification email
    // delivery must never block or fail account creation.
    sendVerificationEmail({ to: user.email, code }).catch((err) => {
      console.error('[registerUser] Failed to send verification email:', err);
    });

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'REGISTER',
      performedByUserId: user._id,
    });

    res.status(201).json({
      status: 'success',
      data: {
        token,
        user: buildAuthUserPayload(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new BadRequestError('Email and password are required');
    }
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new BadRequestError('email and password must be strings');
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail }).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);
    if (!user) {
      await logAuditEvent({
        cafeId: null,
        entityType: 'User',
        entityId: null,
        action: 'LOGIN_FAILED',
        afterState: { attempted_email: cleanEmail, ip: req.ip },
        performedByUserId: null,
      });
      throw new UnauthorizedError('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await logAuditEvent({
        cafeId: null,
        entityType: 'User',
        entityId: user._id,
        action: 'LOGIN_FAILED',
        afterState: { ip: req.ip },
        performedByUserId: null,
      });
      throw new UnauthorizedError('Invalid credentials');
    }

    const token = generateToken(user._id, user.token_version);
    setAuthCookie(res, token);

    const [ownerOrgId, cafeApplication] = await Promise.all([
      getOwnedOrgId(user),
      getLatestApplicationSummary(user._id),
    ]);

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'LOGIN',
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      data: {
        token,
        user: buildAuthUserPayload(user, { ownerOrgId, cafeApplication }),
      },
    });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const [ownerOrgId, cafeApplication] = await Promise.all([
      getOwnedOrgId(user),
      getLatestApplicationSummary(user._id),
    ]);

    res.status(200).json({
      status: 'success',
      data: buildAuthUserPayload(user, { ownerOrgId, cafeApplication }),
    });
  } catch (error) {
    next(error);
  }
};

const logoutUser = async (req, res, next) => {
  try {
    clearAuthCookie(res);
    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      throw new BadRequestError('Email is required');
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (user) {
      const { rawToken, tokenHash, expiresAt } = generateResetToken();
      user.password_reset_token_hash = tokenHash;
      user.password_reset_expires_at = expiresAt;
      await user.save();

      const resetUrl = `${config.FRONTEND_URL}/auth/reset-password?token=${rawToken}`;
      // Fire-and-forget: awaiting this would make the found-user branch take
      // measurably longer than the not-found branch (network round-trip to
      // Resend), letting an attacker use response timing to enumerate valid
      // accounts even though the response body is identical either way.
      sendPasswordResetEmail({ to: user.email, resetUrl }).catch((err) => {
        console.error('[forgotPassword] Failed to send password reset email:', err);
      });

      await logAuditEvent({
        cafeId: null,
        entityType: 'User',
        entityId: user._id,
        action: 'PASSWORD_RESET_REQUESTED',
        performedByUserId: user._id,
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'If an account exists for that email, a reset link has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || typeof token !== 'string') {
      throw new BadRequestError('Reset token is required');
    }
    if (!password || typeof password !== 'string') {
      throw new BadRequestError('New password is required');
    }
    assertPasswordStrength(password);

    const tokenHash = hashResetToken(token);
    const user = await User.findOne({
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestError('This reset link is invalid or has expired.');
    }

    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(password, salt);
    user.password_reset_token_hash = null;
    user.password_reset_expires_at = null;
    // Invalidates every token issued before this reset (H-05) — the usual
    // reason to reset is that someone else has account access, so leaving
    // their already-issued token valid would defeat the point of resetting.
    user.token_version = (user.token_version || 0) + 1;
    await user.save();

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'PASSWORD_RESET',
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      message: 'Password updated. You can now log in.',
    });
  } catch (error) {
    next(error);
  }
};

// Doubles as the confirmation step for changeEmail: if the account has a
// pending_email (set by changeEmail), a matching code swaps it into `email`
// instead of just flipping is_email_verified on the already-verified live
// address. Both cases share the same code-hash/expiry fields, since only one
// outstanding code (signup or change) is ever valid at a time.
const verifyEmail = async (req, res, next) => {
  try {
    if (req.user.is_email_verified && !req.user.pending_email) {
      return res.status(200).json({
        status: 'success',
        message: 'Your email is already verified.',
      });
    }

    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      throw new BadRequestError('Verification code is required');
    }

    const codeHash = hashVerificationCode(code);
    const user = await User.findOne({
      _id: req.user._id,
      email_verification_code_hash: codeHash,
      email_verification_expires_at: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestError('Invalid or expired code.');
    }

    const wasEmailChange = Boolean(user.pending_email);
    if (wasEmailChange) {
      user.email = user.pending_email;
      user.pending_email = null;
    }
    user.is_email_verified = true;
    user.email_verification_code_hash = null;
    user.email_verification_expires_at = null;
    await user.save();

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: wasEmailChange ? 'EMAIL_CHANGED' : 'EMAIL_VERIFIED',
      afterState: wasEmailChange ? { email: user.email } : undefined,
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      message: wasEmailChange ? 'Email address updated and verified.' : 'Email verified.',
    });
  } catch (error) {
    next(error);
  }
};

const resendVerificationEmail = async (req, res, next) => {
  try {
    if (req.user.is_email_verified && !req.user.pending_email) {
      return res.status(200).json({
        status: 'success',
        message: 'Your email is already verified.',
      });
    }

    const { code, codeHash, expiresAt } = generateVerificationCode();

    const user = await User.findById(req.user._id);
    user.email_verification_code_hash = codeHash;
    user.email_verification_expires_at = expiresAt;
    await user.save();

    // A pending email change resends to the new (unconfirmed) address, not
    // the still-live current one.
    sendVerificationEmail({ to: user.pending_email || user.email, code }).catch((err) => {
      console.error('[resendVerificationEmail] Failed to send verification email:', err);
    });

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'EMAIL_VERIFICATION_RESENT',
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      message: 'Verification code sent.',
    });
  } catch (error) {
    next(error);
  }
};

// Starts an email change: verifies the caller's password, checks the new
// address isn't taken, and sends it a verification code. The live `email`
// stays untouched (and reservations/login keep working) until that code is
// confirmed via verifyEmail — this is what lets someone who fat-fingered
// their address at signup recover, rather than being stuck with an
// unverifiable account (M-related fix, see profile page change-email UI).
//
// If the account's current email is already verified, a password alone is
// not enough to start this — a stolen session/password combo could
// otherwise redirect a verified account to an attacker-controlled inbox and
// take it over from there. In that case the caller must also supply a
// step-up otpCode (from requestStepUpOtp, sent to the *current* email) — an
// unverified account skips this since there's no trusted inbox to step up
// through, and the password-only path is exactly the recovery case above.
const changeEmail = async (req, res, next) => {
  try {
    const { newEmail, currentPassword, otpCode } = req.body;
    if (!newEmail || typeof newEmail !== 'string') {
      throw new BadRequestError('New email address is required');
    }
    if (!currentPassword || typeof currentPassword !== 'string') {
      throw new BadRequestError('Current password is required');
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    if (user.is_email_verified) {
      if (!otpCode || typeof otpCode !== 'string') {
        throw new BadRequestError('Security code is required');
      }
      if (
        !user.step_up_code_hash ||
        !user.step_up_expires_at ||
        user.step_up_expires_at.getTime() < Date.now() ||
        hashStepUpOtp(otpCode) !== user.step_up_code_hash
      ) {
        throw new BadRequestError('Invalid or expired security code.');
      }
      user.step_up_code_hash = null;
      user.step_up_expires_at = null;
    }

    const cleanEmail = newEmail.trim().toLowerCase();
    if (cleanEmail === user.email) {
      throw new BadRequestError('That is already your current email address');
    }

    // Authenticated, single-field check — unlike registerUser's deliberately
    // generic conflict message (L-06, guards against an unauthenticated
    // caller enumerating registered accounts), the caller here already knows
    // the value they're submitting isn't secret.
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      throw new BadRequestError('That email address is already in use');
    }

    const { code, codeHash, expiresAt } = generateVerificationCode();
    user.pending_email = cleanEmail;
    user.email_verification_code_hash = codeHash;
    user.email_verification_expires_at = expiresAt;
    await user.save();

    sendVerificationEmail({ to: cleanEmail, code }).catch((err) => {
      console.error('[changeEmail] Failed to send verification email:', err);
    });

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'EMAIL_CHANGE_REQUESTED',
      afterState: { pending_email: cleanEmail },
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      message: `A verification code has been sent to ${cleanEmail}.`,
    });
  } catch (error) {
    next(error);
  }
};

// Phone has no verification step (unlike email) — a typo here only affects
// staff being able to reach the guest, not account access, so it updates
// immediately once the password check and uniqueness check pass.
const changePhone = async (req, res, next) => {
  try {
    const { newPhone, currentPassword } = req.body;
    if (!newPhone || typeof newPhone !== 'string') {
      throw new BadRequestError('New phone number is required');
    }
    if (!currentPassword || typeof currentPassword !== 'string') {
      throw new BadRequestError('Current password is required');
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const cleanPhone = newPhone.trim();
    if (cleanPhone === user.phone) {
      throw new BadRequestError('That is already your current phone number');
    }

    const existing = await User.findOne({ phone: cleanPhone });
    if (existing) {
      throw new BadRequestError('That phone number is already in use');
    }

    user.phone = cleanPhone;
    await user.save();

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'PHONE_CHANGED',
      afterState: { phone: cleanPhone },
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      message: 'Phone number updated.',
      data: { phone: cleanPhone },
    });
  } catch (error) {
    next(error);
  }
};

const ACCOUNT_TYPES = ['customer', 'cafe_owner'];

// Records which surface the account is for so the control-plane onboarding
// prompt is only ever shown once. Purely a navigation hint — see the comment
// on User.account_type. Returns the payload the same way getMe does (data
// directly, not nested under `user`) so the frontend can reuse one parser.
const updateAccountType = async (req, res, next) => {
  try {
    const { account_type } = req.body;
    if (!ACCOUNT_TYPES.includes(account_type)) {
      throw new BadRequestError(`account_type must be one of ${ACCOUNT_TYPES.join(', ')}`);
    }

    const user = await User.findById(req.user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);
    user.account_type = account_type;
    await user.save();

    const [ownerOrgId, cafeApplication] = await Promise.all([
      getOwnedOrgId(user),
      getLatestApplicationSummary(user._id),
    ]);

    res.status(200).json({
      status: 'success',
      data: buildAuthUserPayload(user, { ownerOrgId, cafeApplication }),
    });
  } catch (error) {
    next(error);
  }
};

// Sends a step-up code to the caller's own current (already-verified) email
// — a re-authentication gate for a small set of high-value actions (changing
// a verified account's email, updating a cafe's Razorpay settings) where a
// password/session alone shouldn't be enough. Requires is_email_verified
// since there's no trusted inbox to step up through otherwise; those actions'
// own unverified-account paths don't need this gate in the first place (see
// changeEmail).
const requestStepUpOtp = async (req, res, next) => {
  try {
    if (!req.user.is_email_verified) {
      throw new BadRequestError('Verify your email before requesting a security code.');
    }

    const { code, codeHash, expiresAt } = generateStepUpOtp();
    const user = await User.findById(req.user._id);
    user.step_up_code_hash = codeHash;
    user.step_up_expires_at = expiresAt;
    await user.save();

    sendStepUpOtpEmail({ to: user.email, code }).catch((err) => {
      console.error('[requestStepUpOtp] Failed to send step-up code:', err);
    });

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'STEP_UP_OTP_REQUESTED',
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      message: 'A security code has been sent to your email.',
    });
  } catch (error) {
    next(error);
  }
};

const customerQuickAuth = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!email || !phone || !name || !password) {
      throw new BadRequestError('Name, email, phone, and password are required');
    }
    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof phone !== 'string' ||
      typeof password !== 'string'
    ) {
      throw new BadRequestError('name, email, phone, and password must all be strings');
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();
    let user = await User.findOne({ email: cleanEmail });

    if (!user) {
      // Phone is a unique field on User, so creating a new account with a
      // phone number already tied to a different email would otherwise fail
      // with a raw duplicate-key error. Surface that conflict clearly instead
      // of silently logging the guest into the other account under a
      // password prompt that gives no indication *why* it's asking.
      const phoneOwner = await User.findOne({ phone: cleanPhone });
      if (phoneOwner) {
        throw new BadRequestError(
          'This phone number is already registered under a different email. Please sign in with that email instead, or use a different phone number.'
        );
      }
    }

    if (!user) {
      assertPasswordStrength(password);

      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(password, salt);

      const { code, codeHash, expiresAt } = generateVerificationCode();

      user = new User({
        name: name.trim(),
        email: cleanEmail,
        phone: cleanPhone,
        password_hash,
        staff_memberships: [],
        email_verification_code_hash: codeHash,
        email_verification_expires_at: expiresAt,
      });
      await user.save();

      // Fire-and-forget — same rationale as registerUser: email delivery
      // must never block or fail account creation / table hold.
      sendVerificationEmail({ to: user.email, code }).catch((err) => {
        console.error('[customerQuickAuth] Failed to send verification email:', err);
      });
    } else {
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        await logAuditEvent({
          cafeId: null,
          entityType: 'User',
          entityId: user._id,
          action: 'CUSTOMER_QUICK_AUTH_FAILED',
          afterState: { ip: req.ip },
          performedByUserId: null,
        });
        throw new UnauthorizedError('Invalid password for existing customer account');
      }
    }

    const token = generateToken(user._id, user.token_version);
    setAuthCookie(res, token);

    await user.populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'CUSTOMER_QUICK_AUTH',
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      data: {
        token,
        user: buildAuthUserPayload(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Issues a short-lived-in-practice token for the browser's WebSocket
// connection. Socket.IO connects directly to the backend's own origin (not
// proxied through Next.js like the REST API), so it can't rely on the
// httpOnly session cookie — the browser won't attach a cookie scoped to the
// frontend's origin to a cross-origin socket handshake. This endpoint is
// itself cookie/Bearer authenticated, so the frontend only ever holds this
// token transiently in memory to open the socket, never persisting it.
const getSocketToken = async (req, res, next) => {
  try {
    const token = generateSocketToken(req.user._id);
    res.status(200).json({
      status: 'success',
      data: { token },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
  customerQuickAuth,
  getSocketToken,
  changeEmail,
  changePhone,
  requestStepUpOtp,
  // Exported for backend/tests/unit/cookieDomain.test.js only — lets that
  // test assert on the exact cookie attributes res.cookie() is called with
  // (in particular Domain=) without spinning up the full app/DB.
  setAuthCookie,
  updateAccountType,
};

