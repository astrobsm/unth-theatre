-- Replicate the emergency board.
--
-- WHY THIS EXISTS
--
-- On 27 August the theatre heard an emergency alert for a case no screen in the
-- building could show. The Surgery row replicated. The RadioAnnouncement row
-- replicated. The EmergencySurgeryBooking that the emergency display actually
-- renders from did not — it was in neither the sync policy nor the capture
-- triggers. Cloud held 123 bookings, the theatre server held 121, and the two
-- missing ones were the live emergency.
--
-- It was repaired by hand that day. This stops it recurring, and it also closes
-- the second symptom: a /dashboard link carrying an id that exists on one node
-- and 404s on the other.
--
-- Both tables have a real `id` column, which the capture trigger requires — it
-- reads row_id as to_jsonb(NEW)->>'id'. (idempotency_keys is keyed on `key`
-- instead, which is why inserts there fail with a NULL row_id; unrelated, but
-- worth knowing before enabling anything else.)
--
-- sync_enable_table is idempotent: it adds the sync columns if absent and
-- re-creates the triggers.

SELECT sync_enable_table('emergency_surgery_bookings');
SELECT sync_enable_table('emergency_surgery_alerts');
