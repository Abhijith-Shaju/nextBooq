const request = require('supertest');
const app = require('../../src/app');
const { setupTestDB } = require('../setup');

setupTestDB();

// H-02: /debug-echo used to reflect every request header — including the
// httpOnly session cookie — back in the response body, unauthenticated,
// above the API router. It was marked TEMPORARY and never removed.
describe('Integration Test: /debug-echo is removed', () => {
  test('no longer exists and does not echo request headers back', async () => {
    const res = await request(app)
      .get('/debug-echo')
      .set('Cookie', 'nb_session=super-secret-session-token');

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/super-secret-session-token/);
  });

  test('is gone for every HTTP method, not just GET', async () => {
    const res = await request(app).post('/debug-echo').send({});
    expect(res.status).toBe(404);
  });
});
