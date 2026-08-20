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
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('User', userSchema);
