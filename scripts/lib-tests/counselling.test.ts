import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { BY_CATEGORY, PROCEDURE_OVERRIDES } from '../../src/lib/counselling/library';
import { buildLeaflet, leafletToText, resolveEntry } from '../../src/lib/counselling/leaflet';
import {
  COUNSELLING_VERSION, FASTING_SECTION, UNIVERSAL_SECTIONS,
} from '../../src/lib/counselling/universal';
import {
  blockersForIssue, counsellingTemplateVariables, counsellingUrl,
  hashCounsellingToken, linkState, newCounsellingToken,
} from '../../src/lib/counselling/issue';
import { templateByCode, PATIENT_TEMPLATE_CODES } from '../../src/lib/comms/templates';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** Every `category:` value in the procedure catalogue, scanned plainly. */
function catalogueCategories(): Set<string> {
  const s = read('src/lib/procedures/catalogue.ts');
  const out = new Set<string>();
  let i = 0;
  for (;;) {
    i = s.indexOf('category:', i);
    if (i < 0) return out;
    const j = s.indexOf("'", i + 'category:'.length);
    if (j < 0) return out;
    let k = j + 1;
    let buf = '';
    while (k < s.length) {
      const c = s[k];
      if (c === '\\') { buf += s[k + 1]; k += 2; continue; }
      if (c === "'") break;
      buf += c;
      k += 1;
    }
    out.add(buf);
    i = k;
  }
}

// ───────────────────────────────────────────────── the coverage guarantee ────

describe('every operation the hospital can book has counselling', () => {
  const categories = catalogueCategories();

  it('reads the catalogue at all', () => {
    // Guards the parser. Every assertion below is vacuous if this is empty,
    // and a silently empty result is exactly the failure this prevents.
    expect(categories.size).toBeGreaterThan(50);
    expect(categories.has('Hernia and abdominal wall surgery')).toBe(true);
  });

  it('leaves no category without an entry', () => {
    // THIS is what makes "all the procedures in the database" a fact rather
    // than a claim. A procedure added under a new category cannot ship
    // without its counselling, because this fails.
    const missing = [...categories].filter((c) => !BY_CATEGORY[c]).sort();
    expect(missing, `categories with no counselling: ${missing.join(', ')}`).toEqual([]);
  });

  it('holds no entry for a category that no longer exists', () => {
    // The other direction. An orphan entry is counselling nobody will ever
    // see, and it hides the fact that the catalogue moved underneath it.
    const orphans = Object.keys(BY_CATEGORY).filter((c) => !categories.has(c)).sort();
    expect(orphans, `entries matching no category: ${orphans.join(', ')}`).toEqual([]);
  });

  it('answers all six questions for every entry, with nothing left blank', () => {
    for (const [name, e] of Object.entries(BY_CATEGORY)) {
      expect(e.whatItIs.length, `${name}: whatItIs`).toBeGreaterThan(40);
      expect(e.whyItIsDone.length, `${name}: whyItIsDone`).toBeGreaterThan(30);
      expect(e.benefits.length, `${name}: benefits`).toBeGreaterThan(1);
      expect(e.risks.length, `${name}: risks`).toBeGreaterThan(2);
      // "You could decide not to have the operation" is an alternative in
      // every case, and it is the one a hurried author leaves out.
      expect(e.alternatives.length, `${name}: alternatives`).toBeGreaterThan(1);
      expect(e.recovery.length, `${name}: recovery`).toBeGreaterThan(40);
    }
  });

  it('does not repeat the universal risks in the specific list', () => {
    // Bleeding, infection, clots and anaesthetic risk are printed on every
    // sheet already. Repeating them per category buries the three or four
    // risks that actually distinguish this operation from any other.
    const generic = /^(bleeding|infection|pain|scarring|a scar)\.?$/i;
    for (const [name, e] of Object.entries(BY_CATEGORY)) {
      for (const r of e.risks) {
        expect(generic.test(r.trim()), `${name}: "${r}" is a universal risk`).toBe(false);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────── the leaflet ────

describe('assembling a leaflet', () => {
  const base = {
    procedureName: 'Open inguinal hernia repair',
    category: 'Hernia and abdominal wall surgery',
    subspecialty: 'General Surgery',
    patientName: 'A Patient',
    patientIdentifier: '914954',
  };

  it('uses the category entry when the procedure has no override', () => {
    const { matchedOn } = resolveEntry(base);
    expect(matchedOn).toBe('category');
    expect(buildLeaflet(base).specificContentFound).toBe(true);
  });

  it('prefers a procedure override over the category', () => {
    // The map is deliberately empty today; this proves the precedence works
    // so that the first entry added behaves as intended.
    const slug = 'test-only-slug';
    (PROCEDURE_OVERRIDES as Record<string, unknown>)[slug] = {
      whatItIs: 'x', whyItIsDone: 'y', benefits: ['b'], risks: ['r'],
      alternatives: ['a'], recovery: 'r',
    };
    try {
      expect(resolveEntry({ ...base, procedureSlug: slug }).matchedOn).toBe('procedure');
    } finally {
      delete (PROCEDURE_OVERRIDES as Record<string, unknown>)[slug];
    }
  });

  it('still issues a sheet when the operation is not recognised, and says so', () => {
    // A sheet that guesses at the risks of an operation it does not know is
    // worse than one that admits it, because the patient cannot tell which
    // they are holding.
    const leaflet = buildLeaflet({ procedureName: 'Something not in the catalogue' });
    expect(leaflet.specificContentFound).toBe(false);
    expect(leaflet.matchedOn).toBe('none');
    const text = leafletToText(leaflet);
    expect(text).toMatch(/explained to you by your surgeon/i);
    // And it carries every universal section regardless.
    for (const s of UNIVERSAL_SECTIONS) {
      expect(text, s.heading).toContain(s.heading.toUpperCase());
    }
  });

  it('never claims to be the consent itself', () => {
    const leaflet = buildLeaflet(base);
    expect(leaflet.purpose).toMatch(/not your consent/i);
    expect(leaflet.purpose).toMatch(/your surgeon is right/i);
  });

  it('puts eating and drinking before the risks, and warning signs last', () => {
    const ids = buildLeaflet(base).sections.map((s) => s.id);
    expect(ids.indexOf('fasting')).toBeLessThan(ids.indexOf('general-risks'));
    expect(ids[ids.length - 1]).toBe('alert-signs');
  });

  it('always points fasting advice back at the ward', () => {
    // This module does not know that a patient is diabetic, a child, or on a
    // drip — and the ward does. Same rule as lib/patients/notices.ts.
    const fasting = buildLeaflet(base).sections.find((s) => s.id === 'fasting')!;
    expect(fasting.points!.join(' ')).toMatch(/follow THEIRS/);
    expect(fasting.emphasis).toBe(true);
  });

  it('marks the two sections that cause harm when skimmed', () => {
    const emphasised = buildLeaflet(base).sections.filter((s) => s.emphasis).map((s) => s.id);
    expect(emphasised).toContain('fasting');
    expect(emphasised).toContain('alert-signs');
  });

  it('carries the version, so a sheet in a folder can be identified exactly', () => {
    expect(buildLeaflet(base).version).toBe(COUNSELLING_VERSION);
    expect(leafletToText(buildLeaflet(base))).toContain(COUNSELLING_VERSION);
  });

  it('names the patient and the operation at the top', () => {
    const text = leafletToText(buildLeaflet(base));
    expect(text).toContain('A Patient');
    expect(text).toContain('914954');
    expect(text).toContain('Open inguinal hernia repair');
  });

  it('says death where death is meant', () => {
    // A risk a patient cannot recognise has not been disclosed.
    const text = leafletToText(buildLeaflet(base));
    expect(text).toMatch(/\bdeath\b/i);
  });
});

// ──────────────────────────────────────────────────────────── the sending ────

describe('issuing it to a patient', () => {
  it('never stores the token, only its hash', () => {
    const { token, tokenHash } = newCounsellingToken();
    expect(tokenHash).toBe(hashCounsellingToken(token));
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toHaveLength(64);
    expect(token.length).toBeGreaterThan(30);
  });

  it('mints a different token every time', () => {
    const seen = new Set(Array.from({ length: 50 }, () => newCounsellingToken().token));
    expect(seen.size).toBe(50);
  });

  it('builds the link from the public site, not the request host', () => {
    // The theatre node's Tailscale address does not resolve from mobile data.
    expect(counsellingUrl('abc')).toMatch(/^https?:\/\//);
    expect(counsellingUrl('abc')).toContain('/counselling?t=abc');
  });

  it('refuses a WhatsApp send with no number, and says what to do instead', () => {
    const said = blockersForIssue({
      patientName: 'A Patient', phone: '', procedureName: 'Repair', channel: 'WHATSAPP',
    });
    expect(said.map((b) => b.field)).toContain('phone');
    expect(said[0].say).toMatch(/print the sheet/i);
  });

  it('honours a patient who asked not to be written to on WhatsApp', () => {
    const said = blockersForIssue({
      patientName: 'A Patient', phone: '08030000000', procedureName: 'Repair',
      channel: 'WHATSAPP', whatsappOptOut: true,
    });
    expect(said.map((b) => b.field)).toContain('whatsappOptOut');
  });

  it('lets a sheet be printed for a patient with no phone at all', () => {
    expect(blockersForIssue({
      patientName: 'A Patient', phone: '', procedureName: 'Repair', channel: 'PRINTED',
    })).toEqual([]);
  });

  it('explains an expired or withdrawn link rather than dead-ending', () => {
    const expired = linkState({ expiresAt: new Date(Date.now() - 1000) });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.message).toMatch(/ask your ward nurse|theatre office/i);

    const revoked = linkState({ expiresAt: new Date(Date.now() + 1000), revokedAt: new Date() });
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) expect(revoked.problem).toBe('REVOKED');

    expect(linkState({ expiresAt: new Date(Date.now() + 100000) }).ok).toBe(true);
    expect(linkState(null).ok).toBe(false);
  });
});

// ─────────────────────────────────── what may leave on an external channel ────

describe('the WhatsApp message carries a link and no clinical detail', () => {
  const tpl = templateByCode('PATIENT_OPERATION_INFORMATION')!;

  it('is registered as a patient template', () => {
    expect(PATIENT_TEMPLATE_CODES as readonly string[]).toContain('PATIENT_OPERATION_INFORMATION');
    expect(tpl).toBeDefined();
  });

  it('takes exactly three variables: the name, the hospital and the link', () => {
    // checkSendAllowed refuses CLINICAL content on an external channel, and
    // that rule is right: a diagnosis in a notification shade is read by
    // whoever is holding the phone. Adding a fourth variable here is how that
    // protection would be lost, so the list is pinned.
    expect(tpl.variables).toEqual(['name', 'hospital', 'link']);
    expect(Object.keys(counsellingTemplateVariables({
      patientName: 'A', hospital: 'H', link: 'L',
    }))).toEqual(['name', 'hospital', 'link']);
  });

  it('is classified as PATIENT_IDENTIFIED, not CLINICAL', () => {
    expect(tpl.sensitivity).toBe('PATIENT_IDENTIFIED');
  });

  it('names no condition, no operation and no date in the body', () => {
    const body = `${tpl.body} ${tpl.metaBody}`.toLowerCase();
    for (const word of [
      'cancer', 'tumour', 'hernia', 'diagnosis', 'biopsy', 'amputation', 'hiv', 'caesarean',
    ]) {
      expect(body, word).not.toContain(word);
    }
  });

  it('sends them somewhere a person can be asked, not only a link', () => {
    expect(tpl.body).toMatch(/ward nurse|surgeon/i);
  });
});

// ────────────────────────────────────────────────────────── the plumbing ────

describe('the pieces are wired where they are supposed to be', () => {
  it('the button sits under the patient name on the surgery list', () => {
    const page = read('src/app/dashboard/surgeries/page.tsx');
    expect(page).toContain('SendInformationButton');
    // Under the name means inside the patient cell, after the admission flag.
    const cell = page.slice(page.indexOf('const label = patientLabel(surgery.patient)'));
    const flag = cell.indexOf('InpatientNote');
    const button = cell.indexOf('SendInformationButton');
    expect(button).toBeGreaterThan(flag);
    expect(button - flag).toBeLessThan(900);
  });

  it('the public page reads the token on the client, not on the server', () => {
    // A token in a server render is a token in a log.
    const page = read('src/app/counselling/page.tsx');
    expect(page).toContain("'use client'");
    expect(page).toContain('window.location.search');
  });

  it('the leaflet is built from the snapshot, not from the live case', () => {
    // A sheet is a document given on a date. Amending the case later must not
    // rewrite what the patient has already read.
    const route = read('src/app/api/counselling/route.ts');
    expect(route).toContain('row.procedureName');
    expect(route).not.toMatch(/surgery\.procedureName/);
  });

  it('records whether the patient ever opened it', () => {
    const route = read('src/app/api/counselling/route.ts');
    expect(route).toContain('openedAt');
    expect(route).toContain('openCount');
  });

  it('the issue table replicates, and is classified', () => {
    const migration = read('prisma/migrations/20261118180000_patient_counselling/migration.sql');
    expect(migration).toContain("sync_enable_table('patient_counselling_issues')");
    const policy = read('src/lib/sync/syncPolicy.ts');
    expect(policy).toContain('patient_counselling_issues');
  });

  it('every library file is part of the assembled library', () => {
    const dir = 'src/lib/counselling/library';
    const files = readdirSync(join(root, dir)).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    const index = read(`${dir}/index.ts`);
    for (const f of files) {
      expect(index, f).toContain(`./${f.replace(/\.ts$/, '')}`);
    }
    expect(files.length).toBeGreaterThan(3);
  });
});

// ────────────────────────────────────────────────── how it is written ────

describe('the words are written for a patient', () => {
  it('avoids hospital shorthand a frightened person would have to decode', () => {
    const text = [
      ...UNIVERSAL_SECTIONS.flatMap((s) => [...s.body, ...(s.points ?? [])]),
      ...Object.values(BY_CATEGORY).flatMap((e) => [
        e.whatItIs, e.whyItIsDone, e.recovery, ...e.benefits, ...e.risks, ...e.alternatives,
      ]),
    ].join(' ');
    for (const jargon of ['NPO', 'nil by mouth', 'ASA grade', 'IV access', 'c/o ', 'Ix ']) {
      expect(text, jargon).not.toContain(jargon);
    }
  });

  it('the fasting section gives times a patient can act on tonight', () => {
    const points = FASTING_SECTION.points!.join(' ');
    expect(points).toMatch(/6 hours/);
    expect(points).toMatch(/2 hours/);
    // Breast milk differs from formula, and getting it wrong cancels a baby's
    // operation on the morning.
    expect(points).toMatch(/breast milk/i);
  });
});
