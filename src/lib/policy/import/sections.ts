// ============================================================
// Turning a policy draft into a section tree
// ------------------------------------------------------------
// The whole review hangs off this. A reviewer gives a stance per section, so a
// parse that merges two sections silently removes a question the committee was
// supposed to answer, and one that splits a section in half asks for a stance
// on half a sentence. Neither is visible on the dashboard afterwards -- it just
// looks as though the committee had less to say about section 7.
//
// So the importer is followed by a PREVIEW the owner has to pass, and this file
// is written to be exercised directly in tests rather than through the upload.
//
// WHY NESTING FOLLOWS THE NUMBER, NOT THE HEADING DEPTH
//
// The obvious approach is to nest by `#` depth: an `###` belongs to the `##`
// above it. Policy drafts do not survive that assumption. This one was written
// in a word processor and exported, and its subsections appear variously as
// "### 3.1 The surgeon", "## 3.1 The surgeon" and "**3.1 The surgeon**"
// depending on who last edited that paragraph. Depth-based nesting puts 3.1
// beside section 3 in one place and under it in another, and the reviewer flow
// then shows twelve extra top-level steps.
//
// The NUMBER is the thing the committee actually agreed on -- they cite "5.4"
// in meetings -- and "5.4" states its own parent. So: nest by number wherever a
// number exists and its parent is present, and fall back to heading depth only
// for unnumbered headings.
// ============================================================

export interface ParsedSection {
  /** Stable within one parse, used to wire parents before ids exist. */
  key: string;
  /** "5.4", "3.12", "A", or null for an unnumbered block. */
  number: string | null;
  title: string;
  /** Markdown heading depth, 1-6. Kept for the fallback nesting only. */
  level: number;
  parentKey: string | null;
  /** Position within the parent, from 0. */
  order: number;
  /** Markdown, with tables and lists left exactly as written. */
  body: string;
  isAppendix: boolean;
}

/** The heading forms this recognises, most specific first. */
const APPENDIX_HEADING = /^appendix\s+([A-Z0-9]+)\s*[:.–—-]?\s*(.*)$/i;
const NUMBERED_HEADING = /^(?:section\s+)?(\d+(?:\.\d+)*)\s*[:.)–—-]?\s+(.*)$/i;
/** A bare "5." or "5.4" with no title of its own. */
const NUMBER_ONLY_HEADING = /^(?:section\s+)?(\d+(?:\.\d+)*)\s*\.?$/i;
/** "A. Booking fields" — an appendix written as a bare letter. */
const LETTER_HEADING = /^([A-Z])\s*[:.)]\s+(.*)$/;

interface HeadingParts {
  number: string | null;
  title: string;
  isAppendix: boolean;
}

/**
 * Split a heading into its number and its title.
 *
 * Exported because it is the part most likely to meet a form nobody
 * anticipated, and a test naming the exact string is worth more than a comment
 * claiming it works.
 */
export function parseHeadingText(raw: string): HeadingParts {
  const text = raw.replace(/\s+/g, ' ').trim().replace(/[:.\s]+$/, '').trim();
  if (text === '') return { number: null, title: 'Untitled section', isAppendix: false };

  const appendix = APPENDIX_HEADING.exec(text);
  if (appendix) {
    const letter = appendix[1].toUpperCase();
    const title = appendix[2].trim();
    return {
      number: letter,
      title: title === '' ? `Appendix ${letter}` : title,
      isAppendix: true,
    };
  }

  const numberOnly = NUMBER_ONLY_HEADING.exec(text);
  if (numberOnly) {
    return { number: numberOnly[1], title: `Section ${numberOnly[1]}`, isAppendix: false };
  }

  const numbered = NUMBERED_HEADING.exec(text);
  if (numbered) {
    const title = numbered[2].trim();
    return {
      number: numbered[1],
      title: title === '' ? `Section ${numbered[1]}` : title,
      isAppendix: false,
    };
  }

  const letter = LETTER_HEADING.exec(text);
  if (letter) {
    return { number: letter[1], title: letter[2].trim(), isAppendix: true };
  }

  return { number: null, title: text, isAppendix: false };
}

/** The parent number of "5.4.1" is "5.4"; a top-level number has none. */
export function parentNumberOf(number: string | null): string | null {
  if (!number) return null;
  const parts = number.split('.');
  if (parts.length < 2) return null;
  return parts.slice(0, -1).join('.');
}

interface RawHeading {
  level: number;
  text: string;
  /** Line index of the heading itself. */
  at: number;
}

/**
 * Headings, ignoring anything inside a fenced code block.
 *
 * The draft's appendices contain fenced blocks (the WhatsApp template, the
 * system prompt), and a `#` inside one is a comment character, not a section.
 * Without this the importer invents sections out of code samples.
 */
function findHeadings(lines: string[]): RawHeading[] {
  const out: RawHeading[] = [];
  let fence: string | null = null;

  lines.forEach((line, at) => {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch) {
      const token = fenceMatch[1][0].repeat(3);
      if (fence === null) fence = token;
      else if (fence === token) fence = null;
      return;
    }
    if (fence !== null) return;

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) out.push({ level: heading[1].length, text: heading[2], at });
  });

  return out;
}

/**
 * Parse a Markdown policy into sections.
 *
 * Content before the first heading becomes a section titled "Front matter"
 * rather than being thrown away — in this draft that is the document control
 * block, which the committee does review. The owner renames it in the preview;
 * guessing a better title here would be guessing.
 */
export function parseMarkdownSections(markdown: string): ParsedSection[] {
  const normalised = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalised.split('\n');
  const headings = findHeadings(lines);

  const sections: ParsedSection[] = [];

  const preambleEnd = headings.length > 0 ? headings[0].at : lines.length;
  const preamble = lines.slice(0, preambleEnd).join('\n').trim();
  if (preamble !== '') {
    sections.push({
      key: 's0',
      number: null,
      title: 'Front matter',
      level: 1,
      parentKey: null,
      order: 0,
      body: preamble,
      isAppendix: false,
    });
  }

  headings.forEach((heading, i) => {
    const bodyStart = heading.at + 1;
    const bodyEnd = i + 1 < headings.length ? headings[i + 1].at : lines.length;
    const parts = parseHeadingText(heading.text);
    sections.push({
      key: `s${i + 1}`,
      number: parts.number,
      title: parts.title,
      level: heading.level,
      parentKey: null,
      order: 0,
      body: lines.slice(bodyStart, bodyEnd).join('\n').trim(),
      isAppendix: parts.isAppendix,
    });
  });

  assignParents(sections);
  assignOrder(sections);
  return sections;
}

/**
 * Wire each section to its parent: by number where possible, by heading depth
 * otherwise.
 */
function assignParents(sections: ParsedSection[]): void {
  const byNumber = new Map<string, ParsedSection>();
  for (const s of sections) {
    // First writer wins. A number repeated in the document is a fault in the
    // document; silently re-parenting everything under the second occurrence
    // would turn it into a fault in the review.
    if (s.number && !byNumber.has(s.number)) byNumber.set(s.number, s);
  }

  sections.forEach((section, i) => {
    const parentNumber = parentNumberOf(section.number);
    if (parentNumber) {
      const parent = byNumber.get(parentNumber);
      if (parent && parent.key !== section.key) {
        section.parentKey = parent.key;
        return;
      }
      // A subsection whose parent is absent ("3.4" with no "3") stays top
      // level. It is still reviewable, which is what matters.
    }

    if (section.number !== null && !parentNumber) return; // a top-level number
    if (section.isAppendix) return; // appendices are top level

    // Unnumbered: the nearest earlier heading that is shallower.
    for (let j = i - 1; j >= 0; j -= 1) {
      if (sections[j].level < section.level) {
        section.parentKey = sections[j].key;
        return;
      }
    }
  });
}

/** Document order within each parent, numbered from 0. */
function assignOrder(sections: ParsedSection[]): void {
  const seen = new Map<string, number>();
  for (const s of sections) {
    const key = s.parentKey ?? '';
    const next = seen.get(key) ?? 0;
    s.order = next;
    seen.set(key, next + 1);
  }
}

export interface ImportSummary {
  sections: number;
  topLevel: number;
  appendices: number;
  unnumbered: number;
}

/** What the preview screen reports, so the owner can sanity-check the parse. */
export function summariseImport(sections: ParsedSection[]): ImportSummary {
  return {
    sections: sections.length,
    topLevel: sections.filter((s) => s.parentKey === null).length,
    appendices: sections.filter((s) => s.isAppendix).length,
    unnumbered: sections.filter((s) => s.number === null).length,
  };
}
