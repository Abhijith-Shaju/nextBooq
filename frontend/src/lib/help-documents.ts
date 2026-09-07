import { readMarkdownDocument } from './markdown-documents';

/**
 * Operator-facing guides, kept as Markdown in the repo's top-level `help/`
 * directory alongside the legal texts.
 *
 * These are written for café owners rather than for us, and they exist because
 * the Razorpay connection has failure modes that are invisible from inside
 * nextBooq: a webhook pointed at the wrong host returns 404 to Razorpay and
 * nothing at all to us, so the only person who can catch it is the operator
 * looking at their own delivery log. A guide is the difference between them
 * knowing to look and finding out weeks later.
 */
export const HELP_DOCUMENTS = {
  'razorpay-setup': {
    file: 'razorpay-setup.md',
    title: 'Setting up Razorpay for your café',
    description:
      'Connect your own Razorpay account to nextBooq so guests can pay their reservation fee directly to you.',
  },
} as const;

export type HelpDocumentSlug = keyof typeof HELP_DOCUMENTS;

export async function readHelpDocument(slug: HelpDocumentSlug): Promise<string> {
  return readMarkdownDocument('help', HELP_DOCUMENTS[slug].file);
}
