const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters long'),
  RAZORPAY_KEY_ID: z.string().optional().default('rzp_test_key_id'),
  RAZORPAY_KEY_SECRET: z.string().optional().default('rzp_test_key_secret'),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default('rzp_test_webhook_secret'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment variables configuration');
  }
  return result.data;
};

const config = parseEnv();

module.exports = config;
