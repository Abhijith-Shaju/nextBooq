const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema(
  {
    cafe_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cafe',
      required: true,
      index: true,
    },
    table_number: {
      type: String,
      required: true,
      trim: true,
    },
    capacity: {
      type: Number,
      required: true,
      min: [1, 'Table capacity must be at least 1'],
    },
    can_merge_with: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Table',
      },
    ],
    zone: {
      type: String,
      enum: ['indoor', 'window', 'outdoor', 'patio', 'private'],
      default: 'indoor',
    },
    status: {
      type: String,
      enum: ['active', 'out_of_service'],
      default: 'active',
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: '__v',
  }
);

tableSchema.index({ cafe_id: 1, table_number: 1, is_deleted: 1 }, { unique: true });
tableSchema.index({ cafe_id: 1, status: 1, is_deleted: 1 });

module.exports = mongoose.model('Table', tableSchema);
