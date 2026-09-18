/**
 * Demo data for the training screenshots.
 *
 * Runs ONLY against the throwaway screenshot database. It must never touch
 * production, which is why it refuses to start unless the connection string
 * points at the local container.
 *
 * Every name here is invented. Training material that shows a real patient is a
 * disclosure, and a folder number on a screen in a video cannot be recalled
 * once the video is circulated — which is why the handbook's own production
 * rules say "always fictional, never a real folder number".
 *
 * The point is not a full hospital. It is enough on each screen that a viewer
 * recognises what they are looking at: a list with cases in it, a card with a
 * team on it, a board with something to read.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const url = process.env.DATABASE_URL ?? '';
if (!/127\.0\.0\.1:55433|localhost:55433/.test(url)) {
  console.error('REFUSING TO RUN: this seeder is only for the local screenshot database.');
  process.exit(1);
}

const THEATRES = [
  { name: 'Theatre 1', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Theatre 2', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Theatre 3', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Theatre 4', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Eye Theatre', location: 'Eye Theatre' },
  { name: 'CTU TH1', location: 'Cardiothoracic Centre' },
];

const UNITS = [
  { name: 'GS Unit I', subspecialty: 'General Surgery', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'GS Unit IV', subspecialty: 'General Surgery', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'ENT Unit I', subspecialty: 'ENT (Otorhinolaryngology)', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Ortho Unit III', subspecialty: 'Orthopaedics', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'O&G Firm 1', subspecialty: 'Obstetrics & Gynaecology', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Paedo Unit II', subspecialty: 'Paediatric Surgery', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'CTU Unit III', subspecialty: 'Cardiothoracic Surgery', location: 'Cardiothoracic Centre' },
  { name: 'Wednesday Unit (Ophthalmology)', subspecialty: 'Ophthalmology', location: 'Eye Theatre' },
];

const STAFF = [
  ['Kenneth Adaeze', 'CONSULTANT_SURGEON', '08030000101', 'Surgery (General)'],
  ['Chidi Nwosu', 'SURGEON', '08030000102', 'Surgery (General)'],
  ['Amaka Obi', 'SURGEON', '08030000103', 'Surgery (ENT)'],
  ['Tunde Balogun', 'CONSULTANT_SURGEON', '08030000104', 'Surgery (Orthopaedics)'],
  ['Ifeoma Eze', 'CONSULTANT_SURGEON', '08030000105', 'Obstetrics & Gynaecology'],
  ['Emeka Uche', 'CONSULTANT_SURGEON', '08030000106', 'Surgery (Cardiothoracic)'],
  ['Ngozi Anyanwu', 'CONSULTANT_ANAESTHETIST', '08030000201', 'Anaesthesia'],
  ['Bola Fashola', 'ANAESTHETIST', '08030000202', 'Anaesthesia'],
  ['Sussan Okoro', 'SCRUB_NURSE', '08030000301', 'Theatre Nursing'],
  ['Grace Ibrahim', 'SCRUB_NURSE', '08030000302', 'Theatre Nursing'],
  ['Peter Musa', 'ANAESTHETIC_TECHNICIAN', '08030000401', 'Anaesthesia'],
  ['Chinelo Agu', 'RECOVERY_ROOM_NURSE', '08030000501', 'Recovery'],
  ['Samuel Ojo', 'PORTER', '08030000601', 'Portering'],
  ['Halima Sani', 'PHARMACIST', '08030000701', 'Pharmacy'],
  ['Daniel Etim', 'THEATRE_STORE_KEEPER', '08030000801', 'Theatre Stores'],
  ['Rita Achebe', 'HOUSE_OFFICER', '08030000901', 'Surgery (General)'],
] as const;

const PATIENTS = [
  ['Adaeze Nwankwo', 'DEMO/1001', 34, 'Female', 'WARD 1'],
  ['Emeka Obiora', 'DEMO/1002', 52, 'Male', 'WARD 9'],
  ['Blessing Udo', 'DEMO/1003', 27, 'Female', 'WARD 1'],
  ['Ibrahim Yusuf', 'DEMO/1004', 61, 'Male', 'WARD 8'],
  ['Chiamaka Eze', 'DEMO/1005', 8, 'Female', 'WARD 8'],
  ['Grace Okonkwo', 'DEMO/1006', 45, 'Female', 'POSTNATAL WARD'],
  ['Musa Danladi', 'DEMO/1007', 70, 'Male', 'EYE WARD'],
  ['Ifeanyi Chukwu', 'DEMO/1008', 19, 'Male', 'WARD 9'],
] as const;

const CASES = [
  ['DEMO/1001', 'GS Unit IV', 'General Surgery', 'Excision biopsy of breast lump', 'Right breast lump', '09:00', 90, 'Chidi Nwosu', 'Kenneth Adaeze'],
  ['DEMO/1002', 'GS Unit I', 'General Surgery', 'Inguinal hernia repair', 'Right inguinal hernia', '11:00', 120, 'Chidi Nwosu', 'Kenneth Adaeze'],
  ['DEMO/1003', 'ENT Unit I', 'ENT (Otorhinolaryngology)', 'Tonsillectomy', 'Recurrent tonsillitis', '09:00', 60, 'Amaka Obi', 'Amaka Obi'],
  ['DEMO/1004', 'Ortho Unit III', 'Orthopaedics', 'Total hip replacement', 'Osteoarthritis of the hip', '09:00', 180, 'Tunde Balogun', 'Tunde Balogun'],
  ['DEMO/1005', 'Paedo Unit II', 'Paediatric Surgery', 'Closure of colostomy', 'Post PSARP colostomy', '10:30', 120, 'Chidi Nwosu', 'Kenneth Adaeze'],
  ['DEMO/1006', 'O&G Firm 1', 'Obstetrics & Gynaecology', 'Exploratory laparotomy', 'Ovarian mass', '14:00', 150, 'Ifeoma Eze', 'Ifeoma Eze'],
  ['DEMO/1007', 'Wednesday Unit (Ophthalmology)', 'Ophthalmology', 'Cataract extraction with lens implant', 'Mature cataract', '11:00', 45, 'Amaka Obi', 'Amaka Obi'],
  ['DEMO/1008', 'CTU Unit III', 'Cardiothoracic Surgery', 'Thoracotomy and biopsy', 'Mediastinal mass', '09:00', 240, 'Emeka Uche', 'Emeka Uche'],
] as const;

/** Today at midnight UTC — the day every screen defaults to. */
function today(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

async function main() {
  const day = today();
  console.log('Seeding demo data for', day.toISOString().slice(0, 10));

  for (const t of THEATRES) {
    await prisma.theatreSuite.upsert({
      where: { name: t.name },
      update: {},
      create: { name: t.name, location: t.location, capacity: 1 },
    });
  }
  console.log(`  theatres: ${THEATRES.length}`);

  for (const u of UNITS) {
    await prisma.surgicalUnit.upsert({
      where: { name: u.name },
      update: {},
      create: { name: u.name, subspecialty: u.subspecialty, location: u.location, active: true },
    });
  }
  console.log(`  units: ${UNITS.length}`);

  const password = await bcrypt.hash('demo1234', 10);

  // The administrator the capture signs in as.
  //
  // This seeder has always ENDED by printing "Sign in as admin / admin123" and
  // never created that account, so the screenshot sweep signed in as nobody,
  // reported SIGN-IN FAILED and captured not one picture. It has to be an ADMIN
  // specifically: FULL_ACCESS_ROLES see every module, and a screenshot of a
  // screen the user cannot open is a screenshot of an access-denied page.
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { status: 'APPROVED' as never, role: 'ADMIN' as never },
    create: {
      username: 'admin',
      fullName: 'Demo Administrator',
      password: await bcrypt.hash('admin123', 10),
      role: 'ADMIN' as never,
      status: 'APPROVED' as never,
      department: 'Theatre',
    },
  });

  const staffByName = new Map<string, string>();
  for (const [fullName, role, phone, department] of STAFF) {
    const username = fullName.toLowerCase().replace(/[^a-z]+/g, '.');
    const user = await prisma.user.upsert({
      where: { username },
      update: { status: 'APPROVED' as never },
      create: {
        username,
        fullName,
        password,
        role: role as never,
        status: 'APPROVED' as never,
        phoneNumber: phone,
        department,
        isFirstLogin: false,
      },
      select: { id: true },
    });
    staffByName.set(fullName, user.id);
  }
  console.log(`  staff: ${STAFF.length}`);

  const patientByFolder = new Map<string, string>();
  for (const [name, folderNumber, age, gender, ward] of PATIENTS) {
    const p = await prisma.patient.upsert({
      where: { folderNumber },
      update: {},
      create: { name, folderNumber, age, ageUnit: 'YEARS', gender, ward },
      select: { id: true },
    });
    patientByFolder.set(folderNumber, p.id);
  }
  console.log(`  patients: ${PATIENTS.length}`);

  let created = 0;
  for (const [folder, unit, subspecialty, procedureName, indication, time, duration, surgeon, consultant] of CASES) {
    const patientId = patientByFolder.get(folder)!;
    const exists = await prisma.surgery.findFirst({
      where: { patientId, scheduledDate: day },
      select: { id: true },
    });
    if (exists) continue;
    const theatre = await prisma.theatreSuite.findFirst({
      where: { location: UNITS.find((u) => u.name === unit)?.location },
      select: { id: true },
    });
    await prisma.surgery.create({
      data: {
        patientId,
        surgeonId: staffByName.get(surgeon) ?? null,
        surgeonName: surgeon,
        supervisingConsultantId: staffByName.get(consultant) ?? null,
        supervisingConsultantName: consultant,
        unit,
        subspecialty,
        location: UNITS.find((u) => u.name === unit)?.location ?? null,
        theatreId: theatre?.id ?? null,
        indication,
        procedureName,
        scheduledDate: day,
        scheduledTime: time,
        estimatedDuration: duration,
        surgeryType: 'ELECTIVE' as never,
        magnitude: 'MAJOR',
        anesthesiaType: 'GENERAL',
        status: 'SCHEDULED' as never,
        readinessStatus: 'PENDING_CHECKS',
        bookedByName: 'Rita Achebe',
        bookedById: staffByName.get('Rita Achebe') ?? null,
      },
    });
    created += 1;
  }
  console.log(`  surgeries: ${created}`);

  // A published anaesthetist roster, so the unit cards and the coverage screen
  // both have something real to show.
  const anaesthetists: Array<[string, string, string]> = [
    ['Ngozi Anyanwu', 'CONSULTANT', 'General Surgery'],
    ['Bola Fashola', 'REGISTRAR', 'General Surgery'],
    ['Ngozi Anyanwu', 'CONSULTANT', 'ENT (Otorhinolaryngology)'],
    ['Bola Fashola', 'REGISTRAR', 'Orthopaedics'],
    ['Ngozi Anyanwu', 'CONSULTANT', 'Cardiothoracic Surgery'],
    ['Bola Fashola', 'REGISTRAR', 'Obstetrics & Gynaecology'],
    ['Ngozi Anyanwu', 'CONSULTANT', 'Paediatric Surgery'],
    ['Bola Fashola', 'REGISTRAR', 'Ophthalmology'],
  ];
  let rosterRows = 0;
  for (const [name, seniority, subRole] of anaesthetists) {
    const userId = staffByName.get(name);
    if (!userId) continue;
    const exists = await prisma.roster.findFirst({
      where: { userId, date: day, subRole, staffCategory: 'ANAESTHETISTS' as never },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.roster.create({
      data: {
        userId,
        staffName: name,
        staffCategory: 'ANAESTHETISTS' as never,
        seniorityLevel: seniority,
        subRole,
        date: day,
        shift: 'MORNING' as never,
        status: 'PUBLISHED',
        uploadedBy: 'demo',
      },
    });
    rosterRows += 1;
  }
  console.log(`  anaesthetist roster rows: ${rosterRows}`);

  // One theatre allocation, so at least one card shows a full nursing team.
  const t1 = await prisma.theatreSuite.findFirst({ where: { name: 'Theatre 1' }, select: { id: true } });
  if (t1) {
    const has = await prisma.theatreAllocation.findFirst({
      where: { date: day, surgicalUnit: 'GS Unit IV' },
      select: { id: true },
    });
    if (!has) {
      await prisma.theatreAllocation.create({
        data: {
          theatreId: t1.id,
          date: day,
          surgicalUnit: 'GS Unit IV',
          scrubNurseId: staffByName.get('Sussan Okoro') ?? null,
          circulatingNurseId: staffByName.get('Grace Ibrahim') ?? null,
          anaestheticTechnicianId: staffByName.get('Peter Musa') ?? null,
          anaesthetistConsultantId: staffByName.get('Ngozi Anyanwu') ?? null,
          shift: 'MORNING' as never,
          allocationType: 'SURGERY' as never,
          startTime: new Date(day.getTime() + 8 * 60 * 60 * 1000),
          endTime: new Date(day.getTime() + 16 * 60 * 60 * 1000),
          allocatedBy: 'demo',
        },
      });
      console.log('  theatre allocation: 1');
    }
  }

  console.log('Demo data ready. Sign in as admin / admin123');
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
