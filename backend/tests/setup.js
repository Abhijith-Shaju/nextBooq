const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

// Mock the Razorpay client factory globally in test environment — every
// caller gets the same fake orders.create/payments.all behavior regardless
// of which cafe's credentials were passed in.
jest.mock('../src/config/razorpay', () => ({
  createRazorpayClient: jest.fn(() => ({
    orders: {
      create: jest.fn().mockImplementation(async (options) => ({
        id: `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        entity: 'order',
        amount: options.amount,
        currency: options.currency || 'INR',
        receipt: options.receipt,
        status: 'created',
        created_at: Math.floor(Date.now() / 1000),
      })),
    },
    payments: {
      all: jest.fn().mockResolvedValue({ entity: 'collection', count: 0, items: [] }),
    },
  })),
}));

let replSet;

const setupTestDB = () => {
  beforeAll(async () => {
    // Start in-memory MongoDB replica set to support transactions
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });
    const uri = replSet.getUri();
    await mongoose.connect(uri);
  }, 60000);

  afterEach(async () => {
    if (mongoose.connection.readyState === 1) {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        await collections[key].deleteMany({});
      }
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (replSet) {
      await replSet.stop();
    }
  }, 60000);
};

module.exports = { setupTestDB };
