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

  test('resolves without throwing when the Resend SDK itself rejects', async () => {
    const sendMock = jest.fn().mockRejectedValue(new Error('network exploded'));
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

    expect(result).toEqual({ logged: false, data: null, error: { message: 'network exploded' } });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('escapeHtml: HTML-escapes user input in contact email body to prevent markup injection', async () => {
    const sendMock = jest.fn().mockResolvedValue({ data: { id: 'email_456' }, error: null });
    jest.doMock('../../src/config/env', () => ({
      RESEND_API_KEY: 'test-key',
      FROM_EMAIL: 'nextBooq <onboarding@resend.dev>',
      CONTACT_EMAIL: 'contact@nextbooq.com',
    }));
    jest.doMock('resend', () => ({
      Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
    }));
    const { sendContactEmail } = require('../../src/services/emailService');

    await sendContactEmail({
      name: '<script>alert("xss")</script>',
      email: 'attacker<tag>@example.com',
      message: '<img src=x onerror="alert(1)">',
    });

    const callArgs = sendMock.mock.calls[0][0];
    expect(callArgs.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(callArgs.html).not.toContain('<script>');
    expect(callArgs.html).toContain('attacker&lt;tag&gt;@example.com');
    expect(callArgs.html).not.toContain('<tag>');
    expect(callArgs.html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(callArgs.html).not.toContain('<img src=');
  });

  test('escapeHtml: sanitizes all ampersands, quotes in contact email', async () => {
    const sendMock = jest.fn().mockResolvedValue({ data: { id: 'email_789' }, error: null });
    jest.doMock('../../src/config/env', () => ({
      RESEND_API_KEY: 'test-key',
      FROM_EMAIL: 'nextBooq <onboarding@resend.dev>',
      CONTACT_EMAIL: 'contact@nextbooq.com',
    }));
    jest.doMock('resend', () => ({
      Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
    }));
    const { sendContactEmail } = require('../../src/services/emailService');

    await sendContactEmail({
      name: 'John & Jane "The Smiths"',
      email: 'john@example.com',
      message: "It's <great> & awesome!",
    });

    const callArgs = sendMock.mock.calls[0][0];
    expect(callArgs.html).toContain('John &amp; Jane &quot;The Smiths&quot;');
    expect(callArgs.html).toContain('It&#39;s &lt;great&gt; &amp; awesome!');
  });

  test('newline stripping: removes CR/LF from name in subject line to prevent email header injection', async () => {
    const sendMock = jest.fn().mockResolvedValue({ data: { id: 'email_999' }, error: null });
    jest.doMock('../../src/config/env', () => ({
      RESEND_API_KEY: 'test-key',
      FROM_EMAIL: 'nextBooq <onboarding@resend.dev>',
      CONTACT_EMAIL: 'contact@nextbooq.com',
    }));
    jest.doMock('resend', () => ({
      Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
    }));
    const { sendContactEmail } = require('../../src/services/emailService');

    await sendContactEmail({
      name: 'John\r\nBcc: attacker@evil.com\r\nDoe',
      email: 'john@example.com',
      message: 'Test message',
    });

    const callArgs = sendMock.mock.calls[0][0];
    // Subject should have newlines replaced with spaces, preventing email header injection
    expect(callArgs.subject).toBe('New contact form message from John Bcc: attacker@evil.com Doe');
    expect(callArgs.subject).not.toContain('\r');
    expect(callArgs.subject).not.toContain('\n');
  });
});
