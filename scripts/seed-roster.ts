import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedRoster() {
  console.log('🗓️  Seeding 1-week duty roster...\n');

  // Get an admin user for uploadedBy
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.error('❌ No admin user found. Run the main seed first.');
    process.exit(1);
  }

  // Get theatre suites
  let theatres = await prisma.theatreSuite.findMany({ select: { id: true, name: true } });
  if (theatres.length === 0) {
    console.log('Creating theatre suites...');
    const theatreNames = [
      'THEATRE 1 (VAMED)', 'THEATRE 2 (VAMED)', 'THEATRE 3 (VAMED)',
      'THEATRE 4 (VAMED)', 'THEATRE 5 (VAMED)',
      'SUITE 1 (NIGERIAN SIDE)', 'SUITE 2 (NIGERIAN SIDE)',
      'SUITE 3 (NIGERIAN SIDE)', 'SUITE 4 (NIGERIAN SIDE)',
      'NEUROSURGERY THEATRE', 'EMERGENCY THEATRE', 'CTU THEATRE', 'EYE THEATRE',
    ];
    for (const name of theatreNames) {
      await prisma.theatreSuite.upsert({
        where: { name },
        update: {},
        create: { name, location: 'UNTH Theatre Complex', capacity: 1 },
      });
    }
    theatres = await prisma.theatreSuite.findMany({ select: { id: true, name: true } });
    console.log(`✓ Created ${theatres.length} theatres`);
  }

  // Map staff categories to user roles
  const categoryRoleMap: Record<string, string[]> = {
    NURSES: ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'],
    ANAESTHETISTS: ['ANAESTHETIST'],
    PORTERS: ['PORTER'],
    CLEANERS: ['CLEANER'],
    ANAESTHETIC_TECHNICIANS: ['ANAESTHETIC_TECHNICIAN'],
  };

  // Fetch all relevant users, grouped by category
  const categoryUsers: Record<string, { id: string; fullName: string }[]> = {};
  for (const [category, roles] of Object.entries(categoryRoleMap)) {
    const users = await prisma.user.findMany({
      where: { role: { in: roles as any[] }, status: 'APPROVED' },
      select: { id: true, fullName: true },
    });
    categoryUsers[category] = users;
    if (users.length === 0) {
      console.warn(`⚠ No users found for ${category} (roles: ${roles.join(', ')})`);
    } else {
      console.log(`✓ Found ${users.length} ${category} users`);
    }
  }

  // Generate dates for 1 week starting from today (Mon-Sun)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Shift to Monday of the current week
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  const weekDates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d);
  }

  const shifts = ['MORNING', 'CALL', 'NIGHT'] as const;
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  console.log(`\n📅 Roster week: ${monday.toISOString().slice(0, 10)} to ${weekDates[6].toISOString().slice(0, 10)}\n`);

  // Clear existing roster for this week to avoid duplicates
  await prisma.roster.deleteMany({
    where: {
      date: { gte: weekDates[0], lte: weekDates[6] },
    },
  });
  console.log('✓ Cleared existing roster for this week\n');

  let totalCreated = 0;
  const rosterData: any[] = [];

  for (const [category, users] of Object.entries(categoryUsers)) {
    if (users.length === 0) continue;

    console.log(`--- ${category} ---`);
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const date = weekDates[dayIdx];
      const isWeekend = dayIdx >= 5; // Sat, Sun

      // On weekdays: assign most staff to MORNING, some to CALL, fewer to NIGHT
      // On weekends: skeleton crew across all shifts
      for (let userIdx = 0; userIdx < users.length; userIdx++) {
        const user = users[userIdx];

        // Determine shift assignment:
        // - Rotate users across shifts based on day and index
        let shift: typeof shifts[number];
        if (isWeekend) {
          // Weekend: only half the staff, rotating shifts
          if (userIdx % 3 === 0) continue; // Some staff off on weekends
          shift = shifts[(userIdx + dayIdx) % 3];
        } else {
          // Weekday shift distribution
          const shiftPattern = (userIdx + dayIdx) % 5;
          if (shiftPattern < 3) shift = 'MORNING';
          else if (shiftPattern === 3) shift = 'CALL';
          else shift = 'NIGHT';
        }

        // Assign to a theatre (rotate through available theatres)
        const theatre = theatres[(userIdx + dayIdx) % theatres.length];

        const notes = isWeekend
          ? `Weekend duty - ${dayNames[dayIdx]}`
          : dayIdx === 4 ? 'Friday - handover notes due' : undefined;

        rosterData.push({
          userId: user.id,
          staffName: user.fullName,
          staffCategory: category,
          date,
          theatreId: theatre.id,
          shift,
          uploadedBy: admin.id,
          notes,
        });
      }
    }

    const categoryCount = rosterData.length - totalCreated;
    totalCreated = rosterData.length;
    console.log(`  ${categoryCount} roster entries prepared`);
  }

  // Bulk create all roster entries
  if (rosterData.length > 0) {
    const result = await prisma.roster.createMany({ data: rosterData });
    console.log(`\n✅ Created ${result.count} total roster entries for the week`);
  } else {
    console.log('\n⚠ No roster entries to create. Make sure seed users exist.');
  }

  // Print a summary table
  console.log('\n📊 Summary by category and shift:\n');
  const summary: Record<string, Record<string, number>> = {};
  for (const entry of rosterData) {
    if (!summary[entry.staffCategory]) summary[entry.staffCategory] = {};
    summary[entry.staffCategory][entry.shift] = (summary[entry.staffCategory][entry.shift] || 0) + 1;
  }
  console.log('Category'.padEnd(28) + 'MORNING'.padEnd(10) + 'CALL'.padEnd(10) + 'NIGHT'.padEnd(10) + 'TOTAL');
  console.log('-'.repeat(68));
  for (const [cat, shifts] of Object.entries(summary)) {
    const m = shifts['MORNING'] || 0;
    const c = shifts['CALL'] || 0;
    const n = shifts['NIGHT'] || 0;
    console.log(cat.padEnd(28) + String(m).padEnd(10) + String(c).padEnd(10) + String(n).padEnd(10) + (m + c + n));
  }
}

seedRoster()
  .then(() => {
    console.log('\n🎉 Roster seeding complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
