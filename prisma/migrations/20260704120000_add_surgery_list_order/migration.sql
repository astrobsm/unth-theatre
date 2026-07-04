-- Migration: Add manual list ordering to surgeries (booked-surgery list order).

ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "listOrder" INTEGER;
