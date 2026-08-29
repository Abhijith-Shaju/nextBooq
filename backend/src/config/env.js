const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const INSECURE_DEFAULTS = {
  // RAZORPAY_KEY_ID removed: every cafe now uses its own Razorpay
  // credentials (see Cafe.payments), so there's no platform-level Razorpay
  // account for the booking flow anymore. Left commented out rather than
  // deleted in case a platform-level account is needed later for something
  // unrelated (e.g. platform subscription billing).
  // RAZORPAY_KEY_ID: 'rzp_test_key_id',
  // RAZORPAY_KEY_SECRET removed: paymentService.js's mock-order fallback
  // (both order creation and the verifyCheckoutPayment signature-check
  // fallback) is now gated to `NODE_ENV === 'development'` only, so this
  // value is never read outside development mode. Left commented out
  // rather than deleted for the same reason as RAZORPAY_KEY_ID above.
  // RAZORPAY_KEY_SECRET: 'rzp_test_key_secret',
  // RAZORPAY_WEBHOOK_SECRET removed for the same reason as RAZORPAY_KEY_ID
  // above — webhooks are now verified per-cafe (see
  // Cafe.payments.razorpay_webhook_secret_encrypted).
  // RAZORPAY_WEBHOOK_SECRET: 'rzp_test_webhook_secret',
  ENCRYPTION_KEY: 'insecure_dev_only_encryption_key_32b',
};

const envSchema = z
  .object({
    PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long for adequate signing security'),
    // RAZORPAY_KEY_ID: z.string().optional().default(INSECURE_DEFAULTS.RAZORPAY_KEY_ID),
    // RAZORPAY_KEY_SECRET: z.string().optional().default(INSECURE_DEFAULTS.RAZORPAY_KEY_SECRET),
    // RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(INSECURE_DEFAULTS.RAZORPAY_WEBHOOK_SECRET),
    // 32-byte key (any string is fine — encryption.js hashes it down to 32
    // bytes via SHA-256) for AES-256-GCM encryption of per-cafe Razorpay
    // credentials at rest. Must be set to a real random value in production,
    // same as the RAZORPAY_* secrets below.
    ENCRYPTION_KEY: z.string().optional().default(INSECURE_DEFAULTS.ENCRYPTION_KEY),
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
    // Recipient for the "Contact Us" form's emails. Defaults to FROM_EMAIL's
    // own address when unset, so the form works out of the box without a
    // separate config value — override this if you want contact submissions
    // routed somewhere other than the sender identity.
    CONTACT_EMAIL: z.string().optional(),
    // Recipient for operator notifications (currently: a cafe application
    // needing review). Falls back to CONTACT_EMAIL and then FROM_EMAIL, so
    // this works with no config change.
    ADMIN_EMAIL: z.string().optional(),
    // Used to build absolute links (e.g. password reset) in emails, since the
    // backend has no other way to know the frontend's public origin.
    FRONTEND_URL: z.string().optional().default('http://localhost:3000'),
  })
  .superRefine((data, ctx) => {
    // Guard against booting production with any of INSECURE_DEFAULTS' source-
    // published placeholder values still in place (e.g. ENCRYPTION_KEY, which
    // gates the at-rest encryption of every cafe's own Razorpay credentials
    // and webhook secret — see Cafe.payments). Razorpay webhook/order-signing
    // secrets are no longer platform-wide config: each cafe's credentials are
    // validated and encrypted at settings-save time instead (see
    // admin/cafeController.js), so they don't need a startup check here.
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

      // RESEND_API_KEY gates whether password-reset emails actually go out.
      // If unset, emailService falls back to console.log-ing the RAW reset
      // token, which is a full account-takeover vector for anyone with log
      // access — fail startup outright instead.
      if (!data.RESEND_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'RESEND_API_KEY must be explicitly set to a real value in production (insecure published default detected)',
          path: ['RESEND_API_KEY'],
        });
      }

      // FROM_EMAIL left at Resend's shared sandbox sender only delivers to
      // the Resend account owner's own verified address, so every real
      // user's reset email would silently fail to arrive.
      if (data.FROM_EMAIL === 'nextBooq <onboarding@resend.dev>') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'FROM_EMAIL must be explicitly set to a real value in production (insecure published default detected)',
          path: ['FROM_EMAIL'],
        });
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
