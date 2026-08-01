const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: RBAC Matrix Permissions Enforcement', () => {
  let cafe;
  let hostToken;
  let ownerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'RBAC Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'RBAC Cafe',
      slug: 'rbac-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const hostUser = await User.create({
      name: 'Host Staff',
      email: 'host@rbac.com',
      phone: '+1555000111',
      password_hash: 'pass',
      staff_memberships: [
        {
          cafe_id: cafe._id,
          role: 'host',
          permissions: ['view_reservations', 'edit_reservations'], // Missing edit_tables
        },
      ],
    });
    hostToken = jwt.sign({ id: hostUser._id.toString() }, config.JWT_SECRET);

    const ownerUser = await User.create({
      name: 'Cafe Owner',
      email: 'owner@rbac.com',
      phone: '+1555000222',
      password_hash: 'pass',
      staff_memberships: [
        {
          cafe_id: cafe._id,
          role: 'owner',
          permissions: [], // Owner has implicit full permissions
        },
      ],
    });
    ownerToken = jwt.sign({ id: ownerUser._id.toString() }, config.JWT_SECRET);
  });

  test('Host user attempting to create table gets HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/tables`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        table_number: 'T10',
        capacity: 4,
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Permission denied: Requires 'edit_tables'/i);
  });

  test('Host user viewing reservations gets HTTP 200 OK', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
  });

  test('Owner role user creating table bypasses explicit permission check and gets HTTP 201 Created', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/tables`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        table_number: 'T99',
        capacity: 6,
      });

    expect(res.status).toBe(201);
  });
});
