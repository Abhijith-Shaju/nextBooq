import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Shared shell for the Markdown documents served from the repo: the legal
 * texts and the operator help guides. They are long and read rather than
 * scanned, so this deliberately favours reading comfort over the marketing
 * pages' visual density: a single measure-constrained column, generous
 * leading, and tables that scroll on their own rather than forcing the page
 * sideways on a phone.
 */
export function MarkdownDocument({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: string;
}) {
  return (
    <main className="bg-brand-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-28 pb-24 md:pt-32">
        <header className="mb-10 pb-8 border-b border-brand-brown/15">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-brand-brown tracking-tight">
            {title}
          </h1>
          {updated ? (
            <p className="mt-2 text-sm text-brand-mocha">{updated}</p>
          ) : null}
        </header>

        <div className="legal-prose text-brand-brown/90">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              // The document's own H1 is already rendered in the header above.
              h1: () => null,
              h2: ({ children }) => (
                <h2 className="font-display text-xl sm:text-2xl font-bold text-brand-brown mt-12 mb-3 scroll-mt-24">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="font-display text-base font-bold text-brand-brown mt-8 mb-2">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="my-4 leading-[1.75] text-[15px]">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="my-4 pl-5 list-disc space-y-2 text-[15px] leading-[1.7] marker:text-brand-red">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="my-4 pl-5 list-decimal space-y-2 text-[15px] leading-[1.7] marker:text-brand-mocha">
                  {children}
                </ol>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-brand-brown">{children}</strong>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  className="text-brand-red font-medium underline underline-offset-2 hover:no-underline"
                >
                  {children}
                </a>
              ),
              hr: () => <hr className="my-10 border-brand-brown/15" />,
              blockquote: ({ children }) => (
                <blockquote className="my-5 border-l-4 border-brand-gold bg-brand-tan/30 px-4 py-3 text-[15px] rounded-r-lg">
                  {children}
                </blockquote>
              ),
              // Wide tables scroll inside their own container so the page body
              // never scrolls horizontally on a phone.
              table: ({ children }) => (
                <div className="my-6 overflow-x-auto rounded-xl border border-brand-brown/15 bg-white/70">
                  <table className="w-full text-left text-[14px] border-collapse">{children}</table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-brand-tan/40 text-brand-brown">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-4 py-2.5 font-semibold align-top border-b border-brand-brown/15">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-4 py-2.5 align-top border-b border-brand-brown/10 last:border-0">
                  {children}
                </td>
              ),
              em: ({ children }) => <em className="text-brand-mocha">{children}</em>,
              // A help guide asks an operator to copy exact strings — a webhook
              // URL, an event name — so these must be visually separable from
              // the prose around them and unambiguous to select. `break-all`
              // because a webhook URL is longer than a phone is wide.
              code: ({ children }) => (
                <code className="rounded bg-brand-tan/60 px-1.5 py-0.5 font-mono text-[13.5px] text-brand-brown break-all">
                  {children}
                </code>
              ),
              // Fenced blocks arrive as <pre><code>, so the inline treatment
              // above is neutralised inside them rather than nesting one
              // background inside another.
              pre: ({ children }) => (
                <pre className="my-5 overflow-x-auto rounded-xl border border-brand-brown/15 bg-brand-tan/25 p-4 font-mono text-[13px] leading-relaxed [&>code]:bg-transparent [&>code]:px-0 [&>code]:py-0">
                  {children}
                </pre>
              ),
            }}
          >
            {children}
          </Markdown>
        </div>
      </div>
    </main>
  );
}
