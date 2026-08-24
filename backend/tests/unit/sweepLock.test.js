const { setupTestDB } = require('../setup');
const SweepLock = require('../../src/models/SweepLock');
const { acquireSweepLock } = require('../../src/utils/sweepLock');

setupTestDB();

// M-08: server.js runs background sweeps (stale holds/pending payments,
// lapsed subscriptions) on a plain setInterval. With more than one API
// instance running, every instance's interval fires the same sweep --
// acquireSweepLock is the guard that keeps only one of them actually
// executing it at a time.
describe('acquireSweepLock', () => {
  test('the first caller acquires the lock', async () => {
    const acquired = await acquireSweepLock('test-sweep', 60_000);
    expect(acquired).toBe(true);
  });

  test('a second caller is refused while the lock is still held', async () => {
    const first = await acquireSweepLock('concurrent-sweep', 60_000);
    const second = await acquireSweepLock('concurrent-sweep', 60_000);

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  test('a caller can acquire the lock again once it has expired', async () => {
    const first = await acquireSweepLock('expiring-sweep', 60_000);
    expect(first).toBe(true);

    // Simulate the lock's TTL having already elapsed.
    await SweepLock.updateOne(
      { name: 'expiring-sweep' },
      { $set: { locked_until: new Date(Date.now() - 1000) } }
    );

    const second = await acquireSweepLock('expiring-sweep', 60_000);
    expect(second).toBe(true);
  });

  test('different sweep names have independent locks', async () => {
    const a = await acquireSweepLock('sweep-a', 60_000);
    const b = await acquireSweepLock('sweep-b', 60_000);

    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  test('two instances racing to acquire the same never-locked name both leave exactly one winner', async () => {
    const [first, second] = await Promise.all([
      acquireSweepLock('racing-sweep', 60_000),
      acquireSweepLock('racing-sweep', 60_000),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });
});
