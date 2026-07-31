-- Administrative reopening of an approved retirement is its own audit action,
-- so an auditor can list every override without reading free-text notes.
--
-- The generated diff also proposed dropping the `updatedAt` default on four
-- unrelated theatre tables (daily_first_case_sending, device_tokens,
-- walkie_talkie_logs, wards). That is pre-existing drift, nothing to do with
-- the imprest work, and dropping those defaults would break any insert made
-- outside Prisma. Deliberately left out.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'REOPEN';
