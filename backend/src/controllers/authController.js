const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const config = require('../config/env');
const { BadRequestError, UnauthorizedError } = require('../utils/errors');
const { logAuditEvent } = require('../services/auditService');
const { ACTIVE_STAFF_MEMBERSHIP_POPULATE, buildAuthUserPayload } = require('../utils/authUserResponse');
const { getOwnedOrgId } = require('../services/orgOwnershipService');
const { generateResetToken, hashResetToken } = require('../utils/passwordReset');
const { sendPasswordResetEmail } = require('../services/emailService');

const SESSION_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, config.JWT_SECRET, { expiresIn: '7d' });
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
// frontend never reads or stores the raw token (see frontend/src/lib/session.ts
// and next.config.ts, which proxies frontend API calls through the Next.js
// origin so this cookie is visible to both the app and its route middleware).
// The token is still also returned in the JSON body for non-browser/API clients.
const setAuthCookie = (res, token) => {
  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
    path: '/',
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
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

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      throw new BadRequestError('User with this email already exists');
    }

    const existingPhone = await User.findOne({ phone: phone.trim() });
    if (existingPhone) {
      throw new BadRequestError('User with this phone number already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const user = new User({
      name: name.trim(),
      email: email.toLowerCase(),
      phone: phone.trim(),
      password_hash,
      staff_memberships: [],
    });

    await user.save();
    const token = generateToken(user._id);
    setAuthCookie(res, token);

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

    const token = generateToken(user._id);
    setAuthCookie(res, token);

    const ownerOrgId = await getOwnedOrgId(user);

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
        user: buildAuthUserPayload(user, { ownerOrgId }),
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

    const ownerOrgId = await getOwnedOrgId(user);

    res.status(200).json({
      status: 'success',
      data: buildAuthUserPayload(user, { ownerOrgId }),
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
    let user = await User.findOne({ email: cleanEmail });

    if (!user) {
      user = await User.findOne({ phone: phone.trim() });
    }

    if (!user) {
      assertPasswordStrength(password);

      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(password, salt);

      user = new User({
        name: name.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        password_hash,
        staff_memberships: [],
      });
      await user.save();
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

    const token = generateToken(user._id);
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
    const token = generateToken(req.user._id);
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
  customerQuickAuth,
  getSocketToken,
};

