const express = require('express');
const router = express.Router();
const {
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
  changeName,
  requestStepUpOtp,
  updateAccountType,
} = require('../../controllers/authController');
const { authenticate } = require('../../middleware/auth');
const { authRateLimiter } = require('../../middleware/rateLimiter');

router.post('/register', authRateLimiter, registerUser);
router.post('/login', authRateLimiter, loginUser);
router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password', authRateLimiter, resetPassword);
router.post('/verify-email', authenticate, authRateLimiter, verifyEmail);
router.post('/resend-verification-email', authenticate, authRateLimiter, resendVerificationEmail);
router.post('/change-email', authenticate, authRateLimiter, changeEmail);
router.post('/change-phone', authenticate, authRateLimiter, changePhone);
// Not rate-limited alongside the credential changes: a display-name
// correction is neither a login identifier nor a uniqueness constraint,
// and sharing the auth bucket would let renaming yourself lock you out of
// signing in.
router.patch('/name', authenticate, changeName);
router.post('/request-step-up-otp', authenticate, authRateLimiter, requestStepUpOtp);
router.post('/customer-quick-auth', authRateLimiter, customerQuickAuth);
router.get('/me', authenticate, getMe);
router.patch('/account-type', authenticate, authRateLimiter, updateAccountType);
router.post('/logout', logoutUser);
router.get('/socket-token', authenticate, getSocketToken);

module.exports = router;

