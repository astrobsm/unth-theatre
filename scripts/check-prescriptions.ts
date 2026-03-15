import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check emergency prescriptions
  const emergencyRx = await prisma.emergencyPrescription.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('\n=== EMERGENCY PRESCRIPTIONS ===');
  console.log(`Count: ${emergencyRx.length}`);
  emergencyRx.forEach(rx => {
    console.log(`  ${rx.id} | ${rx.patientName} | ${rx.status} | ${rx.medications?.substring(0, 100)}`);
  });

  // Check regular anesthetic prescriptions
  const regularRx = await prisma.anestheticPrescription.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { surgery: { select: { procedureName: true } } },
  });
  console.log('\n=== ANESTHETIC PRESCRIPTIONS ===');
  console.log(`Count: ${regularRx.length}`);
  regularRx.forEach(rx => {
    console.log(`  ${rx.id} | ${rx.patientName} | ${rx.urgency} | ${rx.status} | ${rx.medications?.substring(0, 100)}`);
  });

  // Check emergency reviews
  const reviews = await prisma.emergencyPreAnaestheticReview.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { prescriptions: true },
  });
  console.log('\n=== EMERGENCY PRE-ANAESTHETIC REVIEWS ===');
  console.log(`Count: ${reviews.length}`);
  reviews.forEach(r => {
    console.log(`  ${r.id} | ${r.patientName} | ${r.status} | prescriptions: ${r.prescriptions.length}`);
  });

  // Check emergency bookings
  const bookings = await prisma.emergencySurgeryBooking.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('\n=== EMERGENCY BOOKINGS ===');
  console.log(`Count: ${bookings.length}`);
  bookings.forEach(b => {
    console.log(`  ${b.id} | ${b.patientName} | ${b.priority} | ${b.status}`);
  });

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
