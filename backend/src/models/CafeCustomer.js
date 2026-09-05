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
    // `private_notes` was removed: nothing ever wrote it (no endpoint, no
    // service, no UI) and every stored value was the empty-string default,
    // yet the Privacy Policy told guests that cafe staff could keep free-text
    // notes about them. Declaring a capability that does not exist is worse
    // than not having it. Reinstate it only alongside the UI that writes it,
    // the route that lets a guest read it back, and the policy wording.
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Local Rolodex compound index
cafeCustomerSchema.index({ cafe_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model('CafeCustomer', cafeCustomerSchema);
