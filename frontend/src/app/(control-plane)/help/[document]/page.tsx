import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarkdownDocument } from '@/components/docs/markdown-document';
import { HELP_DOCUMENTS, readHelpDocument, type HelpDocumentSlug } from '@/lib/help-documents';

// The guides are known at build time, so they render as static pages.
export function generateStaticParams() {
  return Object.keys(HELP_DOCUMENTS).map((document) => ({ document }));
}

// The set of guides is closed. Refusing any slug outside it means an unknown
// path 404s at the routing layer rather than reaching the page, so no request
// ever hits the filesystem with a param we did not publish.
export const dynamicParams = false;

const isHelpSlug = (value: string): value is HelpDocumentSlug =>
  Object.prototype.hasOwnProperty.call(HELP_DOCUMENTS, value);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ document: string }>;
}): Promise<Metadata> {
  const { document } = await params;
  if (!isHelpSlug(document)) return {};

  const { title, description } = HELP_DOCUMENTS[document];
  return {
    title: `${title} — nextBooq`,
    description,
    alternates: { canonical: `/help/${document}` },
  };
}

export default async function HelpDocumentPage({
  params,
}: {
  params: Promise<{ document: string }>;
}) {
  const { document } = await params;
  if (!isHelpSlug(document)) notFound();

  const markdown = await readHelpDocument(document);

  // The "Last Updated" line is the document's own first bold line; lift it into
  // the page header so it sits with the title rather than floating above the
  // body text. A guide that says when it was written is worth more than one
  // that does not, since Razorpay's own dashboard moves around.
  const updatedMatch = markdown.match(/^\*\*(Last Updated:[^*]+)\*\*$/m);
  const body = updatedMatch ? markdown.replace(updatedMatch[0], '') : markdown;

  return (
    <MarkdownDocument title={HELP_DOCUMENTS[document].title} updated={updatedMatch?.[1]}>
      {body}
    </MarkdownDocument>
  );
}
