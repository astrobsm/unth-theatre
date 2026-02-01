-- ============================================
-- UNTH Theatre Management System
-- Production Admin User Creation Script
-- ============================================
-- Run this in Vercel Postgres SQL Editor:
-- Dashboard → Project → Storage → Postgres → Query
-- ============================================

-- Create Super Admin user
-- Username: admin
-- Password: admin123
INSERT INTO "User" (
  id,
  username,
  password,
  "fullName",
  email,
  role,
  status,
  "staffCode",
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid(),
  'admin',
  '$2a$10$SAiOM0nQ2jM8tXif2lFzZOxa0c9VAi2Z1aEBO37853.DVATS/XDmG',
  'Super Administrator',
  'admin@unth.edu.ng',
  'ADMIN',
  'APPROVED',
  'UNTH/ADM/001',
  NOW(),
  NOW()
)
ON CONFLICT (username) DO UPDATE SET
  password = '$2a$10$SAiOM0nQ2jM8tXif2lFzZOxa0c9VAi2Z1aEBO37853.DVATS/XDmG',
  status = 'APPROVED',
  "updatedAt" = NOW();

-- Create backup admin (douglas / blackvelvet)
INSERT INTO "User" (
  id,
  username,
  password,
  "fullName",
  email,
  role,
  status,
  "staffCode",
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid(),
  'douglas',
  '$2a$10$EEHLJ.gAE13TBSNV6WkA2eXAVsGF3qzxObmjXQ96YX693zlvWuH16',
  'Douglas Administrator',
  'douglas@unth.edu.ng',
  'ADMIN',
  'APPROVED',
  'UNTH/ADM/002',
  NOW(),
  NOW()
)
ON CONFLICT (username) DO UPDATE SET
  password = '$2a$10$EEHLJ.gAE13TBSNV6WkA2eXAVsGF3qzxObmjXQ96YX693zlvWuH16',
  status = 'APPROVED',
  "updatedAt" = NOW();

-- Verify users were created
SELECT id, username, "fullName", role, status, "createdAt" 
FROM "User" 
WHERE role = 'ADMIN';
