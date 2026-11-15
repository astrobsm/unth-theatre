import { describe, it, expect } from 'vitest';

import { decodeEntities, htmlToMarkdown } from '../../src/lib/policy/import/html';
import { importFromMarkdown } from '../../src/lib/policy/import';

// Importing the draft, and the one failure that must never be silent.
//
// A review is section by section, so a parse that merges two sections removes a
// question the committee was supposed to answer -- and nothing downstream shows
// it. The dashboard simply reports that fewer people commented on section 7.
//
// WHAT IS AND IS NOT COVERED HERE. htmlToMarkdown is our own code and is
// exercised directly, including on the shapes mammoth actually emits. The
// mammoth call itself (importFromDocx) is not: it needs a real .docx, and
// there is no Word WRITER in this project to build a fixture with. The .docx
// path is therefore verified by uploading the committee's own export through
// the preview screen, which is the step the owner has to pass anyway. Said out
// loud rather than left as an assumed-covered gap.

describe('entities', () => {
  it('decodes what Word puts in exported HTML', () => {
    expect(decodeEntities('Theatre &amp; Anaesthesia')).toBe('Theatre & Anaesthesia');
    expect(decodeEntities('&lt;15:30&gt;')).toBe('<15:30>');
    expect(decodeEntities('non&#8209;operative')).toBe('non‑operative');
    expect(decodeEntities('&#x2014;')).toBe('—');
    expect(decodeEntities('a&nbsp;b')).toBe('a b');
    expect(decodeEntities("it&rsquo;s")).toBe('it’s');
  });
});

describe('mammoth HTML to Markdown', () => {
  it('keeps headings at their level, because headings are the sections', () => {
    const md = htmlToMarkdown('<h1>1 Purpose</h1><h2>1.1 Scope</h2>');
    expect(md).toBe('# 1 Purpose\n\n## 1.1 Scope');
  });

  it('keeps a table, because the appendices ARE tables', () => {
    const md = htmlToMarkdown(
      '<table><tr><th>Field</th><th>Required</th></tr>'
      + '<tr><td>Folder number</td><td>Yes</td></tr></table>',
    );
    expect(md).toBe(
      '| Field | Required |\n| --- | --- |\n| Folder number | Yes |',
    );
  });

  it('pads a ragged table rather than dropping the short row', () => {
    const md = htmlToMarkdown(
      '<table><tr><th>A</th><th>B</th></tr><tr><td>only</td></tr></table>',
    );
    expect(md).toContain('| only |  |');
  });

  it('escapes a pipe inside a cell so it cannot end the cell', () => {
    const md = htmlToMarkdown('<table><tr><td>a|b</td></tr></table>');
    expect(md).toContain('a\\|b');
  });

  it('converts bullets and keeps nesting', () => {
    const md = htmlToMarkdown(
      '<ul><li>First<ul><li>Nested</li></ul></li><li>Second</li></ul>',
    );
    expect(md).toBe('- First\n  - Nested\n- Second');
  });

  it('numbers an ordered list', () => {
    const md = htmlToMarkdown('<ol><li>One</li><li>Two</li></ol>');
    expect(md).toBe('1. One\n2. Two');
  });

  it('keeps emphasis and links', () => {
    expect(htmlToMarkdown('<p>The <strong>surgeon</strong> books.</p>'))
      .toBe('The **surgeon** books.');
    expect(htmlToMarkdown('<p>See <a href="https://x.example/c">the circular</a>.</p>'))
      .toBe('See [the circular](https://x.example/c).');
  });

  it('keeps the words when a tag is not one it knows', () => {
    // Losing a sentence from a document the committee will vote on is the only
    // unacceptable outcome, so an unknown tag costs formatting, never text.
    expect(htmlToMarkdown('<p>A <mark>highlighted</mark> clause.</p>'))
      .toBe('A highlighted clause.');
    expect(htmlToMarkdown('<section><p>Still here.</p></section>'))
      .toContain('Still here.');
  });

  it('escapes a leading hash in body text so it cannot invent a section', () => {
    const md = htmlToMarkdown('<p># not a heading</p>');
    expect(md).toBe('\\# not a heading');
    // And the escape survives the section parser as text, not as a heading.
    expect(importFromMarkdown(md).sections).toHaveLength(1);
  });

  it('drops images and keeps everything around them', () => {
    const md = htmlToMarkdown('<p>Before <img src="data:image/png;base64,AAA"> after.</p>');
    expect(md).toBe('Before after.');
  });

  it('drops footnote markers', () => {
    expect(htmlToMarkdown('<p>Consent is required<sup>1</sup>.</p>'))
      .toBe('Consent is required.');
  });

  it('returns nothing for nothing', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown('<p></p>')).toBe('');
  });

  it('holds block order across mixed content', () => {
    const md = htmlToMarkdown(
      '<h1>5 Laboratory</h1><p>Samples by [11:00].</p>'
      + '<ul><li>Haematology</li></ul><p>Audited monthly.</p>',
    );
    expect(md).toBe(
      '# 5 Laboratory\n\nSamples by [11:00].\n\n- Haematology\n\nAudited monthly.',
    );
  });
});

describe('the import preview tells the owner what it could not do', () => {
  it('reports the counts it found', () => {
    const imported = importFromMarkdown([
      '# 1 Purpose',
      'Cases close at [15:30].',
      '',
      '# 2 Targets',
      'On-time start [80%].',
    ].join('\n'));

    expect(imported.summary.sections).toBe(2);
    expect(imported.summary.decisionItems).toBe(2);
    expect(imported.sections[0].decisionItems[0].currentValue).toBe('15:30');
  });

  it('warns loudly when Word numbering has eaten every section number', () => {
    // The trap worth knowing about: if the draft numbers its headings with
    // Word's automatic numbering, the number is a list property and not part
    // of the text. The document looks right in Word and imports with 3.1 to
    // 3.12 as twelve top-level sections.
    const imported = importFromMarkdown([
      '# Purpose and scope',
      'Text.',
      '',
      '# Roles and responsibilities',
      'Text with [11:00].',
    ].join('\n'));

    expect(imported.warnings.join(' ')).toMatch(/not one heading has a number/i);
    expect(imported.warnings.join(' ')).toMatch(/automatic numbering/i);
  });

  it('warns when only some headings are numbered', () => {
    const imported = importFromMarkdown([
      '# 1 Purpose', 'a [11:00]', '', '# Stray', 'b', '', '# Another', 'c',
    ].join('\n'));
    expect(imported.warnings.join(' ')).toMatch(/1 of 3 headings have a number/i);
  });

  it('warns about a heading that is not really a section', () => {
    const imported = importFromMarkdown('# 3 Roles\n\n# 3.1 The surgeon\nBooks by [11:00].');
    expect(imported.warnings.join(' ')).toMatch(/no text of their own/i);
  });

  it('warns when there is nothing in brackets left to settle', () => {
    const imported = importFromMarkdown('# 1 Purpose\nAll values are agreed.');
    expect(imported.warnings.join(' ')).toMatch(/no \[bracketed\] values/i);
  });

  it('refuses to pretend an empty upload is a policy', () => {
    const imported = importFromMarkdown('');
    expect(imported.sections).toEqual([]);
    expect(imported.warnings.join(' ')).toMatch(/no sections were found/i);
  });

  it('attaches each open value to the section it is actually in', () => {
    const imported = importFromMarkdown([
      '# 6 Pre-anaesthetic review',
      'Review starts at [15:30] and ends by [18:00].',
      '',
      '# 7 Drugs and consumables',
      'Packed [24 hours] ahead.',
    ].join('\n'));

    const six = imported.sections.find((s) => s.number === '6')!;
    const seven = imported.sections.find((s) => s.number === '7')!;
    expect(six.decisionItems.map((d) => d.currentValue)).toEqual(['15:30', '18:00']);
    expect(seven.decisionItems.map((d) => d.currentValue)).toEqual(['24 hours']);
    expect(seven.decisionItems[0].type).toBe('DURATION');
  });
});
