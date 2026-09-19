-- ============================================================
-- The holding area is not a theatre
-- ------------------------------------------------------------
-- It was entered in theatre_suites as though it were one, so it appeared in
-- every theatre picker in the system and a case could be booked into it. It is
-- a waiting area — the same standing as PACU — and no operation is performed
-- there.
--
-- A FLAG, NOT A DELETE. Transfers, patient movements, rosters and allocations
-- already point at that row, and deleting it would orphan the real history of
-- patients who genuinely passed through the holding area on their way to
-- theatre. It stays; it simply stops being offered as somewhere to operate.
--
-- AND NOT A STATUS EITHER. MAINTENANCE and RESERVED both say a theatre is
-- temporarily unusable, which reads as "it will be back". This says the room
-- was never a theatre.
-- ============================================================

ALTER TABLE "theatre_suites"
  ADD COLUMN IF NOT EXISTS "isOperatingRoom" BOOLEAN NOT NULL DEFAULT true;

-- Every room that is a waiting or recovery area rather than a place to
-- operate. Matched on the name because that is the only thing distinguishing
-- them in the data — there has never been a column that said so, which is how
-- the holding area came to be one of the theatres in the first place.
--
-- Deliberately narrow. It matches the holding area, recovery and PACU, and
-- nothing that merely mentions a theatre: "Day-Case Theatre" and "Eye Theatre"
-- are theatres and must keep operating.
UPDATE "theatre_suites"
SET "isOperatingRoom" = false
WHERE "isOperatingRoom" = true
  AND (
       "name" ILIKE '%holding%'
    OR "name" ILIKE '%pacu%'
    OR "name" ILIKE '%recovery%'
  );

-- Any case already booked into one of them is left exactly as it is. Rewriting
-- a booking's theatre from a migration would move a patient's case without
-- anybody deciding to, and the theatre allocation screen is where that
-- decision belongs. The booking screens simply stop offering these rooms from
-- here on.
