const mongoose = require('mongoose');

// Shared by Cafe and CafeApplication so approving an application can copy
// the subdocument across verbatim, with no field mapping to drift.
// Deliberately has no `required` fields: requiring them here would make every
// pre-existing addressless Cafe fail validation on its next save() (see
// updateCafe / updateCafePayments). Requiredness is enforced at the input
// layer by validateAddress in utils/cafeInput.js.
const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true, maxlength: 200, default: '' },
    line2: { type: String, trim: true, maxlength: 200, default: '' },
    landmark: { type: String, trim: true, maxlength: 120, default: '' },
    city: { type: String, trim: true, maxlength: 100, default: '' },
    state: { type: String, trim: true, maxlength: 100, default: '' },
    postal_code: { type: String, trim: true, maxlength: 10, default: '' },
    country: { type: String, trim: true, maxlength: 100, default: 'India' },
    map_url: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false }
);

module.exports = { addressSchema };
