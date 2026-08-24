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
    floor: {
      type: Number,
      default: 1,
      min: [1, 'Floor must be at least 1'],
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

// Partial rather than a plain { cafe_id, table_number, is_deleted } unique
// index: including is_deleted in the index key let two *deleted* rows for
// the same table_number collide (create -> delete -> recreate -> delete
// again writes a second deleted document with the same key), surfacing to
// the host as a confusing duplicate-key 409 on an ordinary delete (M-05).
// Scoping uniqueness to only live rows means a deleted table_number is
// simply not indexed at all, so it can never collide with anything.
tableSchema.index(
  { cafe_id: 1, table_number: 1 },
  { unique: true, partialFilterExpression: { is_deleted: false } }
);
tableSchema.index({ cafe_id: 1, status: 1, is_deleted: 1 });

module.exports = mongoose.model('Table', tableSchema);
