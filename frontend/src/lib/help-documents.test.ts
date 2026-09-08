import { describe, expect, test } from 'vitest';
import { HELP_DOCUMENTS, readHelpDocument, type HelpDocumentSlug } from './help-documents';
import { LEGAL_DOCUMENTS } from './legal-documents';

const slugs = Object.keys(HELP_DOCUMENTS) as HelpDocumentSlug[];

describe('help documents', () => {
  test('every published slug resolves to a real file', async () => {
    for (const slug of slugs) {
      const body = await readHelpDocument(slug);
      expect(body.length).toBeGreaterThan(500);
    }
  });

  test.each(slugs)('%s never leaks a raw {{TODO}} marker to the page', async (slug) => {
    const body = await readHelpDocument(slug);
    expect(body).not.toMatch(/\{\{TODO/);
    expect(body).not.toMatch(/to be confirmed/);
  });

  test.each(slugs)('%s exposes a Last Updated line the page can lift into its header', async (slug) => {
    const body = await readHelpDocument(slug);
    // Same CRLF guard as the legal documents: a stray \r defeats the
    // `$`-anchored match and the date renders as stray body text.
    expect(body).not.toMatch(/\r/);
    expect(body).toMatch(/^\*\*Last Updated:[^*]+\*\*$/m);
  });

  test.each(slugs)('%s carries a title and description for page metadata', (slug) => {
    expect(HELP_DOCUMENTS[slug].title).toBeTruthy();
    expect(HELP_DOCUMENTS[slug].description.length).toBeGreaterThan(20);
  });
});

// The guide is the only thing standing between a cafe owner and the failure we
// shipped for weeks: a webhook pointed at the wrong host, returning 404 to
// Razorpay and nothing at all to us. If its content drifts, it stops being a
// safeguard and becomes a confident set of wrong instructions.
describe('razorpay-setup guide content', () => {
  test('names the API host and warns against the frontend one', async () => {
    const body = await readHelpDocument('razorpay-setup');

    expect(body).toContain('api.nextbooq.in');
    // The specific mistake that produced 404s on every delivery.
    expect(body).toMatch(/www\.nextbooq\.in/);
  });

  test('names both webhook events the backend actually handles', async () => {
    // payment.captured alone looks like it works. Without payment.failed an
    // abandoned checkout is never reconciled and the table stays held.
    const body = await readHelpDocument('razorpay-setup');

    expect(body).toContain('payment.captured');
    expect(body).toContain('payment.failed');
  });

  test('every nextBooq URL it hands to Razorpay is one we actually publish', async () => {
    // The guide tells a cafe to paste these into Razorpay's activation form. A
    // URL that 404s there costs them a rejection and another 3-4 days, and the
    // guide is exactly the kind of document that keeps naming a page months
    // after it was renamed. Same failure as the webhook URL, different form.
    const body = await readHelpDocument('razorpay-setup');

    const known = new Set([
      '/contact',
      '/#pricing',
      '/your-cafe', // the worked example of a storefront URL
      ...Object.keys(LEGAL_DOCUMENTS).map((slug) => `/legal/${slug}`),
    ]);

    const paths = [...body.matchAll(/https:\/\/www\.nextbooq\.in(\/[^\s`|)\]]*)/g)].map(
      (m) => m[1]
    );

    expect(paths.length).toBeGreaterThan(4);
    expect(paths.filter((p) => !known.has(p))).toEqual([]);
  });

  test('names the shipping policy, which Razorpay asks for and a booking service easily forgets', async () => {
    const body = await readHelpDocument('razorpay-setup');
    expect(body).toContain('/legal/shipping');
  });

  test('warns that the demo account must have a verified email', async () => {
    // Booking is gated on email verification, so an unverified test account
    // lets a reviewer sign in and then blocks them at the step they came to
    // check — which reads as a broken site rather than an unverified account.
    const body = await readHelpDocument('razorpay-setup');
    expect(body).toMatch(/verify that account's email address/i);
  });

  test('tells the operator to verify the delivery log', async () => {
    // Nothing in nextBooq reports a failing webhook, so an instruction to go
    // and look at Razorpay's own log is the only detection this has.
    const body = await readHelpDocument('razorpay-setup');

    expect(body).toMatch(/delivery log/i);
    expect(body).toMatch(/\b200\b/);
    expect(body).toMatch(/\b404\b/);
  });
});
