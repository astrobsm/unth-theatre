-- ============================================================
-- Who booked the case belongs on the case
-- ------------------------------------------------------------
-- The case-readiness card reads "Booked by: Unknown" for 43% of cases. The
-- name was never stored on the surgery; it was read from the surgery's
-- CONSUMABLE REQUEST rows, whichever of them happened to carry a requestedById.
--
-- So the name existed only when the case had a consumable pack. Measured on
-- the theatre server: of 592 surgeries, 255 have no consumable rows at all and
-- a further 11 have rows with no requester, leaving 266 permanently unknowable.
--
-- That is exactly backwards. The card names the booker so somebody can chase a
-- pack that has not been prescribed — so the single situation where the name
-- is needed is the situation in which it had been derived out of existence.
-- The screenshot that prompted this shows both halves of the contradiction at
-- once: "Consumable: Not prescribed" beside "Booked by: Unknown", and a
-- "WhatsApp" button with no number behind it.
--
-- The sync layer made it worse rather than causing it. A case booked here
-- whose pack rows have not yet replicated reads as booked-by-nobody on the
-- cloud while reading correctly in theatre: 7 cases in the last 14 days on the
-- cloud against 2 here. Deriving an identity from a child row means the answer
-- changes depending on which database is asked.
--
-- BOTH ID AND NAME ARE STORED. An id is only a name if the row it points at is
-- present, and this system runs on two databases that are not always in step.
-- The id is kept for the phone number, which is what makes the WhatsApp button
-- work; the name is what survives on a node that has never seen that user.
--
-- No foreign key, deliberately — as with theatreId and preopOverrideById.
-- users is CLOUD_AUTHORITATIVE, and a booking must never be rejected on a node
-- that has not yet received the booker's account.
-- ============================================================

ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "bookedById"   TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "bookedByName" TEXT;

-- ---- Backfill 1: the audit log -------------------------------------------
-- CREATE_SURGERY has been written on every booking through /api/surgeries for
-- longer than the pack rows have carried a requester, and it names the user
-- directly. It identifies 491 of 592 cases, including 237 that have no
-- consumable rows and could not otherwise be recovered at all.
--
-- DISTINCT ON with the earliest row: a surgery should have exactly one
-- CREATE_SURGERY, but ordering explicitly means a duplicated audit row cannot
-- make the result depend on physical row order.
UPDATE "surgeries" s
   SET "bookedById"   = a."userId",
       "bookedByName" = u."fullName"
  FROM (
    SELECT DISTINCT ON ("recordId") "recordId", "userId"
      FROM "audit_logs"
     WHERE "tableName" = 'surgeries'
       AND "action"    = 'CREATE_SURGERY'
       AND "userId" IS NOT NULL
     ORDER BY "recordId", "createdAt" ASC
  ) a
  LEFT JOIN "users" u ON u."id" = a."userId"
 WHERE s."id" = a."recordId"
   AND s."bookedById" IS NULL;

-- ---- Backfill 2: the consumable rows -------------------------------------
-- The original source, now the fallback. Recovers cases booked before the
-- audit log existed. Same DISTINCT ON reasoning; requestedByName is preferred
-- over the joined user only when the join finds nothing, so a renamed account
-- still reports the name it has now.
UPDATE "surgeries" s
   SET "bookedById"   = r."requestedById",
       "bookedByName" = COALESCE(u."fullName", r."requestedByName")
  FROM (
    SELECT DISTINCT ON ("surgeryId") "surgeryId", "requestedById", "requestedByName"
      FROM "surgery_consumable_requests"
     WHERE "requestedById" IS NOT NULL
        OR BTRIM(COALESCE("requestedByName", '')) <> ''
     ORDER BY "surgeryId", "createdAt" ASC
  ) r
  LEFT JOIN "users" u ON u."id" = r."requestedById"
 WHERE s."id" = r."surgeryId"
   AND s."bookedById" IS NULL
   AND s."bookedByName" IS NULL;

-- 29 cases remain unattributable — all booked in June and July 2026, 26 of
-- them emergencies, all predating both sources. They are left NULL rather than
-- filled with a guess: "not recorded" is a true statement about an old case,
-- and inventing a plausible booker for a clinical record is not a rounding
-- error. The readiness endpoint distinguishes the two.

-- Answering "which cases have no booker" is the whole point of the change, and
-- it is a scan of a growing table otherwise.
CREATE INDEX IF NOT EXISTS "surgeries_bookedById_idx" ON "surgeries" ("bookedById");
