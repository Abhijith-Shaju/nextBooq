const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const { UnauthorizedError } = require('../utils/errors');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token missing or malformed');
    }

    const token = authHeader.split(' ')[1];
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
