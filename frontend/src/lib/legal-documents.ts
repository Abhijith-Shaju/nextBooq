import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The legal documents live as Markdown in the repo's top-level `legal/`
 * directory, which is the single source of truth: the same files get sent to
 * the lawyer for review and rendered here. Duplicating their text into TSX
 * would guarantee the published page and the reviewed document drift apart.
 *
 * Read at build time (these are static routes), so there is no per-request
 * filesystem cost and a missing file fails the build rather than 500ing a
 * visitor.
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
} as const;

export type LegalDocumentSlug = keyof typeof LEGAL_DOCUMENTS;

// process.cwd() is the `frontend/` directory for both `next dev` and
// `next build`, so the documents sit one level up.
const LEGAL_DIR = path.join(process.cwd(), '..', 'legal');

export async function readLegalDocument(slug: LegalDocumentSlug): Promise<string> {
  const file = await fs.readFile(path.join(LEGAL_DIR, LEGAL_DOCUMENTS[slug].file), 'utf8');

  // Normalise line endings at the boundary. These files are edited on Windows
  // and land with CRLF, which silently breaks any downstream `$`-anchored
  // multiline regex: `**Last Updated: ...**\r\n` does not match /\*\*$/m
  // because of the \r sitting between the text and the newline.
  const raw = file.replace(/\r\n/g, '\n');

  return renderTodoPlaceholders(raw);
}

/**
 * Renders a `{{TODO:...}}` marker as a visible placeholder rather than leaking
 * the raw marker, so an unfinished document is obvious to whoever is reviewing
 * the page instead of looking like intentional copy.
 *
 * The published documents were completed on 8 September 2026 and carry no
 * markers today. This is kept, and tested directly, because a clause added
 * later will arrive with one — and the failure it guards against is a literal
 * `{{TODO:GSTIN_OR_NOT_APPLICABLE}}` sitting on a public legal page.
 *
 * Deliberately emits no emphasis of its own: several markers sat inside an
 * already-bold line (`**Last Updated: {{...}}**`), and wrapping the replacement
 * in `**` produced nested bold that broke both the rendering and the regex that
 * lifts that line into page metadata. Square brackets read as a placeholder
 * without needing emphasis.
 */
export function renderTodoPlaceholders(raw: string): string {
  return raw.replace(/\{\{TODO:([^}]+)\}\}/g, (_match, label: string) => {
    const name = label.split('—')[0].trim().replace(/_/g, ' ').toLowerCase();
    return `[${name} — to be confirmed]`;
  });
}
