-- ============================================================
-- What the WhatsApp dispatcher needs that the queue did not record
-- ------------------------------------------------------------
-- The comms layer has been queueing messages for months and none has ever
-- reached a phone: comms/whatsapp.ts is a complete Meta Cloud API client that
-- nothing calls, and no code reads a QUEUED row. Everything the app has
-- "sent" went to the in-app bell and web push only.
--
-- Three columns stand between the queue and the provider.
--
-- providerParams. Meta does not accept prose. A business-initiated message
-- must name a template Meta has approved and supply its variables POSITIONALLY
-- — {{1}}, {{2}} — and the queue stores only renderedBody, the finished
-- sentence. You cannot recover the parameters from it, and re-rendering at
-- send time would defeat the existing and correct decision to freeze the
-- wording at queue time. So the positional values are frozen alongside it.
--
-- providerLanguage. Meta keys an approved template by name AND language, and
-- rejects a send whose language does not match one it approved. Held per
-- template because a hospital may later approve the same reminder in a second
-- language without touching code.
--
-- whatsappOptOut. Staff have a phoneNumber and no way to say "not on
-- WhatsApp". Operational reminders about your own duty are legitimate
-- workplace communication and default to ON, or the first month reaches
-- nobody and the reluctance this was built to fix simply continues. But a
-- person who wants out must have a way out that is not "block the hospital's
-- number" — blocking is permanent, invisible to us, and takes the emergency
-- messages with it.
-- ============================================================

ALTER TABLE communication_messages
  ADD COLUMN IF NOT EXISTS "providerParams" jsonb;

COMMENT ON COLUMN communication_messages."providerParams" IS
  'Positional template variables for the provider, frozen at queue time in the order the approved template declares. Null for channels that take prose.';

-- When the dispatcher claimed this row.
--
-- Needed to rescue rows stranded in SENDING by a deploy or a timeout, and it
-- has to be the CLAIM time rather than queuedAt. Keyed off queuedAt, a message
-- that sat in a backlog for eleven minutes and is legitimately in flight right
-- now looks stranded, gets requeued, and the consultant is messaged twice —
-- which is the behaviour that gets an alerting system muted.
ALTER TABLE communication_messages
  ADD COLUMN IF NOT EXISTS "sendingSince" timestamptz;

ALTER TABLE communication_templates
  ADD COLUMN IF NOT EXISTS "providerLanguage" text;

COMMENT ON COLUMN communication_templates."providerLanguage" IS
  'Language code the provider approved this template under, e.g. en. Meta rejects a send whose language does not match.';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "whatsappOptOut" boolean NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "whatsappOptOutAt" timestamptz;

COMMENT ON COLUMN users."whatsappOptOut" IS
  'Set when a member of staff asks not to receive WhatsApp. Default false: operational reminders about a persons own duty are workplace communication, and an opt-in default would have reached nobody.';

-- The dispatcher claims work with "the oldest queued messages on this channel".
-- Without this it is a sequential scan of every message ever sent, every run.
CREATE INDEX IF NOT EXISTS communication_messages_dispatch_idx
  ON communication_messages (channel, "queuedAt")
  WHERE status = 'QUEUED';

-- ---------------------------------------------------------------------------
-- A switch a person can actually reach.
-- ---------------------------------------------------------------------------
-- The kill switch was environment-only: COMMUNICATION_DISABLED, read at send
-- time. That is the right FIRST line — it keeps working when the database is
-- the thing misbehaving — but on a hosted deployment changing an environment
-- variable means a redeploy, and the moment a hospital needs to stop automated
-- messages is not a moment to wait for a build.
--
-- So the switch is also a row. Environment still wins, so the emergency brake
-- cannot be released from a screen, and a hospital that wants messaging off
-- with no possibility of it being turned back on by a signed-in administrator
-- still has that.
--
-- dryRun is separate from the credentials check on purpose. "No credentials"
-- means the integration cannot send; dryRun means somebody has decided it
-- should not, while everything else keeps working — which is what you want on
-- the day the wording is being reviewed.
CREATE TABLE IF NOT EXISTS communication_settings (
  id                text        PRIMARY KEY DEFAULT 'singleton',
  "allDisabled"     boolean     NOT NULL DEFAULT false,
  /// Comma-separated channel names, e.g. 'WHATSAPP,SMS'.
  "disabledChannels" text,
  "dryRun"          boolean     NOT NULL DEFAULT false,
  note              text,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedById"     text,
  "updatedByName"   text
);

INSERT INTO communication_settings (id) VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;
