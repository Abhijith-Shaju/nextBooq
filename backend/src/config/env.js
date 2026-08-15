const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const INSECURE_DEFAULTS = {
  RAZORPAY_KEY_ID: 'rzp_test_key_id',
  RAZORPAY_KEY_SECRET: 'rzp_test_key_secret',
  RAZORPAY_WEBHOOK_SECRET: 'rzp_test_webhook_secret',
};

const envSchema = z
  .object({
    PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long for adequate signing security'),
    RAZORPAY_KEY_ID: z.string().optional().default(INSECURE_DEFAULTS.RAZORPAY_KEY_ID),
    RAZORPAY_KEY_SECRET: z.string().optional().default(INSECURE_DEFAULTS.RAZORPAY_KEY_SECRET),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(INSECURE_DEFAULTS.RAZORPAY_WEBHOOK_SECRET),
    CORS_ALLOWED_ORIGINS: z.string().optional().default('http://localhost:3000'),
    // Passed straight to Express's `trust proxy` setting. Controls how many
    // hops of X-Forwarded-For to trust when deriving req.ip (used by rate
    // limiting and audit logs) — must match the real number of reverse
    // proxies/load balancers in front of this process, or those become
    // trivially spoofable/collapse to one IP. "0"/unset means "don't trust
    // any proxy" (safe default for direct-exposure deployments).
    TRUST_PROXY: z.string().optional().default('0'),
    // Optional: if unset, emailService logs the reset link to the console
    // instead of calling Resend — keeps local dev and tests working without
    // a real API key.
    RESEND_API_KEY: z.string().optional(),
    // Resend's shared sandbox sender — safe default for local/test; override
    // in production with a domain you've verified with Resend.
    FROM_EMAIL: z.string().optional().default('nextBooq <onboarding@resend.dev>'),
    // Used to build absolute links (e.g. password reset) in emails, since the
    // backend has no other way to know the frontend's public origin.
    FRONTEND_URL: z.string().optional().default('http://localhost:3000'),
  })
  .superRefine((data, ctx) => {
    // RAZORPAY_WEBHOOK_SECRET gates the HMAC signature check that authorizes
    // payment.captured webhooks to CONFIRM a reservation. Booting production with
    // the source-published default would let anyone forge a valid webhook and
    // confirm reservations without paying, so fail startup outright instead.
    if (data.NODE_ENV === 'production') {
      for (const [key, defaultValue] of Object.entries(INSECURE_DEFAULTS)) {
        if (data[key] === defaultValue) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${key} must be explicitly set to a real value in production (insecure published default detected)`,
            path: [key],
          });
        }
      }
    }
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

module.exports = { ...config, envSchema };
