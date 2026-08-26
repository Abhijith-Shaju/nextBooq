/**
 * Drops the superseded `{cafe_id, table_number, is_deleted}` unique index on
 * tables.
 *
 * That index made `is_deleted` part of the uniqueness key, so a cafe could
 * only ever hold ONE soft-deleted row per table_number: create table 5,
 * delete it, add it back, delete it again, and the second delete collides
 * with the first deleted row and fails as a duplicate-key 409 on what is an
 * ordinary delete. Table.js now declares a partial unique index scoped to
 * `is_deleted: false` instead, which is the real invariant — at most one LIVE
 * table per number, with deleted rows not indexed at all.
 *
 * Fixing the schema is not enough on its own: Mongoose creates newly declared
 * indexes but never removes ones that were dropped from the schema, so any
 * database that ran the old definition still has the broken index and still
 * exhibits the bug. This removes it.
 *
 * Refuses to drop the old index unless the replacement is already in place,
 * so the collection is never left without a uniqueness guard.
 * Safe to re-run — a migrated database reports nothing to do.
 *
 *   node scripts/dropStaleTableUniqueIndex.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Table = require('../src/models/Table');
const config = require('../src/config/env');

const STALE_INDEX = 'cafe_id_1_table_number_1_is_deleted_1';
const REPLACEMENT_INDEX = 'cafe_id_1_table_number_1';

const run = async () => {
  await mongoose.connect(config.MONGO_URI);
  console.log(`[indexes] connected to ${mongoose.connection.name}`);

  const collection = mongoose.connection.collection('tables');
  const indexes = await collection.indexes();

  const stale = indexes.find((i) => i.name === STALE_INDEX);
  const replacement = indexes.find((i) => i.name === REPLACEMENT_INDEX);

  if (!stale) {
    console.log('[indexes] nothing to do — the stale index is not present.');
    await mongoose.disconnect();
    return;
  }

  if (!replacement) {
    // Build the replacement before removing the old guard, so uniqueness is
    // enforced continuously rather than briefly dropping to nothing.
    console.log('[indexes] replacement index missing — creating it first...');
    await Table.syncIndexes({ background: true }).catch(async () => {
      await collection.createIndex(
        { cafe_id: 1, table_number: 1 },
        { unique: true, partialFilterExpression: { is_deleted: false }, name: REPLACEMENT_INDEX }
      );
    });
    console.log(`[indexes] created ${REPLACEMENT_INDEX}.`);
  }

  await collection.dropIndex(STALE_INDEX);
  console.log(`[indexes] dropped ${STALE_INDEX}.`);

  const after = await collection.indexes();
  console.log('[indexes] tables now has:');
  after.forEach((i) =>
    console.log(
      `   ${i.name} ${JSON.stringify(i.key)}` +
        `${i.unique ? ' UNIQUE' : ''}` +
        `${i.partialFilterExpression ? ` partial=${JSON.stringify(i.partialFilterExpression)}` : ''}`
    )
  );

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error('[indexes] failed:', error);
  process.exit(1);
});
