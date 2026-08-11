#!/usr/bin/env bash
# =============================================================================
# Run one SQL statement against Supabase over HTTPS and print the JSON result.
# -----------------------------------------------------------------------------
#   ./supabase-sql.sh "select count(*) from patients"
#   ./supabase-sql.sh -f query.sql
#
# Same transport as supabase-migrate.sh — the Management API on 443 — because
# outbound 5432/6543 is blocked on most of the networks this gets run from.
# That script applies migration FILES and refuses anything else; this one is
# for the ad-hoc read you need when something has gone wrong and you are not
# at the hospital.
#
# It prints whatever the API returns and does not interpret it. Use psql when
# you can reach the database directly; this is the fallback that always works.
# =============================================================================

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-gynkghgypuuvpxkfagcu}"
API="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"

TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
if [[ -z "$TOKEN" && -f "$HOME/.orm-supabase-token" ]]; then
  TOKEN="$(tr -d '[:space:]' < "$HOME/.orm-supabase-token")"
fi
[[ -n "$TOKEN" ]] || { echo "No token. export SUPABASE_ACCESS_TOKEN or write ~/.orm-supabase-token" >&2; exit 1; }

if [[ "${1:-}" == "-f" ]]; then
  [[ -f "${2:-}" ]] || { echo "No such file: ${2:-}" >&2; exit 1; }
  SQL="$(cat "$2")"
else
  SQL="${1:-}"
fi
[[ -n "$SQL" ]] || { echo "Usage: $0 \"<sql>\" | $0 -f <file>" >&2; exit 1; }

# node builds the JSON body: jq is not installed everywhere, and hand-rolled
# escaping corrupts anything containing quotes or newlines.
BODY="$(printf '%s' "$SQL" | node -e "
  let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>
    process.stdout.write(JSON.stringify({query:s})));")"

curl -s -m 180 -X POST "$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$BODY"
echo
