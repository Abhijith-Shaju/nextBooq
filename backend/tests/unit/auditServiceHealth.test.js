// L-11: logAuditEvent used to swallow every failure into console.error
// alone -- a persistently failing write produced no alert and left silent
// gaps in the login-failure/rate-limit forensic record. getAuditLogHealth
// tracks consecutive failures so something can actually notice.
jest.mock('../../src/models/AuditLog');
const AuditLog = require('../../src/models/AuditLog');
const { logAuditEvent, getAuditLogHealth } = require('../../src/services/auditService');

describe('auditService health tracking', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('reports healthy with zero failures after a successful write', async () => {
    AuditLog.mockImplementation(() => ({ save: jest.fn().mockResolvedValue(undefined) }));

    await logAuditEvent({ cafeId: null, entityType: 'User', entityId: null, action: 'TEST_EVENT' });

    expect(getAuditLogHealth()).toEqual({ healthy: true, consecutiveFailures: 0 });
  });

  test('increments consecutiveFailures and reports unhealthy after a failed write', async () => {
    AuditLog.mockImplementation(() => ({ save: jest.fn().mockRejectedValue(new Error('write failed')) }));

    await logAuditEvent({ cafeId: null, entityType: 'User', entityId: null, action: 'TEST_EVENT' });
    await logAuditEvent({ cafeId: null, entityType: 'User', entityId: null, action: 'TEST_EVENT' });

    expect(getAuditLogHealth()).toEqual({ healthy: false, consecutiveFailures: 2 });
  });

  test('a subsequent successful write resets the failure count', async () => {
    AuditLog.mockImplementationOnce(() => ({ save: jest.fn().mockRejectedValue(new Error('write failed')) }));
    AuditLog.mockImplementationOnce(() => ({ save: jest.fn().mockResolvedValue(undefined) }));

    await logAuditEvent({ cafeId: null, entityType: 'User', entityId: null, action: 'TEST_EVENT' });
    expect(getAuditLogHealth().healthy).toBe(false);

    await logAuditEvent({ cafeId: null, entityType: 'User', entityId: null, action: 'TEST_EVENT' });
    expect(getAuditLogHealth()).toEqual({ healthy: true, consecutiveFailures: 0 });
  });
});
