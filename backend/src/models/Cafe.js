const mongoose = require('mongoose');
const { addressSchema } = require('./address');

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
      // How the reservation fee behaves once collected. Cafes differ on
      // this: some treat it as a deposit that comes off the final bill,
      // others bill it separately and never refund it. Both are legitimate,
      // but the guest has to be told which one applies *before* paying, and
      // the published refund policy has to defer to it rather than assert a
      // single platform-wide rule.
      //
      // Defaults match the behaviour nextBooq published before these were
      // configurable, so an existing cafe's terms do not silently change.
      fee_adjusted_against_bill: { type: Boolean, default: true },
      refund_on_cancellation: { type: Boolean, default: true },
      // Hours before the reservation by which a guest must cancel to qualify
      // for a refund. Disclosed to the guest and used by staff when they
      // process a cancellation -- nothing enforces it programmatically,
      // because there is no customer-facing cancellation route yet.
      cancellation_cutoff_hours: { type: Number, default: 24 },
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
    // How strongly the hero photo shows through behind the storefront's
    // white headline/badges — a fixed dim (not a free-form value) so a cafe
    // can't pick a setting that makes their own hero text unreadable against
    // a bright/busy photo. See frontend/src/components/booking/hero.tsx.
    hero_overlay: {
      type: String,
      enum: ['subtle', 'balanced', 'vivid'],
      default: 'balanced',
    },
    contact_phone: {
      type: String,
      trim: true,
      default: '',
    },
    // Captured during onboarding for verification, then editable by the cafe
    // in its own settings and surfaced on the storefront. Optional at the
    // schema level on purpose — see models/address.js.
    address: {
      type: addressSchema,
      default: () => ({}),
    },
    // GeoJSON [longitude, latitude]. Deliberately unset for now: nothing
    // geocodes an address yet. The 2dsphere index below skips documents
    // missing this field, so it is inert until a "cafes near you" feature
    // populates it — at which point $near works with no migration.
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    logo_url: {
      type: String,
      trim: true,
      default: '',
    },
    // Injected by TenantProvider as the --brand-primary/--brand-accent CSS
    // variables the whole storefront palette derives from (see
    // tailwind.config.ts, where brand-red/brand-gold and the shadow-brand-*
    // recipes all resolve through them). Stored as CSS colours rather than
    // bare HSL triplets because those variables are consumed directly —
    // `var(--brand-primary)`, never `hsl(var(--brand-primary))`. Empty means
    // "use the platform default" (DEFAULT_TENANT_THEME).
    brand_primary: {
      type: String,
      trim: true,
      default: '',
    },
    brand_accent: {
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

cafeSchema.index({ location: '2dsphere' });

cafeSchema.set('toJSON', { transform: redactPaymentSecrets });
cafeSchema.set('toObject', { transform: redactPaymentSecrets });

module.exports = mongoose.model('Cafe', cafeSchema);
