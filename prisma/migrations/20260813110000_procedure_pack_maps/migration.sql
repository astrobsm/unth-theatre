-- ============================================================
-- Procedure -> pack mapping, and several procedures per case
-- ------------------------------------------------------------
-- Name matching can SUGGEST a pack but must never choose one: which pack a
-- hemicolectomy needs is a clinical judgement, and auto-requesting the wrong pack
-- is worse than requesting none, because somebody opens it before noticing.
--
-- So a suggestion is reviewed once by an administrator and stored here, and
-- booking reads this table rather than guessing every time. A mapping is not used
-- until confirmedAt is set.
--
-- Additive throughout.
-- ============================================================

CREATE TABLE IF NOT EXISTS "procedure_pack_maps" (
  "id"                 TEXT NOT NULL,
  -- Normalised, so spelling drift does not create two mappings for one operation.
  "procedureKey"       TEXT NOT NULL,
  "procedureName"      TEXT NOT NULL,
  "subspecialty"       TEXT,

  "consumablePackId"   TEXT,
  "pharmacyPackId"     TEXT,
  -- Snapshotted, so a renamed pack does not make an old mapping unreadable.
  "consumablePackName" TEXT,
  "pharmacyPackName"   TEXT,

  "suggestedBasis"     TEXT,
  "confirmedAt"        TIMESTAMP(3),
  "confirmedById"      TEXT,
  "confirmedByName"    TEXT,

  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "procedure_pack_maps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "procedure_pack_maps_procedureKey_key"
  ON "procedure_pack_maps" ("procedureKey");

CREATE INDEX IF NOT EXISTS "procedure_pack_maps_subspecialty_idx"
  ON "procedure_pack_maps" ("subspecialty", "isActive");

-- A case can be more than one procedure: a tumour resection with a skin graft is
-- one operation, one patient, one trip to theatre. The principal procedure keeps
-- its own column; the rest are newline-separated display text, because that is
-- what they are — text a surgeon typed, not foreign keys.
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "additionalProcedures" TEXT;
