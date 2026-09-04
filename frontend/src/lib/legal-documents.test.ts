import { describe, expect, test } from 'vitest';
import { LEGAL_DOCUMENTS, readLegalDocument, type LegalDocumentSlug } from './legal-documents';

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
    // The unfilled details must still be visible as placeholders, not silently
    // dropped -- an unfinished legal document should look unfinished.
    expect(body).toMatch(/to be confirmed/);
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
