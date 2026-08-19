#!/usr/bin/env bash
# =============================================================================
# Did anybody actually hear the radio?
# -----------------------------------------------------------------------------
#   ./check-announcements.sh          report anything worrying
#   ./check-announcements.sh --all    report the numbers even when they are fine
#
# Silence is the failure mode nobody notices. An announcement that appears on
# screen and makes no sound looks, from the server, exactly like one that was
# heard across the theatre — which is how alerts went unheard for weeks before
# 19 August and nothing anywhere recorded it.
#
# So this asks the one question the database can genuinely answer: did each
# announcement ever reach the point of being played.
#
# THE DISTINCTION THAT MATTERS
#
# EXPIRED means an announcement aged out while still PENDING or PLAYING. On its
# own that is ambiguous, and reading it as one thing is how a real fault hides
# behind a normal one:
#
#   lastPlayedAt IS NULL      it was NEVER PLAYED. No window ever produced a
#                             sound for it. This is the silent-alert fault.
#
#   lastPlayedAt IS NOT NULL  it played, possibly many times, and nobody
#                             acknowledged it. That is a people problem, not a
#                             sound problem, and it needs a different
#                             conversation entirely.
#
# Counting EXPIRED without splitting those two would report a busy, answered
# theatre as broken and a silent one as busy.
#
# Read only. It changes nothing, and it is silent when there is nothing wrong,
# so anything it prints is worth reading.
# =============================================================================

set -uo pipefail

APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$APP_DIR" || exit 1

ALL=0
[[ "${1:-}" == "--all" ]] && ALL=1

# How long an announcement may sit unplayed before it counts as stuck. Well
# above the poll interval, so a handset that is merely slow is not reported.
STUCK_MINUTES="${ORM_STUCK_MINUTES:-15}"

read_env_key() {
  local key="$1" file v
  for file in "$APP_DIR/.env.local" "$APP_DIR/.env"; do
    [[ -f "$file" ]] || continue
    v="$(grep -E "^${key}=" "$file" | tail -1 | sed -E "s/^${key}=//; s/^\"//; s/\"$//" || true)"
    [[ -n "$v" ]] && { printf '%s' "$v"; return 0; }
  done
  return 1
}

DB="$(read_env_key DATABASE_URL || true)"; DB="${DB%%\?*}"
[[ -n "$DB" ]] || { echo "check-announcements: no DATABASE_URL" >&2; exit 1; }

q() { psql "$DB" -X -tAc "$1" 2>/dev/null; }

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
say()   { echo "$(stamp) radio: $*"; }

# ---- 1. Never made a sound ---------------------------------------------------
never_played="$(q "
  select count(*) from radio_announcements
   where status = 'EXPIRED' and \"lastPlayedAt\" is null
     and \"createdAt\" > now() - interval '24 hours';")"

# ---- 2. Played, but nobody answered ------------------------------------------
unanswered="$(q "
  select count(*) from radio_announcements
   where status = 'EXPIRED' and \"lastPlayedAt\" is not null
     and \"createdAt\" > now() - interval '24 hours';")"

# ---- 3. Stuck right now ------------------------------------------------------
stuck="$(q "
  select count(*) from radio_announcements
   where status in ('PENDING','PLAYING')
     and \"createdAt\" < now() - interval '$STUCK_MINUTES minutes';")"

# ---- 4. A day that produced nothing at all -----------------------------------
created="$(q "select count(*) from radio_announcements where \"createdAt\" > now() - interval '24 hours';")"
played="$(q "
  select count(*) from radio_announcements
   where \"lastPlayedAt\" is not null and \"lastPlayedAt\" > now() - interval '24 hours';")"

# A database that cannot be read is not a quiet one. Reporting nothing here
# would turn an outage into a clean bill of health.
if [[ -z "$never_played" || -z "$stuck" || -z "$created" ]]; then
  say "could not read the database — no check was performed"
  exit 1
fi

problem=0

if [[ "$never_played" -gt 0 ]]; then
  problem=1
  say "$never_played announcement(s) in the last 24h expired WITHOUT EVER BEING PLAYED."
  say "  Nobody heard these. Check that a window is open and its audio is unlocked;"
  say "  a browser will not make a sound until the page has been touched once."
fi

if [[ "$stuck" -gt 0 ]]; then
  problem=1
  say "$stuck announcement(s) have sat unplayed for over $STUCK_MINUTES minutes."
  say "  Either no window is open anywhere, or the one that is cannot produce audio."
fi

if [[ "$created" -gt 0 && "$played" -eq 0 ]]; then
  problem=1
  say "$created announcement(s) were raised in the last 24h and NONE was played."
  say "  The radio produced no sound at all today."
fi

if [[ $ALL -eq 1 || $problem -eq 1 ]]; then
  # Printed alongside a fault so the reader can see the scale, and on --all so
  # the check can be run by hand to see the shape of a normal day.
  say "last 24h: $created raised, $played played, $never_played never played, $unanswered played but unanswered, $stuck stuck now"
fi

# Deliberately NOT flagged as a fault. An announcement played repeatedly that
# nobody acknowledged is a staffing or workflow question, and putting it in the
# same alert as "the speakers are silent" would blunt both.
if [[ $ALL -eq 1 && "$unanswered" -gt 0 ]]; then
  say "note: $unanswered were played but never acknowledged — heard, not answered."
fi

exit 0
