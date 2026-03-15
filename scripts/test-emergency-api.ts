import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  // Simulate exactly what the GET handler does
  const where: any = { isEmergency: true };
  try {
    const prescriptions = await prisma.emergencyPrescription.findMany({
      where,
      include: {
        review: { select: { id: true, allergies: true, anaestheticPlan: true, reviewerName: true } },
        emergencyBooking: { select: { id: true, patientName: true, folderNumber: true, procedureName: true, surgicalUnit: true, priority: true, status: true, requiredByTime: true } },
        packedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log('=== API Simulation Result ===');
    console.log('Count:', prescriptions.length);
    prescriptions.forEach((p: any) => {
      console.log(JSON.stringify({
        id: p.id,
        patientName: p.patientName,
        status: p.status,
        isEmergency: p.isEmergency,
        medications: p.medications?.substring(0, 200),
        emergencyBooking: p.emergencyBooking,
      }, null, 2));
    });
  } catch (err: any) {
    console.error('=== QUERY ERROR ===');
    console.error(err.message);
    console.error(err.stack);
  }
  await prisma.$disconnect();
}
test();
