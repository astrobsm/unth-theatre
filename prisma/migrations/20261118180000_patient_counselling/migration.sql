-- =============================================================================
-- The record of what a patient was told, and the link that let them read it
-- -----------------------------------------------------------------------------
-- Informed consent has two halves. The conversation with the surgeon is the
-- one that counts, and it is recorded on the consent form. This table is the
-- other half: proof that the written information was issued, which version of
-- it, by whom, and whether the patient ever opened it.
--
-- WHY THAT PROOF MATTERS. "The risks were explained" is an assertion. "The
-- information sheet version UNTH-PC-2026.1 was issued on this date by this
-- person, and opened on that date" is a record. If a patient later says they
-- were never told, the hospital can answer honestly either way — which is the
-- point, because sometimes the honest answer is that they were not.
--
-- THE TOKEN IS NEVER STORED, only its SHA-256. The same rule as
-- feedback_requests, for the same reason: a database read, or a leaked
-- backup, must not open somebody's medical information. The link is emailed
-- to nobody and texted once; if it is lost, a new one is issued.
--
-- WHY THE OPERATION IS SNAPSHOTTED HERE. procedureName, category and
-- indication are copied onto the row rather than read live from the surgery.
-- A leaflet is a document given on a date. If the case is later amended --
-- the procedure changed, the indication corrected -- the sheet the patient
-- actually read must not silently change under them, and a reissue should be
-- a visible second row rather than an invisible edit of the first.
--
-- REPLICATED, AND IT HAS TO BE. The link opens on the public site, which is
-- the cloud; a leaflet issued on the theatre node would be a dead link
-- otherwise. APPEND_ONLY, like feedback_requests: an issue is an event, and
-- two nodes issuing two leaflets have issued two leaflets.
--
-- NO FOREIGN KEYS, by the convention the rest of this schema follows for
-- these joins: a hard FK turns a row that has not synced yet into a refused
-- insert on the other node.
-- =============================================================================

CREATE TABLE "patient_counselling_issues" (
  "id"                TEXT NOT NULL,

  -- TEXT ids, matching Patient.id and Surgery.id. Soft references.
  "patientId"         TEXT,
  "surgeryId"         TEXT,

  -- SHA-256 of the token. The token itself is never stored.
  "tokenHash"         TEXT NOT NULL,
  "expiresAt"         TIMESTAMP(3) NOT NULL,

  -- The operation as it stood when the sheet was issued. See above.
  "procedureName"     TEXT NOT NULL,
  "procedureSlug"     TEXT,
  "category"          TEXT,
  "subspecialty"      TEXT,
  "indication"        TEXT,
  "unit"              TEXT,
  "surgeonName"       TEXT,
  "scheduledFor"      TIMESTAMP(3),

  -- Which edition of the standard text, and whether operation-specific
  -- counselling was found or the sheet fell back to the general sections.
  "leafletVersion"    TEXT NOT NULL,
  "matchedOn"         TEXT NOT NULL DEFAULT 'none',

  -- How it was given: WHATSAPP | PRINTED | LINK_COPIED.
  "channel"           TEXT NOT NULL DEFAULT 'WHATSAPP',

  "issuedById"        TEXT,
  "issuedByName"      TEXT,
  "issuedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- First time the patient opened the link. Null means they never did, which
  -- is a fact worth knowing before the consent conversation.
  "openedAt"          TIMESTAMP(3),
  "openCount"         INTEGER NOT NULL DEFAULT 0,

  -- Withdrawn: the link stops working. Used when a sheet was issued against
  -- the wrong case or sent to the wrong number.
  "revokedAt"         TIMESTAMP(3),
  "revokedReason"     TEXT,

  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "patient_counselling_issues_pkey" PRIMARY KEY ("id")
);

-- The lookup every page load performs. Unique because a token identifies one
-- issue, and a duplicate would make "which leaflet is this" ambiguous.
CREATE UNIQUE INDEX "patient_counselling_issues_tokenHash_key"
  ON "patient_counselling_issues" ("tokenHash");

-- "Has this patient been sent their information?", asked from the surgery list.
CREATE INDEX "patient_counselling_issues_surgeryId_idx"
  ON "patient_counselling_issues" ("surgeryId");

CREATE INDEX "patient_counselling_issues_patientId_idx"
  ON "patient_counselling_issues" ("patientId");

-- Expiring links, for the tidy-up job.
CREATE INDEX "patient_counselling_issues_expiresAt_idx"
  ON "patient_counselling_issues" ("expiresAt");

-- ---------------------------------------------------------------------------
-- A patient's right to say no to WhatsApp
-- ---------------------------------------------------------------------------
-- Staff have had this since the comms module was built; patients have not,
-- because until now nothing was sent to them that they might not want on a
-- phone. An information sheet about their own operation is exactly that.
--
-- The link carries no clinical detail and the message names no condition, but
-- a patient who shares a handset, or whose family reads their messages, has a
-- real reason to decline — and asking them to accept it as the price of being
-- counselled would be the wrong trade. Where this is set, the sheet is
-- printed and handed over instead, and the sender is told so.
ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "whatsappOptOut"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "whatsappOptOutAt" TIMESTAMP(3);

SELECT sync_enable_table('patient_counselling_issues');
