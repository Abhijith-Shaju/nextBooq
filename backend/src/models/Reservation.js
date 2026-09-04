const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { _id: false }
);

const paymentDataSchema = new mongoose.Schema(
  {
    order_id: { type: String, default: null },
    payment_id: { type: String, default: null },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    status: { type: String, default: 'CREATED' },
    webhook_processed: { type: Boolean, default: false },
    requires_manual_refund: { type: Boolean, default: false },
    expires_at: { type: Date, default: null },
  },
  { _id: false }
);

// The cafe's fee terms as they stood when this reservation was made.
//
// Snapshotted rather than read live off the Cafe, because these are the terms
// the guest actually agreed to at checkout. A cafe that later switches its
// fee to non-refundable must not retroactively change the deal for bookings
// already paid for -- reading the live setting at dispute time would let it.
const feePolicySchema = new mongoose.Schema(
  {
    // Each field is immutable in its own right, not just the parent path:
    // Mongoose's `immutable` on `fee_policy` only blocks reassigning the whole
    // subdocument, so without these a `reservation.fee_policy.x = y; save()`
    // would quietly persist and rewrite the agreed terms.
    adjusted_against_bill: { type: Boolean, required: true, immutable: true },
    refund_on_cancellation: { type: Boolean, required: true, immutable: true },
    cancellation_cutoff_hours: { type: Number, required: true, immutable: true },
  },
  { _id: false }
);

const reservationSchema = new mongoose.Schema(
  {
    cafe_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cafe',
      required: true,
      immutable: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    table_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Table',
        required: true,
      },
    ],
    start_time: {
      type: Date,
      required: true,
      immutable: true,
    },
    end_time: {
      type: Date,
      required: true,
      immutable: true,
      validate: {
        validator: function (value) {
          return value > this.start_time;
        },
        message: 'end_time must be strictly after start_time',
      },
    },
    party_size: {
      type: Number,
      required: true,
      min: [1, 'party_size must be greater than 0'],
      immutable: true,
    },
    reservation_timezone: {
      type: String,
      required: true,
    },
    hold_expires_at: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: [
        'HOLD',
        'PENDING_PAYMENT',
        'CONFIRMED',
        'CHECKED_IN',
        'SEATED',
        'COMPLETED',
        'NO_SHOW',
        'CANCELLED',
        'EXPIRED',
        'LEFT_BEFORE_SEATING',
      ],
      default: 'HOLD',
    },
    confirmed_at: { type: Date, default: null },
    checked_in_at: { type: Date, default: null },
    seated_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },

    status_history: [statusHistorySchema],
    payment_data: {
      type: paymentDataSchema,
      default: () => ({}),
    },
    // Immutable for the same reason cafe_id and start_time are: the terms of
    // a booking are not something any later write should be able to revise.
    fee_policy: {
      type: feePolicySchema,
      immutable: true,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: '__v',
  }
);

// Availability Optimization Compound Index
reservationSchema.index({ cafe_id: 1, status: 1, start_time: 1, end_time: 1 });
reservationSchema.index({ 'payment_data.order_id': 1 });
reservationSchema.index({ status: 1, 'payment_data.expires_at': 1 });
reservationSchema.index({ cafe_id: 1, start_time: -1 });
reservationSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.model('Reservation', reservationSchema);
