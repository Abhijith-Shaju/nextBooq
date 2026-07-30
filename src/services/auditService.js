const AuditLog = require('../models/AuditLog');

const logAuditEvent = async ({
  cafeId,
  entityType,
  entityId,
  action,
  beforeState = null,
  afterState = null,
  performedByUserId = null,
}) => {
  try {
    const log = new AuditLog({
      cafe_id: cafeId,
      entity_type: entityType,
      entity_id: entityId,
      action: action,
      before_state: beforeState,
      after_state: afterState,
      performed_by: performedByUserId,
      timestamp: new Date(),
    });
    await log.save();
    return log;
  } catch (error) {
    console.error('[AUDIT LOG ERROR] Failed to record audit log:', error);
  }
};

module.exports = {
  logAuditEvent,
};
