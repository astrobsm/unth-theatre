// ============================================================
// The HTML mammoth gives us, turned back into Markdown
// ------------------------------------------------------------
// mammoth reads .docx and emits HTML. It has no Markdown writer -- only
// convertToHtml and extractRawText -- so this is the missing half.
//
// extractRawText is not an option, which is worth saying plainly: it returns
// paragraphs with no headings and no tables. Headings are how the importer
// finds sections at all, and the appendices ARE tables. Raw text would import
// this policy as one undifferentiated section with the booking fields reduced
// to a run of words.
//
// WHY A HAND-WRITTEN CONVERTER AND NOT A LIBRARY. There is no HTML parser in
// this project and no DOM on the server. The input is not arbitrary web HTML
// though: it is mammoth's output, which is a small and known grammar --
// h1-h6, p, strong, em, ul/ol/li, table/tr/th/td, a, br, sup.
//
// WHY THE TAG MATCHING COUNTS DEPTH rather than using a non-greedy regex.
// Because `<ul><li>First<ul><li>Nested</li></ul></li></ul>` defeats a
// non-greedy match twice over: `<li>([\s\S]*?)</li>` ends at the INNER `</li>`,
// and `<ul>([\s\S]*?)</ul>` ends at the inner `</ul>`. The first version of
// this file did exactly that and produced "- FirstNested" with the second
// bullet orphaned. Nesting is not a thing regular expressions do, and a policy
// with sub-bullets -- which this one has throughout section 3 -- would have
// imported with its lists quietly scrambled.
//
// Anything outside the grammar is unwrapped rather than dropped, so an
// unexpected tag costs its formatting and never its text. In a document the
// committee is going to vote on, losing a sentence is the only unacceptable
// outcome.
// ============================================================

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&mdash;': '\u2014',
  '&ndash;': '\u2013',
  '&hellip;': '\u2026',
  '&rsquo;': '\u2019',
  '&lsquo;': '\u2018',
  '&rdquo;': '\u201d',
  '&ldquo;': '\u201c',
};

export function decodeEntities(text: string): string {
  let out = text;
  for (const [entity, char] of Object.entries(ENTITIES)) {
    out = out.split(entity).join(char);
  }
  out = out.replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)));
  out = out.replace(/&#x([0-9a-f]+);/gi, (_m, n: string) =>
    String.fromCodePoint(parseInt(n, 16)));
  return out;
}

// ── Depth-aware tag matching ───────────────────────────────────────────────

interface TagBlock {
  /** Index of the `<` of the opening tag. */
  start: number;
  /** Index just past the `>` of the closing tag. */
  end: number;
  /** The tag name as written, lower-cased. */
  tag: string;
  /** Everything between the opening and closing tags. */
  inner: string;
}

/**
 * The first block of any of `tags` at or after `from`, with its matching close
 * found by counting nested opens of the same tag.
 */
function nextBlock(html: string, tags: string[], from: number): TagBlock | null {
  const openRe = new RegExp(`<(${tags.join('|')})\\b[^>]*>`, 'gi');
  openRe.lastIndex = from;
  const open = openRe.exec(html);
  if (!open) return null;

  const tag = open[1].toLowerCase();
  const innerStart = open.index + open[0].length;

  const pairRe = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  pairRe.lastIndex = innerStart;
  let depth = 1;
  let step = pairRe.exec(html);

  while (step !== null) {
    depth += step[1] === '/' ? -1 : 1;
    if (depth === 0) {
      return {
        start: open.index,
        end: step.index + step[0].length,
        tag,
        inner: html.slice(innerStart, step.index),
      };
    }
    step = pairRe.exec(html);
  }

  // Unclosed tag: treat the rest of the document as its content rather than
  // discarding it.
  return { start: open.index, end: html.length, tag, inner: html.slice(innerStart) };
}

/** Replace every top-level block of `tags`, left to right. */
function replaceBlocks(
  html: string,
  tags: string[],
  render: (block: TagBlock) => string,
): string {
  let out = '';
  let at = 0;

  for (;;) {
    const block = nextBlock(html, tags, at);
    if (!block) break;
    out += html.slice(at, block.start);
    out += render(block);
    at = block.end;
  }

  return out + html.slice(at);
}

// ── Inline ─────────────────────────────────────────────────────────────────

/** Strip every tag and decode, for text that must not carry markup. */
function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Escape the characters that would turn body text into Markdown structure.
 *
 * A pipe inside a table cell ends the cell; a leading "#" in a paragraph
 * becomes a heading and therefore a SECTION, which would invent a question for
 * the committee out of a sentence that merely began with a hash.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/^(\s*)([#>])/gm, '$1\\$2');
}

function inlineToMarkdown(html: string): string {
  let out = html;

  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<\/?(?:strong|b)>/gi, '**');
  out = out.replace(/<\/?(?:em|i)>/gi, '*');

  out = out.replace(
    /<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, label: string) => {
      const text = textOf(label);
      const url = decodeEntities(href).trim();
      if (text === '') return url;
      if (url === '' || url.startsWith('#')) return text;
      return `[${text}](${url})`;
    },
  );

  // Footnote and endnote markers mammoth emits as superscript; the link is
  // gone by now and a bare number is not useful.
  out = out.replace(/<sup>[\s\S]*?<\/sup>/gi, '');

  // Everything else unwrapped: formatting lost, text kept.
  out = out.replace(/<[^>]*>/g, '');

  return escapeMarkdown(decodeEntities(out))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

// ── Blocks ─────────────────────────────────────────────────────────────────

/** One `<table>` to a Markdown table. */
function tableToMarkdown(inner: string): string {
  const rows: string[][] = [];
  let at = 0;

  for (;;) {
    const row = nextBlock(inner, ['tr'], at);
    if (!row) break;
    at = row.end;

    const cells: string[] = [];
    let cellAt = 0;
    for (;;) {
      const cell = nextBlock(row.inner, ['th', 'td'], cellAt);
      if (!cell) break;
      cellAt = cell.end;
      cells.push(inlineToMarkdown(cell.inner).replace(/\n+/g, ' ').trim());
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return '';

  const width = rows.reduce((n, r) => Math.max(n, r.length), 0);
  const pad = (r: string[]) => {
    const copy = r.slice();
    while (copy.length < width) copy.push('');
    return copy;
  };

  const header = pad(rows[0]);
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.slice(1).map(pad).map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

/**
 * The `<li>` children of one list, as Markdown lines.
 *
 * A nested list is pulled out of the item BEFORE the item's own text is
 * converted, or the child bullets end up inlined into the parent line — which
 * is exactly what the earlier regex version did.
 */
function itemsOf(listInner: string, ordered: boolean, depth: number): string[] {
  const indent = '  '.repeat(depth);
  const out: string[] = [];
  let at = 0;
  let n = 1;

  for (;;) {
    const item = nextBlock(listInner, ['li'], at);
    if (!item) break;
    at = item.end;

    const nested: string[] = [];
    const own = replaceBlocks(item.inner, ['ul', 'ol'], (list) => {
      nested.push(...itemsOf(list.inner, list.tag === 'ol', depth + 1));
      return '';
    });

    const text = inlineToMarkdown(own);
    if (text !== '' || nested.length > 0) {
      out.push(`${indent}${ordered ? `${n}.` : '-'} ${text}`.trimEnd());
      out.push(...nested);
      n += 1;
    }
  }

  return out;
}

/**
 * mammoth's HTML to Markdown.
 *
 * Tables and lists are lifted out first, because their inner text must not be
 * run through the paragraph rules. Each lifted block leaves a marker behind so
 * document order survives.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  const blocks: string[] = [];
  const marker = (text: string): string => {
    blocks.push(text);
    return `\u0000BLOCK${blocks.length - 1}\u0000`;
  };

  let out = html.replace(/<!--[\s\S]*?-->/g, '');

  // Images are dropped. A policy under review is text the committee argues
  // about; a diagram cannot be quoted in a response or amended in a proposal,
  // and carrying base64 image data would mean replicating it between the two
  // nodes for no reader.
  out = out.replace(/<img\b[^>]*>/gi, '');

  out = replaceBlocks(out, ['table'], (b) => marker(tableToMarkdown(b.inner)));
  out = replaceBlocks(out, ['ul', 'ol'], (b) =>
    marker(itemsOf(b.inner, b.tag === 'ol', 0).join('\n')));

  out = replaceBlocks(out, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], (b) => {
    const text = inlineToMarkdown(b.inner).replace(/\n+/g, ' ').trim();
    if (text === '') return '';
    const level = Number(b.tag.slice(1));
    // A heading's own text is not escaped for "#": these hashes are ours.
    return marker(`${'#'.repeat(level)} ${text.replace(/^\\#/, '#')}`);
  });

  out = replaceBlocks(out, ['blockquote'], (b) => {
    const text = inlineToMarkdown(b.inner);
    if (text === '') return '';
    return marker(text.split('\n').map((l) => `> ${l}`).join('\n'));
  });

  out = replaceBlocks(out, ['p'], (b) => {
    const text = inlineToMarkdown(b.inner);
    return text === '' ? '' : marker(text);
  });

  const ordered: string[] = [];
  const seen = new Set<number>();
  const markerRe = /\u0000BLOCK(\d+)\u0000/g;
  let hit = markerRe.exec(out);
  while (hit !== null) {
    const i = Number(hit[1]);
    if (!seen.has(i)) {
      seen.add(i);
      ordered.push(blocks[i]);
    }
    hit = markerRe.exec(out);
  }

  // A block whose marker never made it back (nested inside another block that
  // was itself replaced) is appended rather than lost.
  blocks.forEach((b, i) => {
    if (!seen.has(i) && b.trim() !== '') ordered.push(b);
  });

  // Text that sat outside every block still counts.
  const trailing = inlineToMarkdown(out.replace(/\u0000BLOCK\d+\u0000/g, '\n'));
  if (trailing.trim() !== '') ordered.push(trailing.trim());

  return ordered
    .map((b) => b.trim())
    .filter((b) => b !== '')
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
