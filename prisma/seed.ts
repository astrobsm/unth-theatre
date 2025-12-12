import { PrismaClient, ItemCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@unth.edu.ng',
      password: adminPassword,
      fullName: 'System Administrator',
      role: 'ADMIN',
      status: 'APPROVED',
    },
  });
  console.log('✓ Admin user created:', admin.username);

  // Create theatre manager
  const managerPassword = await bcrypt.hash('manager123', 10);
  const manager = await prisma.user.upsert({
    where: { username: 'manager' },
    update: {},
    create: {
      username: 'manager',
      email: 'manager@unth.edu.ng',
      password: managerPassword,
      fullName: 'Theatre Manager',
      role: 'THEATRE_MANAGER',
      status: 'APPROVED',
    },
  });
  console.log('✓ Theatre manager created:', manager.username);

  // Create sample surgeon
  const surgeonPassword = await bcrypt.hash('surgeon123', 10);
  const surgeon = await prisma.user.upsert({
    where: { username: 'surgeon1' },
    update: {},
    create: {
      username: 'surgeon1',
      email: 'surgeon1@unth.edu.ng',
      password: surgeonPassword,
      fullName: 'Dr. John Doe',
      role: 'SURGEON',
      status: 'APPROVED',
    },
  });
  console.log('✓ Surgeon created:', surgeon.username);

  // Create sample inventory items
  const inventoryItems = [
    {
      name: 'Surgical Gloves (Box of 100)',
      category: ItemCategory.CONSUMABLE,
      description: 'Sterile latex surgical gloves',
      unitCostPrice: 5000,
      quantity: 50,
      reorderLevel: 10,
      supplier: 'Medical Supplies Ltd',
    },
    {
      name: 'Suture Kit',
      category: ItemCategory.CONSUMABLE,
      description: 'Complete suture kit with various sizes',
      unitCostPrice: 15000,
      quantity: 30,
      reorderLevel: 10,
      supplier: 'SurgiTech Inc',
    },
    {
      name: 'Anesthesia Machine',
      category: ItemCategory.MACHINE,
      description: 'Modern anesthesia delivery system',
      unitCostPrice: 5000000,
      quantity: 3,
      reorderLevel: 1,
      supplier: 'MedEquip Global',
    },
    {
      name: 'Surgical Scissors',
      category: ItemCategory.DEVICE,
      description: 'Stainless steel surgical scissors',
      unitCostPrice: 8000,
      quantity: 25,
      reorderLevel: 5,
      supplier: 'Surgical Tools Co',
    },
    {
      name: 'Gauze Pads (Pack of 50)',
      category: ItemCategory.CONSUMABLE,
      description: 'Sterile gauze pads',
      unitCostPrice: 3000,
      quantity: 100,
      reorderLevel: 20,
      supplier: 'Medical Supplies Ltd',
    },
  ];

  for (const item of inventoryItems) {
    const created = await prisma.inventoryItem.upsert({
      where: { id: `${item.name}-seed` },
      update: {},
      create: item,
    });
    console.log('✓ Inventory item created:', created.name);
  }

  // Create sample patients
  const patients = [
    {
      name: 'Chukwu Emeka',
      folderNumber: 'UNTH/2024/001',
      ptNumber: 'PT001234',
      age: 45,
      gender: 'Male',
      ward: 'Surgical Ward A',
    },
    {
      name: 'Okonkwo Adaeze',
      folderNumber: 'UNTH/2024/002',
      ptNumber: 'PT001235',
      age: 32,
      gender: 'Female',
      ward: 'Surgical Ward B',
    },
    {
      name: 'Nwosu Chidinma',
      folderNumber: 'UNTH/2024/003',
      ptNumber: 'PT001236',
      age: 28,
      gender: 'Female',
      ward: 'Gynecology Ward',
    },
  ];

  for (const patient of patients) {
    const created = await prisma.patient.upsert({
      where: { folderNumber: patient.folderNumber },
      update: {},
      create: patient,
    });
    console.log('✓ Patient created:', created.name);
  }

  // Create sample theatre suites
  const theatres = [
    {
      name: 'Theatre 1',
      location: 'Main Building, 2nd Floor',
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
      name: 'Theatre 2',
      location: 'Main Building, 2nd Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Anesthesia Machine',
        'Patient Monitor',
        'Surgical Lights',
        'C-Arm',
      ]),
      status: 'AVAILABLE',
    },
    {
      name: 'Emergency Theatre',
      location: 'Emergency Wing, 1st Floor',
      capacity: 1,
      equipment: JSON.stringify([
        'Operating Table',
        'Portable Anesthesia',
        'Patient Monitor',
        'Emergency Cart',
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
    console.log('✓ Theatre suite created:', created.name);
  }

  console.log('\n✅ Database seeding completed successfully!');
  console.log('\nDefault credentials:');
  console.log('  Admin: admin / admin123');
  console.log('  Manager: manager / manager123');
  console.log('  Surgeon: surgeon1 / surgeon123');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
