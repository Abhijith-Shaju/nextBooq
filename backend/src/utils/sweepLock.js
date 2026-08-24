const SweepLock = require('../models/SweepLock');

/**
 * Attempts to acquire a time-boxed, name-scoped lock so that only one
 * process runs a given background sweep at a time even when multiple API
 * instances are running the same setInterval (M-08). Returns true if this
 * call acquired the lock (the caller should run its sweep), false if
 * another process currently holds it.
 *
 * The lock self-expires via `locked_until` -- there is no release call. A
 * process that crashes mid-sweep simply leaves the lock to expire on its
 * own at the next scheduled run, rather than requiring cleanup.
 */
const acquireSweepLock = async (name, ttlMs) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    // A single atomic upsert: matches (and re-locks) an unlocked/expired
    // document, or inserts a fresh one if none exists yet. Two instances
    // racing to create the same never-seen-before lock name both attempt
    // the insert; the unique index on `name` lets exactly one succeed, and
    // the loser's insert fails with E11000 below -- there is no separate
    // create-then-update step that could leave a window for both to
    // believe they'd acquired it.
    const acquired = await SweepLock.findOneAndUpdate(
      { name, $or: [{ locked_until: null }, { locked_until: { $lte: now } }] },
      { $set: { locked_until: expiresAt } },
      { upsert: true, returnDocument: 'after' }
    );
    return Boolean(acquired);
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
};

module.exports = { acquireSweepLock };
