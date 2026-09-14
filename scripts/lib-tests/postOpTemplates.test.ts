/**
 * The procedure template engine.
 *
 * Two things are being protected here.
 *
 * The first is that a graft case really does offer donor-site fields and a flap
 * case really does offer flap monitoring — the whole justification for the
 * engine. Checking that through the UI would need a browser; checking it here
 * costs nothing and runs on every commit.
 *
 * The second matters more. A template may REORDER options and may not SELECT
 * them. Moving four monitoring options to the top of a list is help. Ticking
 * them is writing an order in the surgeon's name, and no part of this system is
 * entitled to do that. The test below would fail if anybody added a mechanism
 * for it, which is the point: the constraint is easy to erode by accident and
 * impossible to notice afterwards.
 */
import { describe, expect, it } from 'vitest';

import {
  matchTemplate, resolveTemplate, templateByKey, suggestedFirst,
  allFields, extraKeys, CORE_SECTIONS, PROCEDURE_TEMPLATES,
} from '../../src/lib/postop/templates';
import { WOUND_MONITORING } from '../../src/lib/postop/vocabulary';

describe('matching a procedure to a template', () => {
  it('recognises a graft from the procedure name', () => {
    expect(matchTemplate('Split thickness skin graft to left leg')?.key).toBe('SKIN_GRAFT');
    expect(matchTemplate('STSG left thigh')?.key).toBe('SKIN_GRAFT');
  });

  it('recognises a flap', () => {
    expect(matchTemplate('Local flap cover of sacral defect')?.key).toBe('FLAP');
  });

  it('does not care about case or surrounding words', () => {
    expect(matchTemplate('EXPLORATORY LAPAROTOMY')?.key).toBe('ABDOMINAL');
    expect(matchTemplate('  emergency Laparotomy + bowel resection ')?.key).toBe('ABDOMINAL');
  });

  it('prefers the keyword over the subspecialty', () => {
    // A graft done by an orthopaedic surgeon is still a graft, and the graft
    // fields are the ones that matter for what happens to the patient tonight.
    expect(matchTemplate('Skin grafting of leg wound', 'Orthopaedics')?.key).toBe('SKIN_GRAFT');
  });

  it('falls back to the subspecialty when the name says nothing', () => {
    expect(matchTemplate('Procedure', 'Orthopaedics')?.key).toBe('TRAUMA_ORTHO');
  });

  it('returns nothing rather than guessing', () => {
    // The common case, and not a failure: the core sections alone are a
    // complete operation note.
    expect(matchTemplate('Thyroidectomy')).toBeNull();
    expect(matchTemplate('')).toBeNull();
    expect(matchTemplate(null)).toBeNull();
  });

  it('finds a template again by the key a note stored', () => {
    expect(templateByKey('FLAP')?.label).toBe('Flap surgery');
    expect(templateByKey('CORE')).toBeNull();
    expect(templateByKey('NO_SUCH_THING')).toBeNull();
  });
});

describe('resolving a template into a form', () => {
  it('produces a complete note with no template at all', () => {
    const r = resolveTemplate(null);
    expect(r.key).toBe('CORE');
    expect(r.sections.length).toBe(CORE_SECTIONS.length);
    expect(r.sections.some((s) => s.key === 'findings')).toBe(true);
    expect(r.sections.some((s) => s.key === 'escalation')).toBe(true);
  });

  it('adds the graft section for a graft', () => {
    const r = resolveTemplate(matchTemplate('Split thickness skin graft'));
    const graft = r.sections.find((s) => s.key === 'graft');
    expect(graft).toBeTruthy();
    expect(graft!.fields.map((f) => f.key)).toContain('graftDonorSite');
    expect(graft!.fields.map((f) => f.key)).toContain('donorSiteDressing');
  });

  it('puts an added section before the nursing sections, not at the end', () => {
    // A flap section rendered after "next review" is one nobody scrolls to.
    const r = resolveTemplate(matchTemplate('Free flap reconstruction'));
    const flapAt = r.sections.findIndex((s) => s.key === 'flap');
    const firstNursingAt = r.sections.findIndex((s) => s.audience === 'nursing');
    expect(flapAt).toBeGreaterThan(-1);
    expect(flapAt).toBeLessThanOrEqual(firstNursingAt);
  });

  it('keeps every core section when a template is applied', () => {
    for (const t of PROCEDURE_TEMPLATES) {
      const r = resolveTemplate(t);
      for (const core of CORE_SECTIONS) {
        expect(r.sections.some((s) => s.key === core.key)).toBe(true);
      }
    }
  });

  it('reports which keys go to extras rather than to columns', () => {
    const r = resolveTemplate(matchTemplate('Flap cover'));
    expect(extraKeys(r)).toContain('flapType');
    expect(extraKeys(r)).not.toContain('findings');
  });

  it('carries the version, so an old note can be rendered as it was written', () => {
    expect(resolveTemplate(matchTemplate('Skin graft')).version).toBeGreaterThan(0);
    expect(resolveTemplate(null).version).toBe(1);
  });
});

describe('suggestions are suggestions', () => {
  it('moves the suggested options to the front', () => {
    const ordered = suggestedFirst(WOUND_MONITORING, ['MONITOR_FLAP', 'MONITOR_PERFUSION']);
    expect(ordered[0].value).toBe('MONITOR_FLAP');
    expect(ordered[1].value).toBe('MONITOR_PERFUSION');
  });

  it('keeps every option, so nothing becomes unreachable', () => {
    const ordered = suggestedFirst(WOUND_MONITORING, ['MONITOR_FLAP']);
    expect(ordered).toHaveLength(WOUND_MONITORING.length);
    expect(ordered.map((o) => o.value).sort()).toEqual(WOUND_MONITORING.map((o) => o.value).sort());
  });

  it('marks the suggested ones so the form can say why they are first', () => {
    const ordered = suggestedFirst(WOUND_MONITORING, ['MONITOR_FLAP']);
    expect(ordered[0].suggested).toBe(true);
    expect(ordered[ordered.length - 1].suggested).toBeUndefined();
  });

  it('leaves the list alone when there is nothing to suggest', () => {
    expect(suggestedFirst(WOUND_MONITORING, undefined)).toEqual(WOUND_MONITORING);
    expect(suggestedFirst(WOUND_MONITORING, [])).toEqual(WOUND_MONITORING);
  });

  it('gives no template a way to pre-select a clinical order', () => {
    // The constraint the whole design rests on. `suggests` is a list of values
    // to REORDER; there is deliberately no `defaults` on ProcedureTemplate, and
    // adding one would let a keyword in a procedure name write a prescription.
    for (const t of PROCEDURE_TEMPLATES) {
      expect((t as Record<string, unknown>).defaults).toBeUndefined();
      expect((t as Record<string, unknown>).preselect).toBeUndefined();
      expect((t as Record<string, unknown>).values).toBeUndefined();
    }
  });
});

describe('conditional fields', () => {
  it('hides the graft donor-site detail until it is relevant', () => {
    const r = resolveTemplate(null);
    const method = allFields(r).find((f) => f.key === 'hairRemovalMethod');
    expect(method?.showIf).toBeTruthy();
    expect(method!.showIf!({ hairRemoval: 'PERFORMED' })).toBe(true);
    expect(method!.showIf!({ hairRemoval: 'NOT_PERFORMED' })).toBe(false);
    expect(method!.showIf!({})).toBe(false);
  });

  it('asks for the drug only when pharmacological prophylaxis is chosen', () => {
    const r = resolveTemplate(null);
    const drug = allFields(r).find((f) => f.key === 'vteDrug');
    expect(drug!.showIf!({ vtePlan: 'PHARMACOLOGICAL' })).toBe(true);
    expect(drug!.showIf!({ vtePlan: 'BOTH' })).toBe(true);
    expect(drug!.showIf!({ vtePlan: 'NOT_INDICATED' })).toBe(false);
  });

  it('copes with a value of the wrong shape rather than throwing', () => {
    // These predicates run against half-filled forms and against notes loaded
    // out of the database, where a multi-select can arrive as null.
    const r = resolveTemplate(null);
    for (const f of allFields(r)) {
      if (!f.showIf) continue;
      expect(() => f.showIf!({ positions: null, incisionTypes: undefined })).not.toThrow();
    }
  });
});
