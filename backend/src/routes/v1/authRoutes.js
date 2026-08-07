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

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/customer-quick-auth', customerQuickAuth);
router.get('/me', authenticate, getMe);
router.post('/logout', logoutUser);

module.exports = router;

