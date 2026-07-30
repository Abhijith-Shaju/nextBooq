const mongoose = require('mongoose');

const cafeCustomerSchema = new mongoose.Schema(
  {
    cafe_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cafe',
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    total_visits: {
      type: Number,
      default: 0,
    },
    total_no_shows: {
      type: Number,
      default: 0,
    },
    private_notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Local Rolodex compound index
cafeCustomerSchema.index({ cafe_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model('CafeCustomer', cafeCustomerSchema);
