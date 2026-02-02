import { PrismaClient, ItemCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting comprehensive database seed...');

  // Create 5 users for each role (14 roles total)
  const defaultPassword = await bcrypt.hash('test123', 10);
  
  const roles = [
    'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
    'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE',
    'THEATRE_STORE_KEEPER', 'PORTER', 'ANAESTHETIC_TECHNICIAN',
    'BIOMEDICAL_ENGINEER', 'CLEANER', 'PROCUREMENT_OFFICER'
  ];

  const nameTemplates = {
    ADMIN: ['Admin One', 'Admin Two', 'Admin Three', 'Admin Four', 'Admin Five'],
    SYSTEM_ADMINISTRATOR: ['SysAdmin One', 'SysAdmin Two', 'SysAdmin Three', 'SysAdmin Four', 'SysAdmin Five'],
    THEATRE_MANAGER: ['Manager One', 'Manager Two', 'Manager Three', 'Manager Four', 'Manager Five'],
    THEATRE_CHAIRMAN: ['Chairman One', 'Chairman Two', 'Chairman Three', 'Chairman Four', 'Chairman Five'],
    SURGEON: ['Dr. Emeka Okafor', 'Dr. Adaeze Nwankwo', 'Dr. Chidi Eze', 'Dr. Amina Bello', 'Dr. Tunde Adebayo'],
    ANAESTHETIST: ['Dr. Ngozi Okoro', 'Dr. Uche Nwosu', 'Dr. Kemi Ajayi', 'Dr. Yemi Oladele', 'Dr. Bisi Adeyemi'],
    SCRUB_NURSE: ['Nurse Chioma Ike', 'Nurse Fatima Musa', 'Nurse Grace Obi', 'Nurse Joy Nkem', 'Nurse Peace Udo'],
    RECOVERY_ROOM_NURSE: ['Nurse Mary Chukwu', 'Nurse Ruth Ojo', 'Nurse Esther Bala', 'Nurse Sarah Okon', 'Nurse Janet Eze'],
    THEATRE_STORE_KEEPER: ['Store Keeper One', 'Store Keeper Two', 'Store Keeper Three', 'Store Keeper Four', 'Store Keeper Five'],
    PORTER: ['Porter John', 'Porter James', 'Porter David', 'Porter Samuel', 'Porter Michael'],
    ANAESTHETIC_TECHNICIAN: ['Tech Musa Ibrahim', 'Tech Ali Hassan', 'Tech Ahmed Yusuf', 'Tech Sule Mohammed', 'Tech Ibrahim Salisu'],
    BIOMEDICAL_ENGINEER: ['Eng. Chinedu Obi', 'Eng. Oluwaseun Balogun', 'Eng. Nkechi Okeke', 'Eng. Victor Ibe', 'Eng. Ifeanyi Nnamdi'],
    CLEANER: ['Cleaner Grace', 'Cleaner Mercy', 'Cleaner Faith', 'Cleaner Hope', 'Cleaner Joy'],
    PROCUREMENT_OFFICER: ['Procurement Officer One', 'Procurement Officer Two', 'Procurement Officer Three', 'Procurement Officer Four', 'Procurement Officer Five']
  };

  let userCount = 0;
  const createdUsers: any = {};

  for (const role of roles) {
    createdUsers[role] = [];
    const names = nameTemplates[role as keyof typeof nameTemplates];
    
    for (let i = 0; i < 5; i++) {
      const username = `${role.toLowerCase()}_${i + 1}`;
      const staffCode = `UNTH/${role.substring(0, 3).toUpperCase()}/${Date.now()}-${i + 1}`;
      
      const user = await prisma.user.upsert({
        where: { username },
        update: {},
        create: {
          username,
          email: `${username}@unth.edu.ng`,
          password: defaultPassword,
          fullName: names[i],
          role: role as any,
          status: 'APPROVED',
          staffCode,
        },
      });
      createdUsers[role].push(user);
      userCount++;
    }
    console.log(`✓ Created 5 ${role} users`);
  }


  console.log(`✓ Total users created: ${userCount}`);

  // Create 5 comprehensive patients with detailed information
  const patients = [
    {
      name: 'Chukwu Emeka Samuel',
      folderNumber: 'UNTH/2024/00001',
      ptNumber: 'PT2024001',
      age: 45,
      gender: 'Male',
      ward: 'Surgical Ward A',
    },
    {
      name: 'Okonkwo Adaeze Grace',
      folderNumber: 'UNTH/2024/00002',
      ptNumber: 'PT2024002',
      age: 32,
      gender: 'Female',
      ward: 'Surgical Ward B',
    },
    {
      name: 'Nwosu Chidinma Joy',
      folderNumber: 'UNTH/2024/00003',
      ptNumber: 'PT2024003',
      age: 28,
      gender: 'Female',
      ward: 'Gynecology Ward',
    },
    {
      name: 'Bello Ahmed Musa',
      folderNumber: 'UNTH/2024/00004',
      ptNumber: 'PT2024004',
      age: 58,
      gender: 'Male',
      ward: 'Surgical Ward C',
    },
    {
      name: 'Adebayo Funmilayo Ruth',
      folderNumber: 'UNTH/2024/00005',
      ptNumber: 'PT2024005',
      age: 41,
      gender: 'Female',
      ward: 'Surgical Ward A',
    },
  ];

  const createdPatients: any = [];
  for (const patient of patients) {
    const created = await prisma.patient.upsert({
      where: { folderNumber: patient.folderNumber },
      update: {},
      create: patient,
    });
    createdPatients.push(created);
    console.log(`✓ Patient created: ${created.name}`);
  }


  // Create comprehensive inventory items (5+ per category)
  const inventoryItems = [
    // MACHINES
    {
      name: 'Anesthesia Machine Model X1',
      category: ItemCategory.MACHINE,
      description: 'Modern anesthesia delivery system with ventilator',
      unitCostPrice: 5000000,
      quantity: 3,
      reorderLevel: 1,
      supplier: 'MedEquip Global',
      deviceId: 'ANESTH-X1-001',
      maintenanceIntervalDays: 90,
      halfLife: 10,
      depreciationRate: 10,
    },
    {
      name: 'Patient Monitor LifeSign Pro',
      category: ItemCategory.MACHINE,
      description: 'Multi-parameter patient monitoring system',
      unitCostPrice: 2500000,
      quantity: 5,
      reorderLevel: 2,
      supplier: 'MedTech Solutions',
      deviceId: 'MON-LSP-001',
      maintenanceIntervalDays: 180,
      halfLife: 8,
      depreciationRate: 12.5,
    },
    {
      name: 'Surgical Diathermy Unit',
      category: ItemCategory.MACHINE,
      description: 'Electrosurgical unit for cutting and coagulation',
      unitCostPrice: 1500000,
      quantity: 4,
      reorderLevel: 1,
      supplier: 'SurgiTech Inc',
      deviceId: 'DIAT-001',
      maintenanceIntervalDays: 90,
      halfLife: 7,
      depreciationRate: 14.3,
    },
    {
      name: 'Suction Machine Portable',
      category: ItemCategory.MACHINE,
      description: 'Portable surgical suction apparatus',
      unitCostPrice: 800000,
      quantity: 6,
      reorderLevel: 2,
      supplier: 'Medical Supplies Ltd',
      deviceId: 'SUCT-PORT-001',
      maintenanceIntervalDays: 60,
      halfLife: 5,
      depreciationRate: 20,
    },
    {
      name: 'C-Arm Fluoroscopy System',
      category: ItemCategory.MACHINE,
      description: 'Mobile X-ray imaging system',
      unitCostPrice: 15000000,
      quantity: 2,
      reorderLevel: 1,
      supplier: 'Imaging Systems Corp',
      deviceId: 'CARM-001',
      maintenanceIntervalDays: 120,
      halfLife: 12,
      depreciationRate: 8.3,
    },

    // DEVICES
    {
      name: 'Surgical Scissors Set',
      category: ItemCategory.DEVICE,
      description: 'Stainless steel surgical scissors - various sizes',
      unitCostPrice: 8000,
      quantity: 25,
      reorderLevel: 5,
      supplier: 'Surgical Tools Co',
      deviceId: 'SCIS-SET-001',
      halfLife: 3,
      depreciationRate: 33.3,
    },
    {
      name: 'Scalpel Handles (Box of 10)',
      category: ItemCategory.DEVICE,
      description: 'Reusable scalpel handles size 3 and 4',
      unitCostPrice: 12000,
      quantity: 15,
      reorderLevel: 5,
      supplier: 'Surgical Tools Co',
      deviceId: 'SCAL-HAND-001',
      halfLife: 2,
      depreciationRate: 50,
    },
    {
      name: 'Forceps Set',
      category: ItemCategory.DEVICE,
      description: 'Assorted surgical forceps',
      unitCostPrice: 20000,
      quantity: 20,
      reorderLevel: 5,
      supplier: 'Surgical Tools Co',
      deviceId: 'FORC-SET-001',
      halfLife: 3,
      depreciationRate: 33.3,
    },
    {
      name: 'Laryngoscope Set',
      category: ItemCategory.DEVICE,
      description: 'Complete laryngoscope set with blades',
      unitCostPrice: 45000,
      quantity: 8,
      reorderLevel: 3,
      supplier: 'Anesthesia Equipment Ltd',
      deviceId: 'LARY-SET-001',
      maintenanceIntervalDays: 180,
      halfLife: 5,
      depreciationRate: 20,
    },
    {
      name: 'Pulse Oximeter Finger',
      category: ItemCategory.DEVICE,
      description: 'Portable pulse oximeter',
      unitCostPrice: 15000,
      quantity: 12,
      reorderLevel: 4,
      supplier: 'MedTech Solutions',
      deviceId: 'PULSEOX-001',
      maintenanceIntervalDays: 365,
      halfLife: 3,
      depreciationRate: 33.3,
    },

    // CONSUMABLES
    {
      name: 'Surgical Gloves Sterile Size 7.5 (Box of 50 pairs)',
      category: ItemCategory.CONSUMABLE,
      description: 'Latex surgical gloves sterile',
      unitCostPrice: 5000,
      quantity: 100,
      reorderLevel: 20,
      supplier: 'Medical Supplies Ltd',
      batchNumber: 'GLOVE-2024-001',
      manufacturingDate: new Date('2024-01-01'),
      expiryDate: new Date('2026-01-01'),
    },
    {
      name: 'Suture Kit Vicryl 2-0',
      category: ItemCategory.CONSUMABLE,
      description: 'Absorbable suture kit',
      unitCostPrice: 15000,
      quantity: 50,
      reorderLevel: 10,
      supplier: 'SurgiTech Inc',
      batchNumber: 'SUTURE-2024-005',
      manufacturingDate: new Date('2024-03-01'),
      expiryDate: new Date('2027-03-01'),
    },
    {
      name: 'Gauze Pads 4x4 Sterile (Pack of 100)',
      category: ItemCategory.CONSUMABLE,
      description: 'Sterile gauze pads',
      unitCostPrice: 3000,
      quantity: 200,
      reorderLevel: 30,
      supplier: 'Medical Supplies Ltd',
      batchNumber: 'GAUZE-2024-002',
      manufacturingDate: new Date('2024-02-01'),
      expiryDate: new Date('2026-02-01'),
    },
    {
      name: 'Scalpel Blades #10 (Box of 100)',
      category: ItemCategory.CONSUMABLE,
      description: 'Disposable sterile scalpel blades',
      unitCostPrice: 8000,
      quantity: 80,
      reorderLevel: 15,
      supplier: 'Surgical Tools Co',
      batchNumber: 'BLADE-2024-010',
      manufacturingDate: new Date('2024-04-01'),
      expiryDate: new Date('2029-04-01'),
    },
    {
      name: 'Surgical Masks (Box of 50)',
      category: ItemCategory.CONSUMABLE,
      description: 'Disposable surgical face masks',
      unitCostPrice: 2000,
      quantity: 150,
      reorderLevel: 25,
      supplier: 'Medical Supplies Ltd',
      batchNumber: 'MASK-2024-003',
      manufacturingDate: new Date('2024-01-15'),
      expiryDate: new Date('2026-01-15'),
    },
    {
      name: 'IV Cannula 18G (Box of 50)',
      category: ItemCategory.CONSUMABLE,
      description: 'Intravenous cannula',
      unitCostPrice: 10000,
      quantity: 60,
      reorderLevel: 15,
      supplier: 'Medical Supplies Ltd',
      batchNumber: 'CANN-2024-018',
      manufacturingDate: new Date('2024-05-01'),
      expiryDate: new Date('2027-05-01'),
    },
    {
      name: 'Endotracheal Tube 7.5mm (Pack of 10)',
      category: ItemCategory.CONSUMABLE,
      description: 'Disposable endotracheal tubes',
      unitCostPrice: 25000,
      quantity: 40,
      reorderLevel: 10,
      supplier: 'Anesthesia Equipment Ltd',
      batchNumber: 'ETT-2024-075',
      manufacturingDate: new Date('2024-06-01'),
      expiryDate: new Date('2029-06-01'),
    },
  ];

  for (const item of inventoryItems) {
    const created = await prisma.inventoryItem.upsert({
      where: { id: `${item.name}-test` },
      update: {},
      create: item as any,
    });
    console.log(`✓ Inventory item created: ${created.name}`);
  }

  // Create theatre suites - all standard UNTH theatres
  const theatres = [
    {
      name: 'THEATRE 1 (VAMED)',
      location: 'VAMED Complex, Ground Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
        'Suction Machine',
        'Electrocautery',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'THEATRE 2 (VAMED)',
      location: 'VAMED Complex, Ground Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
        'Suction Machine',
        'C-Arm',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'THEATRE 3 (VAMED)',
      location: 'VAMED Complex, Ground Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
        'Suction Machine',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'THEATRE 4 (VAMED)',
      location: 'VAMED Complex, Ground Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
        'Suction Machine',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'THEATRE 5 (VAMED)',
      location: 'VAMED Complex, Ground Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
        'Suction Machine',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'SUITE 1 (NIGERIAN SIDE)',
      location: 'Nigerian Complex, 2nd Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'SUITE 2 (NIGERIAN SIDE)',
      location: 'Nigerian Complex, 2nd Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'SUITE 3 (NIGERIAN SIDE)',
      location: 'Nigerian Complex, 2nd Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'SUITE 4 (NIGERIAN SIDE)',
      location: 'Nigerian Complex, 2nd Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'NEUROSURGERY THEATRE',
      location: 'Neurosurgery Wing, 1st Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
        'Neurosurgical Microscope',
        'Craniotomy Set',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'EMERGENCY THEATRE',
      location: 'Emergency Wing, 1st Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Portable Anesthesia',
        'Patient Monitor',
        'Emergency Cart',
        'Defibrillator',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'CTU THEATRE',
      location: 'Cardiothoracic Unit, Ground Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
        'Heart-Lung Machine',
        'TEE Machine',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'EYE THEATRE',
      location: 'Ophthalmology Wing, 1st Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
        'Phaco Machine',
        'Operating Microscope',
      ]),
      status: 'AVAILABLE',
    },
  ];

  for (const theatre of theatres) {
    const created = await prisma.theatreSuite.upsert({
      where: { name: theatre.name },
      update: {},
      create: theatre as any,
    });
    console.log(`✓ Theatre suite created: ${created.name}`);
  }

  // Create 5 surgeries with complete data
  const today = new Date();
  const surgeries = [
    {
      patientId: createdPatients[0].id,
      surgeonId: createdUsers.SURGEON[0].id,
      anesthetistId: createdUsers.ANAESTHETIST[0].id,
      procedureName: 'Appendectomy',
      subspecialty: 'General Surgery',
      unit: 'General Surgery Unit',
      indication: 'Acute appendicitis',
      scheduledDate: new Date(today.getTime() + 24 * 60 * 60 * 1000), // Tomorrow
      scheduledTime: '08:00',
      surgeryType: 'ELECTIVE' as const,
      readinessStatus: 'READY' as const,
      status: 'SCHEDULED' as const,
    },
    {
      patientId: createdPatients[1].id,
      surgeonId: createdUsers.SURGEON[1].id,
      anesthetistId: createdUsers.ANAESTHETIST[1].id,
      procedureName: 'Myomectomy',
      subspecialty: 'Obstetrics and Gynecology',
      unit: 'Gynecology Unit',
      indication: 'Symptomatic uterine fibroids',
      scheduledDate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000),
      scheduledTime: '10:00',
      surgeryType: 'ELECTIVE' as const,
      readinessStatus: 'READY' as const,
      status: 'SCHEDULED' as const,
    },
    {
      patientId: createdPatients[2].id,
      surgeonId: createdUsers.SURGEON[2].id,
      anesthetistId: createdUsers.ANAESTHETIST[2].id,
      procedureName: 'Ovarian Cystectomy',
      subspecialty: 'Obstetrics and Gynecology',
      unit: 'Gynecology Unit',
      indication: 'Large ovarian cyst causing pain',
      scheduledDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000),
      scheduledTime: '09:00',
      surgeryType: 'ELECTIVE' as const,
      readinessStatus: 'READY' as const,
      status: 'SCHEDULED' as const,
    },
    {
      patientId: createdPatients[3].id,
      surgeonId: createdUsers.SURGEON[3].id,
      anesthetistId: createdUsers.ANAESTHETIST[3].id,
      procedureName: 'Inguinal Hernia Repair',
      subspecialty: 'General Surgery',
      unit: 'General Surgery Unit',
      indication: 'Reducible right inguinal hernia',
      scheduledDate: new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000),
      scheduledTime: '08:30',
      surgeryType: 'ELECTIVE' as const,
      readinessStatus: 'READY' as const,
      status: 'SCHEDULED' as const,
    },
    {
      patientId: createdPatients[4].id,
      surgeonId: createdUsers.SURGEON[4].id,
      anesthetistId: createdUsers.ANAESTHETIST[4].id,
      procedureName: 'Laparoscopic Cholecystectomy',
      subspecialty: 'General Surgery',
      unit: 'General Surgery Unit',
      indication: 'Symptomatic cholelithiasis',
      scheduledDate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000),
      scheduledTime: '11:00',
      surgeryType: 'ELECTIVE' as const,
      readinessStatus: 'READY' as const,
      status: 'SCHEDULED' as const,
    },
  ];

  const createdSurgeries: any = [];
  for (const surgery of surgeries) {
    const created = await prisma.surgery.create({
      data: surgery,
    });
    createdSurgeries.push(created);
    console.log(`✓ Surgery created: ${surgery.procedureName}`);
  }

  console.log('\n✅ Database seeding completed successfully!');
  console.log(`\n📊 Summary:`);
  console.log(`   - Users: ${userCount} (5 per role across 14 roles)`);
  console.log(`   - Patients: ${createdPatients.length}`);
  console.log(`   - Inventory Items: ${inventoryItems.length}`);
  console.log(`   - Theatre Suites: ${theatres.length}`);
  console.log(`   - Surgeries: ${createdSurgeries.length}`);
  console.log('\n🔑 Login Credentials:');
  console.log('   All users: username = [role]_1 to [role]_5, password = test123');
  console.log('   Examples:');
  console.log('     - admin_1 / test123');
  console.log('     - surgeon_1 / test123');
  console.log('     - theatre_store_keeper_1 / test123');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
