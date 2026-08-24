const request = require('supertest');
const app = require('../../src/app');

// L-11: /health now surfaces audit-log write health so a persistently
// failing audit trail is visible to a monitor reading the body, not only to
// logs no one is tailing. Status stays 200 regardless (see app.js comment) --
// audit logging is deliberately off the request critical path.
describe('Integration Test: GET /health surfaces audit log health', () => {
  test('reports 200 with an auditLog check in the body', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.checks.auditLog).toEqual(
      expect.objectContaining({ healthy: expect.any(Boolean), consecutiveFailures: expect.any(Number) })
    );
  });
});
