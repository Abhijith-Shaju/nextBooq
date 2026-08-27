const { Resend } = require('resend');
const config = require('../config/env');

// Escape HTML special characters to prevent injection attacks
const escapeHtml = (str) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendPasswordResetEmail = async ({ to, resetUrl }) => {
  if (!config.RESEND_API_KEY) {
    console.log(
      `[emailService] RESEND_API_KEY not set — logging reset link instead of sending. to=${to} resetUrl=${resetUrl}`
    );
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  try {
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
  } catch (err) {
    // Defense in depth: the Resend SDK is documented to return {data, error}
    // rather than throw, but that's an implementation detail of a third-party
    // library, not a guarantee. If it does throw, don't let that propagate
    // and crash the fire-and-forget call site.
    console.error('[emailService] Failed to send password reset email:', err);
    return { logged: false, data: null, error: { message: err.message } };
  }
};

const sendVerificationEmail = async ({ to, code }) => {
  if (!config.RESEND_API_KEY) {
    console.log(
      `[emailService] RESEND_API_KEY not set — logging verification code instead of sending. to=${to} code=${code}`
    );
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: config.FROM_EMAIL,
      to,
      subject: 'Verify your nextBooq email address',
      html: `
        <p>Use the code below to verify this email address on your nextBooq account.</p>
        <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p>This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
      `,
    });

    if (error) {
      console.error('[emailService] Failed to send verification email:', error);
    }

    return { logged: false, data, error };
  } catch (err) {
    console.error('[emailService] Failed to send verification email:', err);
    return { logged: false, data: null, error: { message: err.message } };
  }
};

const sendContactEmail = async ({ name, email, message }) => {
  const recipient = config.CONTACT_EMAIL || config.FROM_EMAIL;

  if (!config.RESEND_API_KEY) {
    console.log(
      `[emailService] RESEND_API_KEY not set — logging contact form submission instead of sending. from=${name} <${email}> to=${recipient}`
    );
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  try {
    // Escape HTML in user-supplied content to prevent injection attacks
    const escapedName = escapeHtml(name);
    const escapedEmail = escapeHtml(email);
    const escapedMessage = escapeHtml(message);

    // Strip newlines from name before using in subject to prevent email header injection
    const safeNameForSubject = name.replace(/[\r\n]+/g, ' ');

    const { data, error } = await resend.emails.send({
      from: config.FROM_EMAIL,
      to: recipient,
      replyTo: email,
      subject: `New contact form message from ${safeNameForSubject}`,
      html: `
        <p><strong>From:</strong> ${escapedName} (${escapedEmail})</p>
        <p><strong>Message:</strong></p>
        <p>${escapedMessage}</p>
      `,
    });

    if (error) {
      console.error('[emailService] Failed to send contact form email:', error);
    }

    return { logged: false, data, error };
  } catch (err) {
    console.error('[emailService] Failed to send contact form email:', err);
    return { logged: false, data: null, error: { message: err.message } };
  }
};

module.exports = { sendPasswordResetEmail, sendVerificationEmail, sendContactEmail };
