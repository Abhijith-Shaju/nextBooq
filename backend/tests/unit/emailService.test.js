describe('emailService', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('logs the reset link instead of sending when RESEND_API_KEY is unset', async () => {
    jest.doMock('../../src/config/env', () => ({
      RESEND_API_KEY: undefined,
      FROM_EMAIL: 'nextBooq <onboarding@resend.dev>',
    }));
    const { sendPasswordResetEmail } = require('../../src/services/emailService');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendPasswordResetEmail({
      to: 'user@example.com',
      resetUrl: 'http://localhost:3000/auth/reset-password?token=abc',
    });

    expect(result.logged).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:3000/auth/reset-password?token=abc')
    );
    logSpy.mockRestore();
  });

  test('calls the Resend SDK when RESEND_API_KEY is set', async () => {
    const sendMock = jest.fn().mockResolvedValue({ data: { id: 'email_123' }, error: null });
    jest.doMock('../../src/config/env', () => ({
      RESEND_API_KEY: 'test-key',
      FROM_EMAIL: 'nextBooq <onboarding@resend.dev>',
    }));
    jest.doMock('resend', () => ({
      Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
    }));
    const { sendPasswordResetEmail } = require('../../src/services/emailService');

    const result = await sendPasswordResetEmail({
      to: 'user@example.com',
      resetUrl: 'http://localhost:3000/auth/reset-password?token=abc',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'nextBooq <onboarding@resend.dev>',
        to: 'user@example.com',
        subject: 'Reset your nextBooq password',
      })
    );
    expect(result.logged).toBe(false);
    expect(result.error).toBeNull();
  });

  test('logs an error but still returns without throwing when Resend returns an error', async () => {
    const sendMock = jest.fn().mockResolvedValue({ data: null, error: { message: 'provider down' } });
    jest.doMock('../../src/config/env', () => ({
      RESEND_API_KEY: 'test-key',
      FROM_EMAIL: 'nextBooq <onboarding@resend.dev>',
    }));
    jest.doMock('resend', () => ({
      Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
    }));
    const { sendPasswordResetEmail } = require('../../src/services/emailService');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendPasswordResetEmail({
      to: 'user@example.com',
      resetUrl: 'http://localhost:3000/auth/reset-password?token=abc',
    });

    expect(result.error).toEqual({ message: 'provider down' });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
