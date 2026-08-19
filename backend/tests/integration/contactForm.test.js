// backend/tests/integration/contactForm.test.js
const request = require('supertest');
const app = require('../../src/app');
const { setupTestDB } = require('../setup');

jest.mock('../../src/services/emailService', () => ({
  sendContactEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
}));
const { sendContactEmail } = require('../../src/services/emailService');

setupTestDB();

describe('Contact form submission', () => {
  beforeEach(() => {
    sendContactEmail.mockClear();
  });

  test('accepts a valid submission and calls the email service', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Hello, I would like to know more about nextBooq.',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(sendContactEmail).toHaveBeenCalledTimes(1);
    expect(sendContactEmail).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Hello, I would like to know more about nextBooq.',
    });
  });

  test('rejects a missing name with 400 and does not call the email service', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      email: 'jane@example.com',
      message: 'Hello there.',
    });

    expect(res.status).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  test('rejects a missing or malformed email with 400', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'Jane Doe',
      email: 'not-an-email',
      message: 'Hello there.',
    });

    expect(res.status).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  test('rejects a missing message with 400', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
    });

    expect(res.status).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  test('rejects a message over 5000 characters with 400', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'a'.repeat(5001),
    });

    expect(res.status).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  test('rejects a name over 200 characters with 400', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'a'.repeat(201),
      email: 'jane@example.com',
      message: 'Hello there.',
    });

    expect(res.status).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  test('trims whitespace and lowercases the email before passing it to the email service', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: '  Jane Doe  ',
      email: '  JANE@EXAMPLE.COM  ',
      message: '  Hello there.  ',
    });

    expect(res.status).toBe(200);
    expect(sendContactEmail).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Hello there.',
    });
  });
});
