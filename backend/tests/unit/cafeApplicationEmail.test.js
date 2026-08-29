const application = (overrides = {}) => ({
  id: 'app_1',
  application_ref: 'NB-7K2M-9QRT',
  organization_name: 'Filter Kaapi Co',
  cafe_name: 'Filter Kaapi',
  cafe_slug: 'filter-kaapi',
  timezone: 'Asia/Kolkata',
  address: {
    line1: '12 Church Street',
    line2: '',
    landmark: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    postal_code: '560001',
    country: 'India',
    map_url: 'https://maps.google.com/?q=filter+kaapi',
  },
  created_at: new Date('2026-08-29T10:00:00Z'),
  ...overrides,
});

const applicant = (overrides = {}) => ({
  name: 'Asha Menon',
  email: 'asha@example.com',
  phone: '+91 98765 43210',
  ...overrides,
});

describe('cafeApplicationEmail', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  // Mirrors emailService.test.js's idiom: mock config/env and resend fresh
  // per test via jest.doMock + jest.resetModules, then require the module
  // under test inside the test body so it picks up the fresh mocks.
  const setup = () => {
    const sendMock = jest.fn().mockResolvedValue({ data: { id: 'email_1' }, error: null });
    jest.doMock('../../src/config/env', () => ({
      RESEND_API_KEY: 'test_key',
      FROM_EMAIL: 'nextBooq <hello@nextbooq.in>',
      ADMIN_EMAIL: 'ops@nextbooq.in',
      CONTACT_EMAIL: 'contact@nextbooq.in',
      FRONTEND_URL: 'https://nextbooq.in',
    }));
    jest.doMock('resend', () => ({
      Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
    }));
    return {
      sendMock,
      emailService: require('../../src/services/emailService'),
    };
  };

  describe('sendCafeApplicationReviewEmail', () => {
    test('sends to ADMIN_EMAIL with the reference in the subject', async () => {
      const { sendMock, emailService } = setup();

      await emailService.sendCafeApplicationReviewEmail({ application: application(), applicant: applicant() });

      const [call] = sendMock.mock.calls;
      expect(call[0].to).toBe('ops@nextbooq.in');
      expect(call[0].subject).toContain('NB-7K2M-9QRT');
      expect(call[0].subject).toContain('Filter Kaapi');
    });

    test('sets reply-to to the applicant so the reviewer can just reply', async () => {
      const { sendMock, emailService } = setup();

      await emailService.sendCafeApplicationReviewEmail({ application: application(), applicant: applicant() });
      expect(sendMock.mock.calls[0][0].replyTo).toBe('asha@example.com');
    });

    test('includes the address, slug and a deep link to the review screen', async () => {
      const { sendMock, emailService } = setup();

      await emailService.sendCafeApplicationReviewEmail({ application: application(), applicant: applicant() });
      const { html } = sendMock.mock.calls[0][0];

      expect(html).toContain('12 Church Street');
      expect(html).toContain('Bengaluru');
      expect(html).toContain('560001');
      expect(html).toContain('filter-kaapi');
      expect(html).toContain('https://nextbooq.in/admin/cafe-applications/app_1');
    });

    test('escapes applicant-supplied HTML', async () => {
      const { sendMock, emailService } = setup();

      await emailService.sendCafeApplicationReviewEmail({
        application: application({ cafe_name: '<script>alert(1)</script>' }),
        applicant: applicant(),
      });
      const { html } = sendMock.mock.calls[0][0];

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    test('strips newlines from the subject to block header injection', async () => {
      const { sendMock, emailService } = setup();

      await emailService.sendCafeApplicationReviewEmail({
        application: application({ cafe_name: 'Evil\nBcc: victim@example.com' }),
        applicant: applicant(),
      });
      expect(sendMock.mock.calls[0][0].subject).not.toMatch(/[\r\n]/);
    });

    test('falls back to CONTACT_EMAIL when ADMIN_EMAIL is unset', async () => {
      const sendMock = jest.fn().mockResolvedValue({ data: { id: 'email_1' }, error: null });
      jest.doMock('../../src/config/env', () => ({
        RESEND_API_KEY: 'test_key',
        FROM_EMAIL: 'nextBooq <hello@nextbooq.in>',
        CONTACT_EMAIL: 'contact@nextbooq.in',
        FRONTEND_URL: 'https://nextbooq.in',
      }));
      jest.doMock('resend', () => ({
        Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
      }));
      const { sendCafeApplicationReviewEmail } = require('../../src/services/emailService');

      await sendCafeApplicationReviewEmail({ application: application(), applicant: applicant() });
      expect(sendMock.mock.calls[0][0].to).toBe('contact@nextbooq.in');
    });

    test('logs instead of sending when RESEND_API_KEY is unset', async () => {
      const sendMock = jest.fn();
      jest.doMock('../../src/config/env', () => ({
        RESEND_API_KEY: undefined,
        FROM_EMAIL: 'nextBooq <hello@nextbooq.in>',
        ADMIN_EMAIL: 'ops@nextbooq.in',
        FRONTEND_URL: 'https://nextbooq.in',
      }));
      jest.doMock('resend', () => ({
        Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
      }));
      const { sendCafeApplicationReviewEmail } = require('../../src/services/emailService');
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const result = await sendCafeApplicationReviewEmail({ application: application(), applicant: applicant() });

      expect(result).toEqual({ logged: true, data: null, error: null });
      expect(sendMock).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('applicant decision emails', () => {
    test('the approval email links to the new dashboard', async () => {
      const { sendMock, emailService } = setup();

      await emailService.sendCafeApplicationApprovedEmail({
        to: 'asha@example.com',
        applicationRef: 'NB-7K2M-9QRT',
        cafeName: 'Filter Kaapi',
        cafeSlug: 'filter-kaapi',
      });
      const { to, html } = sendMock.mock.calls[0][0];
      expect(to).toBe('asha@example.com');
      expect(html).toContain('https://nextbooq.in/filter-kaapi/dashboard');
    });

    test('the rejection email carries the reviewer note, escaped', async () => {
      const { sendMock, emailService } = setup();

      await emailService.sendCafeApplicationRejectedEmail({
        to: 'asha@example.com',
        applicationRef: 'NB-7K2M-9QRT',
        cafeName: 'Filter Kaapi',
        note: 'Could not verify <b>the address</b>',
      });
      const { html } = sendMock.mock.calls[0][0];
      expect(html).toContain('NB-7K2M-9QRT');
      expect(html).toContain('&lt;b&gt;the address&lt;/b&gt;');
      expect(html).not.toContain('<b>the address</b>');
    });

    test('logs instead of sending when RESEND_API_KEY is unset', async () => {
      const sendMock = jest.fn();
      jest.doMock('../../src/config/env', () => ({
        RESEND_API_KEY: undefined,
        FROM_EMAIL: 'nextBooq <hello@nextbooq.in>',
        FRONTEND_URL: 'https://nextbooq.in',
      }));
      jest.doMock('resend', () => ({
        Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
      }));
      const { sendCafeApplicationApprovedEmail } = require('../../src/services/emailService');
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const result = await sendCafeApplicationApprovedEmail({
        to: 'asha@example.com',
        applicationRef: 'NB-7K2M-9QRT',
        cafeName: 'Filter Kaapi',
        cafeSlug: 'filter-kaapi',
      });

      expect(result).toEqual({ logged: true, data: null, error: null });
      expect(sendMock).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });
});
