// backend/.env carries a real RESEND_API_KEY (needed for local dev and
// production). There is no separate .env.test, and until now nothing
// blanked that key before tests ran — src/config/env.js calls
// dotenv.config() the first time it's required, which loads the real key
// into process.env for the test process too. Left alone, every integration
// test that exercises registerUser, customerQuickAuth, or
// cafeApplicationService.createApplication (etc.) fires a real Resend API
// call, sending real email to real inboxes (ADMIN_EMAIL/CONTACT_EMAIL/
// FROM_EMAIL) on every single test run.
//
// `setupFiles` (see jest.config.js) runs before the test framework is
// installed and before any test file's own requires, so this executes
// before src/config/env.js is ever evaluated. dotenv only assigns a
// variable if it is not already present in process.env, so setting it to
// '' here — rather than deleting it — makes dotenv leave it alone, and
// every sender in emailService.js takes its documented `console.log`
// fallback path instead of calling Resend.
//
// Only RESEND_API_KEY is touched here. Do not set/override NODE_ENV — Jest
// already sets it to 'test', and route files' `NODE_ENV === 'test' ? noop :
// limiter` rate-limiter swaps depend on that.
process.env.RESEND_API_KEY = '';
