const mongoose = require('mongoose');

const cafeSchema = new mongoose.Schema(
  {
    org_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization ID is required'],
    },
    name: {
      type: String,
      required: [true, 'Cafe name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Cafe slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    timezone: {
      type: String,
      required: [true, 'Timezone is required'],
      default: 'UTC',
    },
    reservation_rules: {
      default_turn_time_minutes: { type: Number, default: 90 },
      max_party_size: { type: Number, default: 12 },
      booking_lead_time_hours: { type: Number, default: 24 },
      hold_duration_minutes: { type: Number, default: 10 },
      payment_timeout_minutes: { type: Number, default: 15 },
      reservation_fee: { type: Number, default: 100 },
    },
    operating_hours: [
      {
        day_of_week: {
          type: String,
          enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
          required: true,
        },
        open_time: { type: String, default: '09:00' },
        close_time: { type: String, default: '22:00' },
        is_closed: { type: Boolean, default: false },
      },
    ],
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'description must be 1000 characters or fewer'],
      default: '',
    },
    hero_image_url: {
      type: String,
      trim: true,
      default: '',
    },
    contact_phone: {
      type: String,
      trim: true,
      default: '',
    },
    menu: [
      {
        category: {
          type: String,
          required: [true, 'menu category name is required'],
          trim: true,
          maxlength: 60,
        },
        items: [
          {
            name: {
              type: String,
              required: [true, 'menu item name is required'],
              trim: true,
              maxlength: 80,
            },
            description: { type: String, trim: true, default: '', maxlength: 300 },
            price: { type: Number, min: 0 },
          },
        ],
      },
    ],
    payments: {
      razorpay_key_id: { type: String, trim: true, default: '' },
      razorpay_key_secret_encrypted: { type: String, default: '' },
      razorpay_webhook_secret_encrypted: { type: String, default: '' },
      configured: { type: Boolean, default: false },
    },
    subscription_status: {
      type: String,
      enum: ['active', 'inactive', 'trial', 'past_due'],
      default: 'trial',
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Defense in depth: no response path (existing or future) should ever
// serialize the encrypted Razorpay credentials, even by accident. The
// one-time plaintext webhook secret shown right after a payments save is
// built separately by the controller — never sourced from this document.
const redactPaymentSecrets = (_doc, ret) => {
  if (ret.payments) {
    delete ret.payments.razorpay_key_secret_encrypted;
    delete ret.payments.razorpay_webhook_secret_encrypted;
  }
  return ret;
};

cafeSchema.set('toJSON', { transform: redactPaymentSecrets });
cafeSchema.set('toObject', { transform: redactPaymentSecrets });

module.exports = mongoose.model('Cafe', cafeSchema);
