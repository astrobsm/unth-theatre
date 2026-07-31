-- Keep uploaded imprest evidence as a base64 data URL, matching how this app
-- already stores consent scans and incident media. A data URL is JSON, so a
-- receipt captured with no network queues and replays like any other field —
-- which an object-store key could not. storageKey becomes optional so a later
-- move to object storage stays open. Table is empty, so nothing is rewritten.

-- AlterTable
ALTER TABLE "imprest_attachments" ADD COLUMN     "dataUrl" TEXT,
ALTER COLUMN "storageKey" DROP NOT NULL;

