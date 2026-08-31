module.exports = {
  testEnvironment: 'node',
  // Blanks RESEND_API_KEY (so tests never fire real Resend API calls using
  // the real key in .env) and COOKIE_DOMAIN (so the cookie-scope tests see
  // the host-only default rather than whatever's in .env) before
  // src/config/env.js's dotenv.config() ever runs. See tests/jest.setupEnv.js
  // for the full rationale.
  setupFiles: ['<rootDir>/tests/jest.setupEnv.js'],
};
