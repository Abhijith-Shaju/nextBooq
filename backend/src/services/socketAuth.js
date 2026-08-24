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

  // Requires the aud: 'socket' claim minted only by getSocketToken
  // (authController.js) — a REST session token (no such claim) is rejected
  // here even if otherwise valid, so a leaked session token alone can't
  // open a live socket connection (H-04).
  const decoded = jwt.verify(token, config.JWT_SECRET, { audience: 'socket' });
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
