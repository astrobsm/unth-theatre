/**
 * Put historical form-booked emergencies onto the emergency board.
 *
 *     node scripts/backfill-emergency-bookings.js            # report only
 *     node scripts/backfill-emergency-bookings.js --write    # apply
 *
 * Background
 * ----------
 * Booking a case through the SURGERIES form with Surgery Type = EMERGENCY used
 * to create an EmergencySurgeryAlert (which drives the TV display) but no
 * EmergencySurgeryBooking. The booking row is what the emergency list, the team
 * availability card, the radio broadcast and the response-monitoring board all
 * read, so those cases were invisible to every one of them. New bookings are
 * fixed at source; this repairs the ones already in the database.
 *
 * Two things this script is careful about
 * ---------------------------------------
 * IT DOES NOT BROADCAST. /api/radio/queue promotes every SUBMITTED emergency
 * booking onto the theatre radio, repeating every five minutes until somebody
 * acknowledges it. Back-filling naively would announce weeks-old emergencies
 * across the theatre complex. The queue skips a booking that already has ANY
 * radio row, so this writes one CANCELLED row per booking first — the
 * announcement is retired before it can ever be made.
 *
 * IT DOES NOT INVENT A STATUS. The booking mirrors the status of the surgery it
 * belongs to. Where a surgery is still SCHEDULED with a date in the past, the
 * booking is created as SUBMITTED and WILL show as outstanding on the board —
 * because that is what the record actually says. Nobody closed those cases.
 * Marking them COMPLETED here would be inventing a clinical fact.
 *
 * Idempotent: emergency_surgery_bookings.surgeryId is unique, and the script
 * skips anything already linked.
 */
const { PrismaClient } = require('@prisma/client');

const WRITE = process.argv.includes('--write');
const prisma = new PrismaClient();

/** Booking status that honestly reflects the surgery it belongs to. */
function statusFor(surgeryStatus) {
  if (surgeryStatus === 'COMPLETED') return 'COMPLETED';
  if (surgeryStatus === 'CANCELLED') return 'CANCELLED';
  if (surgeryStatus === 'IN_PROGRESS') return 'IN_PROGRESS';
  // SCHEDULED / IN_HOLDING_AREA / READY_FOR_THEATRE — requested, never closed.
  return 'SUBMITTED';
}

(async () => {
  const orphans = await prisma.surgery.findMany({
    where: { surgeryType: 'EMERGENCY', emergencyBooking: { is: null } },
    select: {
      id: true, procedureName: true, unit: true, indication: true, surgeonId: true,
      surgeonName: true, anesthesiaType: true, estimatedDuration: true, theatreId: true,
      location: true, needBloodTransfusion: true, otherSpecialNeeds: true, status: true,
      scheduledDate: true, scheduledTime: true, createdAt: true,
      patient: { select: { name: true, folderNumber: true, age: true, gender: true, ward: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Emergency surgeries with no booking row: ${orphans.length}\n`);
  if (orphans.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // A real user id is required for the surgeonId relation where the surgeon was
  // typed as free text. Prefer a matching account, else the system admin.
  const fallback = await prisma.user.findFirst({
    where: { role: { in: ['SYSTEM_ADMINISTRATOR', 'ADMIN'] } },
    select: { id: true, fullName: true },
  });
  if (!fallback) {
    console.error('No administrator account to attribute unmatched surgeons to. Aborting.');
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  const plan = [];
  for (const s of orphans) {
    let surgeonId = s.surgeonId;
    if (!surgeonId && s.surgeonName) {
      const match = await prisma.user.findFirst({
        where: { fullName: { equals: s.surgeonName, mode: 'insensitive' } },
        select: { id: true },
      });
      surgeonId = match?.id ?? null;
    }
    plan.push({ surgery: s, surgeonId: surgeonId ?? fallback.id, matched: !!surgeonId, status: statusFor(s.status) });
  }

  for (const p of plan) {
    const s = p.surgery;
    console.log(`  ${s.scheduledDate.toISOString().slice(0, 10)} ${s.scheduledTime}  ${s.procedureName}`);
    console.log(`      ${s.patient?.name ?? 'unknown patient'} (${s.patient?.folderNumber ?? '-'}) · ${s.unit}`);
    console.log(`      surgery ${s.status} -> booking ${p.status}${p.matched ? '' : `  [surgeon "${s.surgeonName}" has no account; attributed to ${fallback.fullName}]`}`);
  }

  if (!WRITE) {
    console.log('\nDry run. Re-run with --write to apply.');
    console.log('Each booking will be created with its radio announcement already retired,');
    console.log('so nothing from these historical cases is broadcast.');
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  for (const p of plan) {
    const s = p.surgery;
    try {
      const booking = await prisma.emergencySurgeryBooking.create({
        data: {
          surgeryId: s.id,
          patientName: s.patient?.name ?? 'Unknown',
          folderNumber: s.patient?.folderNumber ?? '',
          age: s.patient?.age ?? null,
          gender: s.patient?.gender ?? null,
          ward: s.patient?.ward ?? null,
          diagnosis: s.indication,
          procedureName: s.procedureName,
          surgicalUnit: s.unit,
          indication: s.indication,
          surgeonId: p.surgeonId,
          surgeonName: s.surgeonName || 'Not named',
          anaesthesiaType: s.anesthesiaType ?? null,
          // The emergency was raised when the surgery was booked, not now.
          requestedAt: s.createdAt,
          requiredByTime: new Date(`${s.scheduledDate.toISOString().slice(0, 10)}T${s.scheduledTime}`),
          estimatedDuration: s.estimatedDuration,
          theatreId: s.theatreId ?? null,
          theatreName: s.location ?? null,
          priority: 'CRITICAL',
          bloodRequired: s.needBloodTransfusion,
          bloodUnits: s.needBloodTransfusion ? 2 : null,
          specialRequirements: s.otherSpecialNeeds ?? null,
          status: p.status,
        },
      });

      // Retire the broadcast before it can be made. /api/radio/queue skips any
      // booking that already has a radio row, whatever its status.
      await prisma.radioAnnouncement.create({
        data: {
          category: 'EMERGENCY',
          title: `Historical record — ${s.procedureName}`,
          message: 'Backfilled record. Not for broadcast.',
          priority: 0,
          status: 'CANCELLED',
          triggerSource: 'SYSTEM',
          requireAck: false,
          repeatUntilAck: false,
          metadata: JSON.stringify({ emergencyBookingId: booking.id, backfill: true }),
        },
      });

      // Provenance belongs in the audit log, not in a clinical field.
      await prisma.auditLog.create({
        data: {
          userId: p.surgeonId,
          action: 'BACKFILL_EMERGENCY_BOOKING',
          tableName: 'EmergencySurgeryBooking',
          recordId: booking.id,
          changes: JSON.stringify({
            reason: 'Emergency booked through the surgeries form before the board wiring existed',
            surgeryId: s.id,
            statusMirroredFromSurgery: s.status,
            radioSuppressed: true,
          }),
        },
      });

      created++;
      console.log(`  added: ${s.procedureName} [${p.status}]`);
    } catch (err) {
      if (err?.code === 'P2002') {
        console.log(`  skipped (already on the board): ${s.procedureName}`);
      } else {
        console.error(`  FAILED: ${s.procedureName}`, err?.message ?? err);
      }
    }
  }

  const total = await prisma.emergencySurgeryBooking.count();
  const stillOrphaned = await prisma.surgery.count({
    where: { surgeryType: 'EMERGENCY', emergencyBooking: { is: null } },
  });
  console.log(`\nAdded ${created}. Bookings table now holds ${total}.`);
  console.log(`Emergency surgeries still missing a booking row: ${stillOrphaned}`);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
