-- =============================================================================
-- Deposits and collections: who paid, and who carried it away
-- -----------------------------------------------------------------------------
-- Two things were missing and one was wrong.
--
-- MISSING 1: there was nowhere to record that a patient had paid. The
-- consumable shop collects the deposit, the patient is told to bring the
-- receipt to theatre on the day, and from that point the paper WAS the record.
-- A receipt left at home is indistinguishable from a deposit never paid, and
-- the case is held at the door while somebody telephones the shop.
--
-- MISSING 2: there was nowhere to record who collected the pack. Packs are
-- handed to the scrub nurse for the surgical half and to the anaesthetist for
-- the anaesthetic half -- that half holds the controlled drugs -- and neither
-- handover was written down anywhere.
--
-- WRONG: theatre_settings priced MINOR, INTERMEDIATE and MAJOR and had no
-- SUPER MAJOR column at all. So the heaviest cases in the theatre, the ones
-- carrying the largest deposit, were the only ones the booking form could not
-- quote a figure for. Two columns are added and all eight bands are seeded
-- with the figures the hospital set in November 2026.
--
-- SEEDING ONLY WHERE NULL. An administrator who has already typed a number in
-- keeps it: this migration fills the blanks, it does not overwrite a decision.
-- Zero is a decision too, and `IS NULL` leaves it alone.
--
-- NO FOREIGN KEYS on surgeryId. Same reason as every replicated table added
-- since the 19 November stranding: a FK whose parent has not yet synced is not
-- a delayed insert, it is a refused one, retried for ever.
-- =============================================================================

-- ----------------------------------------------------------------- 1. bands
ALTER TABLE "theatre_settings"
  ADD COLUMN IF NOT EXISTS "superMajorConsumableFee" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "superMajorPharmacyFee"   DECIMAL(12,2);

INSERT INTO "theatre_settings" ("id", "updatedAt")
VALUES ('singleton', NOW())
ON CONFLICT ("id") DO NOTHING;

UPDATE "theatre_settings" SET
  "minorConsumableFee"        = COALESCE("minorConsumableFee",         52323.00),
  "intermediateConsumableFee" = COALESCE("intermediateConsumableFee",  65570.00),
  "majorConsumableFee"        = COALESCE("majorConsumableFee",        110360.00),
  "superMajorConsumableFee"   = COALESCE("superMajorConsumableFee",   146090.00),
  "minorPharmacyFee"          = COALESCE("minorPharmacyFee",           20000.00),
  "intermediatePharmacyFee"   = COALESCE("intermediatePharmacyFee",    30000.00),
  "majorPharmacyFee"          = COALESCE("majorPharmacyFee",           40000.00),
  "superMajorPharmacyFee"     = COALESCE("superMajorPharmacyFee",      50000.00)
WHERE "id" = 'singleton';

-- -------------------------------------------------------------- 2. deposits
CREATE TABLE IF NOT EXISTS "surgery_deposits" (
  "id"                 TEXT NOT NULL,
  "surgeryId"          TEXT NOT NULL,

  -- CONSUMABLE | PHARMACY
  "kind"               TEXT NOT NULL,

  -- REQUESTED | PAID | COLLECTED | WAIVED
  "status"             TEXT NOT NULL DEFAULT 'REQUESTED',

  -- The band as it stood when the deposit was raised, and the magnitude it
  -- was read from. Not re-derived later: a receipt in a patient's hand must
  -- go on matching the record after a tariff change.
  "expectedAmount"     DECIMAL(12,2),
  "magnitudeAtPricing" TEXT,

  "amountPaid"         DECIMAL(12,2),
  "receiptNumber"      TEXT,
  "paidAt"             TIMESTAMP(3),
  "paidRecordedById"   TEXT,
  "paidRecordedByName" TEXT,

  "waivedAt"           TIMESTAMP(3),
  "waivedById"         TEXT,
  "waivedByName"       TEXT,
  "waivedReason"       TEXT,

  "notes"              TEXT,

  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "sync_version"       INTEGER NOT NULL DEFAULT 0,
  "sync_origin"        TEXT,
  "sync_hlc"           TEXT,

  CONSTRAINT "surgery_deposits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "surgery_deposits_surgeryId_kind_key"
  ON "surgery_deposits" ("surgeryId", "kind");
CREATE INDEX IF NOT EXISTS "surgery_deposits_surgeryId_idx"
  ON "surgery_deposits" ("surgeryId");
CREATE INDEX IF NOT EXISTS "surgery_deposits_status_idx"
  ON "surgery_deposits" ("status");

-- ----------------------------------------------------------- 3. collections
CREATE TABLE IF NOT EXISTS "surgery_pack_collections" (
  "id"              TEXT NOT NULL,
  "surgeryId"       TEXT NOT NULL,

  -- SURGICAL_CONSUMABLES | ANAESTHETIC_CONSUMABLES | SURGICAL_DRUGS |
  -- ANAESTHETIC_DRUGS
  "stream"          TEXT NOT NULL,

  -- CONSUMABLE | PHARMACY, denormalised from the stream.
  "kind"            TEXT NOT NULL,

  "collectedById"   TEXT,
  -- A snapshot as well as a link: an account can be renamed or deactivated,
  -- and a handover that then reads "unknown user" is not a record of who took
  -- the drugs.
  "collectedByName" TEXT,
  -- SCRUB_NURSE | ANAESTHETIST
  "collectorKind"   TEXT,
  "collectedAt"     TIMESTAMP(3),

  "recordedById"    TEXT,
  "recordedByName"  TEXT,

  "notes"           TEXT,

  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "sync_version"    INTEGER NOT NULL DEFAULT 0,
  "sync_origin"     TEXT,
  "sync_hlc"        TEXT,

  CONSTRAINT "surgery_pack_collections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "surgery_pack_collections_surgeryId_stream_key"
  ON "surgery_pack_collections" ("surgeryId", "stream");
CREATE INDEX IF NOT EXISTS "surgery_pack_collections_surgeryId_idx"
  ON "surgery_pack_collections" ("surgeryId");

-- ------------------------------------------------------------------ 4. sync
-- Both tables replicate. The deposit is raised at the consumable shop on the
-- theatre node while the ward nurse reads it from the cloud, and a payment
-- recorded on one node only would leave the two desks disagreeing about
-- whether a patient may go to theatre.
SELECT sync_enable_table('surgery_deposits');
SELECT sync_enable_table('surgery_pack_collections');
