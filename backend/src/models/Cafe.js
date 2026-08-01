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

// Routing performance index
cafeSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model('Cafe', cafeSchema);
