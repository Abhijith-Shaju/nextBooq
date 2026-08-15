const {
  inspectMongoTransactionSupport,
  assertMongoTransactionSupport,
  verifyMongoTransactionSupport,
  MongoTransactionTopologyError,
} = require('../../src/config/mongoTransactionSupport');

const connectionForHello = (helloResult) => ({
  db: {
    admin: () => ({
      command: jest.fn().mockResolvedValue(helloResult),
    }),
  },
});

describe('MongoDB transaction topology support', () => {
  test('recognizes a replica set from hello.setName', async () => {
    await expect(inspectMongoTransactionSupport(connectionForHello({ setName: 'rs0' })))
      .resolves.toMatchObject({ supported: true, topology: 'replica-set' });
  });

  test('recognizes a sharded cluster from hello.msg', async () => {
    await expect(inspectMongoTransactionSupport(connectionForHello({ msg: 'isdbgrid' })))
      .resolves.toMatchObject({ supported: true, topology: 'sharded-cluster' });
  });

  test('marks a standalone server as unsupported', async () => {
    await expect(inspectMongoTransactionSupport(connectionForHello({ isWritablePrimary: true })))
      .resolves.toMatchObject({ supported: false, topology: 'standalone' });
  });

  test('fails closed when topology inspection cannot run', async () => {
    const connection = {
      db: {
        admin: () => ({
          command: jest.fn().mockRejectedValue(new Error('hello unavailable')),
        }),
      },
    };

    await expect(inspectMongoTransactionSupport(connection))
      .resolves.toMatchObject({ supported: false, topology: 'unknown' });
  });

  test('throws a controlled error before transactions on unsupported topology', async () => {
    await expect(assertMongoTransactionSupport(connectionForHello({ isWritablePrimary: true })))
      .rejects.toMatchObject({
        name: 'MongoTransactionTopologyError',
        code: 'MONGO_TRANSACTIONS_UNSUPPORTED',
      });
  });

  test('rejects unsupported topology in production', async () => {
    await expect(verifyMongoTransactionSupport(connectionForHello({ isWritablePrimary: true }), {
      nodeEnv: 'production',
      logger: { warn: jest.fn() },
    })).rejects.toBeInstanceOf(MongoTransactionTopologyError);
  });

  test('warns but keeps development startup available on unsupported topology', async () => {
    const logger = { warn: jest.fn() };

    await expect(verifyMongoTransactionSupport(connectionForHello({ isWritablePrimary: true }), {
      nodeEnv: 'development',
      logger,
    })).resolves.toMatchObject({ supported: false, topology: 'standalone' });

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Cafe provisioning will remain unavailable'));
  });
});
