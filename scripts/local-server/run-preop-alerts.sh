#!/usr/bin/env bash
# =============================================================================
# Fire the hour-before "send for the patient" call from THIS server
# -----------------------------------------------------------------------------
#   ./run-preop-alerts.sh          run it
#   ./run-preop-alerts.sh --check  say what would happen, change nothing
#
# WHY THIS EXISTS
#
# /api/maintenance/preop-alerts is what puts "kindly send for the patient" on
# the theatre radio an hour before a case is due. It is not a loop inside the
# app — nothing calls it unless something outside asks — and the only thing
# that asked was the Vercel cron, which runs in the cloud.
#
# radio_announcements replicates, so while the link is up the cloud raises the
# call and it reaches the theatre. The link being up is exactly the assumption
# a local server exists to remove. During an outage — the hours that most need
# a working theatre radio — the hour-before call was never raised at all, and
# the failure is silent: no error anywhere, just a patient nobody was asked to
# send for.
#
# So the local server now asks for itself, every five minutes through the
# operating day. The endpoint is idempotent per surgery (a unique constraint,
# not a timing guess), so both schedulers running is harmless: whichever gets
# there first creates the alert and the other is a no-op.
#
# LOCALHOST, NOT THE PUBLIC NAME. 127.0.0.1:3000 is the pm2 app on this box. It
# needs no DNS, no TLS and no internet — which matters, because the whole point
# is the case where none of those are available.
# =============================================================================

set -uo pipefail

APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$APP_DIR" || exit 1

CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

PORT="${ORM_PORT:-3000}"
URL="http://127.0.0.1:${PORT}/api/maintenance/preop-alerts"

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
say()   { echo "$(stamp) preop-alerts: $*"; }

read_env_key() {
  local key="$1" file v
  for file in "$APP_DIR/.env.local" "$APP_DIR/.env"; do
    [[ -f "$file" ]] || continue
    v="$(grep -E "^${key}=" "$file" | tail -1 | sed -E "s/^${key}=//; s/^\"//; s/\"$//" || true)"
    [[ -n "$v" ]] && { printf '%s' "$v"; return 0; }
  done
  return 1
}

SECRET="$(read_env_key CRON_SECRET || true)"
if [[ -z "$SECRET" ]]; then
  # Without it the endpoint answers 401 and the alerts silently never run,
  # which is the fault this script was added to remove. Say so loudly.
  say "NO CRON_SECRET in .env.local — the endpoint will refuse this call."
  say "  Generate one:  openssl rand -hex 32"
  say "  Add it as CRON_SECRET=... to .env.local, then: pm2 restart orm"
  exit 1
fi

if [[ $CHECK -eq 1 ]]; then
  say "would POST $URL with the CRON_SECRET bearer token"
  exit 0
fi

# --max-time so a wedged app cannot leave cron processes piling up every five
# minutes. -s -w to capture the status separately from the body.
body="$(curl -sS --max-time 45 -w '\n%{http_code}' \
  -H "Authorization: Bearer ${SECRET}" \
  "$URL" 2>&1)"
code="$(printf '%s' "$body" | tail -1)"
payload="$(printf '%s' "$body" | sed '$d')"

case "$code" in
  200)
    # Report only what a person would act on: how many calls actually went out.
    alerted="$(printf '%s' "$payload" | grep -oE '"alerted":[0-9]+' | head -1 | cut -d: -f2)"
    examined="$(printf '%s' "$payload" | grep -oE '"examined":[0-9]+' | head -1 | cut -d: -f2)"
    # A dry run means the bearer token did not authenticate and it fell through
    # to a session. Nothing was sent, and without this it would look like a
    # quiet success for as long as nobody read the log.
    if printf '%s' "$payload" | grep -q '"dryRun":true'; then
      say "DRY RUN — nothing was sent. The CRON_SECRET bearer was not accepted."
      exit 1
    fi
    if [[ -n "${alerted:-}" && "$alerted" != "0" ]]; then
      say "raised ${alerted} pre-op call(s)${examined:+ from ${examined} case(s) examined}"
    fi
    # Silent when there was nothing to do — cron mail should mean something.
    ;;
  401|403)
    say "REFUSED (HTTP $code). CRON_SECRET is set but the app has not picked it up."
    say "  Next reads .env.local at boot:  pm2 restart orm"
    exit 1
    ;;
  000)
    say "no answer from $URL — is the app running?  pm2 list"
    exit 1
    ;;
  *)
    say "HTTP $code from $URL"
    printf '%s\n' "$payload" | head -3
    exit 1
    ;;
esac
