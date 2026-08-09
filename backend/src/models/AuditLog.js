const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    cafe_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cafe',
      required: false,
      index: true,
    },
    entity_type: {
      type: String,
      required: true,
    },
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
    action: {
      type: String,
      required: true,
    },
    before_state: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    after_state: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    performed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
