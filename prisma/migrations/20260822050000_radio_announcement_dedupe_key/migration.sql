-- An indexable dedupe key for radio announcements.
--
-- The scheduler asked "have I already announced this?" with
--   metadata LIKE '%"emergencyBookingId":"abc"%'
-- A leading-wildcard match on an unindexed TEXT column cannot use a B-tree, so
-- every check read the entire table. Measured before this change:
--
--   seq_scan      2,088,030
--   seq_tup_read  4,666,644,002
--
-- on a 2,713-row table, four checks per poll, 14,464 polls a day.
ALTER TABLE "radio_announcements" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

CREATE INDEX IF NOT EXISTS "radio_announcements_dedupeKey_idx"
  ON "radio_announcements" ("dedupeKey");

-- Backfill from the metadata already stored, so existing announcements keep
-- being recognised as duplicates and the scheduler does not re-announce a
-- fortnight of old events the moment this ships.
UPDATE "radio_announcements"
SET "dedupeKey" = 'emergencyBookingId:' || (regexp_match(metadata, '"emergencyBookingId":"([^"]+)"'))[1]
WHERE "dedupeKey" IS NULL AND metadata LIKE '%"emergencyBookingId":%';

UPDATE "radio_announcements"
SET "dedupeKey" = 'emergencyPrescriptionId:' || (regexp_match(metadata, '"emergencyPrescriptionId":"([^"]+)"'))[1]
WHERE "dedupeKey" IS NULL AND metadata LIKE '%"emergencyPrescriptionId":%';

UPDATE "radio_announcements"
SET "dedupeKey" = 'surgeryReminderId:' || (regexp_match(metadata, '"surgeryReminderId":"([^"]+)"'))[1]
WHERE "dedupeKey" IS NULL AND metadata LIKE '%"surgeryReminderId":%';

UPDATE "radio_announcements"
SET "dedupeKey" = 'announcementId:' || (regexp_match(metadata, '"announcementId":"([^"]+)"'))[1]
WHERE "dedupeKey" IS NULL AND metadata LIKE '%"announcementId":%';
