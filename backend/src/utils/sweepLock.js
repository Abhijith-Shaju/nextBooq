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

  // Idempotently ensure the lock document exists. A concurrent create from
  // another instance racing this one is expected and harmless -- whichever
  // loses the race just finds the document already there.
  try {
    await SweepLock.create({ name, locked_until: null });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }

  const acquired = await SweepLock.findOneAndUpdate(
    { name, $or: [{ locked_until: null }, { locked_until: { $lte: now } }] },
    { $set: { locked_until: expiresAt } },
    { returnDocument: 'after' }
  );

  return Boolean(acquired);
};

module.exports = { acquireSweepLock };
