const request = require('supertest');
const app = require('../../src/app');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: minimum password strength on registration/quick-auth', () => {
  test('registration rejects a password shorter than 8 characters', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Weak Password User',
      email: 'weak-pw@test.com',
      phone: '+1555000999',
      password: 'short1',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/password/i);
  });

  test('registration accepts a password of at least 8 characters', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Strong Password User',
      email: 'strong-pw@test.com',
      phone: '+1555001000',
      password: 'goodenough123',
    });

    expect(res.status).toBe(201);
  });

  test('customer quick-auth rejects a password shorter than 8 characters for a new account', async () => {
    const res = await request(app).post('/api/v1/auth/customer-quick-auth').send({
      name: 'Weak Quick Auth',
      email: 'weak-quick@test.com',
      phone: '+1555001001',
      password: 'short1',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/password/i);
  });
});
