const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const { UnauthorizedError } = require('../utils/errors');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies?.nb_session) {
      // Browser clients no longer send an Authorization header — the session
      // lives in an httpOnly cookie set on login (see authController.js).
      // Scoped to COOKIE_DOMAIN so both the app and API origins receive it.
      token = req.cookies.nb_session;
    }

    if (!token) {
      throw new UnauthorizedError('Authentication token missing or malformed');
    }

    const decoded = jwt.verify(token, config.JWT_SECRET);

    // A socket token (aud: 'socket', minted by getSocketToken for the
    // WebSocket handshake only) must not double as a REST bearer token —
    // otherwise its short TTL wouldn't actually bound what it can do (H-04).
    if (decoded.aud === 'socket') {
      throw new UnauthorizedError('This token is only valid for the WebSocket connection');
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      throw new UnauthorizedError('User account associated with token no longer exists');
    }

    // A token minted before the user's most recent password reset carries a
    // stale `tv` claim and must be rejected — otherwise resetting a password
    // (typically because someone else has access) would leave that access
    // valid for the rest of the token's 7-day life (H-05). Tokens minted
    // before this check existed carry no `tv` claim at all; treat that as
    // version 0 rather than invalidating every already-issued session.
    const tokenVersion = typeof decoded.tv === 'number' ? decoded.tv : 0;
    if (tokenVersion !== (user.token_version || 0)) {
      throw new UnauthorizedError('This session is no longer valid. Please log in again.');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
};
