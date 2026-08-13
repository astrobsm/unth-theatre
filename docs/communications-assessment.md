# Communications, notification and escalation engine — Phase 0

Discovery only, per §50 and §59. No implementation code written.

The headline: **a large part of this specification already exists.** The gap is
narrower and more specific than the prompt assumes, and naming it precisely is
worth more than a fresh architecture.

---

## 1. Actual stack

| | |
|---|---|
| Framework | **Next.js 14 App Router** — no Express. Handlers are `src/app/api/**/route.ts` |
| Language | TypeScript, strict |
| Database | PostgreSQL via **Prisma 5.22**, ~190 models |
| Auth | NextAuth, role checks inside each handler |
| RBAC | `UserRole` enum + `lib/modules.ts`; sidebar hardcoded in `dashboard/layout.tsx` |
| Offline | Service Worker + raw **IndexedDB** (no Dexie), global offline queue |
| Idempotency | **`src/lib/idempotency.ts`** — `idempotencyKeyFrom`, `replayIfSeen`, `rememberResult`, backed by an `idempotency_keys` table that is itself synced |
| Realtime | **SSE** — `/api/notifications/stream`, `/api/radio/events`, `/api/emergency-display/stream` |
| Push | **FCM** via `src/lib/pushAll.ts` |
| In-app | `src/lib/notifications.ts`, `Notification` model, `/api/notifications` |
| Email | **`nodemailer` 7.0.13 is already a dependency** |
| Scheduling | **Vercel cron** in `vercel.json`, hitting `/api/deadline-checker` and `/api/maintenance/*` |
| Background work | `orm-sync` systemd worker on the theatre server; no BullMQ/Redis |
| Audit | `AuditLog`, written in the same transaction as the change |
| Deployment | Vercel (cloud) + PM2/nginx on the theatre server, one address via split-horizon DNS |

## 2. What already exists of this specification

- **§7 event engine** — partly. `/api/deadline-checker`, `/api/maintenance/detect-delays`,
  `/api/maintenance/preop-alerts`, `/api/emergency-alerts/escalate`.
- **§8 SLA engine** — partly. `deadline-checker?action=check-reminders` runs on a
  cron schedule and already reasons about approaching deadlines.
- **§14 escalation** — partly. `/api/emergency-alerts/escalate` exists, and the
  emergency board has acknowledgement with a named person.
- **§21 background processing** — Vercel cron plus the sync worker. **No queue
  library is needed**; adding BullMQ would mean Redis, which this deployment does
  not have and does not need.
- **§22 offline** — the queue and `idempotency_keys` already exist and already
  survive sync. §23's idempotency requirement is largely met by reuse.
- **§26 audit** — `AuditLog`.
- **§39 priority** — the radio queue already ranks EMERGENCY above MUSIC and
  cancels the lower priority. That is a working priority model to extend.

**So Phases 6, 7 and 8 are extensions, not new subsystems.**

## 3. The genuine gaps

1. **No central communication service.** Notifications, push and the radio each
   send independently. §6 is real work.
2. **No WhatsApp sending.** What exists is a `wa.me` link the *browser* opens —
   built for estimates. That is a person pressing send, not automation. The
   Cloud API is a new integration.
3. **No email sending.** `nodemailer` is installed but unused; no SMTP config, no
   sender identity, no templates.
4. **No delivery tracking**, no `CommunicationMessage` record, no webhooks.
5. **No templates**, no rule builder, no kill switch.

## 4. The constraint that shapes everything

**The theatre server has no public inbound address.** It sits behind carrier-grade
NAT; that is why Tailscale was needed to reach it at all.

Therefore:

- **Webhooks from Meta or an email provider can only reach the CLOUD.** Delivery
  receipts land on Vercel, and reach the theatre server through the existing sync
  journal — which means `CommunicationMessage` must be classified in
  `syncPolicy.ts`, almost certainly `APPEND_ONLY` for the message and
  `CLOUD_AUTHORITATIVE` for its delivery status.
- **Outbound sending should be cloud-only.** If both nodes could send, a message
  queued locally and synced would be sent twice — once by each. The theatre
  server should enqueue; the cloud should transmit.

That single decision removes an entire class of duplicate-message bug, and it
falls out of the network reality rather than a preference.

## 5. Proposed models — 6, not the spec's 17

```
CommunicationTemplate     channel, code, version, body, variables, sensitivity,
                          providerTemplateId, status, isActive
CommunicationMessage      recipient, channel, templateCode, renderedBody,
                          relatedType/relatedId, priority, status, providerMessageId,
                          failureReason, attempts, idempotencyKey (unique)
CommunicationEvent        provider webhook receipts, append-only, deduplicated
WorkflowRule              trigger, conditions (Json), actions (Json), isActive
EscalationPolicy          levels (Json): delay, recipients, channel
FeedbackRequest           token (hashed), expiresAt, submittedAt
```

`NotificationPreference` folds onto `User`. `WorkflowInstance` is unnecessary —
the cron checkers already recompute state each run, and storing instances would
create a second source of truth about whether a theatre is ready.

## 6. Risks worth stating before approval

- **WhatsApp templates need Meta approval**, take days, and cannot be edited
  freely. §17 is right to insist on this; it also means the rule builder must not
  promise arbitrary message text.
- **Patient messaging has a consent dimension** this codebase does not currently
  record. Sending a procedure reminder to a number in a patient record is not the
  same as having permission to. Worth settling before §10 is built.
- **Cost.** Every WhatsApp conversation is billable. A misconfigured escalation
  loop is a bill as well as a nuisance — the kill switch in §41 should exist
  before the first rule does, not after.
- **§31 predictive analysis** should stay descriptive until there is data. The
  spec says this itself and is right.

## 7. Proposed phase order — different from the spec

The spec's order builds WhatsApp before the escalation engine. I would invert it,
because the escalation engine can be proved against **in-app notifications and the
radio, which already work and cost nothing**, before a billable external channel
is attached.

1. `CommunicationMessage` + the central service, sending via existing channels only
2. Templates, with sensitivity classification
3. Email through the installed `nodemailer`
4. Extend `deadline-checker` into a configurable SLA/escalation engine
5. **Kill switch and admin visibility**
6. WhatsApp Cloud API, cloud-only sending, webhooks
7. Rule builder, dashboard, feedback links

## 8. Rollback

Every phase is additive. Phase 1–4 introduce tables nothing else reads; dropping
them restores current behaviour. Phase 6 is the only one with an external
dependency, and the kill switch precedes it deliberately.

---

## Awaiting approval

Per §51 and §59, no implementation code has been written. This also sits behind
the Conflict Resolver, the estimates builder, the meal activity engine and the
music module — all of which are further along.

If this is more urgent than those, say so and I will re-order. My own reading is
that the **SLA and escalation half is worth more than the WhatsApp half**: theatre
setup running late already has a detector and no consequence, and giving that a
voice through channels that already exist is days of work rather than weeks.
