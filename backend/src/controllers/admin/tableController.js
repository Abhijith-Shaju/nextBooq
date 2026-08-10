const Table = require('../../models/Table');
const Reservation = require('../../models/Reservation');
const { BadRequestError, NotFoundError, UnprocessableEntityError } = require('../../utils/errors');
const { logAuditEvent } = require('../../services/auditService');

const ACTIVE_RESERVATION_STATUSES = ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'SEATED'];

/**
 * Rejects a table capacity reduction that would leave any active reservation's
 * party_size over the combined capacity of its assigned tables (accounting for
 * merge partners, not just this table alone) — mirrors the same invariant
 * enforced at booking time in allocationEngine/bookingService.
 */
const assertCapacityReductionIsSafe = async (cafeId, tableId, newCapacity) => {
  const reservations = await Reservation.find({
    cafe_id: cafeId,
    table_ids: tableId,
    status: { $in: ACTIVE_RESERVATION_STATUSES },
  });

  if (reservations.length === 0) return;

  const otherTableIds = new Set();
  reservations.forEach((r) => r.table_ids.forEach((id) => {
    if (id.toString() !== tableId.toString()) otherTableIds.add(id.toString());
  }));

  const otherTables = await Table.find({ _id: { $in: [...otherTableIds] } });
  const capacityById = new Map(otherTables.map((t) => [t._id.toString(), t.capacity]));

  for (const reservation of reservations) {
    const totalCapacity = reservation.table_ids.reduce((sum, id) => {
      const idStr = id.toString();
      return sum + (idStr === tableId.toString() ? newCapacity : capacityById.get(idStr) || 0);
    }, 0);

    if (reservation.party_size > totalCapacity) {
      throw new UnprocessableEntityError(
        `Cannot reduce capacity to ${newCapacity}: reservation ${reservation._id} (party of ${reservation.party_size}) would no longer fit`
      );
    }
  }
};

/**
 * The Table Editor UI lets a host pick merge partners by their human-readable
 * table_number (what's printed on the actual table), not by Mongo _id. This
 * resolves those table_numbers to real Table documents within the same cafe,
 * rejecting anything that doesn't resolve instead of letting an ObjectId cast
 * fail deep inside a .save() call.
 */
const resolveMergeTableIds = async (cafeId, tableNumbers, excludeTableId = null) => {
  if (!tableNumbers || tableNumbers.length === 0) return [];

  const query = { cafe_id: cafeId, table_number: { $in: tableNumbers }, is_deleted: false };
  if (excludeTableId) {
    query._id = { $ne: excludeTableId };
  }
  const matches = await Table.find(query);

  const foundNumbers = new Set(matches.map((t) => t.table_number));
  const unresolved = tableNumbers.filter((n) => !foundNumbers.has(n));
  if (unresolved.length > 0) {
    throw new BadRequestError(
      `can_merge_with references unknown table_number(s): ${unresolved.join(', ')}`
    );
  }

  return matches.map((t) => t._id);
};

const getTables = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const tables = await Table.find({ cafe_id: cafeId, is_deleted: false }).sort({ table_number: 1 });

    res.status(200).json({
      status: 'success',
      count: tables.length,
      data: tables,
    });
  } catch (error) {
    next(error);
  }
};

const createTable = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const { table_number, capacity, can_merge_with, status } = req.body;

    if (!table_number || !capacity) {
      throw new BadRequestError('table_number and capacity are required');
    }

    const mergeTableIds = await resolveMergeTableIds(cafeId, can_merge_with);

    const table = new Table({
      cafe_id: cafeId,
      table_number,
      capacity,
      can_merge_with: mergeTableIds,
      status: status || 'active',
    });

    await table.save();

    // Maintain symmetric adjacency invariant
    if (mergeTableIds.length > 0) {
      await Table.updateMany(
        { _id: { $in: mergeTableIds }, cafe_id: cafeId },
        { $addToSet: { can_merge_with: table._id } }
      );
    }

    await logAuditEvent({
      cafeId,
      entityType: 'Table',
      entityId: table._id,
      action: 'CREATE_TABLE',
      afterState: table.toObject(),
      performedByUserId: req.user._id,
    });

    res.status(201).json({
      status: 'success',
      data: table,
    });
  } catch (error) {
    next(error);
  }
};

const updateTable = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const { tableId } = req.params;
    const { table_number, capacity, can_merge_with, status, is_deleted } = req.body;

    const existingTable = await Table.findOne({ _id: tableId, cafe_id: cafeId });
    if (!existingTable) {
      throw new NotFoundError('Table not found');
    }

    const beforeState = existingTable.toObject();

    if (capacity !== undefined && capacity < existingTable.capacity) {
      await assertCapacityReductionIsSafe(cafeId, existingTable._id, capacity);
    }

    if (table_number !== undefined) existingTable.table_number = table_number;
    if (capacity !== undefined) existingTable.capacity = capacity;
    if (status !== undefined) existingTable.status = status;
    if (is_deleted !== undefined) existingTable.is_deleted = is_deleted;

    // Deleting a table must not leave it as a phantom merge partner for
    // whichever tables still reference it.
    if (is_deleted === true) {
      await Table.updateMany(
        { cafe_id: cafeId },
        { $pull: { can_merge_with: existingTable._id } }
      );
    }

    if (can_merge_with !== undefined) {
      const newMergeTableIds = await resolveMergeTableIds(cafeId, can_merge_with, existingTable._id);
      const newMergeIdStrings = new Set(newMergeTableIds.map((id) => id.toString()));

      // Remove symmetric reference from old neighbors no longer in array
      const removedIds = existingTable.can_merge_with.filter(
        (id) => !newMergeIdStrings.has(id.toString())
      );
      if (removedIds.length > 0) {
        await Table.updateMany(
          { _id: { $in: removedIds }, cafe_id: cafeId },
          { $pull: { can_merge_with: existingTable._id } }
        );
      }

      // Add symmetric reference to new neighbors
      if (newMergeTableIds.length > 0) {
        await Table.updateMany(
          { _id: { $in: newMergeTableIds }, cafe_id: cafeId },
          { $addToSet: { can_merge_with: existingTable._id } }
        );
      }

      existingTable.can_merge_with = newMergeTableIds;
    }

    await existingTable.save();

    await logAuditEvent({
      cafeId,
      entityType: 'Table',
      entityId: existingTable._id,
      action: 'UPDATE_TABLE',
      beforeState,
      afterState: existingTable.toObject(),
      performedByUserId: req.user._id,
    });

    res.status(200).json({
      status: 'success',
      data: existingTable,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTables,
  createTable,
  updateTable,
};
