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

const sendStepUpOtpEmail = async ({ to, code }) => {
  if (!config.RESEND_API_KEY) {
    console.log(
      `[emailService] RESEND_API_KEY not set — logging step-up code instead of sending. to=${to} code=${code}`
    );
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: config.FROM_EMAIL,
      to,
      subject: 'Your nextBooq security code',
      html: `
        <p>Use the code below to confirm it's you before making this change.</p>
        <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p>This code expires in 10 minutes. If you didn't request this, you can safely ignore this email — no change will be made without it.</p>
      `,
    });

    if (error) {
      console.error('[emailService] Failed to send step-up OTP email:', error);
    }

    return { logged: false, data, error };
  } catch (err) {
    console.error('[emailService] Failed to send step-up OTP email:', err);
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

const applicationReviewRecipient = () => config.ADMIN_EMAIL || config.CONTACT_EMAIL || config.FROM_EMAIL;

const formatAddressHtml = (address = {}) =>
  [address.line1, address.line2, address.landmark, address.city, address.state, address.postal_code, address.country]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => escapeHtml(part))
    .join(', ');

const sendCafeApplicationReviewEmail = async ({ application, applicant }) => {
  const recipient = applicationReviewRecipient();
  const reviewUrl = `${config.FRONTEND_URL}/admin/cafe-applications/${application.id}`;

  if (!config.RESEND_API_KEY) {
    console.log(
      `[emailService] RESEND_API_KEY not set — logging cafe application instead of sending. ref=${application.application_ref} to=${recipient} review=${reviewUrl}`
    );
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  try {
    // Same rationale as sendContactEmail: everything below is applicant-
    // supplied, so it is escaped for the body and newline-stripped for the
    // subject (header injection).
    const safeCafeNameForSubject = String(application.cafe_name).replace(/[\r\n]+/g, ' ');
    const mapLink = application.address?.map_url
      ? `<p><strong>Map:</strong> <a href="${escapeHtml(application.address.map_url)}">${escapeHtml(application.address.map_url)}</a></p>`
      : '';

    const { data, error } = await resend.emails.send({
      from: config.FROM_EMAIL,
      to: recipient,
      replyTo: applicant.email,
      subject: `New cafe application ${application.application_ref} — ${safeCafeNameForSubject}`,
      html: `
        <p>A cafe owner has applied to list a cafe on nextBooq.</p>
        <p><strong>Reference:</strong> ${escapeHtml(application.application_ref)}</p>
        <p><strong>Applicant:</strong> ${escapeHtml(applicant.name)} (${escapeHtml(applicant.email)}, ${escapeHtml(applicant.phone || '')})</p>
        <p><strong>Organization:</strong> ${escapeHtml(application.organization_name)}</p>
        <p><strong>Cafe:</strong> ${escapeHtml(application.cafe_name)}</p>
        <p><strong>Requested address:</strong> /${escapeHtml(application.cafe_slug)}</p>
        <p><strong>Timezone:</strong> ${escapeHtml(application.timezone)}</p>
        <p><strong>Address:</strong> ${formatAddressHtml(application.address)}</p>
        ${mapLink}
        <p><strong>Submitted:</strong> ${escapeHtml(new Date(application.created_at).toISOString())}</p>
        <p><a href="${reviewUrl}">Review this application</a></p>
      `,
    });

    if (error) {
      console.error('[emailService] Failed to send cafe application review email:', error);
    }

    return { logged: false, data, error };
  } catch (err) {
    console.error('[emailService] Failed to send cafe application review email:', err);
    return { logged: false, data: null, error: { message: err.message } };
  }
};

const sendCafeApplicationApprovedEmail = async ({ to, applicationRef, cafeName, cafeSlug }) => {
  if (!config.RESEND_API_KEY) {
    console.log(`[emailService] RESEND_API_KEY not set — logging approval instead of sending. to=${to} ref=${applicationRef}`);
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: config.FROM_EMAIL,
      to,
      subject: `Your cafe is live on nextBooq — ${applicationRef}`,
      html: `
        <p>Good news — ${escapeHtml(cafeName)} has been approved and is now live on nextBooq.</p>
        <p>Set your operating hours, tables and payment details before taking bookings:</p>
        <p><a href="${config.FRONTEND_URL}/${escapeHtml(cafeSlug)}/dashboard">Open your dashboard</a></p>
        <p>Application reference: ${escapeHtml(applicationRef)}</p>
      `,
    });

    if (error) {
      console.error('[emailService] Failed to send cafe application approval email:', error);
    }

    return { logged: false, data, error };
  } catch (err) {
    console.error('[emailService] Failed to send cafe application approval email:', err);
    return { logged: false, data: null, error: { message: err.message } };
  }
};

const sendCafeApplicationRejectedEmail = async ({ to, applicationRef, cafeName, note }) => {
  if (!config.RESEND_API_KEY) {
    console.log(`[emailService] RESEND_API_KEY not set — logging rejection instead of sending. to=${to} ref=${applicationRef}`);
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: config.FROM_EMAIL,
      to,
      subject: `About your nextBooq cafe application — ${applicationRef}`,
      html: `
        <p>We were not able to approve the application for ${escapeHtml(cafeName)} as submitted.</p>
        <p><strong>What we need:</strong> ${escapeHtml(note || 'Please get in touch so we can verify your cafe.')}</p>
        <p>You can update the details and apply again from your profile:</p>
        <p><a href="${config.FRONTEND_URL}/profile">Go to your profile</a></p>
        <p>Application reference: ${escapeHtml(applicationRef)}</p>
      `,
    });

    if (error) {
      console.error('[emailService] Failed to send cafe application rejection email:', error);
    }

    return { logged: false, data, error };
  } catch (err) {
    console.error('[emailService] Failed to send cafe application rejection email:', err);
    return { logged: false, data: null, error: { message: err.message } };
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendStepUpOtpEmail,
  sendContactEmail,
  sendCafeApplicationReviewEmail,
  sendCafeApplicationApprovedEmail,
  sendCafeApplicationRejectedEmail,
};
