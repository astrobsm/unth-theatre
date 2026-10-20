-- ============================================================
-- Turning the theatre radio down from somewhere else
-- ------------------------------------------------------------
-- One row. Every open radio window reads it on its next queue poll and
-- applies it, so the corridor speaker can be turned down at two in the
-- morning without anybody walking to the theatre.
--
-- THE FLOOR FOR EMERGENCIES IS NOT STORED HERE. It lives in
-- lib/radio/volume.ts, where it cannot be edited by whoever is holding the
-- slider. The player already refuses to let the per-device mute silence an
-- emergency, for a reason recorded in that code: a muted emergency is not
-- merely silent, it is consumed -- the queue retires it as delivered and
-- nobody in the room ever hears it. A remote volume of zero would recreate
-- that from a distance, set by somebody who cannot hear that nothing
-- happened.
--
-- The change is attributed. A radio turned down from home that later costs a
-- missed emergency call is a decision somebody made.
--
-- Seeded with the single row so a fresh install starts at full volume rather
-- than at whatever a missing row would be read as.
-- ============================================================

CREATE TABLE IF NOT EXISTS "radio_settings" (
  "id"            TEXT NOT NULL DEFAULT 'singleton',
  "volume"        DOUBLE PRECISION NOT NULL DEFAULT 1,
  "routineMuted"  BOOLEAN NOT NULL DEFAULT false,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById"   TEXT,
  "updatedByName" TEXT,
  "note"          TEXT,

  CONSTRAINT "radio_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "radio_settings" ("id") VALUES ('singleton')
  ON CONFLICT ("id") DO NOTHING;
