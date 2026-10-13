-- ============================================================
-- Letting the theatre server say how it is, without anyone reaching in
-- ------------------------------------------------------------
-- The theatre server has been invisible three times now, each time for a
-- different reason and each time costing a day:
--
--   23 September — serving a build four days old. Found by noticing the
--   process start time, after the user reported features missing.
--   24 September — a failed migration blocked every deploy. Found by reading
--   a Vercel build log after the page 404ed.
--   13 October  — three weeks behind, SSH blocked for a week while the app
--   itself answered fine. Found by probing routes over a lossy relay and
--   inferring the build from which ones 404ed.
--
-- Every one of those was diagnosable only by reaching INTO the server, and
-- the server is behind a hospital NAT, on a relayed Tailscale link, with ssh
-- currently shut. Reaching in is the part that keeps failing.
--
-- So the direction is reversed. The sync worker already talks OUT to the
-- cloud every cycle, through a NAT that has never been the problem, with a
-- service token it already holds. It now sends a short report of its own
-- state with that traffic, and the cloud keeps the latest one per node.
--
-- A single row per node, overwritten. This is "how is it right now", not a
-- history: a table that grew forever would need pruning, and nobody has ever
-- wanted to know what the theatre server's queue depth was last March.
--
-- NO SECRETS IN IT. Commit, build time, queue depths, versions. Nothing here
-- is worth protecting, which means nothing here has to be protected — the
-- report can be read by any administrator without a second access decision.
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_node_reports (
  node_id       text PRIMARY KEY,
  -- When the node sent it, and when we stored it. Both, because a node with a
  -- wrong clock is itself worth seeing, and silently trusting its timestamp
  -- would make a stale report look fresh.
  reported_at   timestamptz NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  -- Everything the node chose to say. Deliberately loose: the useful fields
  -- will change as the questions do, and a rigid column set would need a
  -- migration every time somebody wanted one more number.
  payload       jsonb       NOT NULL
);

COMMENT ON TABLE sync_node_reports IS
  'Latest self-report from each node, pushed outward with sync traffic. One row per node, overwritten. Exists because reaching INTO the theatre server has failed repeatedly, and it can always reach out.';
