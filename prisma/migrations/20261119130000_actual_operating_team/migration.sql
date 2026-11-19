-- =============================================================================
-- Who was actually in the room
-- -----------------------------------------------------------------------------
-- A surgery row names the surgeon who was BOOKED. On most lists here that is
-- the consultant who put the case up, and the person who held the knife was a
-- senior registrar. Both facts are true and the record only holds the first,
-- so every figure drawn from surgeonId answers "whose list was this" while
-- reading as though it answered "who did this".
--
-- The assistants are worse off still. They are recorded at booking, as an
-- intention, in surgical_team_members; nothing anywhere says who actually
-- scrubbed. A registrar who assisted on forty cases has forty rows saying she
-- was expected to.
--
-- WHY NOT JUST CORRECT THE SURGERY ROW. The post-operative note already lets
-- the operating surgeon be corrected, and writes it straight over
-- surgeries.surgeonId. That loses the booking -- after the correction nothing
-- remembers whose list it was -- and it has no room for assistants at all.
-- The two questions need two answers, kept side by side.
--
-- APPEND-ONLY, IN SETS. One confirmation writes one row per person, all
-- sharing a confirmationId and a confirmedAt. A correction appends a NEW set;
-- nothing is updated and nothing is deleted. The current team is the newest
-- set, and the ones before it are the trail of what was corrected and by whom.
--
-- That shape is chosen for the sync layer as much as for the audit. An
-- append-only table is unioned between the two nodes and cannot produce a
-- conflict, so a team confirmed on the theatre server and a correction made on
-- the cloud both survive, and the later one shows. The standing rule that the
-- EARLIEST timestamped record wins a conflict is not in play here and must not
-- be applied: it governs two nodes holding rival versions of one booking,
-- where the first is the true one. Here a later set is a human deliberately
-- correcting the earlier -- "first wins" would make correction impossible,
-- which is the entire point of the feature.
--
-- NO FOREIGN KEYS, to surgeries or to users. Deliberate, and the same choice
-- surgery_schedule_drafts documents: a hard FK turns a row whose parent has
-- not synced yet into a refused insert on the other node. That is precisely
-- what stranded a theatre list on 19 November, when one staff account written
-- before capture was enabled took sixty-five child rows down with it. A team
-- member naming a user id that has not arrived yet should be a row waiting to
-- be joined, not a batch that cannot commit.
--
-- Reversible:
--   DROP TABLE "surgery_actual_team";
--   DROP TYPE "ActualTeamRole";
-- =============================================================================

-- What a person DID on this case, as distinct from their grade. A consultant
-- who assisted a registrar is CONSULTANT doing ASSISTANT, and counting that as
-- a consultant case would hide the one thing a training record is for.
--
-- Anaesthesia is in the same table rather than one of its own. The question
-- is identical -- who was actually in the room, as against who was booked --
-- and the anaesthetist is the post most often swapped on the morning, because
-- the anaesthetic rota is drawn up after the lists are. A separate table would
-- have needed the same confirmation screen, the same correction trail and the
-- same board, written twice and able to disagree.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActualTeamRole') THEN
    CREATE TYPE "ActualTeamRole" AS ENUM (
      'PRIMARY_SURGEON',
      'ASSISTANT',
      'ANAESTHETIST',
      'ANAESTHETIC_ASSISTANT'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "surgery_actual_team" (
  "id"              TEXT NOT NULL,
  "surgeryId"       TEXT NOT NULL,

  -- Every row written by one confirmation shares this. It is what makes "the
  -- current team" a single cheap lookup instead of a reconstruction, and what
  -- keeps a half-written correction from ever being read as the answer.
  "confirmationId"  TEXT NOT NULL,
  "confirmedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedById"   TEXT NOT NULL,
  -- Denormalised on purpose. This is a record of an attestation, and an
  -- attestation that cannot be read without a working join to a user table on
  -- the other node is not much of a record.
  "confirmedByName" TEXT NOT NULL,

  -- Null for a visiting surgeon with no account here. They still operated and
  -- the case still has to say so; they simply cannot be counted on a board
  -- that is keyed on staff.
  "userId"          TEXT,
  "memberName"      TEXT NOT NULL,
  "staffCode"       TEXT,

  "role"            "ActualTeamRole" NOT NULL,
  -- Their grade on the day: CONSULTANT | SENIOR_REGISTRAR | REGISTRAR |
  -- HOUSE_OFFICER, matching SurgicalTeamRole. Left as text rather than reusing
  -- that enum because a grade recorded against a finished case is a historical
  -- fact, and should not change under it if the enum is ever extended.
  "grade"           TEXT,

  -- 0 for the operating surgeon, 1 for the first assistant, 2 for the second.
  -- Order matters on an operation note and in a logbook; "an assistant" is not
  -- the same claim as "the first assistant".
  "position"        INTEGER NOT NULL DEFAULT 0,

  -- "Took over at closure", "scrubbed for the second procedure only".
  "notes"           TEXT,

  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "surgery_actual_team_pkey" PRIMARY KEY ("id")
);

-- The question every read asks: who is on this case now. Newest set first.
CREATE INDEX IF NOT EXISTS "surgery_actual_team_surgeryId_confirmedAt_idx"
  ON "surgery_actual_team" ("surgeryId", "confirmedAt" DESC);

-- The question the performance board asks: what has this person done, and when.
CREATE INDEX IF NOT EXISTS "surgery_actual_team_userId_confirmedAt_idx"
  ON "surgery_actual_team" ("userId", "confirmedAt");

-- Fetching one confirmation whole, for the correction trail.
CREATE INDEX IF NOT EXISTS "surgery_actual_team_confirmationId_idx"
  ON "surgery_actual_team" ("confirmationId");

-- Replicated. A case confirmed in theatre must count on the cloud board, and a
-- correction typed on the cloud must reach the node.
SELECT sync_enable_table('surgery_actual_team');
