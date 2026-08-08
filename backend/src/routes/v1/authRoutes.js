const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  customerQuickAuth,
} = require('../../controllers/authController');
const { authenticate } = require('../../middleware/auth');
const { authRateLimiter } = require('../../middleware/rateLimiter');

router.post('/register', authRateLimiter, registerUser);
router.post('/login', authRateLimiter, loginUser);
router.post('/customer-quick-auth', authRateLimiter, customerQuickAuth);
router.get('/me', authenticate, getMe);
router.post('/logout', logoutUser);

module.exports = router;

