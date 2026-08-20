#!/usr/bin/env bash
# Read-only. Finds patients that exist on BOTH nodes under DIFFERENT ids —
# the condition that took a neurosurgical case out of theatre on 20 August.
#
# A folder number is the hospital's identifier for a human being. If the two
# databases disagree about which UUID carries it, nothing referencing either one
# can ever cross, and it fails silently until somebody notices a missing case.
cd ~/unth-theatre || exit 1
DB=$(grep -E '^DATABASE_URL=' .env.local | tail -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//'); DB=${DB%%\?*}
C=$(grep -E '^CLOUD_DIRECT_URL=' .env.local | tail -1 | sed -E 's/^CLOUD_DIRECT_URL=//; s/^"//; s/"$//')
C=$(printf '%s' "$C" | sed -E 's/([?&])(schema|connection_limit|pgbouncer|pool_timeout|socket_timeout)=[^&]*/\1/g; s/\?&+/?/; s/&&+/\&/g; s/[?&]$//')

echo "=== folder numbers whose UUID differs between the two nodes ==="
join -t'|' -j1 \
  <(psql "$DB" -X -tA -F'|' -c 'select "folderNumber", id, name from patients order by 1' | sed 's/ *| */|/g') \
  <(psql "$C"  -X -tA -F'|' -c 'select "folderNumber", id, name from patients order by 1' | sed 's/ *| */|/g') \
  2>/dev/null | awk -F'|' '$2 != $4 { print $1 "  local=" $2 "  cloud=" $4 "  (" $3 ")" }'

echo
echo "=== folder numbers present on only ONE node ==="
comm -3 \
  <(psql "$DB" -X -tAc 'select "folderNumber" from patients order by 1') \
  <(psql "$C"  -X -tAc 'select "folderNumber" from patients order by 1') \
  2>/dev/null | head -20

echo
echo "(no output under either heading means the two nodes agree on every patient)"
