-- The three milestones the duration calculations were missing.
--
-- Added to the EXISTING PatientMovementPhase rather than a parallel milestone
-- table: a second timeline for the same patient would immediately start
-- disagreeing with the first, and nobody could say which was right.
--
-- Additive only. Every existing phase is untouched, so movement history already
-- recorded stays valid and readable.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PatientMovementPhase" ADD VALUE 'ANAESTHESIA_STARTED';
ALTER TYPE "PatientMovementPhase" ADD VALUE 'WHO_TIMEOUT_COMPLETED';
ALTER TYPE "PatientMovementPhase" ADD VALUE 'DRESSING_COMPLETED';

