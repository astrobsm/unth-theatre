-- Keep the issued PDF itself alongside its checksum, as a base64 data URL —
-- the same convention used for receipts. A checksum proves a document was not
-- altered; the stored bytes let a disputed copy be compared against what was
-- actually issued. storageKey becomes optional for a later move to object
-- storage. The table is empty, so nothing is rewritten.

-- AlterTable
ALTER TABLE "imprest_generated_documents" ADD COLUMN     "dataUrl" TEXT,
ALTER COLUMN "storageKey" DROP NOT NULL;

