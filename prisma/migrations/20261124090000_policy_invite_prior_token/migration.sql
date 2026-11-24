-- A reminder now carries the member's personal review link, which means minting a
-- fresh token. The token itself is never stored, only its SHA-256, so there is no
-- query that could put the existing link into a message.
--
-- The previous hash is kept alive beside the new one. Replacing tokenHash outright
-- would stop the link sitting in the member's WhatsApp from the original
-- invitation, and they would find that out by tapping it and being told it is not
-- recognised. Withdrawal is unaffected: revokedAt is checked per invitation, not
-- per token, and the explicit "New link" reissue clears this column on purpose.
ALTER TABLE "policy_invitations"
  ADD COLUMN IF NOT EXISTS "priorTokenHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "policy_invitations_priorTokenHash_key"
  ON "policy_invitations" ("priorTokenHash");
