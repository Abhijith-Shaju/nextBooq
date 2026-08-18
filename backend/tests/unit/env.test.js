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

  test('rejects production config with RESEND_API_KEY unset', () => {
    const result = config.envSchema.safeParse({
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://localhost:27017/test',
      JWT_SECRET: 'a'.repeat(32),
      RAZORPAY_KEY_ID: 'real_key_id',
      RAZORPAY_KEY_SECRET: 'real_key_secret',
      RAZORPAY_WEBHOOK_SECRET: 'real_webhook_secret',
      FROM_EMAIL: 'nextBooq <noreply@realdomain.com>',
    });

    expect(result.success).toBe(false);
  });

  test('rejects production config with RESEND_API_KEY set but FROM_EMAIL left at the sandbox default', () => {
    const result = config.envSchema.safeParse({
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://localhost:27017/test',
      JWT_SECRET: 'a'.repeat(32),
      RAZORPAY_KEY_ID: 'real_key_id',
      RAZORPAY_KEY_SECRET: 'real_key_secret',
      RAZORPAY_WEBHOOK_SECRET: 'real_webhook_secret',
      RESEND_API_KEY: 're_real_key',
      FROM_EMAIL: 'nextBooq <onboarding@resend.dev>',
    });

    expect(result.success).toBe(false);
  });

  test('accepts production config with RESEND_API_KEY and a non-default FROM_EMAIL both set', () => {
    const result = config.envSchema.safeParse({
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://localhost:27017/test',
      JWT_SECRET: 'a'.repeat(32),
      RAZORPAY_KEY_ID: 'real_key_id',
      RAZORPAY_KEY_SECRET: 'real_key_secret',
      RAZORPAY_WEBHOOK_SECRET: 'real_webhook_secret',
      ENCRYPTION_KEY: 'a_real_32_byte_or_longer_encryption_key_value',
      RESEND_API_KEY: 're_real_key',
      FROM_EMAIL: 'nextBooq <noreply@realdomain.com>',
    });

    expect(result.success).toBe(true);
  });
});
