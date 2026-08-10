const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const { findStaffMembership } = require('../utils/staffMembership');

/**
 * Verifies a JWT presented at WebSocket handshake and loads the user it
 * belongs to. Without this, any client can connect and join any cafe's
 * real-time room (see isAuthorizedForCafe).
 */
const authenticateSocket = async (token) => {
  if (!token) {
    throw new Error('Missing authentication token');
  }

  const decoded = jwt.verify(token, config.JWT_SECRET);
  const user = await User.findById(decoded.id);
  if (!user) {
    throw new Error('User account associated with token no longer exists');
  }

  return user;
};

const isAuthorizedForCafe = (user, cafeId) => Boolean(findStaffMembership(user, cafeId));

module.exports = {
  authenticateSocket,
  isAuthorizedForCafe,
};
