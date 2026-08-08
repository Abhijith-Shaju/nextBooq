const request = require('supertest');
const app = require('../../src/app');
const AuditLog = require('../../src/models/AuditLog');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: Auth Event Audit Logging', () => {
  test('logs a REGISTER audit event on successful registration', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Grace Owner',
      email: 'grace@example.com',
      phone: '+18885555555',
      password: 'GracesPassword1!',
    });

    expect(res.statusCode).toEqual(201);

    const log = await AuditLog.findOne({ action: 'REGISTER', entity_type: 'User' });
    expect(log).not.toBeNull();
    expect(log.cafe_id).toBeNull();
    expect(log.entity_id.toString()).toEqual(res.body.data.user.id.toString());
    expect(log.performed_by.toString()).toEqual(res.body.data.user.id.toString());
  });

  test('logs a LOGIN audit event on successful login', async () => {
    await request(app).post('/api/v1/auth/register').send({
      name: 'Henry Owner',
      email: 'henry@example.com',
      phone: '+18885556666',
      password: 'HenrysPassword1!',
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'henry@example.com',
      password: 'HenrysPassword1!',
    });

    expect(res.statusCode).toEqual(200);

    const log = await AuditLog.findOne({ action: 'LOGIN', entity_type: 'User' });
    expect(log).not.toBeNull();
    expect(log.cafe_id).toBeNull();
    expect(log.entity_id.toString()).toEqual(res.body.data.user.id.toString());
  });

  test('logs a CUSTOMER_QUICK_AUTH audit event on successful quick-auth', async () => {
    const res = await request(app).post('/api/v1/auth/customer-quick-auth').send({
      name: 'Ivy Guest',
      email: 'ivy@example.com',
      phone: '+18885557777',
      password: 'IvysPassword1!',
    });

    expect(res.statusCode).toEqual(200);

    const log = await AuditLog.findOne({ action: 'CUSTOMER_QUICK_AUTH', entity_type: 'User' });
    expect(log).not.toBeNull();
    expect(log.cafe_id).toBeNull();
    expect(log.entity_id.toString()).toEqual(res.body.data.user.id.toString());
  });
});
