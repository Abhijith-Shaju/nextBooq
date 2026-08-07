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
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('User', userSchema);
