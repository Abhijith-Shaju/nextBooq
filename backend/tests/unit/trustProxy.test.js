describe('Unit Test: trust proxy configuration', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('defaults to not trusting any proxy hop when TRUST_PROXY is unset', () => {
    delete process.env.TRUST_PROXY;
    const app = require('../../src/app');
    expect(app.get('trust proxy')).toBeFalsy();
  });

  test('trusts the configured number of proxy hops when TRUST_PROXY is a number', () => {
    process.env.TRUST_PROXY = '1';
    const app = require('../../src/app');
    expect(app.get('trust proxy')).toBe(1);
  });

  test('accepts a trust-proxy keyword (e.g. "loopback")', () => {
    process.env.TRUST_PROXY = 'loopback';
    const app = require('../../src/app');
    expect(app.get('trust proxy')).toBe('loopback');
  });
});
