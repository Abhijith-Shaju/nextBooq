import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ContactPage from './page';
import { LEGAL_DOCUMENTS, readLegalDocument, type LegalDocumentSlug } from '@/lib/legal-documents';

// The form posts to the API and is covered by its own tests; this page's job is
// the published details beside it.
vi.mock('@/components/marketing/ContactForm', () => ({ ContactForm: () => null }));

const detailValues = () =>
  screen.getAllByTestId('contact-detail').map((el) => el.textContent?.trim() ?? '');

describe('ContactPage', () => {
  test('publishes the details the E-Commerce Rules require', () => {
    render(<ContactPage />);
    const values = detailValues();

    // Rule 5 of the Consumer Protection (E-Commerce) Rules 2020: a legal name,
    // a geographic address, and contact details a customer can actually use.
    expect(values.join(' | ')).toMatch(/nextbooq@gmail\.com/);
    expect(values.join(' | ')).toMatch(/\+91 96300 23003/);
    expect(values.join(' | ')).toMatch(/Phagwara, Punjab 144411/);
  });

  test('names a grievance officer, as the IT Rules require', () => {
    // Matched against the detail values rather than the whole page: the section
    // heading also reads "Grievance Officer", and a query that matches a
    // heading would still pass with no officer actually named.
    render(<ContactPage />);
    const values = detailValues();

    expect(values).toContain('Shashank Singh');
    expect(values).toContain('Grievance Officer & Managing Partner');
    expect(values).toContain('shashanksingh9048@gmail.com');
  });

  test('carries no unfilled placeholder', () => {
    // A contact page with "to be confirmed" on it fails the rule it exists to
    // satisfy, and Razorpay's onboarding reviewer reads this page.
    const { container } = render(<ContactPage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/to be confirmed/i);
    expect(text).not.toMatch(/\bTB[CD]\b/);
    expect(text).not.toMatch(/\{\{TODO/);
  });

  test('every detail has a real value', () => {
    render(<ContactPage />);
    const values = detailValues();

    // Guards the guard: if the testid ever stopped matching, this test and the
    // drift check below would both pass over an empty list and prove nothing.
    expect(values.length).toBeGreaterThanOrEqual(8);

    for (const value of values) {
      expect(value.length).toBeGreaterThan(3);
    }
  });
});

// This page restates facts that also live in legal/*.md, because it is a React
// tree and those are prose. Nothing stops the two drifting except this: a
// contact page naming a different address or grievance officer than the
// published terms is worse than one that says nothing, since a regulator reads
// both and the disagreement is the finding.
describe('agreement with the published legal documents', () => {
  const slugs = Object.keys(LEGAL_DOCUMENTS) as LegalDocumentSlug[];

  test('every published detail also appears in the legal documents', async () => {
    render(<ContactPage />);
    const values = detailValues();

    expect(values.length).toBeGreaterThanOrEqual(8);

    const documents = await Promise.all(slugs.map((slug) => readLegalDocument(slug)));
    const corpus = documents.join('\n');

    const missing = values.filter((value) => !corpus.includes(value));

    expect(missing).toEqual([]);
  });
});
