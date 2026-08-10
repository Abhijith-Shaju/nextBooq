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
    } else if (req.cookies?.accessToken) {
      // Browser clients no longer send an Authorization header — the session
      // lives in an httpOnly cookie set on login (see authController.js).
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new UnauthorizedError('Authentication token missing or malformed');
    }

    const decoded = jwt.verify(token, config.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      throw new UnauthorizedError('User account associated with token no longer exists');
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
