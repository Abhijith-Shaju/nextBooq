const cookie = require('cookie');

describe('Unit Test: session cookie Domain attribute', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // The rest of the suite (tests/integration/cookieAuth.test.js) runs with
  // COOKIE_DOMAIN pinned to '' by tests/jest.setupEnv.js, so it only ever
  // exercises the host-only (unset) path. That leaves the one config value
  // production actually depends on — COOKIE_DOMAIN being set to
  // ".nextbooq.in" — with no test coverage at all. A typo here (wrong env
  // var name, wrong value) would boot cleanly and pass every existing test,
  // then silently produce a host-only cookie in production.
  test('COOKIE_DOMAIN set to .nextbooq.in produces a cookie with a matching Domain attribute', () => {
    process.env.COOKIE_DOMAIN = '.nextbooq.in';

    // Re-import both the config and the cookie helper under the new env,
    // same jest.resetModules() + reassign process.env pattern as
    // tests/unit/trustProxy.test.js.
    require('../../src/config/env');
    const { setAuthCookie } = require('../../src/controllers/authController');

    let capturedName, capturedValue, capturedOptions;
    const res = {
      cookie: (name, value, options) => {
        capturedName = name;
        capturedValue = value;
        capturedOptions = options;
      },
    };

    setAuthCookie(res, 'sometoken');

    expect(capturedOptions.domain).toBe('.nextbooq.in');

    // Also assert on the actual serialized Set-Cookie header text, not just
    // the options object handed to res.cookie() — this is the literal
    // Domain=.nextbooq.in the production cookie carries.
    const serialized = cookie.serialize(capturedName, capturedValue, capturedOptions);
    expect(serialized).toMatch(/Domain=\.nextbooq\.in/i);
  });
});
