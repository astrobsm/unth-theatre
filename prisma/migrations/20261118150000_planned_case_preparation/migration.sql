-- =============================================================================
-- A plan the theatre can prepare for, and publish without retyping
-- -----------------------------------------------------------------------------
-- surgery_schedule_drafts holds what a unit intends to operate. It carried
-- enough to NAME the case and not enough to PREPARE for it: no blood, no
-- diathermy, no stereo, no mattress, no day-case flag, no destination after
-- theatre. All of those are things the booking form asks and the pack, the
-- pharmacy and the recovery room act on.
--
-- Two consequences, both of which this closes.
--
-- PUBLISHING MEANT RETYPING. The plan becomes a surgery through the ordinary
-- booking route, and everything the plan did not carry had to be entered
-- again at the moment of publishing -- which is the moment somebody is trying
-- to get a case onto a list, and so the moment they are least likely to stop
-- and fill in a pack request. It was entered later, or not at all.
--
-- AND THE PHARMACY COULD NOT PREPARE. The whole point of knowing a fortnight
-- in advance is that somebody can order what the case needs. A plan that does
-- not say what it needs tells them only that an operation is coming.
--
-- NOTHING HERE IS CLINICAL ASSESSMENT. These are REQUESTS -- what the unit
-- says the case will need -- not findings about the patient. The labs, the
-- consent, the risk scores and the on-duty team stay out of the plan on
-- purpose: a draft that invented values for those would be recording as fact
-- things nobody has checked. See src/lib/surgeryDrafts/draft.ts.
--
-- AND NO THEATRE. Deliberately. The booking form stopped letting the booker
-- choose one, because when each booker picked a room a single unit's cases
-- ended up scattered across three of them; a unit gets a room for the session
-- and works its own list in it. A "preferred theatre" on the plan would put
-- that choice back, one step earlier, where it is even less informed.
--
-- All nullable or defaulted, so every existing plan stays valid exactly as it
-- is. No index is added: these are read with the row, never searched on.
-- =============================================================================

ALTER TABLE "surgery_schedule_drafts"
  -- What the case will need, in the same words the booking form uses, so
  -- publishing can hand them straight to POST /api/surgeries.
  ADD COLUMN IF NOT EXISTS "needBloodTransfusion"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "needDiathermy"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "needStereo"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "needMontrellMattress"  BOOLEAN NOT NULL DEFAULT false,
  -- Anything the four flags do not cover, in the booker's own words. This is
  -- what the store reads when it is picking a tray for an unusual case.
  ADD COLUMN IF NOT EXISTS "otherSpecialNeeds"     TEXT,

  -- Where the patient goes afterwards, and whether they go home the same day.
  -- Recovery and the ward both plan around these, and a day case that nobody
  -- knew was a day case occupies a bed that had been given away.
  ADD COLUMN IF NOT EXISTS "isDayCase"             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "postOpDestination"     TEXT,

  -- Which site the unit operates at. Not a theatre: the location is how the
  -- unit list itself is filtered, and the booking form asks for it before it
  -- will offer a unit at all.
  ADD COLUMN IF NOT EXISTS "location"              TEXT;

-- The capture trigger already replicates this table (see the migration that
-- created it); new columns on a captured table need no further registration.
