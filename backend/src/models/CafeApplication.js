const mongoose = require('mongoose');
const { addressSchema } = require('./address');

// A cafe owner's request to have a cafe provisioned. Deliberately holds no
// Organization, Cafe, Subscription or staff membership: nothing enters live
// tenancy until a platform admin approves, at which point the existing
// provisionCafe() transaction is the sole writer.
const cafeApplicationSchema = new mongoose.Schema(
  {
    // Human-readable handle shared between the applicant's status screen and
    // the review email, so both sides can refer to the same string.
    application_ref: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    applicant_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organization_name: { type: String, required: true, trim: true },
    cafe_name: { type: String, required: true, trim: true },
    cafe_slug: { type: String, required: true, lowercase: true, trim: true },
    timezone: { type: String, required: true, trim: true },
    address: { type: addressSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'withdrawn'],
      default: 'pending',
    },
    // Shown to the applicant on rejection, so they know what to fix.
    review_note: { type: String, trim: true, maxlength: 1000, default: '' },
    reviewed_by_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewed_at: { type: Date, default: null },
    provisioned_cafe_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cafe', default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// One open application per user, enforced in the database rather than by a
// read-then-write check in the controller, so two concurrent submissions
// cannot both win.
cafeApplicationSchema.index(
  { applicant_user_id: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

// The admin review queue, newest first.
cafeApplicationSchema.index({ status: 1, created_at: -1 });

module.exports = mongoose.model('CafeApplication', cafeApplicationSchema);
