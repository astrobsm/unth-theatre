-- Clinical OCR & document intelligence — storage, versions, verification, audit.
--
-- Hand-written. `prisma migrate diff` has three times proposed dropping the
-- sync columns and sync table primary keys on this database, so it is not used
-- here. Every statement below is additive: no DROP, no ALTER of an existing
-- column, nothing that touches a table that already holds clinical data.
--
-- Files are NOT stored here. Scans live in the document store (Supabase
-- Storage in the cloud, disk on the theatre server) and these tables hold
-- metadata, extracted text, confidence and a content-addressed reference. See
-- docs/ocr-platform-assessment.md §2 for why: the base64-in-Postgres
-- convention used elsewhere in ORM would put 8-11 GB through the sync journal.

-- ---------------------------------------------------------------------------
-- A scanned document, in one or more versions.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ocr_documents" (
  "id"                TEXT PRIMARY KEY,
  "patientId"         TEXT,
  "surgeryId"         TEXT,
  "documentType"      TEXT NOT NULL,
  -- Set when the type was inferred rather than chosen, so a wrong automatic
  -- classification can be told apart from a wrong human one.
  "classifiedAuto"    BOOLEAN NOT NULL DEFAULT false,

  -- Content address of the ORIGINAL capture. Never overwritten: §17 requires
  -- the original to survive every later correction, and §24 makes the signed
  -- consent document itself the authoritative artefact.
  "originalKey"       TEXT NOT NULL,
  "originalSha256"    TEXT NOT NULL,
  "originalBytes"     INTEGER NOT NULL,
  "originalMimeType"  TEXT NOT NULL,
  -- The enhanced/deskewed image actually fed to the recogniser, kept so a
  -- disputed transcription can be traced to what the engine really saw.
  "processedKey"      TEXT,

  "status"            TEXT NOT NULL DEFAULT 'PENDING',
  "pageCount"         INTEGER NOT NULL DEFAULT 1,

  -- Null until an engine has run. Deliberately nullable rather than 0: absent
  -- confidence and zero confidence mean different things and must not be
  -- rendered the same way.
  "overallConfidence" DOUBLE PRECISION,
  "imageQualityScore" INTEGER,

  -- Set by the confidence engine when anything on the page needs a human, or
  -- when the page contains a category §14/§29 requires verifying regardless of
  -- confidence (doses, allergies, identifiers, blood group...).
  "requiresReview"    BOOLEAN NOT NULL DEFAULT true,
  "reviewReason"      TEXT,

  "capturedById"      TEXT NOT NULL,
  "capturedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedById"      TEXT,
  "verifiedAt"        TIMESTAMP(3),

  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "sync_version"      INTEGER NOT NULL DEFAULT 0,
  "sync_origin"       TEXT,
  "sync_hlc"          TEXT
);

-- ON DELETE RESTRICT, not CASCADE. A scanned consent form is evidence; deleting
-- a patient row must not silently destroy it. Retention is a policy decision
-- (§34), taken deliberately, not a side effect of a foreign key.
DO $$ BEGIN
  ALTER TABLE "ocr_documents" ADD CONSTRAINT "ocr_documents_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ocr_documents" ADD CONSTRAINT "ocr_documents_surgeryId_fkey"
    FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ocr_documents" ADD CONSTRAINT "ocr_documents_capturedById_fkey"
    FOREIGN KEY ("capturedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ocr_documents" ADD CONSTRAINT "ocr_documents_verifiedById_fkey"
    FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ocr_documents_patientId_idx"  ON "ocr_documents"("patientId");
CREATE INDEX IF NOT EXISTS "ocr_documents_surgeryId_idx"  ON "ocr_documents"("surgeryId");
CREATE INDEX IF NOT EXISTS "ocr_documents_status_idx"     ON "ocr_documents"("status");
-- Duplicate detection (§22) asks "have we seen these bytes for this patient?"
CREATE INDEX IF NOT EXISTS "ocr_documents_sha_patient_idx"
  ON "ocr_documents"("originalSha256", "patientId");
CREATE INDEX IF NOT EXISTS "ocr_documents_review_idx"
  ON "ocr_documents"("requiresReview") WHERE "requiresReview" = true;

-- ---------------------------------------------------------------------------
-- One row per engine run. Never replaced: §43 compares providers on the same
-- document, and §20 must show local and cloud results side by side rather than
-- letting the later one silently overwrite the earlier.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ocr_provider_runs" (
  "id"             TEXT PRIMARY KEY,
  "documentId"     TEXT NOT NULL,
  "provider"       TEXT NOT NULL,
  "modelVersion"   TEXT,
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"    TIMESTAMP(3),
  "durationMs"     INTEGER,
  "status"         TEXT NOT NULL DEFAULT 'RUNNING',
  "failureReason"  TEXT,
  "confidence"     DOUBLE PRECISION,
  -- The engine's own output, untouched. §17 keeps raw OCR separate from the
  -- verified transcription so the two can never be confused for one another.
  "rawText"        TEXT,
  "rawPayload"     JSONB,
  -- True when this run's text was chosen as the document's working
  -- transcription. At most one per document; enforced by index below.
  "isPrimary"      BOOLEAN NOT NULL DEFAULT false,
  "sync_version"   INTEGER NOT NULL DEFAULT 0,
  "sync_origin"    TEXT,
  "sync_hlc"       TEXT
);

DO $$ BEGIN
  ALTER TABLE "ocr_provider_runs" ADD CONSTRAINT "ocr_provider_runs_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ocr_provider_runs_documentId_idx" ON "ocr_provider_runs"("documentId");
CREATE UNIQUE INDEX IF NOT EXISTS "ocr_provider_runs_one_primary_idx"
  ON "ocr_provider_runs"("documentId") WHERE "isPrimary" = true;

-- ---------------------------------------------------------------------------
-- Pages.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ocr_pages" (
  "id"           TEXT PRIMARY KEY,
  "documentId"   TEXT NOT NULL,
  "pageNumber"   INTEGER NOT NULL,
  "imageKey"     TEXT,
  "width"        INTEGER,
  "height"       INTEGER,
  "rotation"     INTEGER NOT NULL DEFAULT 0,
  "confidence"   DOUBLE PRECISION,
  -- PRINTED | HANDWRITTEN | MIXED | UNKNOWN (§11)
  "contentKind"  TEXT NOT NULL DEFAULT 'UNKNOWN',
  "sync_version" INTEGER NOT NULL DEFAULT 0,
  "sync_origin"  TEXT,
  "sync_hlc"     TEXT
);

DO $$ BEGIN
  ALTER TABLE "ocr_pages" ADD CONSTRAINT "ocr_pages_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ocr_pages_document_page_idx"
  ON "ocr_pages"("documentId", "pageNumber");

-- ---------------------------------------------------------------------------
-- Tokens: the word-level record that makes uncertainty visible.
--
-- This table is why the system can refuse to guess. Each word keeps its own
-- confidence and its own box on the page, so an uncertain word can be
-- highlighted and the clinician shown the exact region of the original image
-- (§15) instead of being asked to trust a paragraph.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ocr_tokens" (
  "id"            TEXT PRIMARY KEY,
  "documentId"    TEXT NOT NULL,
  "pageId"        TEXT NOT NULL,
  "runId"         TEXT,
  "lineIndex"     INTEGER NOT NULL DEFAULT 0,
  "tokenIndex"    INTEGER NOT NULL DEFAULT 0,
  "text"          TEXT NOT NULL,
  "confidence"    DOUBLE PRECISION,
  -- Pixel box on the page image: x, y, width, height.
  "bboxX"         INTEGER,
  "bboxY"         INTEGER,
  "bboxW"         INTEGER,
  "bboxH"         INTEGER,
  "isHandwritten" BOOLEAN NOT NULL DEFAULT false,
  -- Below threshold, or engines disagreed, or a high-risk category (§29).
  "isUncertain"   BOOLEAN NOT NULL DEFAULT false,
  "uncertainWhy"  TEXT,
  -- Alternatives OFFERED, never applied. §2: clinical context may identify
  -- candidates; it may never select one.
  "alternatives"  JSONB,
  "isVerified"    BOOLEAN NOT NULL DEFAULT false,
  "correctedText" TEXT,
  "correctedById" TEXT,
  "correctedAt"   TIMESTAMP(3),
  "sync_version"  INTEGER NOT NULL DEFAULT 0,
  "sync_origin"   TEXT,
  "sync_hlc"      TEXT
);

DO $$ BEGIN
  ALTER TABLE "ocr_tokens" ADD CONSTRAINT "ocr_tokens_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ocr_tokens" ADD CONSTRAINT "ocr_tokens_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "ocr_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ocr_tokens" ADD CONSTRAINT "ocr_tokens_correctedById_fkey"
    FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ocr_tokens_documentId_idx" ON "ocr_tokens"("documentId");
CREATE INDEX IF NOT EXISTS "ocr_tokens_pageId_idx"     ON "ocr_tokens"("pageId");
CREATE INDEX IF NOT EXISTS "ocr_tokens_uncertain_idx"
  ON "ocr_tokens"("documentId") WHERE "isUncertain" = true;

-- ---------------------------------------------------------------------------
-- Versions. §23: never destroy a previous version.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ocr_versions" (
  "id"            TEXT PRIMARY KEY,
  "documentId"    TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  -- RAW_OCR | CLINICIAN_CORRECTION | VERIFIED
  "kind"          TEXT NOT NULL,
  "text"          TEXT NOT NULL,
  "confidence"    DOUBLE PRECISION,
  "authorId"      TEXT NOT NULL,
  "note"          TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"  INTEGER NOT NULL DEFAULT 0,
  "sync_origin"   TEXT,
  "sync_hlc"      TEXT
);

DO $$ BEGIN
  ALTER TABLE "ocr_versions" ADD CONSTRAINT "ocr_versions_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ocr_versions" ADD CONSTRAINT "ocr_versions_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ocr_versions_document_number_idx"
  ON "ocr_versions"("documentId", "versionNumber");

-- ---------------------------------------------------------------------------
-- Verification: who accepted what, and what they were shown when they did.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ocr_verifications" (
  "id"                 TEXT PRIMARY KEY,
  "documentId"         TEXT NOT NULL,
  "versionId"          TEXT,
  "verifiedById"       TEXT NOT NULL,
  "verifiedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- ACCEPTED | CORRECTED | REJECTED | MARKED_ILLEGIBLE
  "outcome"            TEXT NOT NULL,
  "tokensReviewed"     INTEGER NOT NULL DEFAULT 0,
  "tokensCorrected"    INTEGER NOT NULL DEFAULT 0,
  -- Recorded because §29 requires explicit confirmation of high-risk values.
  -- Keeping the count and the categories means an audit can show what the
  -- clinician was actually asked to confirm, not merely that they clicked.
  "highRiskConfirmed"  INTEGER NOT NULL DEFAULT 0,
  "highRiskCategories" TEXT,
  "note"               TEXT,
  "ipAddress"          TEXT,
  "sync_version"       INTEGER NOT NULL DEFAULT 0,
  "sync_origin"        TEXT,
  "sync_hlc"           TEXT
);

DO $$ BEGIN
  ALTER TABLE "ocr_verifications" ADD CONSTRAINT "ocr_verifications_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ocr_verifications" ADD CONSTRAINT "ocr_verifications_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "ocr_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ocr_verifications" ADD CONSTRAINT "ocr_verifications_verifiedById_fkey"
    FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ocr_verifications_documentId_idx" ON "ocr_verifications"("documentId");

-- ---------------------------------------------------------------------------
-- Image quality assessments (§30). Kept per attempt, including the ones that
-- were rejected as too poor: "how often does capture fail, and why" is exactly
-- what tells us whether to fix the camera guidance or the recogniser.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ocr_quality_assessments" (
  "id"              TEXT PRIMARY KEY,
  "documentId"      TEXT,
  "capturedById"    TEXT NOT NULL,
  "score"           INTEGER NOT NULL,
  "sharpness"       INTEGER,
  "exposure"        INTEGER,
  "contrast"        INTEGER,
  "glare"           INTEGER,
  "skewDegrees"     DOUBLE PRECISION,
  "resolutionPx"    INTEGER,
  "cornersDetected" INTEGER,
  "failedChecks"    TEXT,
  -- True when the user was warned and chose "Proceed anyway" (§5). Worth
  -- knowing when a transcription is later disputed.
  "proceededAnyway" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"    INTEGER NOT NULL DEFAULT 0,
  "sync_origin"     TEXT,
  "sync_hlc"        TEXT
);

DO $$ BEGIN
  ALTER TABLE "ocr_quality_assessments" ADD CONSTRAINT "ocr_quality_assessments_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ocr_quality_assessments" ADD CONSTRAINT "ocr_quality_assessments_capturedById_fkey"
    FOREIGN KEY ("capturedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Signature / stamp regions (§24). Recorded as present and located, NEVER
-- transcribed into clinical text.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ocr_signature_regions" (
  "id"           TEXT PRIMARY KEY,
  "documentId"   TEXT NOT NULL,
  "pageId"       TEXT NOT NULL,
  -- SIGNATURE | STAMP | INITIALS
  "kind"         TEXT NOT NULL,
  "bboxX"        INTEGER NOT NULL,
  "bboxY"        INTEGER NOT NULL,
  "bboxW"        INTEGER NOT NULL,
  "bboxH"        INTEGER NOT NULL,
  "confidence"   DOUBLE PRECISION,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version" INTEGER NOT NULL DEFAULT 0,
  "sync_origin"  TEXT,
  "sync_hlc"     TEXT
);

DO $$ BEGIN
  ALTER TABLE "ocr_signature_regions" ADD CONSTRAINT "ocr_signature_regions_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ocr_signature_regions" ADD CONSTRAINT "ocr_signature_regions_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "ocr_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ocr_signature_regions_documentId_idx"
  ON "ocr_signature_regions"("documentId");
