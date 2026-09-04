const mongoose = require('mongoose');

const staffMembershipSchema = new mongoose.Schema(
  {
    cafe_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cafe',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'manager', 'host', 'staff'],
      default: 'staff',
    },
    permissions: [
      {
        type: String,
        enum: [
          'manage_staff',
          'edit_tables',
          'edit_settings',
          'view_reservations',
          'edit_reservations',
          'cancel_reservations',
          'manage_billing',
        ],
      },
    ],
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password_hash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
    },
    staff_memberships: [staffMembershipSchema],
    // Cross-tenant nextBooq operator access, entirely separate from
    // per-cafe staff_memberships roles. Never settable through any HTTP
    // endpoint — only a one-off script (scripts/grantPlatformAdmin.js).
    is_platform_admin: {
      type: Boolean,
      default: false,
    },
    // Which surface this account said it was for, captured once after email
    // verification. A UI hint only: it decides where the browser goes next
    // and whether to re-prompt. It is NEVER an authorization signal — access
    // stays derived from staff_memberships, getOwnedOrgId() and
    // is_platform_admin.
    account_type: {
      type: String,
      enum: ['customer', 'cafe_owner'],
      default: null,
    },
    // Single-use, hashed, time-limited password reset token. Never stores
    // the raw token — only its SHA-256 hash (see backend/src/utils/passwordReset.js).
    // Cleared on successful reset, or overwritten by a newer forgot-password
    // request (only the most recent request's token is ever valid).
    password_reset_token_hash: {
      type: String,
      default: null,
    },
    password_reset_expires_at: {
      type: Date,
      default: null,
    },
    // 6-digit code, hashed (SHA-256) and time-limited, sent via email at
    // registration and customerQuickAuth (see backend/src/utils/emailVerification.js).
    // Cleared on successful verification, or overwritten by a newer code request (only
    // the most recently issued code is ever valid). Gates reservation creation:
    // POST /:cafeId/reservations returns 400 for unverified users.
    is_email_verified: {
      type: Boolean,
      default: false,
    },
    email_verification_code_hash: {
      type: String,
      default: null,
    },
    email_verification_expires_at: {
      type: Date,
      default: null,
    },
    // Set while an email-change request is awaiting confirmation (see
    // changeEmail in authController.js). The user's live `email` and
    // `is_email_verified` are untouched until the code sent to this address
    // is confirmed via verifyEmail, which then copies this into `email` and
    // clears it. Reuses the same code-hash/expiry fields above rather than a
    // separate pair, since only one outstanding code (signup or change) is
    // ever valid at a time.
    pending_email: {
      type: String,
      default: null,
    },
    // 6-digit code, hashed and time-limited (see backend/src/utils/stepUpAuth.js),
    // sent to the user's own already-verified email as a re-authentication
    // step before a high-value change (changing a verified account's email,
    // updating a cafe's Razorpay settings) — guards against a stolen session
    // alone being enough to make those changes. Cleared once consumed or
    // overwritten by a newer request.
    step_up_code_hash: {
      type: String,
      default: null,
    },
    step_up_expires_at: {
      type: Date,
      default: null,
    },
    // Bumped on password reset to invalidate every JWT issued before that
    // point (H-05) — JWTs are otherwise stateless, so without this a reset
    // (typically requested because someone else has account access) leaves
    // that access valid for up to the token's full 7-day lifetime.
    // middleware/auth.js rejects any token whose `tv` claim doesn't match
    // the user's current value. Not bumped on logout — that stays scoped to
    // clearing the current device's cookie, not revoking every session.
    token_version: {
      type: Number,
      default: 0,
    },
    // When this user affirmatively accepted the Terms.
    //
    // The Terms claim acceptance happens "by clicking I Agree", and until this
    // existed nothing recorded that anyone had. Indian courts treat clickwrap
    // as materially stronger evidence than browsewrap, so the claim needs a
    // record behind it. Null on accounts created before this shipped -- absence
    // means unknown, not refused.
    terms_accepted_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('User', userSchema);
