-- ============================================================
-- A booking that has been started but not yet made
-- ------------------------------------------------------------
-- The booking form asks for a great deal — patient, procedure, theatre, a full
-- set of pre-operative safety results, consent, and two pack lists — and it was
-- all or nothing. A phone that slept, a battery that went flat, a nurse called
-- away mid-form: everything typed was gone and the surgeon began again at the
-- patient search.
--
-- On a hospital link that is not a rare event, and the consequence is not
-- merely irritation. It is why long forms get abandoned halfway and why cases
-- end up booked on paper and entered later, or not at all.
--
-- Each section is saved here as it is completed, so that "what happens if
-- something interrupts me" is answered with "you carry on where you stopped".
--
-- ONE DRAFT PER PERSON. A queue of half-finished bookings is worse than none:
-- it invites somebody to resume the wrong one and book a procedure against the
-- wrong patient. Starting a new booking while a draft exists asks, explicitly,
-- whether to resume it or discard it.
--
-- NOT CLASSIFIED FOR SYNC, deliberately. This is work in progress rather than a
-- clinical record, finished within minutes on the device it began on.
-- Replicating a half-completed booking would put a second resumable copy on the
-- other node — which is the duplicate-case problem again, arriving by a new
-- route.
-- ============================================================

CREATE TABLE IF NOT EXISTS "surgery_drafts" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "data"        JSONB NOT NULL,
    "step"        TEXT NOT NULL DEFAULT 'patient',
    "patientId"   TEXT,
    "patientName" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surgery_drafts_pkey" PRIMARY KEY ("id")
);

-- One per person, enforced by the database rather than by the code that happens
-- to write it. Two tabs open on one account must not be able to create two.
CREATE UNIQUE INDEX IF NOT EXISTS "surgery_drafts_userId_key"
    ON "surgery_drafts" ("userId");

-- Abandoned drafts are swept by age; this is the index that sweep uses.
CREATE INDEX IF NOT EXISTS "surgery_drafts_updatedAt_idx"
    ON "surgery_drafts" ("updatedAt");
