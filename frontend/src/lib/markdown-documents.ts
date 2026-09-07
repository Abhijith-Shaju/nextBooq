import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Reads the Markdown documents kept in the repo root — the legal texts under
 * `legal/` and the operator guides under `help/`.
 *
 * Those files are the single source of truth: the legal ones are what goes to
 * a lawyer for review, and the guides are what we send an operator who is
 * stuck. Duplicating either into TSX would guarantee the published page and
 * the reviewed document drift apart.
 *
 * Shared by both registries rather than copied into each, because the line
 * ending normalisation below is a subtle correctness detail that has already
 * caused one bug — a second copy would invite it back.
 */

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

/**
 * Reads one Markdown file from a directory in the repo root.
 *
 * `dirName` is relative to the repository root, not to this file:
 * process.cwd() is the `frontend/` directory for both `next dev` and
 * `next build`, so the documents sit one level up.
 *
 * Callers read at build time (these are static routes), so there is no
 * per-request filesystem cost and a missing file fails the build rather than
 * 500ing a visitor.
 */
export async function readMarkdownDocument(dirName: string, fileName: string): Promise<string> {
  const file = await fs.readFile(path.join(process.cwd(), '..', dirName, fileName), 'utf8');

  // Normalise line endings at the boundary. These files are edited on Windows
  // and land with CRLF, which silently breaks any downstream `$`-anchored
  // multiline regex: `**Last Updated: ...**\r\n` does not match /\*\*$/m
  // because of the \r sitting between the text and the newline. When this
  // broke, the date rendered as stray body text instead of page metadata.
  const raw = file.replace(/\r\n/g, '\n');

  return renderTodoPlaceholders(raw);
}
