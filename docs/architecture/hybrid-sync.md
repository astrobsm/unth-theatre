# Hybrid sync — local server and cloud, both writable

Status: **design + phase 1 implementation.** Read the "What is not built" section
before relying on any of this.

This describes how the in-hospital PostgreSQL server and the Supabase cloud
database stay in agreement while both accept writes.

---

## The constraints that shape everything

**1. The cloud cannot reach the hospital.** The local server sits behind a
MikroTik doing NAT on a domestic Airtel uplink. There is no inbound route, no
static address, and no port forwarding. Every design that assumes the cloud can
push to the hospital is unbuildable here.

> Consequence: **the local node always initiates.** It pushes its changes and
> pulls the cloud's. The cloud is a passive HTTP endpoint that never calls in.

**2. Wall clocks are not trustworthy.** The router's own log shows its clock a
year adrift until it reached a time service, and it will be adrift again after
any power cut that outlasts the internet. Last-write-wins on `now()` would
silently resolve conflicts in favour of whichever machine was most wrong.

> Consequence: ordering uses a **Hybrid Logical Clock**, not wall time.

**3. Identity is already safe.** 181 of 184 models use UUID primary keys, so
two nodes inserting simultaneously cannot collide. Sync never has to remap an
id, which removes the hardest class of bug in bidirectional replication.

**4. The link is intermittent by design.** This whole system exists because the
hospital internet fails. Sync must treat disconnection as the normal case, not
an error.

---

## Topology

```
   Device (PWA, IndexedDB + offline queue)
        │  writes go to whichever origin the device is on
        ▼
   ┌──────────────────┐        push / pull over HTTPS         ┌──────────────┐
   │  LOCAL NODE      │  ───────────────────────────────────► │  CLOUD NODE  │
   │  unth-theatre    │  ◄─────────────────────────────────── │  Supabase    │
   │  Postgres 18     │      (local always initiates)         │  Postgres 17 │
   └──────────────────┘                                       └──────────────┘
        │                                                            │
   sync_journal (append-only)                              sync_journal (append-only)
```

Both nodes run the same schema and the same journal. Neither is "the master".
Authority is decided **per table**, not per node — see the policy table.

---

## Capture: database triggers, not application hooks

Every mutating statement on a synced table appends a row to `sync_journal`.

This is done with an `AFTER INSERT OR UPDATE OR DELETE` trigger rather than in
the application layer, for one decisive reason: **the application is not the
only writer.** Migrations, the maintenance scripts in `scripts/maintenance/`,
the seed, and any psql session all write directly. An application-level capture
would miss them, and a sync system that silently misses writes is worse than no
sync system, because it manufactures confident disagreement.

The trigger is the completeness guarantee. It cannot be bypassed by a code path
nobody remembered.

---

## Row metadata

Three columns are added to every synced table:

| Column | Purpose |
| --- | --- |
| `sync_version` | Monotonic per row. Incremented by the trigger on every write. |
| `sync_origin` | The node id that last wrote this row. |
| `sync_hlc` | Hybrid Logical Clock stamp of that write. |

`sync_version` is what makes conflict *detection* exact rather than heuristic: a
change is a conflict if and only if it was derived from a version that is no
longer the current one on the receiving node.

---

## Ordering: Hybrid Logical Clock

An HLC stamp is `physical_ms.counter.node_id`, compared in that order.

- It never goes backwards, even if the system clock does.
- It preserves causality: if A happened before B and B saw A, B sorts after A.
- It stays close to wall time, so a human can read it.

`lib/sync/hlc.ts` implements it, with tests covering the case that matters
here: **a node whose clock jumps backwards a year still produces increasing
stamps**, so a power-cut router or an unsynced server cannot rewrite history.

---

## Conflict resolution policy

This is the part that is a clinical decision, not an engineering one. Tables
are grouped into four classes. **The class is declared per table in
`lib/sync/syncPolicy.ts` and a table with no declared class is not synced at
all** — silence defaults to "do not guess".

### Class 1 — `APPEND_ONLY` (no conflict is possible)

Event streams: milestones, audit log, notifications, radio announcements, stock
movements, check-ins, patient movements.

Rows are inserted and never updated. Both sides' rows are unioned. There is
nothing to resolve, and this is where the majority of clinical volume lives.

> Design note: preferring append-only tables is the single most effective way
> to avoid conflicts. Where a design choice exists, record an event rather than
> mutate a state.

### Class 2 — `LWW` (last writer wins, by HLC)

Administrative and scheduling data where the most recent intent is correct and
the previous value has no clinical meaning: ward location, theatre allocation,
roster drafts, list ordering, equipment status, meal counts.

The losing version is still written to `sync_conflicts`. Nothing is discarded.

### Class 3 — `QUARANTINE` (both preserved, a human decides)

Clinical content where a silent overwrite could destroy a record somebody
relied on: consent, operative notes, PACU assessments, pre-op reviews,
prescriptions, complexity scores, blood requests, the pre-op clinical values.

On conflict, the receiving node **keeps its own row unchanged**, writes the
incoming version to `sync_conflicts`, and raises it on the admin dashboard for
resolution. The case is not blocked; the disagreement is made visible.

Rationale: for a consent form, "the most recent write" is not the same as "the
correct record". Two people may have documented consent by different routes.
Merging them automatically is how a system ends up asserting something nobody
said.

### Class 4 — `CLOUD_AUTHORITATIVE`

Identity and access: users, roles, module grants, permissions.

The cloud wins unconditionally. Local writes to these tables are replicated up
but never overwrite cloud state on the way back down.

Rationale: an account merged or revoked centrally must not be resurrected by a
stale local copy. This is also why the duplicate-account merges in
`scripts/maintenance/` are run against the cloud first.

---

## Data integrity guarantees

**What is guaranteed:**

1. **No write is ever lost.** The journal is append-only and is only trimmed
   after both nodes have acknowledged the entry. The losing side of any
   conflict is preserved in `sync_conflicts` with its full payload.
2. **At-least-once delivery, exactly-once apply.** Entries carry a UUID; the
   receiver records applied ids and ignores repeats. Replaying the journal is
   always safe, which is what makes aggressive retry safe.
3. **Ordering per row.** Entries for one row apply in HLC order. Later stamps
   never lose to earlier ones.
4. **No partial entries.** Each journal entry is applied in a transaction with
   the row that records it as applied.
5. **Detectable divergence.** Periodic checksums per table give a fast answer
   to "are these two databases actually the same?" rather than an assumption.

**What is NOT guaranteed, and must not be assumed:**

- **Not linearizable.** During a partition the two nodes will show different
  data. This is eventual consistency; a reader on one node may not see a write
  made seconds earlier on the other.
- **No cross-row transactions across nodes.** Two rows written atomically on
  one node may arrive separately at the other. Invariants that span rows must
  be enforced within a node, not assumed across the pair.
- **Quarantined conflicts require a person.** They do not resolve themselves,
  and a growing quarantine queue is an operational failure, not a background
  detail.

---

## Failover

Devices choose an origin; they do not fail over automatically mid-session,
because a device that silently switches databases would show a user two
different versions of the same list and attribute their writes to whichever
node answered.

The rule staff follow is the one already in the deployment manual: **one origin
per device.** Inside the hospital, use the local origin. Outside, use the
cloud. The sync layer is what makes that safe.

`/api/sync/health` exposes what an operator needs to decide when to move
people: last successful push and pull, journal backlog per direction, conflict
counts, and per-table checksum agreement.

---

## What is not built

Honesty about scope, because this is a mission-critical system and a half-built
sync layer that is believed to be complete is more dangerous than none:

- **Phase 1 (this commit)** — journal schema and triggers, HLC, the policy
  table, push/pull API contract, the sync worker loop, health endpoint, and the
  admin dashboard.
- **Not yet done** — enabling triggers on all 184 tables (phase 1 enables the
  declared set), automatic checksum reconciliation, and the quarantine
  resolution UI beyond listing.
- **Blocked on a decision** — the per-table class assignments below the obvious
  ones need a clinician to confirm. The defaults are conservative: anything
  unclassified is not synced, so a wrong guess cannot silently corrupt data.
- **Transport caveat** — local → cloud is HTTPS to Supabase and is fine. The
  hospital LAN origin itself is plain HTTP, so device→local traffic is
  unencrypted on the wire, protected only by WPA2. That is a known, accepted
  limitation recorded in the deployment manual, and it is unchanged by this
  work.
