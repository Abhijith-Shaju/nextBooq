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
    },
    plan_tier: {
      type: String,
      default: 'standard',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'trial', 'past_due'],
      default: 'active',
    },
    current_period_end: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
