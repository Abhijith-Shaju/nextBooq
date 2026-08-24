// M-01: statusCode >= 500 outside development used to serialize the raw
// error message straight into the response body — leaking internal detail
// (a CORS rejection's message, a Mongoose driver error, a decrypt failure,
// third-party SDK text) to any client that triggers an unhandled error.
// Stack traces were already withheld outside development; the message
// itself was not.
const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const buildReq = () => ({ method: 'GET', originalUrl: '/api/v1/whatever' });

afterEach(() => {
  jest.resetModules();
  jest.dontMock('../../src/config/env');
});

describe('errorHandler', () => {
  test('redacts the message for a 500 (unclassified) error outside development', () => {
    jest.doMock('../../src/config/env', () => ({ NODE_ENV: 'production' }));
    const errorHandler = require('../../src/middleware/errorHandler');

    const err = new Error('connect ECONNREFUSED 127.0.0.1:27017 — internal mongo detail');
    err.statusCode = 500;
    const res = buildRes();

    errorHandler(err, buildReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.message).not.toMatch(/ECONNREFUSED|27017|mongo/i);
    expect(body.error.message).not.toMatch(/ECONNREFUSED|27017|mongo/i);
    expect(body.message).toBe('Something went wrong on our end. Please try again.');
  });

  test('still shows the real message for a 4xx error outside development', () => {
    jest.doMock('../../src/config/env', () => ({ NODE_ENV: 'production' }));
    const errorHandler = require('../../src/middleware/errorHandler');

    const err = new Error('Email already exists');
    err.statusCode = 400;
    const res = buildRes();

    errorHandler(err, buildReq(), res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Email already exists');
  });

  test('still shows the real 500 message in development', () => {
    jest.doMock('../../src/config/env', () => ({ NODE_ENV: 'development' }));
    const errorHandler = require('../../src/middleware/errorHandler');

    const err = new Error('connect ECONNREFUSED 127.0.0.1:27017');
    err.statusCode = 500;
    const res = buildRes();

    errorHandler(err, buildReq(), res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('connect ECONNREFUSED 127.0.0.1:27017');
    expect(body.stack).toBeDefined();
  });

  test('does not leak the real message in the stack field outside development', () => {
    jest.doMock('../../src/config/env', () => ({ NODE_ENV: 'production' }));
    const errorHandler = require('../../src/middleware/errorHandler');

    const err = new Error('internal detail');
    err.statusCode = 500;
    const res = buildRes();

    errorHandler(err, buildReq(), res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.stack).toBeUndefined();
  });
});
