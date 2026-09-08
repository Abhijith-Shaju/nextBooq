import { readMarkdownDocument } from './markdown-documents';

/**
 * The legal documents live as Markdown in the repo's top-level `legal/`
 * directory, which is the single source of truth: the same files get sent to
 * the lawyer for review and rendered here. Duplicating their text into TSX
 * would guarantee the published page and the reviewed document drift apart.
 */
export const LEGAL_DOCUMENTS = {
  terms: {
    file: 'terms-and-conditions.md',
    title: 'Terms and Conditions',
    description:
      'The agreement between you and nextBooq covering reservations, deposits, and use of the platform.',
  },
  privacy: {
    file: 'privacy-policy.md',
    title: 'Privacy Policy',
    description:
      'What personal data nextBooq collects, why, who it is shared with, and the rights you have over it.',
  },
  refunds: {
    file: 'cancellation-and-refund-policy.md',
    title: 'Cancellation and Refund Policy',
    description:
      'How reservation deposits work, when they are refunded, and how to cancel a booking.',
  },
  // Nothing ships in a table reservation business, but payment providers and
  // the E-Commerce Rules both expect a delivery policy to exist. A published
  // page explaining that the "delivery" is an instantly-confirmed booking is
  // more useful to a reader, and to a reviewer, than a missing URL.
  shipping: {
    file: 'shipping-and-delivery-policy.md',
    title: 'Shipping and Delivery Policy',
    description:
      'What you receive when you book, when it is delivered, and what to do if a booking does not appear.',
  },
} as const;

export type LegalDocumentSlug = keyof typeof LEGAL_DOCUMENTS;

export async function readLegalDocument(slug: LegalDocumentSlug): Promise<string> {
  return readMarkdownDocument('legal', LEGAL_DOCUMENTS[slug].file);
}
