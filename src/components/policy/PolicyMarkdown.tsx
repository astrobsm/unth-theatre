'use client';

/**
 * A policy section, rendered.
 *
 * WHY THIS IS NOT dangerouslySetInnerHTML, and not a Markdown library.
 *
 * The repository has no Markdown dependency and exactly one
 * dangerouslySetInnerHTML in the whole of src -- the captive portal's inline
 * style. Adding injected HTML here would be the worst place to start: this
 * component renders the policy text AND, on the owner's screens, the
 * "proposed wording" that reviewers typed. That is text from a dozen people,
 * displayed back to the committee and to Management. Rendering it as React
 * elements means a proposal containing a script tag is a proposal containing
 * the words "script tag", which is the only safe answer.
 *
 * THE [BRACKETED] VALUES ARE MARKED UP ON PURPOSE. They are what the committee
 * is actually being asked to settle, and in a wall of policy prose on a phone
 * they are invisible. Highlighting them is why a reviewer notices there is a
 * decision to make in the paragraph they just read.
 */

import React from 'react';

interface Props {
  markdown: string;
  /** Highlight [bracketed] open values. Off for a reviewer's own prose. */
  highlightPlaceholders?: boolean;
  className?: string;
}

/** Placeholders for escaped characters, so they survive inline parsing. */
const ESC_PIPE = '\u0001';
const ESC_HASH = '\u0002';
const ESC_GT = '\u0003';

const protect = (s: string) =>
  s.split('\\|').join(ESC_PIPE).split('\\#').join(ESC_HASH).split('\\>').join(ESC_GT);

const restore = (s: string) =>
  s.split(ESC_PIPE).join('|').split(ESC_HASH).join('#').split(ESC_GT).join('>');

/** `**bold**`, `*italic*`, `` `code` ``, `[label](url)`, `[open value]`. */
const INLINE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]*\]\([^)\s]*\)|\[[^\]\n]+\])/g;

function renderInline(
  text: string,
  highlightPlaceholders: boolean,
  keyPrefix: string,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const parts = protect(text).split(INLINE);

  parts.forEach((part, i) => {
    if (part === '') return;
    const key = `${keyPrefix}-${i}`;

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      out.push(<strong key={key}>{restore(part.slice(2, -2))}</strong>);
      return;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      out.push(<em key={key}>{restore(part.slice(1, -1))}</em>);
      return;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      out.push(
        <code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em] text-slate-800">
          {restore(part.slice(1, -1))}
        </code>,
      );
      return;
    }

    const link = /^\[([^\]]*)\]\(([^)\s]*)\)$/.exec(part);
    if (link) {
      const label = restore(link[1]) || restore(link[2]);
      out.push(
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-700 underline underline-offset-2"
        >
          {label}
        </a>,
      );
      return;
    }

    if (part.startsWith('[') && part.endsWith(']') && part.length > 2) {
      const inner = restore(part.slice(1, -1));
      if (!highlightPlaceholders) {
        out.push(<span key={key}>{restore(part)}</span>);
        return;
      }
      out.push(
        <mark
          key={key}
          className="rounded bg-amber-100 px-1 font-semibold text-amber-900 ring-1 ring-amber-300"
          title="An open value the committee is being asked to settle"
        >
          {inner}
        </mark>,
      );
      return;
    }

    out.push(<span key={key}>{restore(part)}</span>);
  });

  return out;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^(\s*)[-*]\s+(.*)$/;
const NUMBERED = /^(\s*)\d+\.\s+(.*)$/;
const TABLE_ROW = /^\s*\|(.*)\|\s*$/;
const DIVIDER_ROW = /^\s*\|[\s|:-]+\|\s*$/;

const cellsOf = (line: string): string[] => {
  const inner = TABLE_ROW.exec(line)?.[1] ?? '';
  // Split on unescaped pipes only.
  return protect(inner).split('|').map((c) => restore(c).trim());
};

const HEADING_CLASS: Record<number, string> = {
  1: 'mt-4 text-lg font-bold text-slate-900',
  2: 'mt-4 text-base font-bold text-slate-900',
  3: 'mt-3 text-base font-semibold text-slate-900',
  4: 'mt-3 text-sm font-semibold text-slate-800',
  5: 'mt-2 text-sm font-semibold text-slate-700',
  6: 'mt-2 text-sm font-semibold text-slate-700',
};

export default function PolicyMarkdown({
  markdown,
  highlightPlaceholders = true,
  className,
}: Props) {
  const lines = (markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const inline = (text: string) => renderInline(text, highlightPlaceholders, `k${key}`);

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = (`h${Math.min(level + 2, 6)}`) as 'h3' | 'h4' | 'h5' | 'h6';
      blocks.push(
        <Tag key={`h${key}`} className={HEADING_CLASS[level]}>
          {inline(heading[2])}
        </Tag>,
      );
      key += 1;
      i += 1;
      continue;
    }

    // A table: a run of pipe rows. The divider row is structure, not content.
    if (TABLE_ROW.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        if (!DIVIDER_ROW.test(lines[i])) rows.push(cellsOf(lines[i]));
        i += 1;
      }
      if (rows.length > 0) {
        const [head, ...body] = rows;
        blocks.push(
          // Scrolls horizontally rather than squeezing: the appendix tables
          // have five columns and this is read on a phone.
          <div key={`t${key}`} className="my-3 -mx-1 overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100">
                  {head.map((c, ci) => (
                    <th
                      key={ci}
                      className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-800"
                    >
                      {inline(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} className={ri % 2 ? 'bg-slate-50' : undefined}>
                    {row.map((c, ci) => (
                      <td key={ci} className="border border-slate-300 px-2 py-1.5 align-top text-slate-700">
                        {inline(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        key += 1;
      }
      continue;
    }

    // A list: a run of bullets or numbers. Indentation becomes nesting.
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const items: Array<{ depth: number; text: string; ordered: boolean }> = [];
      while (i < lines.length && (BULLET.test(lines[i]) || NUMBERED.test(lines[i]))) {
        const bullet = BULLET.exec(lines[i]);
        const numbered = NUMBERED.exec(lines[i]);
        const match = bullet ?? numbered!;
        items.push({
          depth: Math.floor(match[1].length / 2),
          text: match[2],
          ordered: bullet === null,
        });
        i += 1;
      }
      const ordered = items[0].ordered;
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag
          key={`l${key}`}
          className={`my-2 space-y-1 pl-5 text-sm text-slate-700 ${
            ordered ? 'list-decimal' : 'list-disc'
          }`}
        >
          {items.map((item, ii) => (
            <li key={ii} style={item.depth > 0 ? { marginLeft: item.depth * 14 } : undefined}>
              {inline(item.text)}
            </li>
          ))}
        </ListTag>,
      );
      key += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`q${key}`}
          className="my-2 border-l-4 border-slate-300 pl-3 text-sm italic text-slate-600"
        >
          {inline(quoted.join(' '))}
        </blockquote>,
      );
      key += 1;
      continue;
    }

    // A paragraph: everything up to the next blank line or block start.
    const para: string[] = [];
    while (
      i < lines.length
      && lines[i].trim() !== ''
      && !HEADING.test(lines[i])
      && !TABLE_ROW.test(lines[i])
      && !BULLET.test(lines[i])
      && !NUMBERED.test(lines[i])
      && !/^\s*>\s?/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`p${key}`} className="my-2 text-sm leading-relaxed text-slate-700">
        {inline(para.join(' '))}
      </p>,
    );
    key += 1;
  }

  if (blocks.length === 0) {
    return (
      <p className={`text-sm italic text-slate-400 ${className ?? ''}`}>
        This section has no text of its own.
      </p>
    );
  }

  return <div className={className}>{blocks}</div>;
}
