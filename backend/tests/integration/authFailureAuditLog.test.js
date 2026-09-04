const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const AuditLog = require('../../src/models/AuditLog');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: Failed Auth Attempt Audit Logging', () => {
  test('logs a LOGIN_FAILED audit event when the password is wrong', async () => {
    await request(app).post('/api/v1/auth/register').send({ accept_terms: true,
      name: 'Jack Owner',
      email: 'jack@example.com',
      phone: '+18885558888',
      password: 'JacksRealPassword1!',
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'jack@example.com',
      password: 'TotallyWrongPassword!',
    });

    expect(res.statusCode).toEqual(401);

    const user = await User.findOne({ email: 'jack@example.com' });
    const log = await AuditLog.findOne({ action: 'LOGIN_FAILED', entity_id: user._id });
    expect(log).not.toBeNull();
    expect(log.entity_type).toEqual('User');
    expect(log.after_state.ip).toBeDefined();
  });

  test('logs a LOGIN_FAILED audit event with a null entity when the email matches no account', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'nobody-registered@example.com',
      password: 'WhateverPassword1!',
    });

    expect(res.statusCode).toEqual(401);

    const log = await AuditLog.findOne({
      action: 'LOGIN_FAILED',
      'after_state.attempted_email': 'nobody-registered@example.com',
    });
    expect(log).not.toBeNull();
    expect(log.entity_id).toBeNull();
  });

  test('logs a CUSTOMER_QUICK_AUTH_FAILED audit event when the password is wrong', async () => {
    await request(app).post('/api/v1/auth/customer-quick-auth').send({ accept_terms: true,
      name: 'Kelly Guest',
      email: 'kelly@example.com',
      phone: '+18885559090',
      password: 'KellysRealPassword1!',
    });

    const res = await request(app).post('/api/v1/auth/customer-quick-auth').send({ accept_terms: true,
      name: 'Kelly Guest',
      email: 'kelly@example.com',
      phone: '+18885559090',
      password: 'WrongPassword1!',
    });

    expect(res.statusCode).toEqual(401);

    const user = await User.findOne({ email: 'kelly@example.com' });
    const log = await AuditLog.findOne({ action: 'CUSTOMER_QUICK_AUTH_FAILED', entity_id: user._id });
    expect(log).not.toBeNull();
    expect(log.after_state.ip).toBeDefined();
  });
});
