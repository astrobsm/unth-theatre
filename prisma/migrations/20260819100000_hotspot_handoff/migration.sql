-- ============================================================
-- Carrying a signed-in session out of the captive-portal browser
-- ------------------------------------------------------------
-- Staff joining UNTH-THEATRE-ORM sign in inside the operating system's captive
-- network assistant. Two properties of that window, neither of them ours to
-- change, break the handover to the app:
--
--   The OS destroys it. Once the router grants access the phone's connectivity
--   probe succeeds, the system decides the portal is finished, and closes the
--   window. That is why the dashboard "flashed and then disappeared" — it was
--   being loaded into a window already condemned.
--
--   Its cookies are its own. The session set during portal sign-in is invisible
--   to Safari and Chrome, so opening the app afterwards shows a login screen.
--
-- A cookie cannot cross that gap, so a token does: minted in the assistant
-- where the session exists, redeemed once in the real browser.
--
-- Only the SHA-256 hash is stored, so a copy of this table yields no working
-- token. Ten-minute lifetime. Single use is enforced by a conditional UPDATE on
-- used_at rather than read-then-write, so two taps on a flaky connection cannot
-- both redeem it.
--
-- NOT classified for sync, deliberately: the row is per-device, lives ten
-- minutes, and means nothing on the node that did not issue it. Replicating a
-- live credential between buildings would be all risk and no benefit.
-- ============================================================

CREATE TABLE IF NOT EXISTS "hotspot_handoffs" (
    "id"         TEXT NOT NULL,
    "tokenHash"  TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "deviceMac"  TEXT,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "usedAt"     TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotspot_handoffs_pkey" PRIMARY KEY ("id")
);

-- The lookup is by hash and must be exact and unique: it is what makes a
-- redemption a single row rather than a scan.
CREATE UNIQUE INDEX IF NOT EXISTS "hotspot_handoffs_tokenHash_key"
    ON "hotspot_handoffs" ("tokenHash");

-- Expired rows are swept, not read; this is the index that sweep uses.
CREATE INDEX IF NOT EXISTS "hotspot_handoffs_expiresAt_idx"
    ON "hotspot_handoffs" ("expiresAt");
