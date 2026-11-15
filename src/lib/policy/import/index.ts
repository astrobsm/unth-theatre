// ============================================================
// One draft in, a reviewable section tree out
// ------------------------------------------------------------
// The owner uploads the latest export of the draft and gets a preview to pass
// before anybody is invited. Everything here is reported rather than assumed,
// because the failure that matters is silent: a parse that merges two sections
// removes a question the committee was supposed to answer, and no screen
// downstream shows that it is missing. It simply looks as though the committee
// had less to say about section 7.
// ============================================================

import {
  parseMarkdownSections,
  summariseImport,
  type ImportSummary,
  type ParsedSection,
} from './sections';
import { detectDecisionItems, type DetectedDecisionItem } from './decisionItems';
import { htmlToMarkdown } from './html';

export type { ParsedSection } from './sections';
export type { DetectedDecisionItem } from './decisionItems';

export interface ImportedSection extends ParsedSection {
  decisionItems: DetectedDecisionItem[];
}

export interface ImportedPolicy {
  /** The Markdown the sections were parsed from, kept for the preview. */
  markdown: string;
  sections: ImportedSection[];
  summary: ImportSummary & { decisionItems: number };
  /** Things the owner should look at before opening the round. */
  warnings: string[];
}

/**
 * Warn where the parse is probably wrong, in the owner's words.
 *
 * THE WORD-NUMBERING TRAP is the one worth knowing about. If the draft's
 * headings are numbered by Word's automatic list numbering rather than typed,
 * the number is not in the text at all -- it is a list property -- and mammoth
 * cannot see it. Every section then imports as "Roles and responsibilities"
 * with no number, nesting by number is impossible, and 3.1 to 3.12 arrive as
 * twelve top-level sections. The document looks fine in Word and wrong here,
 * which is exactly the kind of fault somebody clicks past.
 */
function warningsFor(sections: ImportedSection[]): string[] {
  const out: string[] = [];
  if (sections.length === 0) {
    out.push(
      'No sections were found. If the draft uses no headings, add them before '
      + 'importing — a review is section by section, so a document with one '
      + 'section asks the committee one question.',
    );
    return out;
  }

  const numbered = sections.filter((s) => s.number !== null).length;
  if (numbered === 0) {
    out.push(
      'Not one heading has a number. This usually means the draft numbers its '
      + 'headings with Word’s automatic numbering, which is not part of the '
      + 'text and cannot be read here. Subsections will not nest. Consider '
      + 'typing the numbers into the headings and exporting again.',
    );
  } else if (numbered < sections.length / 2) {
    out.push(
      `Only ${numbered} of ${sections.length} headings have a number. Check the `
      + 'preview below: anything unnumbered will sit at the top level rather '
      + 'than under its parent.',
    );
  }

  const empty = sections.filter((s) => s.body.trim() === '').length;
  if (empty > 0) {
    out.push(
      `${empty} section${empty === 1 ? ' has' : 's have'} no text of their own. `
      + 'That is normal for a heading that only introduces subsections, but a '
      + 'reviewer will be asked for a stance on it, so remove any that are not '
      + 'really sections.',
    );
  }

  const items = sections.reduce((n, s) => n + s.decisionItems.length, 0);
  if (items === 0) {
    out.push(
      'No [bracketed] values were found. If the draft still has open times and '
      + 'targets to settle, check that they are written in square brackets.',
    );
  }

  return out;
}

/** Attach the open values found in each section's own body. */
function withDecisionItems(sections: ParsedSection[]): ImportedSection[] {
  return sections.map((section) => ({
    ...section,
    decisionItems: detectDecisionItems(section.body),
  }));
}

export function importFromMarkdown(markdown: string): ImportedPolicy {
  const sections = withDecisionItems(parseMarkdownSections(markdown));
  return {
    markdown,
    sections,
    summary: {
      ...summariseImport(sections),
      decisionItems: sections.reduce((n, s) => n + s.decisionItems.length, 0),
    },
    warnings: warningsFor(sections),
  };
}

/**
 * A Word export, by way of HTML.
 *
 * mammoth offers convertToHtml and extractRawText and nothing between them.
 * extractRawText is not usable here: it returns paragraphs with no headings and
 * no tables, so the importer would find no sections and the appendices -- which
 * ARE tables -- would arrive as runs of words. See ./html.ts.
 */
export async function importFromDocx(buffer: Buffer): Promise<ImportedPolicy> {
  // Imported lazily so the Word reader is not pulled into any bundle that only
  // ever handles Markdown, which is every page in this module.
  const mammoth = (await import('mammoth')).default;

  const result = await mammoth.convertToHtml(
    { buffer },
    {
      // Word's own heading styles, plus the ones a hospital template tends to
      // use. mammoth maps Heading 1-6 by default; Title and Subtitle it does
      // not, and this draft's front page uses both.
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Heading 5'] => h5:fresh",
        "p[style-name='Heading 6'] => h6:fresh",
      ],
      includeDefaultStyleMap: true,
      // A .docx from a shared drive may carry links to other files on it.
      // Reading those would mean this server following a path chosen by the
      // document, which is not something an upload gets to do.
      externalFileAccess: false,
    },
  );

  const markdown = htmlToMarkdown(result.value);
  const imported = importFromMarkdown(markdown);

  const converterWarnings = result.messages
    .filter((m) => m.type === 'warning' || m.type === 'error')
    .map((m) => m.message)
    // Mammoth reports every unmapped style once per occurrence; the owner
    // needs the distinct list, not two hundred copies of it.
    .filter((message, i, all) => all.indexOf(message) === i)
    .slice(0, 10);

  return {
    ...imported,
    warnings: [
      ...imported.warnings,
      ...(converterWarnings.length > 0
        ? [
          'Word reported: '
            + `${converterWarnings.join('; ')}. Formatting may differ from the `
            + 'original; the text itself is kept.',
        ]
        : []),
    ],
  };
}
