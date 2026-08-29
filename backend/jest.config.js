module.exports = {
  testEnvironment: 'node',
  // Blanks RESEND_API_KEY before src/config/env.js's dotenv.config() ever
  // runs, so tests never fire real Resend API calls using the real key in
  // .env. See tests/jest.setupEnv.js for the full rationale.
  setupFiles: ['<rootDir>/tests/jest.setupEnv.js'],
};
