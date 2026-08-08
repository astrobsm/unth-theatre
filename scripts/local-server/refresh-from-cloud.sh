#!/usr/bin/env bash
# =============================================================================
# Pull the cloud's data down again, replacing what is here.
# -----------------------------------------------------------------------------
# Run this on the local server when the internet is back and you want the local
# copy to match the cloud again.
#
# READ THIS BEFORE RUNNING IT: this REPLACES the local database wholesale. Any
# record entered on the local server and not present in the cloud is DESTROYED.
# It refuses to run until you confirm, and it tells you what you would lose.
# =============================================================================

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -t 1 ]]; then B=$'\e[1m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'; else B=""; Y=""; R=""; N=""; fi

FORCE=0
if [[ "${1:-}" == "--yes" ]]; then FORCE=1; shift; fi   # shifted off: setup-local-db.sh
                                                       # does not accept --yes

echo "${B}What you would lose${N}"
echo "-------------------"
"$HERE/local-vs-cloud.sh" --only-local-ahead || true

if [[ $FORCE == 0 ]]; then
  echo
  echo "${Y}This replaces the local database with the cloud's copy.${N}"
  echo "Anything listed above as ahead locally will be ${R}permanently lost${N}."
  read -r -p "Type REPLACE to continue: " answer
  [[ "$answer" == "REPLACE" ]] || { echo "Nothing was changed."; exit 1; }
fi

exec "$HERE/setup-local-db.sh" "$@"
