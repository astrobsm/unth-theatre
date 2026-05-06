/**
 * Idempotent seed of:
 *   - TheatreSuite rows (canonical names per LOCATIONS)
 *   - SurgicalUnit rows (per OPERATING THEATRE ALLOCATION SCHEDULE)
 *   - SurgicalUnitSchedule rows (day-of-week → theatre per unit)
 *
 * Run with:
 *   cd unth-theatre; npx ts-node --transpile-only scripts/seed-theatres-and-units.ts
 *
 * Notes:
 *  - Theatre names are unique. We upsert by name and (re)align location.
 *  - For pre-existing TheatreSuite rows whose names collide with our canonical
 *    set (e.g. "THEATRE 1 (VAMED)" vs canonical "Theatre 1"), we keep both;
 *    units always reference the canonical short-name row. No row is deleted.
 *  - Schedules for each unit are FULLY REPLACED on each run (deleteMany then
 *    create) so re-running converges to the latest spec without duplicates.
 */
import { PrismaClient } from '@prisma/client';

const CANONICAL_THEATRES: Array<{ name: string; location: string; capacity?: number }> = [
  // Location 4 – Professor Ojukwu Theatre Complex
  { name: 'Theatre 1', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Theatre 2', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Theatre 3', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Theatre 4', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Theatre 5', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Suite 1', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Suite 2', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Suite 3', location: 'Professor Ojukwu Theatre Complex' },
  // Location 2 – Eye Theatre
  { name: 'Eye Theatre', location: 'Eye Theatre' },
  // Location 1 – A&E (24/7 emergency)
  { name: 'A&E Theatre', location: 'A&E' },
  // Location 3 – Cardiothoracic Centre
  { name: 'CTU TH1', location: 'Cardiothoracic Centre' },
];

const prisma = new PrismaClient();

const DAY = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
} as const;

type Day = keyof typeof DAY;

interface UnitSpec {
  name: string;
  subspecialty: string;
  location: string;
  schedule: Array<{ day: Day; theatre: string }>;
}

const UNITS: UnitSpec[] = [
  // 1. Plastic Surgery
  { name: 'PS Unit 1', subspecialty: 'Plastic Surgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Wed', theatre: 'Theatre 3' }] },
  { name: 'PS Unit 2', subspecialty: 'Plastic Surgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Thu', theatre: 'Theatre 1' }] },

  // 2. General Surgery
  { name: 'GS Unit I', subspecialty: 'General Surgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Wed', theatre: 'Theatre 2' }, { day: 'Thu', theatre: 'Suite 3' }] },
  { name: 'GS Unit II', subspecialty: 'General Surgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Tue', theatre: 'Theatre 3' }] },
  { name: 'GS Unit III', subspecialty: 'General Surgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Mon', theatre: 'Suite 3' }] },
  { name: 'GS Unit IV', subspecialty: 'General Surgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Fri', theatre: 'Suite 2' }] },

  // 3. Orthopaedics
  { name: 'Ortho Unit I', subspecialty: 'Orthopaedics', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Tue', theatre: 'Theatre 4' }] },
  { name: 'Ortho Unit II', subspecialty: 'Orthopaedics', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Thu', theatre: 'Theatre 4' }] },
  { name: 'Ortho Unit III', subspecialty: 'Orthopaedics', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Fri', theatre: 'Theatre 4' }] },

  // 4. Urology
  { name: 'Uro Unit I', subspecialty: 'Urology', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Mon', theatre: 'Suite 2' }] },
  { name: 'Uro Unit II', subspecialty: 'Urology', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Wed', theatre: 'Suite 2' }] },
  { name: 'Uro Unit III', subspecialty: 'Urology', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Thu', theatre: 'Suite 2' }] },

  // 5. Maxillofacial
  { name: 'Maxillo Unit I', subspecialty: 'Maxillofacial Surgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Tue', theatre: 'Theatre 5' }] },
  { name: 'Maxillo Unit II', subspecialty: 'Maxillofacial Surgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Wed', theatre: 'Theatre 5' }] },
  { name: 'Maxillo Unit III', subspecialty: 'Maxillofacial Surgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Wed', theatre: 'Theatre 5' }] },

  // 6. ENT
  { name: 'ENT Unit I', subspecialty: 'ENT (Otorhinolaryngology)', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Tue', theatre: 'Theatre 1' }] },
  { name: 'ENT Unit II', subspecialty: 'ENT (Otorhinolaryngology)', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Wed', theatre: 'Theatre 1' }] },
  { name: 'ENT Unit III', subspecialty: 'ENT (Otorhinolaryngology)', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Fri', theatre: 'Theatre 5' }] },

  // 7. Paediatric Surgery
  { name: 'Paedo Unit I', subspecialty: 'Paediatric Surgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Mon', theatre: 'Theatre 1' }] },
  { name: 'Paedo Unit II', subspecialty: 'Paediatric Surgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Fri', theatre: 'Theatre 1' }] },

  // 8. Neurosurgery
  { name: 'Neuro Unit I', subspecialty: 'Neurosurgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Thu', theatre: 'Suite 1' }] },
  { name: 'Neuro Unit II', subspecialty: 'Neurosurgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Wed', theatre: 'Suite 1' }] },
  { name: 'Neuro Unit III', subspecialty: 'Neurosurgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Mon', theatre: 'Suite 1' }] },
  { name: 'Neuro Unit IV', subspecialty: 'Neurosurgery', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Fri', theatre: 'Suite 1' }] },

  // 9. O&G
  { name: 'O&G Firm 1', subspecialty: 'Obstetrics & Gynaecology', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Fri', theatre: 'Theatre 2' }] },
  { name: 'O&G Firm 5', subspecialty: 'Obstetrics & Gynaecology', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Thu', theatre: 'Theatre 3' }] },
  { name: 'O&G Firm 2', subspecialty: 'Obstetrics & Gynaecology', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Mon', theatre: 'Theatre 4' }] },
  { name: 'O&G Firm 3', subspecialty: 'Obstetrics & Gynaecology', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Tue', theatre: 'Theatre 2' }] },
  { name: 'O&G Unit 4', subspecialty: 'Obstetrics & Gynaecology', location: 'Professor Ojukwu Theatre Complex',
    schedule: [{ day: 'Wed', theatre: 'Theatre 4' }] },

  // Ophthalmology (Eye Theatre — Location 2). "Monday Unit" rotates to Wed, etc.
  { name: 'Monday Unit (Ophthalmology)', subspecialty: 'Ophthalmology', location: 'Eye Theatre',
    schedule: [{ day: 'Wed', theatre: 'Eye Theatre' }] },
  { name: 'Tuesday Unit (Ophthalmology)', subspecialty: 'Ophthalmology', location: 'Eye Theatre',
    schedule: [{ day: 'Thu', theatre: 'Eye Theatre' }] },
  { name: 'Wednesday Unit (Ophthalmology)', subspecialty: 'Ophthalmology', location: 'Eye Theatre',
    schedule: [{ day: 'Fri', theatre: 'Eye Theatre' }] },
  { name: 'Thursday Unit (Ophthalmology)', subspecialty: 'Ophthalmology', location: 'Eye Theatre',
    schedule: [{ day: 'Tue', theatre: 'Eye Theatre' }] },
  { name: 'Friday Unit (Ophthalmology)', subspecialty: 'Ophthalmology', location: 'Eye Theatre',
    schedule: [{ day: 'Mon', theatre: 'Eye Theatre' }] },

  // Cardiothoracic — Location 3
  { name: 'CTU Unit I', subspecialty: 'Cardiothoracic Surgery', location: 'Cardiothoracic Centre',
    schedule: [{ day: 'Thu', theatre: 'CTU TH1' }] },
  { name: 'CTU Unit II', subspecialty: 'Cardiothoracic Surgery', location: 'Cardiothoracic Centre',
    schedule: [{ day: 'Tue', theatre: 'CTU TH1' }] },
  { name: 'CTU Unit III', subspecialty: 'Cardiothoracic Surgery', location: 'Cardiothoracic Centre',
    schedule: [{ day: 'Fri', theatre: 'CTU TH1' }] },
];

async function main() {
  console.log('=== Seeding theatres ===');
  const theatreByName = new Map<string, string>(); // name -> id
  for (const t of CANONICAL_THEATRES) {
    const existing = await prisma.theatreSuite.findUnique({ where: { name: t.name } });
    if (existing) {
      // Realign location only if it changed; do not modify capacity/equipment/status.
      if (existing.location !== t.location) {
        await prisma.theatreSuite.update({
          where: { id: existing.id },
          data: { location: t.location },
        });
        console.log(`  Updated location: ${t.name} -> ${t.location}`);
      } else {
        console.log(`  OK  ${t.name} @ ${t.location}`);
      }
      theatreByName.set(t.name, existing.id);
    } else {
      const created = await prisma.theatreSuite.create({
        data: {
          name: t.name,
          location: t.location,
          capacity: t.capacity ?? 1,
          status: 'AVAILABLE',
        },
      });
      console.log(`  + Created ${t.name} @ ${t.location}`);
      theatreByName.set(t.name, created.id);
    }
  }

  console.log('\n=== Seeding surgical units & schedules ===');
  for (const u of UNITS) {
    const upserted = await prisma.surgicalUnit.upsert({
      where: { name: u.name },
      create: {
        name: u.name,
        subspecialty: u.subspecialty,
        location: u.location,
        active: true,
      },
      update: {
        subspecialty: u.subspecialty,
        location: u.location,
        active: true,
      },
    });

    // Replace schedule rows for this unit so reruns converge.
    await prisma.surgicalUnitSchedule.deleteMany({ where: { unitId: upserted.id } });
    for (const s of u.schedule) {
      const theatreId = theatreByName.get(s.theatre);
      if (!theatreId) {
        console.warn(`  ! Unit ${u.name}: no theatre id for "${s.theatre}" — skipping`);
        continue;
      }
      await prisma.surgicalUnitSchedule.create({
        data: {
          unitId: upserted.id,
          dayOfWeek: DAY[s.day],
          theatreId,
          theatreName: s.theatre,
        },
      });
    }
    console.log(`  OK  ${u.name} (${u.subspecialty}, ${u.location}) — ${u.schedule.length} schedule row(s)`);
  }

  const totalUnits = await prisma.surgicalUnit.count();
  const totalSchedules = await prisma.surgicalUnitSchedule.count();
  const totalTheatres = await prisma.theatreSuite.count();
  console.log(`\nDone. Theatres=${totalTheatres}, Units=${totalUnits}, Schedules=${totalSchedules}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
