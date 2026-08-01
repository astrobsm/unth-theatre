-- Device label on an emergency acknowledgement.
--
-- The specification asks each acknowledgement to record a device identifier
-- alongside the timestamp, identity and position. Nullable, because every
-- acknowledgement recorded before this column existed has none and none can
-- be invented for them.
--
-- Additive only.

ALTER TABLE "emergency_team_availability" ADD COLUMN "deviceLabel" TEXT;
