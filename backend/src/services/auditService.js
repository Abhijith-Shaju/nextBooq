const AuditLog = require('../models/AuditLog');

// Deliberately kept off the request's critical path -- a failed audit write
// never blocks or fails the action it's logging. But swallowing every
// failure into console.error alone means a persistently failing write (a
// bad index, a full disk) produces no alert and leaves silent gaps in the
// login-failure/rate-limit forensic record (L-11). Tracking a simple
// in-memory counter, surfaced through getAuditLogHealth() below, is the
// minimum needed to make that failure visible to whatever is watching
// this process (see /health in app.js) rather than only to logs no one
// is tailing.
let consecutiveFailures = 0;

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
    consecutiveFailures = 0;
    return log;
  } catch (error) {
    consecutiveFailures += 1;
    console.error(
      `[AUDIT LOG ERROR] Failed to record audit log (${consecutiveFailures} consecutive failure(s)):`,
      error
    );
  }
};

const getAuditLogHealth = () => ({
  healthy: consecutiveFailures === 0,
  consecutiveFailures,
});

module.exports = {
  logAuditEvent,
  getAuditLogHealth,
};
