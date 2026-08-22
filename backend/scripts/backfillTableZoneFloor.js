/**
 * Backfills `zone` and `floor` onto Table documents created before those
 * fields existed.
 *
 * Mongoose schema defaults are applied when a document is hydrated, not
 * retroactively to stored rows — so pre-existing tables read back as
 * zone="indoor"/floor=1 through the API while the stored document has no
 * such field at all. That gap is invisible until something queries the
 * fields directly: `Table.find({ floor: 1 })` or any aggregation/.lean()
 * read silently skips those rows, because a missing field never equals 1.
 *
 * Safe to re-run — it only touches documents where the field is absent.
 *
 *   node scripts/backfillTableZoneFloor.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Table = require('../src/models/Table');
const config = require('../src/config/env');

const DEFAULT_ZONE = 'indoor';
const DEFAULT_FLOOR = 1;

const run = async () => {
  await mongoose.connect(config.MONGO_URI);
  console.log(`[backfill] connected to ${mongoose.connection.name}`);

  const missingZone = await Table.countDocuments({ zone: { $exists: false } });
  const missingFloor = await Table.countDocuments({ floor: { $exists: false } });
  console.log(`[backfill] tables missing zone: ${missingZone}`);
  console.log(`[backfill] tables missing floor: ${missingFloor}`);

  if (missingZone === 0 && missingFloor === 0) {
    console.log('[backfill] nothing to do — all tables already carry both fields.');
    await mongoose.disconnect();
    return;
  }

  const zoneResult = await Table.updateMany(
    { zone: { $exists: false } },
    { $set: { zone: DEFAULT_ZONE } }
  );
  const floorResult = await Table.updateMany(
    { floor: { $exists: false } },
    { $set: { floor: DEFAULT_FLOOR } }
  );

  console.log(`[backfill] zone  set on ${zoneResult.modifiedCount} table(s) -> "${DEFAULT_ZONE}"`);
  console.log(`[backfill] floor set on ${floorResult.modifiedCount} table(s) -> ${DEFAULT_FLOOR}`);

  const stillMissing =
    (await Table.countDocuments({ zone: { $exists: false } })) +
    (await Table.countDocuments({ floor: { $exists: false } }));
  console.log(
    stillMissing === 0
      ? '[backfill] done — every table now carries zone and floor.'
      : `[backfill] WARNING: ${stillMissing} document(s) still missing a field.`
  );

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error('[backfill] failed:', error);
  process.exit(1);
});
