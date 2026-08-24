const mongoose = require('mongoose');

// Backs a simple distributed lock (see utils/sweepLock.js) so that when
// multiple API instances run the same setInterval-driven background sweep
// (server.js), only one of them actually executes it at a time -- without
// this, every replica multiplies the sweep's writes and OCC conflicts (M-08).
const sweepLockSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  locked_until: { type: Date, default: null },
});

module.exports = mongoose.model('SweepLock', sweepLockSchema);
