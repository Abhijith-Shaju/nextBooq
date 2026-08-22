/**
 * Removes merge links between tables that are not in the same section.
 *
 * Merging means physically pushing two tables together, so partners must
 * share a zone and a floor. That rule is now enforced on write (see
 * tableController), but pairs created before it existed are still stored —
 * and nothing downstream re-checks them: generateMergeCombinations
 * (allocationEngine.js) builds seating combos purely from can_merge_with, so
 * a stale cross-section pair lets the booking engine allocate a party across
 * a table combination that cannot physically exist.
 *
 * Links are removed symmetrically, matching how they are written.
 * Safe to re-run — a clean database reports nothing to do.
 *
 *   node scripts/pruneCrossSectionMerges.js           # report only
 *   node scripts/pruneCrossSectionMerges.js --apply   # actually prune
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Table = require('../src/models/Table');
const Cafe = require('../src/models/Cafe');
const config = require('../src/config/env');

const APPLY = process.argv.includes('--apply');

const sectionOf = (table) => ({ zone: table.zone || 'indoor', floor: table.floor || 1 });
const sameSection = (a, b) => a.zone === b.zone && a.floor === b.floor;
const describe = ({ zone, floor }) => `${zone}/F${floor}`;

const run = async () => {
  await mongoose.connect(config.MONGO_URI);
  console.log(`[prune] connected to ${mongoose.connection.name}`);
  console.log(APPLY ? '[prune] APPLY mode — links will be removed.' : '[prune] dry run — pass --apply to remove.');

  const cafes = await Cafe.find({ is_deleted: false }).lean();
  let offending = 0;

  for (const cafe of cafes) {
    const tables = await Table.find({ cafe_id: cafe._id, is_deleted: false });
    const byId = new Map(tables.map((t) => [t._id.toString(), t]));

    for (const table of tables) {
      const stranded = (table.can_merge_with || []).filter((partnerId) => {
        const partner = byId.get(partnerId.toString());
        // A link to a table that no longer exists is its own kind of stale;
        // leave those to the delete path and only judge resolvable pairs here.
        return partner && !sameSection(sectionOf(table), sectionOf(partner));
      });

      if (stranded.length === 0) continue;

      for (const partnerId of stranded) {
        const partner = byId.get(partnerId.toString());
        // Report each unordered pair once.
        if (table._id.toString() < partnerId.toString()) {
          offending++;
          console.log(
            `  [${cafe.slug}] #${table.table_number} (${describe(sectionOf(table))})` +
              ` <-> #${partner.table_number} (${describe(sectionOf(partner))})`
          );
        }
      }

      if (APPLY) {
        await Table.updateOne(
          { _id: table._id },
          { $pull: { can_merge_with: { $in: stranded } } }
        );
      }
    }
  }

  if (offending === 0) {
    console.log('\n[prune] no cross-section merge pairs found.');
  } else {
    console.log(
      `\n[prune] ${offending} cross-section pair(s) ${APPLY ? 'removed' : 'found — re-run with --apply to remove'}.`
    );
  }

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error('[prune] failed:', error);
  process.exit(1);
});
