const Reservation = require('../models/Reservation');
const Table = require('../models/Table');
const { UnprocessableEntityError } = require('../utils/errors');
const { getSeatedTableIds } = require('./tableOccupancyService');

/**
 * Finds overlapping active reservations for a given cafe and time window.
 */
const getBlockedTableIds = async (cafeId, startTime, endTime, session = null) => {
  const now = new Date();

  const query = Reservation.find({
    cafe_id: cafeId,
    status: { $in: ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'SEATED'] },
    start_time: { $lt: endTime },
    end_time: { $gt: startTime },
    $or: [
      { status: { $ne: 'HOLD' } },
      { hold_expires_at: { $gt: now } },
    ],
  });

  if (session) {
    query.session(session);
  }

  const overlappingReservations = await query.exec();
  const blockedTableIds = new Set();

  for (const res of overlappingReservations) {
    for (const tableId of res.table_ids) {
      blockedTableIds.add(tableId.toString());
    }
  }

  return blockedTableIds;
};

/**
 * Helper to generate connected combinations of tables up to maxDepth (3).
 */
const generateMergeCombinations = (tables, partySize, maxDepth = 3) => {
  const tableMap = new Map(tables.map((t) => [t._id.toString(), t]));
  const validCombinations = [];

  // Helper to check if a subset of tables forms a connected graph via can_merge_with
  const isConnected = (tableList) => {
    if (tableList.length <= 1) return true;
    const visited = new Set();
    const stack = [tableList[0]._id.toString()];
    visited.add(tableList[0]._id.toString());

    const subsetIds = new Set(tableList.map((t) => t._id.toString()));

    while (stack.length > 0) {
      const currentId = stack.pop();
      const currentTable = tableMap.get(currentId);

      if (currentTable && currentTable.can_merge_with) {
        for (const neighborIdObj of currentTable.can_merge_with) {
          const neighborId = neighborIdObj.toString();
          if (subsetIds.has(neighborId) && !visited.has(neighborId)) {
            visited.add(neighborId);
            stack.push(neighborId);
          }
        }
      }
    }

    return visited.size === tableList.length;
  };

  const backtrack = (startIdx, currentCombo, currentCapacity) => {
    if (currentCombo.length >= 2) {
      if (currentCapacity >= partySize && isConnected(currentCombo)) {
        validCombinations.push({
          tables: [...currentCombo],
          tableIds: currentCombo.map((t) => t._id),
          totalCapacity: currentCapacity,
          tableCount: currentCombo.length,
          excessCapacity: currentCapacity - partySize,
          startingTableNumber: currentCombo
            .map((t) => t.table_number)
            .sort()[0],
        });
      }
    }

    if (currentCombo.length >= maxDepth) return;

    for (let i = startIdx; i < tables.length; i++) {
      const table = tables[i];
      backtrack(i + 1, [...currentCombo, table], currentCapacity + table.capacity);
    }
  };

  backtrack(0, [], 0);

  return validCombinations;
};

/**
 * Picks the best-fit table (or connected merge combo) for a party from an
 * already-filtered list of available tables. Returns null when nothing fits,
 * leaving the choice of error message (or of not erroring at all) to the caller.
 */
const selectBestFit = (availableTables, partySize) => {
  // Single Table Fit
  const singleFitTables = availableTables
    .filter((t) => t.capacity >= partySize)
    .sort((a, b) => {
      if (a.capacity !== b.capacity) {
        return a.capacity - b.capacity;
      }
      return a.table_number.localeCompare(b.table_number, undefined, { numeric: true });
    });

  if (singleFitTables.length > 0) {
    const selected = singleFitTables[0];
    return {
      tableIds: [selected._id],
      tables: [selected],
      totalCapacity: selected.capacity,
      isMerged: false,
    };
  }

  // Multi-Table Merge Fallback (maxDepth = 3)
  const mergeCombinations = generateMergeCombinations(availableTables, partySize, 3);

  if (mergeCombinations.length === 0) {
    return null;
  }

  // Sort combinations deterministically:
  // 1) Lowest excess capacity
  // 2) Fewest tables
  // 3) Lowest starting table number
  mergeCombinations.sort((a, b) => {
    if (a.excessCapacity !== b.excessCapacity) {
      return a.excessCapacity - b.excessCapacity;
    }
    if (a.tableCount !== b.tableCount) {
      return a.tableCount - b.tableCount;
    }
    return a.startingTableNumber.localeCompare(b.startingTableNumber, undefined, { numeric: true });
  });

  const bestCombo = mergeCombinations[0];
  return {
    tableIds: bestCombo.tableIds,
    tables: bestCombo.tables,
    totalCapacity: bestCombo.totalCapacity,
    isMerged: true,
  };
};

/**
 * Best-Fit Table Allocation Engine
 */
const allocateTables = async (cafeId, startTime, endTime, partySize, session = null) => {
  // Step 1: Overlap exclusion query
  const blockedTableIds = await getBlockedTableIds(cafeId, startTime, endTime, session);

  // Step 2: Fetch available active tables
  const tableQuery = Table.find({
    cafe_id: cafeId,
    status: 'active',
    is_deleted: false,
    _id: { $nin: Array.from(blockedTableIds) },
  });

  if (session) {
    tableQuery.session(session);
  }

  const availableTables = await tableQuery.exec();

  if (!availableTables || availableTables.length === 0) {
    throw new UnprocessableEntityError('No available tables for the requested time slot');
  }

  const selection = selectBestFit(availableTables, partySize);

  if (!selection) {
    throw new UnprocessableEntityError(
      `No available table layout can accommodate a party of ${partySize}`
    );
  }

  return selection;
};

/**
 * Finds an alternate table (or merge combo) a reservation could be seated at
 * instead of its currently-assigned one, backing the host-facing "reassign"
 * option on a seating conflict.
 *
 * Excludes tables blocked in two genuinely different ways:
 *   - schedule overlap: another reservation holds the table during this
 *     reservation's booked window. This also excludes this reservation's own
 *     tables (it overlaps itself), which is what we want — the whole point is
 *     to land on a different table.
 *   - live occupancy: another party is physically SEATED there right now,
 *     even if their booked window has already ended.
 *
 * Returns null when nothing else fits, so the caller can omit the suggestion
 * rather than offering the host a dead end.
 */
const suggestAlternateTable = async (cafeId, reservation) => {
  const blockedBySchedule = await getBlockedTableIds(
    cafeId,
    reservation.start_time,
    reservation.end_time
  );
  const blockedBySeating = await getSeatedTableIds(cafeId, reservation._id);

  const blockedTableIds = new Set([...blockedBySchedule, ...blockedBySeating]);

  const availableTables = await Table.find({
    cafe_id: cafeId,
    status: 'active',
    is_deleted: false,
    _id: { $nin: Array.from(blockedTableIds) },
  }).exec();

  if (!availableTables || availableTables.length === 0) {
    return null;
  }

  return selectBestFit(availableTables, reservation.party_size);
};

module.exports = {
  allocateTables,
  getBlockedTableIds,
  generateMergeCombinations,
  selectBestFit,
  suggestAlternateTable,
};
