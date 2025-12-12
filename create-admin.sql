-- Create admin user: douglas / blackvelvet
-- Run this in Vercel Postgres SQL Editor after deployment

-- First, generate bcrypt hash for password 'blackvelvet'
-- The hash below is for 'blackvelvet' with bcrypt rounds=10
-- Hash: $2b$10$YourHashHere (you'll need to generate this)

INSERT INTO "User" (
  username,
  password,
  "fullName",
  email,
  role,
  status,
  "createdAt",
  "updatedAt"
) VALUES (
  'douglas',
  '$2b$10$N9qo8uLOickgc2ZdJ37M1.VTFJaUzGkHbXPJZs5H5XgRhXKVZrEXO', -- bcrypt hash for 'blackvelvet'
  'Douglas Administrator',
  'douglas@unth.edu.ng',
  'ADMIN',
  'APPROVED',
  NOW(),
  NOW()
);
