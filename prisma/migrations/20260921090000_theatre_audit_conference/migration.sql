-- ============================================================
-- Hospital Theatre Audit Conference
-- ------------------------------------------------------------
-- A sitting at which structural adjustments to the theatre are taken point by
-- point. Each point is raised, discussed and decided, and the decision is
-- stored against the point it answers — so a reader a year later sees what was
-- proposed and what was resolved without holding two documents open.
--
-- Distinct from the existing theatre-audit REVIEW board, which lists
-- cancellations, incidents and mortalities for scrutiny. That board asks what
-- happened. This one asks what is changing, who is doing it, and by when.
--
-- theatre_audit_conferences     one sitting
-- conference_attendees          who was in the room
-- conference_issues             one agenda point
-- conference_discussion_points  what was said (append-only)
-- conference_decisions          the decision, one per point
--
-- All five replicate. A conference held in the theatre seminar room during an
-- internet outage is exactly the sitting whose minute must reach the cloud,
-- and the adopted resolution is read by people who were never in the room.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConferenceArea') THEN
    CREATE TYPE "ConferenceArea" AS ENUM (
      'LIST_AND_SCHEDULING', 'STAFFING_AND_ROLES', 'THEATRE_READINESS',
      'EMERGENCY_PATHWAY', 'EQUIPMENT_AND_CONSUMABLES', 'COMMUNICATION',
      'PATIENT_FLOW', 'RECORDS_AND_AUDIT', 'INFRASTRUCTURE', 'TRAINING', 'OTHER'
    );
  END IF;

  -- DEFERRED and REFERRED are kept apart from REJECTED deliberately. "We will
  -- come back to this" and "somebody else decides this" are not refusals, and
  -- a minute recording all three as "not adopted" loses the only information
  -- anybody needs at the next sitting.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConferenceOutcome') THEN
    CREATE TYPE "ConferenceOutcome" AS ENUM (
      'ADOPTED', 'ADOPTED_WITH_MODIFICATION', 'REJECTED',
      'DEFERRED', 'REFERRED', 'NOTED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConferenceStatus') THEN
    CREATE TYPE "ConferenceStatus" AS ENUM ('DRAFT', 'IN_SESSION', 'ANALYSED', 'ADOPTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "theatre_audit_conferences" (
  "id"            TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "sittingDate"   TIMESTAMP(3) NOT NULL,
  "venue"         TEXT,
  "purpose"       TEXT,
  "chairId"       TEXT,
  "chairName"     TEXT NOT NULL,
  "secretaryId"   TEXT,
  "secretaryName" TEXT,
  "status"        "ConferenceStatus" NOT NULL DEFAULT 'DRAFT',
  "adoptedAt"     TIMESTAMP(3),
  "adoptedById"   TEXT,
  "adoptedByName" TEXT,
  -- Stored verbatim at adoption. Regenerating it later from data that has
  -- since changed would silently rewrite what was agreed in the room.
  "adoptedResolution" TEXT,
  "createdById"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"  INTEGER NOT NULL DEFAULT 0,
  "sync_origin"   TEXT,
  "sync_hlc"      TEXT,
  CONSTRAINT "theatre_audit_conferences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "theatre_audit_conferences_sittingDate_idx"
  ON "theatre_audit_conferences" ("sittingDate");
CREATE INDEX IF NOT EXISTS "theatre_audit_conferences_status_idx"
  ON "theatre_audit_conferences" ("status");

-- Attendance is part of the minute. A decision about anaesthetic cover taken
-- with no anaesthetist in the room is a different fact from the same decision
-- taken with three.
CREATE TABLE IF NOT EXISTS "conference_attendees" (
  "id"            TEXT NOT NULL,
  "conferenceId"  TEXT NOT NULL,
  "userId"        TEXT,
  "name"          TEXT NOT NULL,
  "roleAtSitting" TEXT,
  "present"       BOOLEAN NOT NULL DEFAULT true,
  "apologies"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"  INTEGER NOT NULL DEFAULT 0,
  "sync_origin"   TEXT,
  "sync_hlc"      TEXT,
  CONSTRAINT "conference_attendees_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "conference_attendees_conferenceId_idx"
  ON "conference_attendees" ("conferenceId");

CREATE TABLE IF NOT EXISTS "conference_issues" (
  "id"              TEXT NOT NULL,
  "conferenceId"    TEXT NOT NULL,
  "ordinal"         INTEGER NOT NULL,
  "title"           TEXT NOT NULL,
  "area"            "ConferenceArea" NOT NULL DEFAULT 'OTHER',
  -- Three fields rather than one description. What happens now, what is
  -- proposed instead, and why it was raised are three different claims, and a
  -- committee that cannot see them apart argues about all three at once.
  "background"      TEXT,
  "currentPractice" TEXT,
  "proposal"        TEXT,
  "raisedById"      TEXT,
  "raisedByName"    TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"    INTEGER NOT NULL DEFAULT 0,
  "sync_origin"     TEXT,
  "sync_hlc"        TEXT,
  CONSTRAINT "conference_issues_pkey" PRIMARY KEY ("id")
);

-- After adoption these numbers are how the resolution refers to each point, so
-- two points cannot share one.
CREATE UNIQUE INDEX IF NOT EXISTS "conference_issues_conferenceId_ordinal_key"
  ON "conference_issues" ("conferenceId", "ordinal");
CREATE INDEX IF NOT EXISTS "conference_issues_conferenceId_idx"
  ON "conference_issues" ("conferenceId");

-- Append-only. What somebody said in the room is not edited afterwards.
CREATE TABLE IF NOT EXISTS "conference_discussion_points" (
  "id"           TEXT NOT NULL,
  "issueId"      TEXT NOT NULL,
  "speakerName"  TEXT NOT NULL,
  "speakerId"    TEXT,
  "point"        TEXT NOT NULL,
  "stance"       TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version" INTEGER NOT NULL DEFAULT 0,
  "sync_origin"  TEXT,
  "sync_hlc"     TEXT,
  CONSTRAINT "conference_discussion_points_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "conference_discussion_points_issueId_idx"
  ON "conference_discussion_points" ("issueId");

CREATE TABLE IF NOT EXISTS "conference_decisions" (
  "id"                  TEXT NOT NULL,
  "issueId"             TEXT NOT NULL,
  "outcome"             "ConferenceOutcome" NOT NULL,
  "decisionText"        TEXT NOT NULL,
  "rationale"           TEXT,
  "ownerId"             TEXT,
  "ownerName"           TEXT,
  "dueDate"             TIMESTAMP(3),
  -- Ids of other points in the same conference. The analysis sequences from
  -- these and refuses to break a cycle on the committee's behalf.
  "dependsOnIssueIds"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "resourceImplication" TEXT,
  -- Null throughout means consensus, which is the ordinary case and must not
  -- be displayed as a 0-0-0 vote.
  "votesFor"            INTEGER,
  "votesAgainst"        INTEGER,
  "votesAbstain"        INTEGER,
  -- For DEFERRED. A deferral with no return date is how a point disappears.
  "reviewOn"            TIMESTAMP(3),
  "referredTo"          TEXT,
  "decidedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedById"        TEXT NOT NULL,
  "recordedByName"      TEXT,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"        INTEGER NOT NULL DEFAULT 0,
  "sync_origin"         TEXT,
  "sync_hlc"            TEXT,
  CONSTRAINT "conference_decisions_pkey" PRIMARY KEY ("id")
);

-- One decision per point. A second is an amendment of the first, not a rival.
CREATE UNIQUE INDEX IF NOT EXISTS "conference_decisions_issueId_key"
  ON "conference_decisions" ("issueId");
CREATE INDEX IF NOT EXISTS "conference_decisions_ownerId_idx"
  ON "conference_decisions" ("ownerId");
CREATE INDEX IF NOT EXISTS "conference_decisions_dueDate_idx"
  ON "conference_decisions" ("dueDate");

-- ------------------------------------------------------------
-- Foreign keys
-- ------------------------------------------------------------
-- Cascading on purpose: a conference deleted in draft takes its agenda with
-- it, and an agenda point removed before the sitting takes its discussion.
-- After adoption nothing is deletable through the application at all, which is
-- where the real protection sits.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conference_attendees_conferenceId_fkey') THEN
    ALTER TABLE "conference_attendees"
      ADD CONSTRAINT "conference_attendees_conferenceId_fkey"
      FOREIGN KEY ("conferenceId") REFERENCES "theatre_audit_conferences"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conference_issues_conferenceId_fkey') THEN
    ALTER TABLE "conference_issues"
      ADD CONSTRAINT "conference_issues_conferenceId_fkey"
      FOREIGN KEY ("conferenceId") REFERENCES "theatre_audit_conferences"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conference_discussion_points_issueId_fkey') THEN
    ALTER TABLE "conference_discussion_points"
      ADD CONSTRAINT "conference_discussion_points_issueId_fkey"
      FOREIGN KEY ("issueId") REFERENCES "conference_issues"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conference_decisions_issueId_fkey') THEN
    ALTER TABLE "conference_decisions"
      ADD CONSTRAINT "conference_decisions_issueId_fkey"
      FOREIGN KEY ("issueId") REFERENCES "conference_issues"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Replication
-- ------------------------------------------------------------
-- Enabled parent-first, so a child arriving on the far node always finds the
-- row it points at. A child whose parent does not travel parks for ever, which
-- this project has already had happen twice.
--
-- Classified LWW in lib/sync/syncPolicy.ts: each row is one person's typing in
-- one document, and a later edit of the same field is a correction of it. The
-- protection against a conference being rewritten is that adoption seals it in
-- the application, not the merge rule.
SELECT sync_enable_table('theatre_audit_conferences');
SELECT sync_enable_table('conference_attendees');
SELECT sync_enable_table('conference_issues');
SELECT sync_enable_table('conference_discussion_points');
SELECT sync_enable_table('conference_decisions');
