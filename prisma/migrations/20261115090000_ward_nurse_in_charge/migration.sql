-- ============================================================
-- Ward Nurse-in-Charge: the ward's own account in the theatre workflow
-- ------------------------------------------------------------
-- Every theatre case begins and ends on a ward, and the ward had no login.
-- Two things already in this database show what that cost.
--
-- patient_call_ups carries theatre_porter_arrived_at_ward_time,
-- theatre_porter_departed_ward_time and ward_nurse_name, and the schema
-- comment beside them says how they are collected: handwritten by the ward
-- nurse on the printout, then transcribed in the holding area. The person who
-- knows the two times writes them on paper for somebody who was not there to
-- type in afterwards.
--
-- And "PATIENT_EN_ROUTE" with patient_en_route_at are read by the patient
-- journey timeline, the PACU discharge summary and the holding-area chase,
-- and written by no route in the application at all. The "en route to
-- theatre" line on every patient's journey is blank on every patient,
-- because the only honest source for it is the nurse who sent the patient,
-- and that nurse had no account to say so from.
--
-- This migration adds the actor, not the work. The work is already expected.
-- ============================================================

-- ---------------------------------------------------------------------------
-- The role. A ward nurse is not a perioperative nurse, and borrowing
-- SCRUB_NURSE to avoid a migration would have given the ward the theatre's
-- access and left the audit trail saying a scrub nurse did it.
-- ---------------------------------------------------------------------------
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'WARD_NURSE_IN_CHARGE';

-- ---------------------------------------------------------------------------
-- The posting: the ONE ward this account is in charge of.
--
-- Nullable, so existing rows migrate and so an administrator may create the
-- account before deciding the posting. NULL means "nobody has said which
-- ward" and the application resolves it to NO cases -- never to every ward.
-- See wardScopeOf() in src/lib/ward/nurseInCharge.ts, which returns that
-- unset state explicitly so that a call site cannot read it as "any ward".
--
-- Not folded into "department": that column is chosen from a fixed list of
-- departments, every existing account already has a real value in it, and a
-- ward is not a department.
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wardAssignment" TEXT;

-- No sync registration is needed. `users` is already captured and classified
-- CLOUD_AUTHORITATIVE in src/lib/sync/syncPolicy.ts, the capture trigger
-- diffs whatever columns the row has, and a short ward name is neither a blob
-- to omit nor a heartbeat to ignore.
