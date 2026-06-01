const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  // 1. All registered surgical units
  const units = await prisma.surgicalUnit.findMany({
    where: { active: true },
    orderBy: [{ subspecialty: 'asc' }, { name: 'asc' }],
  });

  // 2. Catalog templates (consumables + drugs/dressings) with their specialty hint
  const consumables = await prisma.surgicalConsumableTemplate.findMany({
    where: { isActive: true },
    select: { specialty: true, name: true, category: true },
  });
  const drugs = await prisma.surgicalDrugDressingTemplate.findMany({
    where: { isActive: true },
    select: { specialty: true, name: true, type: true },
  });

  // 3. Aggregate contributions by specialty (catalog "specialty" maps to SurgicalUnit.subspecialty)
  const contribBySpecialty = {};
  const bump = (s, kind) => {
    if (!s) s = '__GENERAL__';
    if (!contribBySpecialty[s]) contribBySpecialty[s] = { consumables: 0, drugs: 0 };
    contribBySpecialty[s][kind] += 1;
  };
  consumables.forEach((c) => bump(c.specialty, 'consumables'));
  drugs.forEach((d) => bump(d.specialty, 'drugs'));

  // 4. Match units to contributions
  const subspecialties = [...new Set(units.map((u) => u.subspecialty))].sort();

  const contributed = [];
  const notContributed = [];

  for (const sub of subspecialties) {
    const subUnits = units.filter((u) => u.subspecialty === sub);
    const stats = contribBySpecialty[sub] || { consumables: 0, drugs: 0 };
    const total = stats.consumables + stats.drugs;
    const entry = { subspecialty: sub, units: subUnits.map((u) => u.name), stats };
    if (total > 0) contributed.push(entry);
    else notContributed.push(entry);
  }

  const generalItems = contribBySpecialty['__GENERAL__'] || { consumables: 0, drugs: 0 };

  // 5. Output summary to console
  console.log('\n========== SURGICAL CATALOG CONTRIBUTIONS ==========\n');
  console.log(`Active surgical units: ${units.length}`);
  console.log(`Distinct subspecialties: ${subspecialties.length}`);
  console.log(`Total consumable templates: ${consumables.length}`);
  console.log(`Total drug/dressing templates: ${drugs.length}`);
  console.log(`General/shared items (no specialty tag): ${generalItems.consumables + generalItems.drugs}`);
  console.log(`\nSpecialties that HAVE contributed (${contributed.length}):`);
  contributed.forEach((c) => {
    console.log(`  ✅ ${c.subspecialty}  —  ${c.stats.consumables} consumables, ${c.stats.drugs} drugs/dressings`);
    c.units.forEach((u) => console.log(`       • ${u}`));
  });
  console.log(`\nSpecialties YET to contribute (${notContributed.length}):`);
  notContributed.forEach((c) => {
    console.log(`  ⏳ ${c.subspecialty}`);
    c.units.forEach((u) => console.log(`       • ${u}`));
  });

  // 6. Build WhatsApp appeal message
  const lines = [];
  lines.push('🚨 *URGENT & PASSIONATE APPEAL* 🚨');
  lines.push('*TO: ALL SURGICAL UNITS — UNTH OPERATING THEATRES*');
  lines.push('*RE: SUBMISSION OF UNIT CONSUMABLES & DRUG/DRESSING LIST*');
  lines.push('');
  lines.push('Dear Esteemed Heads of Units, Consultants, Registrars and Theatre Coordinators,');
  lines.push('');
  lines.push('Greetings from the ORM Theatre Management Team. 🙏🏽');
  lines.push('');
  lines.push('We write with deep respect — and a sense of urgency — to *passionately appeal* to every surgical unit that has not yet submitted its standard *Consumables, Drugs & Dressings list* to please do so *without further delay*.');
  lines.push('');
  lines.push('*WHY THIS MATTERS:*');
  lines.push('The ORM platform now powers our *Theatre Case-Prep Workflow*. Ahead of every booked case, the *Consumable Pack Provider* and *Theatre Pharmacy* rely on YOUR unit\'s catalog to pre-pack the night before surgery. When a unit\'s list is missing:');
  lines.push('  ❌ Cases start late');
  lines.push('  ❌ Scrub nurses scramble for items mid-procedure');
  lines.push('  ❌ Patients are exposed to avoidable risk');
  lines.push('  ❌ Theatre utilisation drops');
  lines.push('');
  lines.push('*When your list IS submitted:*');
  lines.push('  ✅ Packs are ready before the patient arrives');
  lines.push('  ✅ Surgery begins on time');
  lines.push('  ✅ Patient safety is upheld');
  lines.push('  ✅ Your unit\'s clinical autonomy is preserved — what YOU prefer, is what gets packed.');
  lines.push('');
  lines.push('────────────────────────────');
  lines.push(`✅ *UNITS THAT HAVE ALREADY CONTRIBUTED* (${contributed.length} of ${subspecialties.length} subspecialties)`);
  lines.push('────────────────────────────');
  if (contributed.length === 0) {
    lines.push('_None yet — be the first to lead the way!_');
  } else {
    contributed.forEach((c) => {
      lines.push(`*${c.subspecialty}* — _${c.stats.consumables} consumables, ${c.stats.drugs} drugs/dressings_`);
      c.units.forEach((u) => lines.push(`   • ${u}`));
    });
  }
  lines.push('');
  lines.push('We thank these units sincerely for setting the standard. 👏🏽');
  lines.push('');
  lines.push('────────────────────────────');
  lines.push(`⏳ *UNITS WE ARE STILL EXPECTING TO HEAR FROM* (${notContributed.length})`);
  lines.push('────────────────────────────');
  if (notContributed.length === 0) {
    lines.push('🎉 _Every subspecialty has contributed — God bless you all!_');
  } else {
    notContributed.forEach((c) => {
      lines.push(`*${c.subspecialty}*`);
      c.units.forEach((u) => lines.push(`   • ${u}`));
    });
  }
  lines.push('');
  lines.push('────────────────────────────');
  lines.push('*HOW TO SUBMIT YOUR LIST (3 EASY OPTIONS):*');
  lines.push('────────────────────────────');
  lines.push('1️⃣  *Log in to the ORM Platform* → https://unth-theatre-mai.vercel.app → _Surgical Catalog_ → add your unit\'s consumables, drugs & dressings.');
  lines.push('2️⃣  *Send a written list* (Word/PDF/handwritten photo) to the ORM Team via this group or directly to the Theatre Coordinator.');
  lines.push('3️⃣  *Request a visit* — an ORM team member will sit with your unit and capture the list together.');
  lines.push('');
  lines.push('*What to include for each item:*');
  lines.push('   • Name (e.g. Vicryl 2/0, Sofratulle, Ceftriaxone 1g)');
  lines.push('   • Size / strength (where applicable)');
  lines.push('   • Default quantity per case');
  lines.push('   • Procedures it applies to (or "all cases in this unit")');
  lines.push('');
  lines.push('────────────────────────────');
  lines.push('*KIND REMINDER:* This is not an administrative request — it is a *patient-safety request*. Every case packed without a unit-approved list is a case at risk. Your input *protects your patient* and *honours your craft*.');
  lines.push('');
  lines.push('Please respond by *end of next week*. We are available to assist any unit that needs help compiling its list.');
  lines.push('');
  lines.push('With profound respect and gratitude,');
  lines.push('*The ORM Theatre Management Team*');
  lines.push('_"Right item. Right case. Right time. Every time."_');

  // 7. Save outputs
  const outDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().split('T')[0];

  const msgPath = path.join(outDir, `surgical-catalog-appeal-${stamp}.txt`);
  fs.writeFileSync(msgPath, lines.join('\n'), 'utf8');

  const reportPath = path.join(outDir, `surgical-catalog-status-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      { totalUnits: units.length, contributed, notContributed, generalItems },
      null,
      2,
    ),
  );

  console.log(`\n📄 Appeal message: ${msgPath}`);
  console.log(`📊 Status report:  ${reportPath}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
