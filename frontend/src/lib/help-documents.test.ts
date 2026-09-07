import { describe, expect, test } from 'vitest';
import { HELP_DOCUMENTS, readHelpDocument, type HelpDocumentSlug } from './help-documents';

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

  test('tells the operator to verify the delivery log', async () => {
    // Nothing in nextBooq reports a failing webhook, so an instruction to go
    // and look at Razorpay's own log is the only detection this has.
    const body = await readHelpDocument('razorpay-setup');

    expect(body).toMatch(/delivery log/i);
    expect(body).toMatch(/\b200\b/);
    expect(body).toMatch(/\b404\b/);
  });
});
