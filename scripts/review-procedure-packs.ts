/**
 * What this hospital has actually operated on, and what each of those
 * operations would be packed with.
 *
 *     npx tsx scripts/review-procedure-packs.ts            # the summary
 *     npx tsx scripts/review-procedure-packs.ts --all      # every procedure
 *     npx tsx scripts/review-procedure-packs.ts --suspect  # only the doubtful
 *
 * READ-ONLY. It writes nothing, anywhere.
 *
 * WHY IT EXISTS. Two questions could not be answered from the code alone:
 * which procedures this theatre actually books, and what the pack machinery
 * resolves each of them to. The second is the one that matters, because the
 * classifier reads a family out of a procedure's NAME, and a name it reads
 * wrongly produces a pack that is confidently, specifically wrong — a vaginal
 * pack on a cervical spine, which is exactly what a backfill dry run turned up
 * on a case booked for 16 November.
 *
 * So this lists every distinct procedure that has been booked, with the family
 * the classifier gives it, and flags the ones worth a human look:
 *
 *   - UNMATCHED: fell through to GENERAL. Gets a defensible pack, but not a
 *     specific one. These are the candidates for an authored mapping.
 *   - SUSPECT: the family disagrees with the subspecialty the case was booked
 *     under — a neurosurgical case classified as gynaecological, say. This is
 *     the cervical/cervix class of error, and it is the reason to read the
 *     list rather than trust the totals.
 */
import prisma from '../src/lib/prisma';
import { familyOf, approachOf, FAMILY_LABEL, type ProcedureFamily } from '../src/lib/packs/standards';

const ALL = process.argv.includes('--all');
const SUSPECT_ONLY = process.argv.includes('--suspect');

/**
 * Which families are plausible for a subspecialty.
 *
 * Deliberately GENEROUS: a general surgeon does hernias and breasts and
 * laparotomies, and units share work. This is a flag for a human, not a rule,
 * and a false alarm costs a glance while a miss costs a vaginal pack on a neck.
 */
const PLAUSIBLE: Record<string, ProcedureFamily[]> = {
  'Neurosurgery': ['CRANIOTOMY', 'SPINAL', 'CSF_SHUNT', 'GENERAL'],
  'Obstetrics & Gynaecology': ['CAESAREAN', 'HYSTERECTOMY', 'GYNAE_VAGINAL', 'OBSTETRIC_OTHER', 'LAPAROTOMY', 'LAPAROSCOPIC', 'GENERAL'],
  'Orthopaedics': ['ARTHROPLASTY', 'FRACTURE_FIXATION', 'OPEN_FRACTURE', 'ORTHOPAEDIC_SOFT_TISSUE', 'SPINAL', 'GENERAL'],
  'Ophthalmology': ['OPHTHALMIC', 'GENERAL'],
  'Urology': ['UROLOGY_ENDOSCOPIC', 'UROLOGY_OPEN', 'LAPAROTOMY', 'GENERAL'],
  'Cardiothoracic Surgery': ['CARDIAC', 'THORACIC', 'VASCULAR', 'GENERAL'],
  'Otorhinolaryngology': ['ENT_CLEAN', 'ENT_AERODIGESTIVE', 'MAXILLOFACIAL', 'GENERAL'],
  'Oral & Maxillofacial Surgery': ['MAXILLOFACIAL', 'ENT_AERODIGESTIVE', 'GENERAL'],
  'Plastic Surgery': ['SKIN_GRAFT_FLAP', 'SUPERFICIAL', 'ORTHOPAEDIC_SOFT_TISSUE', 'GENERAL'],
  'Paediatric Surgery': ['LAPAROTOMY', 'HERNIA', 'UROLOGY_OPEN', 'APPENDICECTOMY', 'SUPERFICIAL', 'GENERAL'],
};

async function main() {
  const [surgeries, maps, packs] = await Promise.all([
    prisma.surgery.findMany({
      select: { procedureName: true, subspecialty: true, magnitude: true, status: true },
    }),
    prisma.procedurePackMap.findMany({
      select: { procedureName: true, confirmedAt: true, isActive: true,
                consumablePackName: true, pharmacyPackName: true },
    }),
    prisma.surgicalPack.groupBy({
      by: ['subspecialty', 'kind', 'isActive'], _count: true,
    }),
  ]);

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  // Distinct procedures, with how often each has been booked.
  const byProcedure = new Map<string, { name: string; count: number; subspecialties: Set<string> }>();
  for (const s of surgeries) {
    const name = (s.procedureName || '').trim();
    if (!name) continue;
    const k = norm(name);
    const got = byProcedure.get(k);
    if (got) {
      got.count += 1;
      if (s.subspecialty) got.subspecialties.add(s.subspecialty);
    } else {
      byProcedure.set(k, {
        name,
        count: 1,
        subspecialties: new Set(s.subspecialty ? [s.subspecialty] : []),
      });
    }
  }

  const mapByName = new Map(maps.map((m) => [norm(m.procedureName), m]));

  const rows = Array.from(byProcedure.values())
    .map((p) => {
      const family = familyOf(p.name, Array.from(p.subspecialties)[0] ?? null);
      const approach = approachOf(p.name, family);
      const m = mapByName.get(norm(p.name));
      const subs = Array.from(p.subspecialties);
      const suspect = subs.some((sub) => {
        const ok = PLAUSIBLE[sub];
        return ok && !ok.includes(family);
      });
      return {
        ...p,
        subs,
        family,
        approach,
        mapped: !!m,
        confirmed: !!m?.confirmedAt,
        unmatched: family === 'GENERAL',
        suspect,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const cases = surgeries.length;
  const confirmed = rows.filter((r) => r.confirmed).length;
  const mapped = rows.filter((r) => r.mapped).length;
  const unmatched = rows.filter((r) => r.unmatched).length;
  const suspects = rows.filter((r) => r.suspect);

  console.log('═══ What has been booked ═══');
  console.log(`cases:                    ${cases}`);
  console.log(`distinct procedures:      ${rows.length}`);
  console.log('');
  console.log('═══ Authored mappings (procedure_pack_maps) ═══');
  console.log(`procedures with a row:    ${mapped}`);
  console.log(`  of which CONFIRMED:     ${confirmed}   <- only these are used at booking`);
  console.log(`  unconfirmed:            ${mapped - confirmed}`);
  console.log(`procedures with no row:   ${rows.length - mapped}`);
  console.log('');
  console.log('═══ Packs on file ═══');
  for (const p of packs) {
    console.log(`  ${p.subspecialty}  ${p.kind}  ${p.isActive ? 'active' : 'DRAFT'}  ${p._count}`);
  }
  console.log('');
  console.log('═══ What the classifier resolves them to ═══');
  const byFamily = new Map<string, number>();
  for (const r of rows) byFamily.set(r.family, (byFamily.get(r.family) ?? 0) + 1);
  for (const [f, n] of Array.from(byFamily.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(FAMILY_LABEL[f as ProcedureFamily] ?? f).padEnd(28)} ${n}`);
  }
  console.log(`\nfell through to GENERAL:  ${unmatched} procedure(s)`);

  if (suspects.length) {
    console.log('\n═══ SUSPECT: family disagrees with the subspecialty booked ═══');
    console.log('(the cervical-spine-as-cervix class of error — read every one)');
    for (const r of suspects) {
      console.log(`  [${r.count}]  ${r.name}`);
      console.log(`         booked under: ${r.subs.join(', ') || '—'}`);
      console.log(`         classified:   ${FAMILY_LABEL[r.family]}`);
    }
  } else {
    console.log('\nNo procedure is classified against its own subspecialty.');
  }

  if (ALL || SUSPECT_ONLY) {
    if (!SUSPECT_ONLY) {
      console.log('\n═══ Every distinct procedure ═══');
      for (const r of rows) {
        const flags = [
          r.confirmed ? 'mapped+confirmed' : r.mapped ? 'mapped(unconfirmed)' : 'no map',
          r.unmatched ? 'GENERAL' : FAMILY_LABEL[r.family],
          r.approach,
        ].join(' | ');
        console.log(`  [${String(r.count).padStart(3)}]  ${r.name}`);
        console.log(`         ${flags}`);
      }
    }
  } else {
    console.log('\n(--all lists every procedure; --suspect lists only the doubtful)');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
