const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    org_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    cafe_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cafe',
      required: true,
      index: true,
    },
    term_months: {
      type: Number,
      enum: [1, 6, 12, 18],
      required: true,
    },
    price_per_month: {
      type: Number,
      required: true,
      min: 0,
    },
    period_start: {
      type: Date,
      required: true,
      default: Date.now,
    },
    current_period_end: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['trial', 'active', 'past_due', 'inactive'],
      default: 'active',
    },
    // True for the one Subscription document per cafe that reflects its
    // live state; false for superseded history. A renewal never mutates an
    // old document — it flips this to false and inserts a new one, so past
    // terms survive as an audit trail.
    is_current: {
      type: Boolean,
      default: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Fast "what's this cafe's live state" lookup, used on every list/overview render.
subscriptionSchema.index({ cafe_id: 1, is_current: 1 });
// History, ordered newest-first.
subscriptionSchema.index({ cafe_id: 1, period_start: -1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
