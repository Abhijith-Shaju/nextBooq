// backend/tests/unit/cafePaymentsModel.test.js
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 60000);

describe('Cafe model: payments sub-document', () => {
  test('defaults payments to an unconfigured, empty state', async () => {
    const org = await Organization.create({ name: 'Payments Model Org' });
    const cafe = await Cafe.create({ org_id: org._id, name: 'Model Cafe', slug: 'model-cafe', timezone: 'UTC' });

    expect(cafe.payments.razorpay_key_id).toBe('');
    expect(cafe.payments.configured).toBe(false);
  });

  test('toJSON strips the encrypted secret fields but keeps key_id and configured', async () => {
    const org = await Organization.create({ name: 'Payments Model Org 2' });
    const cafe = await Cafe.create({
      org_id: org._id,
      name: 'Model Cafe 2',
      slug: 'model-cafe-2',
      timezone: 'UTC',
      payments: {
        razorpay_key_id: 'rzp_test_visible',
        razorpay_key_secret_encrypted: 'iv:tag:ciphertext',
        razorpay_webhook_secret_encrypted: 'iv:tag:ciphertext2',
        configured: true,
      },
    });

    const json = cafe.toJSON();

    expect(json.payments.razorpay_key_id).toBe('rzp_test_visible');
    expect(json.payments.configured).toBe(true);
    expect(json.payments.razorpay_key_secret_encrypted).toBeUndefined();
    expect(json.payments.razorpay_webhook_secret_encrypted).toBeUndefined();
  });

  test('toObject({ getters: true }) strips the encrypted secret fields but keeps key_id and configured', async () => {
    const org = await Organization.create({ name: 'Payments Model Org 3' });
    const cafe = await Cafe.create({
      org_id: org._id,
      name: 'Model Cafe 3',
      slug: 'model-cafe-3',
      timezone: 'UTC',
      payments: {
        razorpay_key_id: 'rzp_test_visible',
        razorpay_key_secret_encrypted: 'iv:tag:ciphertext',
        razorpay_webhook_secret_encrypted: 'iv:tag:ciphertext2',
        configured: true,
      },
    });

    const obj = cafe.toObject({ getters: true });

    expect(obj.payments.razorpay_key_id).toBe('rzp_test_visible');
    expect(obj.payments.configured).toBe(true);
    expect(obj.payments.razorpay_key_secret_encrypted).toBeUndefined();
    expect(obj.payments.razorpay_webhook_secret_encrypted).toBeUndefined();
  });
});
