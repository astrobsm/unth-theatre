/**
 * UNTH Theatre Management System
 * Ensure Admin User Exists Script
 * 
 * This script ensures an admin user exists in the database.
 * Can be run during deployment or manually.
 * 
 * Usage: npx ts-node scripts/ensure-admin.ts
 * Or: node -r ts-node/register scripts/ensure-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

interface AdminConfig {
  username: string;
  password: string;
  fullName: string;
  email: string;
  staffCode: string;
}

const ADMIN_USERS: AdminConfig[] = [
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

async function ensureAdminExists() {
  console.log('🔐 Ensuring admin users exist...\n');

  for (const adminConfig of ADMIN_USERS) {
    try {
      const existingUser = await prisma.user.findUnique({
        where: { username: adminConfig.username },
      });

      if (existingUser) {
        console.log(`✅ User '${adminConfig.username}' already exists`);
        
        // Ensure user is approved
        if (existingUser.status !== 'APPROVED') {
          await prisma.user.update({
            where: { username: adminConfig.username },
            data: { status: 'APPROVED' },
          });
          console.log(`   → Updated status to APPROVED`);
        }
      } else {
        // Create new admin user
        const hashedPassword = await bcrypt.hash(adminConfig.password, 10);
        
        await prisma.user.create({
          data: {
            username: adminConfig.username,
            password: hashedPassword,
            fullName: adminConfig.fullName,
            email: adminConfig.email,
            role: 'ADMIN',
            status: 'APPROVED',
            staffCode: adminConfig.staffCode,
          },
        });
        
        console.log(`✅ Created user '${adminConfig.username}'`);
        console.log(`   → Password: ${adminConfig.password}`);
      }
    } catch (error) {
      console.error(`❌ Error processing user '${adminConfig.username}':`, error);
    }
  }

  console.log('\n📋 Admin Login Credentials:');
  console.log('━'.repeat(50));
  for (const admin of ADMIN_USERS) {
    console.log(`   Username: ${admin.username}`);
    console.log(`   Password: ${admin.password}`);
    console.log('━'.repeat(50));
  }
}

async function main() {
  try {
    await ensureAdminExists();
    console.log('\n✅ Admin user setup complete!');
  } catch (error) {
    console.error('❌ Failed to ensure admin exists:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
