-- =============================================================================
-- Signing the reviewed policy
-- -----------------------------------------------------------------------------
-- The review round ended at a recommendation nobody had endorsed. The analysis
-- produced a revised policy and a change log, the Chairman accepted the changes
-- -- and then the endorsement of the people who reviewed it happened in a
-- WhatsApp thread, which is the one thing this module was built to stop being
-- the record.
--
-- WHO IS ASKED. Only members who SUBMITTED a review. A signature list padded
-- with people who never opened the draft is worse than a short one: it tells
-- Hospital Management the committee agreed when most of it never looked.
--
-- WHAT EACH SIGNATURE IS BOUND TO, which is the part that makes it mean
-- anything. signedFingerprint holds a SHA-256 of the exact document text that
-- was on screen when the signature was given. Edit the final proposal
-- afterwards and the fingerprints stop matching, so the signature is reported
-- as standing against an EARLIER version rather than being silently carried
-- onto words nobody agreed to. A signature page without that is an assertion
-- that some document existed at some point.
--
-- NO EXPIRY, deliberately, and unlike the review invitation. A review link
-- closes with the round because the analysis runs on what was said by the
-- deadline. A head of department back from leave should still be able to
-- endorse the document, and a signature arriving late is still a signature.
-- The Chairman withdraws a link if he needs to stop one.
--
-- NO FOREIGN KEYS. Same reason as every other replicated table added since the
-- 19 November stranding: a FK whose parent has not yet synced is not a delayed
-- insert, it is a refused one, retried for ever. roundId, invitationId and
-- finalProposalId are soft references.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "policy_signoffs" (
  "id"                TEXT NOT NULL,
  "roundId"           TEXT NOT NULL,

  -- The participant. One sign-off per invitation per round.
  "invitationId"      TEXT NOT NULL,

  -- Denormalised at the moment the link was issued, so the signature page
  -- reads correctly even if the invitation is later edited or withdrawn. A
  -- signature list that silently re-labels itself is not a record.
  "signerName"        TEXT NOT NULL,
  "signerRole"        TEXT,
  "signerUnit"        TEXT,

  -- Which published outcome they were asked to sign.
  "finalProposalId"   TEXT,
  "outcomeVersion"    TEXT,

  "tokenHash"         TEXT NOT NULL,
  "sentAt"            TIMESTAMP(3),
  "openedAt"          TIMESTAMP(3),
  "revokedAt"         TIMESTAMP(3),

  -- The signature itself.
  "signedAt"          TIMESTAMP(3),
  "signedName"        TEXT,
  "signatureImage"    TEXT,
  "signedFingerprint" TEXT,

  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "policy_signoffs_pkey" PRIMARY KEY ("id")
);

COMMENT ON COLUMN "policy_signoffs"."signatureImage" IS
  'The drawn signature as a base64 PNG data URL. Held back from the sync '
  'journal unless it actually changed -- see sync_omitted_columns.';

COMMENT ON COLUMN "policy_signoffs"."signedFingerprint" IS
  'SHA-256 of the normalised document text that was signed. A mismatch against '
  'the current final proposal means the signature stands against an earlier '
  'version.';

CREATE UNIQUE INDEX IF NOT EXISTS "policy_signoffs_tokenHash_key"
  ON "policy_signoffs" ("tokenHash");

-- One signing link per participant per round. A second row would mean two
-- links, two signatures and a participation count that double-counts somebody.
CREATE UNIQUE INDEX IF NOT EXISTS "policy_signoffs_round_invitation_key"
  ON "policy_signoffs" ("roundId", "invitationId");

CREATE INDEX IF NOT EXISTS "policy_signoffs_roundId_idx"
  ON "policy_signoffs" ("roundId");

CREATE INDEX IF NOT EXISTS "policy_signoffs_signedAt_idx"
  ON "policy_signoffs" ("signedAt");

-- Replicated. The link points at the public node and the Chairman reads the
-- signature list from inside the hospital, so both sides need every row.
SELECT sync_enable_table('policy_signoffs');

-- ---------------------------------------------------------------------------
-- The signature image must not ride on every unrelated edit.
--
-- This is the announcements.audioData lesson, applied before it costs anything
-- rather than after. The capture trigger serialises the whole row, so marking a
-- link as opened -- one timestamp -- would otherwise journal the entire PNG
-- again. A signature image is far smaller than an MP3, but there is one per
-- committee member and the push batch is bounded by a byte budget: a queue of
-- signature images sitting in front of a theatre list is the same failure in
-- miniature.
--
-- CONDITIONAL, not blanket. signatureImage is nullable, so a blanket omission
-- would technically apply -- but it would mean the bytes never reach the peer
-- at all, and the signature would exist on one node only. when_unchanged ships
-- the column when it is genuinely new or genuinely changed, which is exactly
-- once per signature, and omits it on every later bookkeeping write.
-- ---------------------------------------------------------------------------
INSERT INTO sync_omitted_columns (table_name, column_name, when_unchanged) VALUES
  ('policy_signoffs','signatureImage', true)
ON CONFLICT (table_name, column_name) DO UPDATE SET when_unchanged = excluded.when_unchanged;
