/**
 * UNTH Theatre Management System — Database Seed
 *
 * Seeds ONLY the following baseline records:
 *   • Allow-listed admin users  (admin, douglas, ngozi.mbah)
 *   • Theatre suites
 *   • Inventory items (machines, devices, consumables)
 *
 * NO clinical staff (surgeons, anaesthetists, nurses, etc.) are seeded.
 * NO demo patients or surgeries are seeded.
 * Add real staff and clinical data through the application UI.
 */

import { PrismaClient, ItemCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

interface UserSeed {
  username: string;
  password: string;
  fullName: string;
  email: string;
  staffCode: string;
}

const ADMIN_USERS: UserSeed[] = [
  {
    username: 'admin',
    password: 'admin123',
    fullName: 'Super Administrator',
    email: 'admin@unth.edu.ng',
    staffCode: 'UNTH/ADM/001',
  },
  {
    username: 'douglas',
    password: 'blackvelvet',
    fullName: 'Douglas Administrator',
    email: 'douglas@unth.edu.ng',
    staffCode: 'UNTH/ADM/002',
  },
  {
    username: 'ngozi.mbah',
    password: 'changeme123',
    fullName: 'Ngozi Mbah',
    email: 'ngozi.mbah@unth.edu.ng',
    staffCode: 'UNTH/ADM/003',
  },
];

async function main() {
  console.log('Starting baseline database seed (admins + theatres + inventory only)…\n');

  // === 1. Admin users (allow-list only — no hardcoded clinical staff) ===
  for (const u of ADMIN_USERS) {
    const hashed = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { username: u.username },
      update: { status: 'APPROVED', role: 'ADMIN' },
      create: {
        username: u.username,
        email: u.email,
        password: hashed,
        fullName: u.fullName,
        role: 'ADMIN',
        status: 'APPROVED',
        staffCode: u.staffCode,
        isFirstLogin: false,
        mustChangePassword: u.username === 'ngozi.mbah',
      },
    });
    console.log(`✓ Admin upserted: ${u.username} (${u.fullName})`);
  }

  // === 2. Inventory items ===
  const inventoryItems = [
    // MACHINES
    { name: 'Anesthesia Machine Model X1', category: ItemCategory.MACHINE, description: 'Modern anesthesia delivery system with ventilator', unitCostPrice: 5000000, quantity: 3, reorderLevel: 1, supplier: 'MedEquip Global', deviceId: 'ANESTH-X1-001', maintenanceIntervalDays: 90, halfLife: 10, depreciationRate: 10 },
    { name: 'Patient Monitor LifeSign Pro', category: ItemCategory.MACHINE, description: 'Multi-parameter patient monitoring system', unitCostPrice: 2500000, quantity: 5, reorderLevel: 2, supplier: 'MedTech Solutions', deviceId: 'MON-LSP-001', maintenanceIntervalDays: 180, halfLife: 8, depreciationRate: 12.5 },
    { name: 'Surgical Diathermy Unit', category: ItemCategory.MACHINE, description: 'Electrosurgical unit for cutting and coagulation', unitCostPrice: 1500000, quantity: 4, reorderLevel: 1, supplier: 'SurgiTech Inc', deviceId: 'DIAT-001', maintenanceIntervalDays: 90, halfLife: 7, depreciationRate: 14.3 },
    { name: 'Suction Machine Portable', category: ItemCategory.MACHINE, description: 'Portable surgical suction apparatus', unitCostPrice: 800000, quantity: 6, reorderLevel: 2, supplier: 'Medical Supplies Ltd', deviceId: 'SUCT-PORT-001', maintenanceIntervalDays: 60, halfLife: 5, depreciationRate: 20 },
    { name: 'C-Arm Fluoroscopy System', category: ItemCategory.MACHINE, description: 'Mobile X-ray imaging system', unitCostPrice: 15000000, quantity: 2, reorderLevel: 1, supplier: 'Imaging Systems Corp', deviceId: 'CARM-001', maintenanceIntervalDays: 120, halfLife: 12, depreciationRate: 8.3 },

    // DEVICES
    { name: 'Surgical Scissors Set', category: ItemCategory.DEVICE, description: 'Stainless steel surgical scissors - various sizes', unitCostPrice: 8000, quantity: 25, reorderLevel: 5, supplier: 'Surgical Tools Co', deviceId: 'SCIS-SET-001', halfLife: 3, depreciationRate: 33.3 },
    { name: 'Scalpel Handles (Box of 10)', category: ItemCategory.DEVICE, description: 'Reusable scalpel handles size 3 and 4', unitCostPrice: 12000, quantity: 15, reorderLevel: 5, supplier: 'Surgical Tools Co', deviceId: 'SCAL-HAND-001', halfLife: 2, depreciationRate: 50 },
    { name: 'Forceps Set', category: ItemCategory.DEVICE, description: 'Assorted surgical forceps', unitCostPrice: 20000, quantity: 20, reorderLevel: 5, supplier: 'Surgical Tools Co', deviceId: 'FORC-SET-001', halfLife: 3, depreciationRate: 33.3 },
    { name: 'Laryngoscope Set', category: ItemCategory.DEVICE, description: 'Complete laryngoscope set with blades', unitCostPrice: 45000, quantity: 8, reorderLevel: 3, supplier: 'Anesthesia Equipment Ltd', deviceId: 'LARY-SET-001', maintenanceIntervalDays: 180, halfLife: 5, depreciationRate: 20 },
    { name: 'Pulse Oximeter Finger', category: ItemCategory.DEVICE, description: 'Portable pulse oximeter', unitCostPrice: 15000, quantity: 12, reorderLevel: 4, supplier: 'MedTech Solutions', deviceId: 'PULSEOX-001', maintenanceIntervalDays: 365, halfLife: 3, depreciationRate: 33.3 },

    // CONSUMABLES
    { name: 'Surgical Gloves Sterile Size 7.5 (Box of 50 pairs)', category: ItemCategory.CONSUMABLE, description: 'Latex surgical gloves sterile', unitCostPrice: 5000, quantity: 100, reorderLevel: 20, supplier: 'Medical Supplies Ltd', batchNumber: 'GLOVE-2024-001', manufacturingDate: new Date('2024-01-01'), expiryDate: new Date('2026-01-01') },
    { name: 'Suture Kit Vicryl 2-0', category: ItemCategory.CONSUMABLE, description: 'Absorbable suture kit', unitCostPrice: 15000, quantity: 50, reorderLevel: 10, supplier: 'SurgiTech Inc', batchNumber: 'SUTURE-2024-005', manufacturingDate: new Date('2024-03-01'), expiryDate: new Date('2027-03-01') },
    { name: 'Gauze Pads 4x4 Sterile (Pack of 100)', category: ItemCategory.CONSUMABLE, description: 'Sterile gauze pads', unitCostPrice: 3000, quantity: 200, reorderLevel: 30, supplier: 'Medical Supplies Ltd', batchNumber: 'GAUZE-2024-002', manufacturingDate: new Date('2024-02-01'), expiryDate: new Date('2026-02-01') },
    { name: 'Scalpel Blades #10 (Box of 100)', category: ItemCategory.CONSUMABLE, description: 'Disposable sterile scalpel blades', unitCostPrice: 8000, quantity: 80, reorderLevel: 15, supplier: 'Surgical Tools Co', batchNumber: 'BLADE-2024-010', manufacturingDate: new Date('2024-04-01'), expiryDate: new Date('2029-04-01') },
    { name: 'Surgical Masks (Box of 50)', category: ItemCategory.CONSUMABLE, description: 'Disposable surgical face masks', unitCostPrice: 2000, quantity: 150, reorderLevel: 25, supplier: 'Medical Supplies Ltd', batchNumber: 'MASK-2024-003', manufacturingDate: new Date('2024-01-15'), expiryDate: new Date('2026-01-15') },
    { name: 'IV Cannula 18G (Box of 50)', category: ItemCategory.CONSUMABLE, description: 'Intravenous cannula', unitCostPrice: 10000, quantity: 60, reorderLevel: 15, supplier: 'Medical Supplies Ltd', batchNumber: 'CANN-2024-018', manufacturingDate: new Date('2024-05-01'), expiryDate: new Date('2027-05-01') },
    { name: 'Endotracheal Tube 7.5mm (Pack of 10)', category: ItemCategory.CONSUMABLE, description: 'Disposable endotracheal tubes', unitCostPrice: 25000, quantity: 40, reorderLevel: 10, supplier: 'Anesthesia Equipment Ltd', batchNumber: 'ETT-2024-075', manufacturingDate: new Date('2024-06-01'), expiryDate: new Date('2029-06-01') },
  ];

  for (const item of inventoryItems) {
    const created = await prisma.inventoryItem.upsert({
      where: { id: `${item.name}-test` },
      update: {},
      create: item as any,
    });
    console.log(`✓ Inventory item upserted: ${created.name}`);
  }

  // === 3. Theatre suites ===
  const theatres = [
    { name: 'THEATRE 1 (VAMED)', location: 'VAMED Complex, Ground Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Anesthesia Machine','Patient Monitor','Surgical Lights','Suction Machine','Electrocautery']), status: 'AVAILABLE' },
    { name: 'THEATRE 2 (VAMED)', location: 'VAMED Complex, Ground Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Anesthesia Machine','Patient Monitor','Surgical Lights','Suction Machine','C-Arm']), status: 'AVAILABLE' },
    { name: 'THEATRE 3 (VAMED)', location: 'VAMED Complex, Ground Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Anesthesia Machine','Patient Monitor','Surgical Lights','Suction Machine']), status: 'AVAILABLE' },
    { name: 'THEATRE 4 (VAMED)', location: 'VAMED Complex, Ground Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Anesthesia Machine','Patient Monitor','Surgical Lights','Suction Machine']), status: 'AVAILABLE' },
    { name: 'THEATRE 5 (VAMED)', location: 'VAMED Complex, Ground Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Anesthesia Machine','Patient Monitor','Surgical Lights','Suction Machine']), status: 'AVAILABLE' },
    { name: 'SUITE 1 (NIGERIAN SIDE)', location: 'Nigerian Complex, 2nd Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Anesthesia Machine','Patient Monitor','Surgical Lights']), status: 'AVAILABLE' },
    { name: 'SUITE 2 (NIGERIAN SIDE)', location: 'Nigerian Complex, 2nd Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Anesthesia Machine','Patient Monitor','Surgical Lights']), status: 'AVAILABLE' },
    { name: 'SUITE 3 (NIGERIAN SIDE)', location: 'Nigerian Complex, 2nd Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Anesthesia Machine','Patient Monitor','Surgical Lights']), status: 'AVAILABLE' },
    { name: 'SUITE 4 (NIGERIAN SIDE)', location: 'Nigerian Complex, 2nd Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Anesthesia Machine','Patient Monitor','Surgical Lights']), status: 'AVAILABLE' },
    { name: 'NEUROSURGERY THEATRE', location: 'Neurosurgery Wing, 1st Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Anesthesia Machine','Patient Monitor','Surgical Lights','Neurosurgical Microscope','Craniotomy Set']), status: 'AVAILABLE' },
    { name: 'EMERGENCY THEATRE', location: 'Emergency Wing, 1st Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Portable Anesthesia','Patient Monitor','Emergency Cart','Defibrillator']), status: 'AVAILABLE' },
    { name: 'CTU THEATRE', location: 'Cardiothoracic Unit, Ground Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Anesthesia Machine','Patient Monitor','Surgical Lights','Heart-Lung Machine','TEE Machine']), status: 'AVAILABLE' },
    { name: 'EYE THEATRE', location: 'Ophthalmology Wing, 1st Floor', capacity: 1, equipment: JSON.stringify(['Operating Table','Anesthesia Machine','Patient Monitor','Surgical Lights','Phaco Machine','Operating Microscope']), status: 'AVAILABLE' },
  ];

  for (const theatre of theatres) {
    const created = await prisma.theatreSuite.upsert({
      where: { name: theatre.name },
      update: {},
      create: theatre as any,
    });
    console.log(`✓ Theatre suite upserted: ${created.name}`);
  }

  console.log('\n✅ Baseline seeding completed.');
  console.log('\n📋 Login credentials:');
  ADMIN_USERS.forEach(u => console.log(`   ${u.username.padEnd(20)} / ${u.password}`));
  console.log('\nNo clinical staff or demo surgeries were created. Register all real');
  console.log('users (surgeons, anaesthetists, nurses, etc.) through the application UI.');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
