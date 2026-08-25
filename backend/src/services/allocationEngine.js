const Reservation = require('../models/Reservation');
const Table = require('../models/Table');
const { UnprocessableEntityError } = require('../utils/errors');
const { getSeatedTableIds } = require('./tableOccupancyService');

/**
 * Finds overlapping active reservations for a given cafe and time window.
 */
const getBlockedTableIds = async (cafeId, startTime, endTime, session = null, excludeReservationId = null) => {
  const now = new Date();

  const query = Reservation.find({
    cafe_id: cafeId,
    ...(excludeReservationId ? { _id: { $ne: excludeReservationId } } : {}),
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
  return blockedTableIdsFromReservations(overlappingReservations, startTime, endTime);
};

/**
 * Pure, in-memory equivalent of getBlockedTableIds' overlap filter — given a
 * pre-fetched batch of candidate reservations (already narrowed to the
 * cafe/status/day of interest), returns the tables blocked for one specific
 * [startTime, endTime) window without touching the database again. Backs the
 * batched multi-slot allocation check below.
 */
const blockedTableIdsFromReservations = (reservations, startTime, endTime, excludeReservationId = null) => {
  const now = new Date();
  const blockedTableIds = new Set();

  for (const res of reservations) {
    if (excludeReservationId && res._id.toString() === excludeReservationId.toString()) continue;
    if (!(res.start_time < endTime && res.end_time > startTime)) continue;
    if (res.status === 'HOLD' && !(res.hold_expires_at > now)) continue;
    for (const tableId of res.table_ids) {
      blockedTableIds.add(tableId.toString());
    }
  }

  return blockedTableIds;
};

/**
 * Fetches the tables and candidate reservations needed to check availability
 * across an entire range of slot windows (e.g. every slot in a day) in two
 * queries total, instead of the two-queries-per-candidate-slot cost of
 * calling allocateTables() in a loop (L-04).
 */
const prefetchAvailabilityData = async (cafeId, windowStart, windowEnd) => {
  const [tables, reservations] = await Promise.all([
    Table.find({ cafe_id: cafeId, status: 'active', is_deleted: false }).exec(),
    Reservation.find({
      cafe_id: cafeId,
      status: { $in: ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'SEATED'] },
      start_time: { $lt: windowEnd },
      end_time: { $gt: windowStart },
    }).exec(),
  ]);

  return { tables, reservations };
};

/**
 * Same allocation decision as allocateTables(), evaluated entirely in memory
 * against a batch fetched by prefetchAvailabilityData() — no DB access.
 */
const allocateTablesFromPrefetched = (tables, reservations, startTime, endTime, partySize) => {
  const blockedTableIds = blockedTableIdsFromReservations(reservations, startTime, endTime);
  const availableTables = tables.filter((t) => !blockedTableIds.has(t._id.toString()));

  if (availableTables.length === 0) {
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
 * Runs the original combinatorial search (every ascending-index subset up
 * to maxDepth, filtered by isConnected) against one already-isolated group
 * of tables. Left as-is from before L-05 -- the fix is in how
 * generateMergeCombinations partitions the input before calling this, not
 * in the search itself.
 */
const searchConnectedCombinations = (tables, partySize, maxDepth) => {
  const tableMap = new Map(tables.map((t) => [t._id.toString(), t]));
  const validCombinations = [];

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
 * Generates connected combinations of tables up to maxDepth (3).
 *
 * Two tables that are mutually unreachable via can_merge_with (in either
 * direction) can never pass isConnected together, so any subset spanning
 * two of the floor plan's merge-adjacency components is guaranteed invalid.
 * Previously the search enumerated every subset of the ENTIRE table list
 * regardless (~161,700 checks per call at 100 tables) and relied on
 * isConnected to reject the cross-component ones after the fact. Splitting
 * into connected components first and running the unmodified search on
 * each component separately produces the identical result set (every valid
 * combo lives entirely within one component, and per-component relative
 * table order is preserved) while skipping that wasted combinatorial work
 * -- the dominant cost in a real floor plan, where most tables are single,
 * non-mergeable tables or belong to small merge clusters (L-05).
 */
const generateMergeCombinations = (tables, partySize, maxDepth = 3) => {
  const undirectedNeighbors = new Map(tables.map((t) => [t._id.toString(), new Set()]));
  for (const table of tables) {
    const id = table._id.toString();
    for (const neighborIdObj of table.can_merge_with || []) {
      const neighborId = neighborIdObj.toString();
      if (!undirectedNeighbors.has(neighborId)) continue;
      undirectedNeighbors.get(id).add(neighborId);
      undirectedNeighbors.get(neighborId).add(id);
    }
  }

  const visited = new Set();
  const componentIdSets = [];
  for (const table of tables) {
    const id = table._id.toString();
    if (visited.has(id)) continue;

    const stack = [id];
    visited.add(id);
    const componentIds = new Set();
    while (stack.length > 0) {
      const currentId = stack.pop();
      componentIds.add(currentId);
      for (const neighborId of undirectedNeighbors.get(currentId)) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          stack.push(neighborId);
        }
      }
    }
    componentIdSets.push(componentIds);
  }

  const validCombinations = [];
  for (const componentIds of componentIdSets) {
    // A table with no merge partners at all can never form a multi-table
    // combo -- skip the search entirely for singleton components.
    if (componentIds.size < 2) continue;

    const componentTables = tables.filter((t) => componentIds.has(t._id.toString()));
    validCombinations.push(...searchConnectedCombinations(componentTables, partySize, maxDepth));
  }

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
 *   - schedule overlap: another reservation holds the table during the
 *     window this reservation will actually occupy. This also excludes this
 *     reservation's own tables (it overlaps itself), which is what we want —
 *     the whole point is to land on a different table.
 *   - live occupancy: another party is physically SEATED there right now,
 *     even if their booked window has already ended.
 *
 * The schedule-overlap check does NOT simply reuse `[start_time, end_time)`.
 * Nothing in this app constrains WHEN a reservation may be moved to SEATED —
 * a host can seat a party late (arriving after `end_time` has already
 * passed) or early (before `start_time`). If we only checked the booked
 * window, a table that's free on paper but booked by someone else for the
 * hours the party will actually be sitting there would look free and get
 * suggested — seating two real parties at one table, exactly what this
 * feature exists to prevent. So the window checked here is widened to the
 * union of the booked window and the window starting now (spanning the same
 * duration), i.e. the earlier of `now`/`start_time` through the later of
 * `end_time`/`now + duration`. This is deliberately conservative: it can
 * exclude a table that would in fact have been free, but failing to offer a
 * suggestion only costs the host a manual decision, whereas suggesting an
 * occupied table double-books it.
 *
 * Returns null when nothing else fits, so the caller can omit the suggestion
 * rather than offering the host a dead end.
 */
const suggestAlternateTable = async (cafeId, reservation) => {
  const now = new Date();
  const duration = reservation.end_time.getTime() - reservation.start_time.getTime();
  const nowWindowEnd = new Date(now.getTime() + duration);

  const windowStart = now < reservation.start_time ? now : reservation.start_time;
  const windowEnd = reservation.end_time > nowWindowEnd ? reservation.end_time : nowWindowEnd;

  const blockedBySchedule = await getBlockedTableIds(cafeId, windowStart, windowEnd);
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
  prefetchAvailabilityData,
  allocateTablesFromPrefetched,
};
