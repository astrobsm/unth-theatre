/**
 * "The anaesthetist walks round the hospital only to discover the case is a
 * day case and the patient has not arrived."
 *
 * isDayCase has been captured at booking since the beginning. It was displayed
 * on exactly one screen — call-for-patient, which the holding area reads — and
 * projected by neither of the APIs that feed the screens an anaesthetist
 * actually works from. So the case looked like any other inpatient, the row
 * said "Ward: X", and somebody walked there.
 *
 * The projection is the half that silently breaks: a flag added to a component
 * while the field is missing from the query renders nothing at all, and the
 * page looks exactly as it did before. So the queries are asserted as well as
 * the components.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const FLAG = read('src/components/DayCaseFlag.tsx');
const SURGERIES_API = read('src/app/api/surgeries/route.ts');
const BOARD_API = read('src/app/api/anaesthesia/board/route.ts');
const MY_CASES_API = read('src/app/api/anaesthesia/my-cases/route.ts');
const SCHEDULE = read('src/app/dashboard/surgeries/page.tsx');
const PREOP = read('src/app/dashboard/preop-reviews/page.tsx');
const BOARD = read('src/app/dashboard/anaesthetist-board/page.tsx');

describe('the flag reaches the screen', () => {
  it('is projected by every API an anaesthetist works from', () => {
    // Without this the component renders nothing and the page is unchanged,
    // which is the failure mode that looks most like success.
    for (const [name, src] of [
      ['surgery list', SURGERIES_API],
      ['anaesthesia board', BOARD_API],
      ['my cases', MY_CASES_API],
    ] as const) {
      expect(src, name).toContain('isDayCase: true');
    }
  });

  it('is rendered on every list somebody walks away from', () => {
    for (const [name, src] of [
      ['surgery schedule', SCHEDULE],
      ['pre-op review list', PREOP],
      ['anaesthetist board', BOARD],
    ] as const) {
      expect(src, name).toContain('DayCaseFlag');
      expect(src, name).toContain("from '@/components/DayCaseFlag'");
    }
  });

  it('survives the export, which is the copy carried round the theatre', () => {
    expect(SCHEDULE).toContain('DAY CASE');
    expect(SCHEDULE).toContain('.daycase {');
  });

  it('prints as a solid block, not a tint', () => {
    // The list is photocopied as often as it is read on screen, and a pale
    // amber badge is indistinguishable from the rest of a black-and-white row.
    expect(SCHEDULE).toMatch(/\.daycase \{[^}]*background:#b45309[^}]*color:#fff/);
  });
});

describe('what the flag says', () => {
  it('says the words and nothing more, so a table cell keeps its shape', () => {
    // This test used to demand the opposite, and the reasoning was sound:
    // "day case" is a discharge term and reads as a statement about where
    // the patient GOES, while the mistake being prevented is an assumption
    // about where they ARE. So the flag spelled out the consequence.
    //
    // It lost to the table. Three lines of prose in the patient cell pushed
    // every row apart and distorted the theatre list, which is read by
    // scanning a column. Reported, and cut by decision. The sentence lives
    // on in the tooltip, asserted below.
    //
    // Pinned as an absence so it cannot drift back in: whoever reads the
    // rationale above and finds it persuasive would otherwise restore the
    // prose and break the list again.
    const code = FLAG.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toContain('do not');
    expect(code).not.toContain('go looking for a bed');
    // The badge itself is one line of text.
    expect(code).toContain('Day case');
  });

  it('cannot set a row height on its own', () => {
    // inline-flex in a <span>, not a block <div>: a badge that establishes
    // its own box is a badge that can stretch the row it sits in, which is
    // exactly what was reported.
    const full = FLAG.slice(FLAG.indexOf('return (', FLAG.indexOf('if (compact)')));
    expect(full).toContain('<span');
    expect(full).toContain('inline-flex');
  });

  it('claims nothing about whether the patient has actually arrived', () => {
    // It knows the case is a day case; it does not know their whereabouts.
    // An anaesthetist who trusted a stale "arrived" once would stop reading
    // the flag altogether.
    //
    // Matched on the code with the comments stripped: the paragraph above the
    // component explaining why it must not say "arrived" contains the word,
    // and an assertion that failed on its own rationale would teach the next
    // person to delete the check rather than respect it.
    const code = FLAG.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/\barrived\b/i);
    expect(code).not.toMatch(/\bin the hospital\b/i);
  });

  it('carries the warning in the compact form too', () => {
    // The dense rows get the short version, but a bare word with no tooltip
    // would be the same omission in smaller type.
    expect(FLAG).toContain('title="Day case — the patient is not on a ward.');
  });
});

describe('the ward line, which is the one that misleads', () => {
  it('is relabelled on a day case rather than left to be read as "go here"', () => {
    // On a day case the ward is where they will be admitted in the morning,
    // not where they are tonight.
    expect(SCHEDULE).toContain("{surgery.isDayCase ? 'Admitting ward' : 'Ward'}");
  });

  it('puts the flag above it, not after it', () => {
    // The schedule now renders BOTH answers from one ternary — a day case
    // gets the band, an inpatient gets the quiet word — so the anchor is
    // the component, not the old `&&`. The previous anchor did not just
    // fail: its sibling below passed on -1 being less than everything,
    // which is a test that had stopped testing.
    const flagAt = SCHEDULE.indexOf('<DayCaseFlag className="mt-1" />');
    const wardAt = SCHEDULE.indexOf("{surgery.isDayCase ? 'Admitting ward' : 'Ward'}");
    expect(flagAt).toBeGreaterThan(-1);
    expect(wardAt).toBeGreaterThan(-1);
    expect(flagAt).toBeLessThan(wardAt);
  });

  it('sits directly under the patient name, not further down the cell', () => {
    // Asked for explicitly: the patient column is what an anaesthetist reads
    // to decide who they are going to see, so the flag has to be part of
    // reading the NAME rather than something noticed below the folder number.
    const flagAt = SCHEDULE.indexOf('<DayCaseFlag className="mt-1" />');
    expect(flagAt).toBeGreaterThan(-1);
    const identifierAt = SCHEDULE.indexOf('{label.identifier}');
    expect(identifierAt).toBeGreaterThan(-1);
    expect(flagAt).toBeLessThan(identifierAt);

    const preopFlagAt = PREOP.indexOf('{surgery.isDayCase && <DayCaseFlag');
    const preopFolderAt = PREOP.indexOf('{surgery.patient.folderNumber}');
    expect(preopFolderAt).toBeGreaterThan(-1);
    expect(preopFlagAt).toBeLessThan(preopFolderAt);

    const boardFlagAt = BOARD.indexOf('{c.isDayCase && <DayCaseFlag');
    const boardFolderAt = BOARD.indexOf('{c.folderNumber}');
    expect(boardFolderAt).toBeGreaterThan(-1);
    expect(boardFlagAt).toBeLessThan(boardFolderAt);
  });
});
