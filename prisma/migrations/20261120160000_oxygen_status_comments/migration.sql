-- =============================================================================
-- Theatre answering the oxygen room
-- -----------------------------------------------------------------------------
-- oxygen_readiness_reports is a broadcast. The oxygen room writes a pressure,
-- a cylinder bank level and a per-theatre tick, and that is the end of the
-- conversation: there is no column anywhere for somebody standing at the
-- outlet to say "this does not match my gauge" or "the Theatre 3 flowmeter is
-- dead". The information flows one way, from the room that cannot see the
-- theatre to the theatre that cannot answer back.
--
-- That gap is the whole reason this table exists. An anaesthetic technician
-- setting up at 11:40 is the person best placed to tell the oxygen room its
-- own posting has gone stale, and until now his only channel was a telephone
-- number he did not have.
--
-- NOT A CHAT. Three kinds of message, each with a job:
--   CONFIRM_REQUEST     -- "I am setting up; is this status still good?"
--   ADJUSTMENT_REQUEST  -- "Change the cylinder / the T2 outlet is low."
--   OBSERVATION         -- a note for the record, asking nothing.
-- and one answer, carrying an outcome. A free thread between two rooms becomes
-- a chat nobody reads with the one urgent line on page two.
--
-- ANSWERED IN PLACE, not appended. A request and its answer are one exchange,
-- and the question every screen asks is "what is still waiting on the oxygen
-- room" -- which is a lookup on status, not a reconstruction from a stream.
-- Hence LWW rather than APPEND_ONLY in syncPolicy: the answer is the later and
-- correct intent for that row. The standing rule that the EARLIEST timestamp
-- wins a conflict governs two nodes holding rival versions of one booking; it
-- is not in play here, where the second write is a person deliberately
-- answering the first.
--
-- NO FOREIGN KEYS, to oxygen_readiness_reports or to users. The same choice
-- surgery_actual_team and surgery_schedule_drafts document: a hard FK turns a
-- row whose parent has not synced yet into a refused insert on the other node,
-- which is exactly what stranded a theatre list on 19 November. A comment
-- naming a report id that has not arrived should be a row waiting to be
-- joined, not a batch that cannot commit. The report's own timestamp and the
-- author's name are denormalised here for the same reason: this has to be
-- readable on the node where the join does not yet resolve.
--
-- Reversible:
--   DROP TABLE "oxygen_status_comments";
-- =============================================================================

CREATE TABLE IF NOT EXISTS "oxygen_status_comments" (
  "id"            TEXT NOT NULL,

  -- The posting being commented on. Null is legitimate: a technician who finds
  -- NOTHING posted at 11:40 has the most urgent thing to say of anybody, and
  -- refusing his comment for want of a report to attach it to would silence
  -- precisely the case this is for.
  "reportId"      TEXT,
  "reportedAt"    TIMESTAMP(3),

  -- Where the commenter was standing. Free text, matching the theatre names
  -- used by anesthesia_setup_logs rather than an id, because A&E North Wing
  -- and the Eye Theatre are named differently in three tables already.
  "theatreName"   TEXT,
  "setupLogId"    TEXT,

  -- CONFIRM_REQUEST | ADJUSTMENT_REQUEST | OBSERVATION
  "kind"          TEXT NOT NULL,
  "body"          TEXT,

  "authorId"      TEXT,
  "authorName"    TEXT NOT NULL,
  "authorRole"    TEXT,

  -- OPEN | ANSWERED
  "status"        TEXT NOT NULL DEFAULT 'OPEN',

  "answeredAt"      TIMESTAMP(3),
  "answeredById"    TEXT,
  "answeredByName"  TEXT,
  -- CONFIRMED | ADJUSTED | DECLINED
  "answerOutcome"   TEXT,
  "answerBody"      TEXT,

  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "oxygen_status_comments_pkey" PRIMARY KEY ("id")
);

-- The question the oxygen room's own screen asks: what is still waiting on me.
CREATE INDEX IF NOT EXISTS "oxygen_status_comments_status_createdAt_idx"
  ON "oxygen_status_comments" ("status", "createdAt" DESC);

-- The question every other screen asks: what has been said about this posting.
CREATE INDEX IF NOT EXISTS "oxygen_status_comments_reportId_idx"
  ON "oxygen_status_comments" ("reportId");

-- The thread, newest first, which is how it is read on a phone.
CREATE INDEX IF NOT EXISTS "oxygen_status_comments_createdAt_idx"
  ON "oxygen_status_comments" ("createdAt" DESC);

-- Replicated. A request raised in theatre must reach the oxygen room whichever
-- node either of them happens to be on.
SELECT sync_enable_table('oxygen_status_comments');
