const loadDatabase = ({ nodeEnv, hello }) => {
  jest.resetModules();

  const connection = {
    host: 'localhost',
    db: {
      admin: () => ({
        command: jest.fn().mockResolvedValue(hello),
      }),
    },
  };
  const mongooseResult = { connection };
  const mongoose = {
    connect: jest.fn().mockResolvedValue(mongooseResult),
    disconnect: jest.fn(),
  };

  jest.doMock('mongoose', () => mongoose);
  jest.doMock('../../src/config/env', () => ({
    MONGO_URI: 'mongodb://localhost:27017/nextbooq',
    NODE_ENV: nodeEnv,
  }));

  let database;
  jest.isolateModules(() => {
    database = require('../../src/config/database');
  });

  return { ...database, connection, mongoose, mongooseResult };
};

describe('connectDB transaction topology startup policy', () => {
  let exitSpy;
  let errorSpy;
  let logSpy;
  let warnSpy;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    jest.dontMock('mongoose');
    jest.dontMock('../../src/config/env');
  });

  test('production standalone topology cannot complete connectDB startup', async () => {
    const { connectDB, mongoose } = loadDatabase({
      nodeEnv: 'production',
      hello: { isWritablePrimary: true },
    });

    await expect(connectDB()).rejects.toMatchObject({
      code: 'MONGO_TRANSACTIONS_UNSUPPORTED',
    });

    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('development standalone topology warns and returns the connected database', async () => {
    const { connectDB, mongooseResult } = loadDatabase({
      nodeEnv: 'development',
      hello: { isWritablePrimary: true },
    });

    await expect(connectDB()).resolves.toBe(mongooseResult);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Cafe provisioning will remain unavailable'));
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
