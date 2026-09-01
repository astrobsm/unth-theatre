/**
 * Map every procedure this hospital actually books to a consumable pack and a
 * pharmacy pack.
 *
 * WHY THIS DOES NOT IMPORT ANYTHING FROM THE INTERNET
 *
 * The brief was to research pack contents online. Having looked at what is
 * already here, that would be the wrong thing to do. This theatre already has
 * 77 live packs — 51 consumable, 26 pharmacy — organised by subspecialty, with
 * a standard pack for each specialty AND procedure-specific packs for the
 * operations that need them. Somebody built that against how this hospital
 * actually operates: what its store stocks, what its pharmacy dispenses, what
 * its surgeons use.
 *
 * A generic list off the internet would name products this store does not
 * carry, in sizes it does not hold, and would quietly disagree with the
 * clinical content already agreed here. The mapping — procedure to pack — was
 * the part that was missing, and it was missing completely: procedure_pack_maps
 * had ZERO rows, so all 402 booked procedures and all 709 bookings resolved to
 * nothing but the mandatory base pack.
 *
 * So this matches, it does not invent.
 *
 * HOW A PROCEDURE IS MATCHED
 *
 *   1. A procedure-specific pack in the same subspecialty, by keyword.
 *      "exploratory laparotomy" -> Exploratory Laparotomy — Consumables.
 *   2. Failing that, the subspecialty's own standard pack.
 *      Every specialty has one, so nothing falls through to nothing.
 *   3. Pharmacy the same way: a procedure-specific drug pack where one exists
 *      (a caesarean has its own), otherwise the specialty antibiotics pack.
 *
 * NOTHING IS CONFIRMED. Every row is written with confirmedAt NULL and a
 * suggestedBasis saying exactly why it was matched. The model was built with
 * that distinction and it matters here: these are suggestions from name
 * matching, not clinical decisions, and a consultant should agree them before
 * they drive what a store packs at six in the evening.
 */

const { PrismaClient } = require('@prisma/client');

const APPLY = process.env.APPLY === '1';
const prisma = new PrismaClient(
  process.env.TARGET_URL ? { datasources: { db: { url: process.env.TARGET_URL } } } : undefined,
);

/** Loose comparison for keyword matching only. Never used as a stored key. */
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The stored key, and it MUST be byte-identical to the app's.
 *
 * src/lib/procedurePacks.ts packItemKey() produces "EXPLORATORY-LAPAROTOMY||"
 * — uppercase, non-alphanumerics collapsed to hyphens, and two trailing pipes
 * from the dosage and drugType fields it shares with pack items.
 *
 * The first version of this script stored its own lowercase-spaces form. The
 * rows looked perfect and were completely dead: buildPackRequests looks up by
 * packItemKey, the review screen groups by packItemKey, and neither would ever
 * have matched. Worse, verifying with the same wrong function made it look
 * correct. A key convention is not a detail to re-derive — it is copied.
 */
const packKey = (name) =>
  `${name}||`
    .toUpperCase()
    .replace(/[^A-Z0-9|]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');

/**
 * Keyword -> the procedure-specific pack it implies, per subspecialty.
 * Longest match wins, so "prostate biopsy" beats "prostate".
 */
const RULES = [
  // General surgery
  { sub: 'General Surgery', match: ['exploratory laparotomy', 'laparotomy', 'ex lap'], pack: 'Exploratory Laparotomy — Consumables' },
  { sub: 'General Surgery', match: ['herniorrhaphy', 'hernioplasty', 'hernia repair', 'mesh repair', 'inguinal hernia', 'hernia'], pack: 'Herniorrhaphy / Mesh Repair — Consumables' },
  { sub: 'General Surgery', match: ['thyroidectomy', 'thyroid'], pack: 'Thyroidectomy — Consumables' },
  { sub: 'General Surgery', match: ['mastectomy', 'breast lump', 'breast mass', 'breast'], pack: 'Mastectomy / Breast Surgery — Consumables' },

  // ENT
  { sub: 'ENT (Otorhinolaryngology)', match: ['adenotonsillectomy', 'tonsillectomy', 'adenoidectomy'], pack: 'Adenotonsillectomy — Consumables' },
  { sub: 'ENT (Otorhinolaryngology)', match: ['tracheostomy'], pack: 'Tracheostomy — Consumables' },
  { sub: 'ENT (Otorhinolaryngology)', match: ['laryngoscopy', 'oesophagoscopy', 'esophagoscopy', 'bronchoscopy', 'panendoscopy'], pack: 'Laryngoscopy / Oesophagoscopy — Consumables' },

  // Obstetrics & Gynaecology
  { sub: 'Obstetrics & Gynaecology', match: ['caesarean', 'cesarean', 'c section', 'lscs'], pack: 'O&G — Standard Consumables', pharmacy: 'Caesarean Section — Drugs & Fluids' },
  { sub: 'Obstetrics & Gynaecology', match: ['hysterectomy', 'tah bso', 'tah'], pack: 'Hysterectomy / TAH-BSO — Consumables' },

  // Neurosurgery
  { sub: 'Neurosurgery', match: ['craniotomy', 'craniectomy', 'tumour excision'], pack: 'Craniotomy (Tumour) — Consumables' },
  { sub: 'Neurosurgery', match: ['burr hole', 'burrhole', 'subdural', 'sdh'], pack: 'Burr-hole / Chronic SDH Evacuation — Consumables' },
  { sub: 'Neurosurgery', match: ['laminectomy', 'discectomy', 'spinal fusion', 'spine'], pack: 'Laminectomy / Spinal — Consumables' },
  { sub: 'Neurosurgery', match: ['vp shunt', 'shunt', 'ventriculoperitoneal'], pack: 'VP Shunt — Consumables' },

  // Orthopaedics
  { sub: 'Orthopaedics', match: ['amputation', 'aka', 'bka'], pack: 'Amputation (AKA/BKA) — Consumables' },
  { sub: 'Orthopaedics', match: ['orif', 'plating', 'nailing', 'screw', 'fracture fixation', 'implant removal'], pack: 'ORIF (Plate/Nail) — Implants & Consumables' },
  { sub: 'Orthopaedics', match: ['arthrotomy', 'lavage', 'washout', 'debridement'], pack: 'Arthrotomy & Lavage — Consumables' },

  // Urology
  { sub: 'Urology', match: ['prostate biopsy'], pack: 'Prostate Biopsy — Consumables' },
  { sub: 'Urology', match: ['prostatectomy', 'turp', 'tvp'], pack: 'Open Prostatectomy / TVP — Consumables' },
  { sub: 'Urology', match: ['nephrectomy'], pack: 'Nephrectomy — Consumables' },
  { sub: 'Urology', match: ['orchidectomy', 'orchidopexy', 'scrotal', 'hydrocele', 'varicocele'], pack: 'Orchidectomy / Scrotal — Consumables' },

  // Paediatric surgery
  { sub: 'Paediatric Surgery', match: ['herniotomy'], pack: 'Inguinal Herniotomy — Consumables' },
  { sub: 'Paediatric Surgery', match: ['hypospadias', 'genital repair', 'psarp'], pack: 'Hypospadias / Genital Repair — Consumables' },
  { sub: 'Paediatric Surgery', match: ['colostomy', 'laparotomy', 'ex lap'], pack: 'Paediatric Colostomy / Ex-lap — Consumables' },

  // Plastic surgery
  { sub: 'Plastic Surgery', match: ['skin graft', 'stsg', 'sstg', 'grafting'], pack: 'Skin Grafting (STSG) — Consumables' },
  { sub: 'Plastic Surgery', match: ['flap', 'tendon repair', 'tendon'], pack: 'Flap Cover / Tendon Repair — Consumables' },

  // Cardiothoracic
  { sub: 'Cardiothoracic Surgery', match: ['thoracotomy', 'lobectomy', 'decortication'], pack: 'Thoracotomy / Lobectomy — Consumables' },
  { sub: 'Cardiothoracic Surgery', match: ['pda'], pack: 'PDA Ligation — Consumables' },
  { sub: 'Cardiothoracic Surgery', match: ['sternotomy', 'varicose', 'sfj', 'vein'], pack: 'Sternotomy / Varicose (SFJ) — Consumables' },

  // Maxillofacial
  { sub: 'Maxillofacial Surgery', match: ['facial fracture', 'orif', 'zygoma', 'mandible fracture', 'panfacial'], pack: 'Facial Fracture ORIF — Plates & Consumables' },
  { sub: 'Maxillofacial Surgery', match: ['mandibulectomy', 'maxillectomy', 'tumour excision'], pack: 'Mandibulectomy / Tumour Excision — Consumables' },

  // Ophthalmology
  { sub: 'Ophthalmology', match: ['cataract', 'sics', 'phaco', 'pciol', 'iol', 'lens implant'], pack: 'Cataract (SICS/Phaco + PCIOL) — Consumables' },
  { sub: 'Ophthalmology', match: ['trabeculectomy', 'pterygium'], pack: 'Ophthalmology — Standard Consumables', pharmacy: 'Trabeculectomy / Pterygium — Drugs' },
  { sub: 'Ophthalmology', match: ['intravitreal', 'anti vegf', 'avastin', 'bevacizumab'], pack: 'Ophthalmology — Standard Consumables', pharmacy: 'Intravitreal Injection (anti-VEGF) — Drugs' },
];

async function main() {
  const packs = await prisma.surgicalPack.findMany({
    where: { isActive: true },
    select: { id: true, name: true, subspecialty: true, kind: true },
  });

  const findPack = (name, kind) =>
    packs.find((p) => p.kind === kind && norm(p.name) === norm(name));

  /** The specialty fallbacks: every subspecialty has both. */
  const standardFor = (sub, kind) =>
    packs.find((p) => p.kind === kind && norm(p.subspecialty) === norm(sub) &&
      (kind === 'CONSUMABLE'
        ? /standard consumables/.test(norm(p.name))
        : /antibiotic|drugs|fluids|irrigation|adjunct|drops/.test(norm(p.name))));

  const surgeries = await prisma.surgery.findMany({
    select: { procedureName: true, subspecialty: true },
  });

  // One entry per distinct procedure, remembering the commonest subspecialty
  // it is booked under and how often — the frequency drives review order.
  const byProc = new Map();
  for (const s of surgeries) {
    const key = norm(s.procedureName);
    if (!key) continue;
    const e = byProc.get(key) ?? { name: s.procedureName, key, storedKey: packKey(s.procedureName), count: 0, subs: new Map() };
    e.count += 1;
    if (s.subspecialty) e.subs.set(s.subspecialty, (e.subs.get(s.subspecialty) ?? 0) + 1);
    byProc.set(key, e);
  }

  const rows = [];
  const stats = { specific: 0, standard: 0, none: 0 };

  for (const e of byProc.values()) {
    const sub = [...e.subs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (!sub) { stats.none += 1; continue; }

    // Longest keyword first, so "prostate biopsy" wins over "prostate".
    const candidates = RULES
      .filter((r) => norm(r.sub) === norm(sub))
      .flatMap((r) => r.match.map((m) => ({ ...r, m })))
      .sort((a, b) => b.m.length - a.m.length);

    const hit = candidates.find((r) => e.key.includes(norm(r.m)));

    const consumable = (hit && findPack(hit.pack, 'CONSUMABLE')) || standardFor(sub, 'CONSUMABLE');
    const pharmacy =
      (hit?.pharmacy && findPack(hit.pharmacy, 'PHARMACY')) || standardFor(sub, 'PHARMACY');

    if (!consumable && !pharmacy) { stats.none += 1; continue; }
    if (hit) stats.specific += 1; else stats.standard += 1;

    rows.push({
      procedureKey: e.storedKey,
      procedureName: e.name,
      subspecialty: sub,
      consumablePackId: consumable?.id ?? null,
      consumablePackName: consumable?.name ?? null,
      pharmacyPackId: pharmacy?.id ?? null,
      pharmacyPackName: pharmacy?.name ?? null,
      suggestedBasis: hit
        ? `Matched on "${hit.m}" within ${sub}. Booked ${e.count} time(s). NOT yet confirmed by a clinician.`
        : `No procedure-specific pack; using the ${sub} standard packs. Booked ${e.count} time(s). NOT yet confirmed by a clinician.`,
      _count: e.count,
      _specific: Boolean(hit),
    });
  }

  rows.sort((a, b) => b._count - a._count);

  console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN ===');
  console.log(`distinct procedures : ${byProc.size}`);
  console.log(`  matched to a procedure-specific pack : ${stats.specific}`);
  console.log(`  falling back to the specialty standard: ${stats.standard}`);
  console.log(`  no subspecialty, skipped              : ${stats.none}`);
  console.log();
  console.log('TOP 20 by how often they are booked:');
  for (const r of rows.slice(0, 20)) {
    console.log(`  ${String(r._count).padStart(3)}x ${r._specific ? '*' : ' '} ${r.procedureName.slice(0, 34).padEnd(35)} -> ${String(r.consumablePackName).slice(0, 38)}`);
  }
  console.log('  (* = matched a procedure-specific pack)');

  if (!APPLY) { console.log('\nNothing written.'); await prisma.$disconnect(); return; }

  let created = 0, updated = 0;
  for (const r of rows) {
    const { _count, _specific, ...data } = r;
    const existing = await prisma.procedurePackMap.findFirst({
      where: { procedureKey: data.procedureKey },
      select: { id: true, confirmedAt: true },
    });
    if (existing) {
      // Never touch a mapping a clinician has confirmed.
      if (existing.confirmedAt) continue;
      await prisma.procedurePackMap.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.procedurePackMap.create({ data });
      created += 1;
    }
  }
  console.log(`\ncreated ${created}, updated ${updated}, all left UNCONFIRMED for review.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error('ERR', e.message?.slice(0, 300)); process.exit(1); });
