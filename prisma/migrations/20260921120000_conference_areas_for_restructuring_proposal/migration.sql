-- ============================================================
-- Areas the restructuring proposal actually covers
-- ------------------------------------------------------------
-- The conference agenda is now the Theatre Team's submission to the Chief
-- Medical Director of 8th September 2026 (UNTH/THTR/TT/CMD/2026/09-02), whose
-- eleven prayers run well outside the areas first defined here: three concern
-- infection prevention (attire and zoning, environmental services, the IPC and
-- quality assurance function), one the integration of blood transfusion,
-- radiology, pharmacy and laboratory, one the charge for emergency treatment
-- and the fund it is met from, one the ICT and records establishment, and one
-- the governance of the whole.
--
-- Filing those under OTHER would defeat the grouping the analysis depends on,
-- and a proposal mis-filed is a proposal the committee cannot find.
--
-- FINANCE_AND_REVENUE is kept apart from the clinical areas deliberately. The
-- proposal at paragraph 8 turns on section 20 of the National Health Act and
-- on a revolving fund; it is decided with Finance and Legal in the room, not
-- without them, and the agenda should show that at a glance.
-- ============================================================

ALTER TYPE "ConferenceArea" ADD VALUE IF NOT EXISTS 'INFECTION_PREVENTION';
ALTER TYPE "ConferenceArea" ADD VALUE IF NOT EXISTS 'DIAGNOSTIC_AND_SUPPORT';
ALTER TYPE "ConferenceArea" ADD VALUE IF NOT EXISTS 'FINANCE_AND_REVENUE';
ALTER TYPE "ConferenceArea" ADD VALUE IF NOT EXISTS 'ICT_AND_DOCUMENTATION';
ALTER TYPE "ConferenceArea" ADD VALUE IF NOT EXISTS 'GOVERNANCE';
