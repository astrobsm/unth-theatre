-- Clinical heads of department, so the Theatre Audit Committee can be named by
-- role instead of by a list of individuals.
--
-- Only the heads that did not already exist. CSSD, the oxygen unit, works and
-- the power plant already have head-level roles — CSSD_SUPERVISOR is labelled
-- "CSSD HOD" and OXYGEN_UNIT_SUPERVISOR "Oxygen Tech HOD" — and giving one job
-- two roles splits its people across both, so those are reused as they are.
--
-- IF NOT EXISTS because a re-run must not fail; ALTER TYPE ... ADD VALUE is
-- permitted inside a transaction on PostgreSQL 12 and later provided the new
-- value is not USED in the same transaction, and nothing here uses them.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'HEAD_OF_ANAESTHESIA';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'HEAD_OF_SURGERY';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'HEAD_OF_OBSTETRICS_GYNAECOLOGY';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'HEAD_OF_PHARMACY';
