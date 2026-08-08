const config = require('../../src/config/env');

describe('Environment Config Schema', () => {
  test('rejects a JWT_SECRET shorter than 32 characters', () => {
    const result = config.envSchema.safeParse({
      MONGO_URI: 'mongodb://localhost:27017/test',
      JWT_SECRET: 'short-secret-16c',
    });

    expect(result.success).toBe(false);
  });

  test('accepts a JWT_SECRET of at least 32 characters', () => {
    const result = config.envSchema.safeParse({
      MONGO_URI: 'mongodb://localhost:27017/test',
      JWT_SECRET: 'a'.repeat(32),
    });

    expect(result.success).toBe(true);
  });
});
