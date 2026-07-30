const Table = require('../../models/Table');
const { BadRequestError, NotFoundError } = require('../../utils/errors');
const { logAuditEvent } = require('../../services/auditService');

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

    const table = new Table({
      cafe_id: cafeId,
      table_number,
      capacity,
      can_merge_with: can_merge_with || [],
      status: status || 'active',
    });

    await table.save();

    // Maintain symmetric adjacency invariant if can_merge_with provided
    if (can_merge_with && can_merge_with.length > 0) {
      await Table.updateMany(
        { _id: { $in: can_merge_with }, cafe_id: cafeId },
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

    if (table_number !== undefined) existingTable.table_number = table_number;
    if (capacity !== undefined) existingTable.capacity = capacity;
    if (status !== undefined) existingTable.status = status;
    if (is_deleted !== undefined) existingTable.is_deleted = is_deleted;

    if (can_merge_with !== undefined) {
      // Remove symmetric reference from old neighbors no longer in array
      const removedIds = existingTable.can_merge_with.filter(
        (id) => !can_merge_with.includes(id.toString())
      );
      if (removedIds.length > 0) {
        await Table.updateMany(
          { _id: { $in: removedIds }, cafe_id: cafeId },
          { $pull: { can_merge_with: existingTable._id } }
        );
      }

      // Add symmetric reference to new neighbors
      if (can_merge_with.length > 0) {
        await Table.updateMany(
          { _id: { $in: can_merge_with }, cafe_id: cafeId },
          { $addToSet: { can_merge_with: existingTable._id } }
        );
      }

      existingTable.can_merge_with = can_merge_with;
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
