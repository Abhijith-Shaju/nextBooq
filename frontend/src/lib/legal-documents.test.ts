import { describe, expect, test } from 'vitest';
import {
  LEGAL_DOCUMENTS,
  readLegalDocument,
  renderTodoPlaceholders,
  type LegalDocumentSlug,
} from './legal-documents';

const slugs = Object.keys(LEGAL_DOCUMENTS) as LegalDocumentSlug[];

describe('legal documents', () => {
  test('every published slug resolves to a real file', async () => {
    for (const slug of slugs) {
      const body = await readLegalDocument(slug);
      expect(body.length).toBeGreaterThan(500);
    }
  });

  test.each(slugs)('%s never leaks a raw {{TODO}} marker to the page', async (slug) => {
    const body = await readLegalDocument(slug);
    expect(body).not.toMatch(/\{\{TODO/);
  });

  test.each(slugs)('%s carries no unfilled placeholder', async (slug) => {
    // Filled on 8 September 2026. A rendered "[... to be confirmed]" reaching a
    // published page is the same defect as a raw marker, just quieter: it tells
    // a guest, a regulator or Razorpay's onboarding reviewer that the terms
    // they are being asked to rely on are unfinished.
    const body = await readLegalDocument(slug);
    expect(body).not.toMatch(/to be confirmed/);
  });

  test.each(slugs)('%s exposes a Last Updated line the page can lift into its header', async (slug) => {
    const body = await readLegalDocument(slug);
    // Regression guard: these files are authored on Windows and arrive with
    // CRLF, which defeats a `$`-anchored multiline match unless the reader
    // normalises line endings first. When this broke, the date rendered as
    // stray body text instead of page metadata.
    expect(body).not.toMatch(/\r/);
    expect(body).toMatch(/^\*\*Last Updated:[^*]+\*\*$/m);
  });

  test.each(slugs)('%s carries a title and description for page metadata', (slug) => {
    expect(LEGAL_DOCUMENTS[slug].title).toBeTruthy();
    expect(LEGAL_DOCUMENTS[slug].description.length).toBeGreaterThan(20);
  });
});

// Tested directly rather than through the documents, which no longer contain
// any markers. The code path stays live because a clause added later will
// arrive with one, and what it prevents -- a literal {{TODO:...}} on a public
// legal page -- is not something to rediscover in production.
describe('renderTodoPlaceholders', () => {
  test('renders a marker as a readable placeholder instead of leaking it', () => {
    expect(renderTodoPlaceholders('GSTIN: {{TODO:GSTIN_OR_NOT_APPLICABLE}}')).toBe(
      'GSTIN: [gstin or not applicable — to be confirmed]'
    );
  });

  test('drops the em-dashed hint, which is a note to the author not the reader', () => {
    expect(renderTodoPlaceholders('Respond within {{TODO:DSR_RESPONSE_DAYS — suggest 30}} days')).toBe(
      'Respond within [dsr response days — to be confirmed] days'
    );
  });

  test('adds no emphasis of its own, so it can sit inside an already-bold line', () => {
    // Nested bold broke both the rendered output and the `$`-anchored regex
    // that lifts the Last Updated line into page metadata.
    const out = renderTodoPlaceholders('**Last Updated: {{TODO:EFFECTIVE_DATE}}**');
    expect(out).toBe('**Last Updated: [effective date — to be confirmed]**');
  });

  test('leaves text with no markers untouched', () => {
    const clean = '**Last Updated: 8 September 2026**';
    expect(renderTodoPlaceholders(clean)).toBe(clean);
  });
});
