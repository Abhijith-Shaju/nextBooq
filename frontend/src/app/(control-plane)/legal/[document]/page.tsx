import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarkdownDocument } from '@/components/docs/markdown-document';
import {
  LEGAL_DOCUMENTS,
  readLegalDocument,
  type LegalDocumentSlug,
} from '@/lib/legal-documents';

// All three documents are known at build time, so they render as static pages.
export function generateStaticParams() {
  return Object.keys(LEGAL_DOCUMENTS).map((document) => ({ document }));
}

// The set of legal documents is closed. Refusing any slug outside it means an
// unknown path 404s at the routing layer rather than reaching the page, so no
// request ever hits the filesystem with a param we did not publish.
export const dynamicParams = false;

const isLegalSlug = (value: string): value is LegalDocumentSlug =>
  Object.prototype.hasOwnProperty.call(LEGAL_DOCUMENTS, value);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ document: string }>;
}): Promise<Metadata> {
  const { document } = await params;
  if (!isLegalSlug(document)) return {};

  const { title, description } = LEGAL_DOCUMENTS[document];
  return {
    title: `${title} — nextBooq`,
    description,
    alternates: { canonical: `/legal/${document}` },
  };
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ document: string }>;
}) {
  const { document } = await params;
  if (!isLegalSlug(document)) notFound();

  const markdown = await readLegalDocument(document);

  // The "Last Updated" line is the document's own first bold line; lift it into
  // the page header so it sits with the title rather than floating above the
  // body text.
  const updatedMatch = markdown.match(/^\*\*(Last Updated:[^*]+)\*\*$/m);
  const body = updatedMatch ? markdown.replace(updatedMatch[0], '') : markdown;

  return (
    <MarkdownDocument title={LEGAL_DOCUMENTS[document].title} updated={updatedMatch?.[1]}>
      {body}
    </MarkdownDocument>
  );
}
