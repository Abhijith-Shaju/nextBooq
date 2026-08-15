const { Resend } = require('resend');
const config = require('../config/env');

const sendPasswordResetEmail = async ({ to, resetUrl }) => {
  if (!config.RESEND_API_KEY) {
    console.log(
      `[emailService] RESEND_API_KEY not set — logging reset link instead of sending. to=${to} resetUrl=${resetUrl}`
    );
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: config.FROM_EMAIL,
    to,
    subject: 'Reset your nextBooq password',
    html: `
      <p>We received a request to reset your nextBooq password.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>
    `,
  });

  if (error) {
    console.error('[emailService] Failed to send password reset email:', error);
  }

  return { logged: false, data, error };
};

module.exports = { sendPasswordResetEmail };
