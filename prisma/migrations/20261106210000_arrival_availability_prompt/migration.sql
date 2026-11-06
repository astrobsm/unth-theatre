-- Why a check-in has no position.
--
-- Asked for on 6 November 2026:
--
--   "when a user arrives at the hospital and logs in, if his name is on any
--    booked case he gets a pop up to indicate his availability status
--    (location must be accessible; if denied by the user, notify him that
--    his availability status cannot be ascertained and may be considered
--    absent)"
--
-- NO_FIX has meant three different things at once: the person refused
-- permission, the handset was in a basement, or the page was served over
-- plain http on the theatre server. Only the first is a choice somebody
-- made, and only the first is something a coordinator should weigh when a
-- check-in cannot be corroborated. The arrival prompt now says to the person,
-- in as many words, that a refusal leaves their availability unverifiable --
-- so the record has to be able to say which of the three happened.
--
-- Nullable on both tables: every check-in already recorded has no reason, and
-- inventing one would be a lie about a named person's attendance.
--
-- Guarded. Plain double-dash comments only; a Prisma triple-slash doc comment
-- in a migration once broke `migrate deploy`.

ALTER TABLE "surgery_team_check_ins"
  ADD COLUMN IF NOT EXISTS "locationUnavailableReason" TEXT;

ALTER TABLE "emergency_team_availability"
  ADD COLUMN IF NOT EXISTS "locationUnavailableReason" TEXT;

-- No sync_enable_table calls: both tables are already captured, and
-- sync_capture() uses to_jsonb(NEW), so a new column travels with its row.
