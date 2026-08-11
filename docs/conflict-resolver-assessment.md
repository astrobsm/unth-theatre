# Conflict Resolver — architecture assessment

Phase 1 of the specification, before any schema or code. §59 asks what actually
exists rather than what was assumed, and several assumptions in the spec do not
match this codebase.

---

## A. Architecture findings

| Spec assumes | ORM actually is |
|---|---|
| React + Express + Node backend | **Next.js 14 App Router**. No Express. Backend is route handlers under `src/app/api/**/route.ts` |
| Dexie.js | Service Worker + raw **IndexedDB**, no Dexie |
| "Existing AI integrations, if available" | **None.** No LLM dependency of any kind. The Medical Scribe is deliberately rules-based |
| Separate frontend/backend structure | One Next.js app, server components and route handlers in the same tree |

What genuinely exists and should be reused:

- **Auth** — NextAuth, `src/lib/auth.ts`, `getServerSession(authOptions)`. Roles on the session
- **Users/roles** — `User` model, `UserRole` enum, plus a role-inheritance layer for `CONSULTANT_SURGEON`
- **Notifications** — `src/lib/notifications.ts`, `src/lib/pushAll.ts` (FCM), in-app + push already wired
- **Audit** — `AuditLog` model, written directly via `prisma.auditLog.create` inside the same transaction as the change
- **PDF** — `jspdf` + `jspdf-autotable`, with `src/lib/pdfGenerator.ts`, `src/lib/pdfSafeText.ts`, `src/lib/dutyFlyerPdf.ts` as working precedent
- **Sync** — the hybrid journal layer (`src/lib/sync/*`). Any new table must be classified in `syncPolicy.ts` or it will not cross between hospital and cloud
- **Sidebar** — **hardcoded** in `src/app/dashboard/layout.tsx`. `lib/modules.ts` governs access only. A new module needs an entry in both
- **Money** — integer kobo everywhere. No floats

## B. Reusable — do not rebuild

Users, roles, departments/surgical units, notifications, push, audit log, file
upload, PDF generation, offline shell, sync engine, auth. The spec's §55 already
says this; naming it concretely so it is checkable.

## C. Database changes

17 models in the spec is more than this needs. Proposed **9** for the MVP,
following existing conventions (UUID PK, `@@map` to snake_case plural):

```
ConflictDecision      the case: number, title, problem, category, urgency, status,
                      deadline, quorum config, anonymity mode, version
ConflictStakeholder   invited party -> User, with stakeholder role and responded flag
ConflictQuestion      type, prompt, options (Json), required, order, conditional rules
ConflictResponse      one per stakeholder per decision, with sync/offline fields
ConflictAnswer        one per question per response
ConflictEvidence      attachments, reusing existing upload handling
ConflictAnalysis      the generated analysis, versioned, never overwritten
ConflictReview        reviewer edits and comments, append-only
ConflictApproval      who approved at which level, with timestamp
```

Dropped from the MVP as premature: `ConflictRecommendation` (folds into
`ConflictAnalysis`), `ConflictPublication` (a status plus dates on the decision),
`ConflictComment` (belongs on `ConflictReview`), `ConflictAuditLog` and
`ConflictNotification` (existing `AuditLog` and notifications must not be
duplicated — §55.4–55.6).

`ConflictImplementation` and `ConflictOutcome` are real but phase 2.

**Sync classification is mandatory.** Proposed: decisions and questions
`CLOUD_AUTHORITATIVE` (policy is decided centrally); responses `APPEND_ONLY` (a
response submitted on either node was still submitted, and must never be
overwritten); analyses and approvals `CLOUD_AUTHORITATIVE`.

## D. Backend changes

Route handlers under `src/app/api/conflict-resolver/`, matching the paths in §36
but as App Router handlers, not Express routes. Server-side role checks in every
handler — §49 is right that frontend permission checks are not permission checks.

The state machine (§8) belongs in one pure function with its own tests, in the
style of `syncPolicy.decide()`. Fifteen statuses with illegal transitions is
exactly the code that rots when the rule lives in the UI.

## E. Frontend changes

Pages under `src/app/dashboard/conflict-resolver/`, plus a sidebar entry in
`layout.tsx` and a `modules.ts` grant. Mobile-first per §39.

## F. Risks

1. **No AI provider exists.** §17–19 are the heart of the module and there is
   nothing to call. This is a decision, not an implementation detail — see below.
2. **Anonymity versus audit** (§13 against §30) genuinely conflict. Resolvable,
   but the rule must be stated once and enforced server-side: an anonymous
   decision stores `responded=true` on the stakeholder row and never a link from
   answer to user. That cannot be retrofitted after responses exist.
3. **Scale.** The schema is already ~9,000 lines and 184 models. Nine more is
   fine; seventeen for an MVP is not.
4. **Prompt injection** (§52) is a real concern if an LLM is used: stakeholder
   free text is untrusted input arriving from many people.
5. **Offline responses** must reuse the existing sync layer. A second offline
   mechanism is how the last one broke.

## G. Implementation plan

1. Schema + migration for the 9 models, sync classification, `prisma validate`
2. State machine as a pure tested function
3. Create-decision wizard + survey builder
4. Stakeholder selection reusing users/roles/units
5. Response capture, mobile-first, offline-tolerant
6. Statistics and consensus engine — deterministic, no AI
7. Analysis layer behind `AIAnalysisService` (§51)
8. Review, approval, publication
9. **Institutional PDF export**
10. Audit + notifications throughout, reusing both

---

## The PDF, since it was singled out

Every final report must export as a document fit for a federal teaching
hospital's permanent records. `jspdf` + `jspdf-autotable` already do this
elsewhere in ORM, so the work is a shared institutional layer, not a new library:

- **Typography** — an embedded serif for body text (Helvetica, jsPDF's default,
  reads as a memo, not an institutional record). Fonts must be embedded, since a
  PDF that borrows the reader's fonts reflows on someone else's machine
- **Letterhead** — hospital name, theatre complex, decision number, version
- **Structure** — the §23 fields in fixed order, so any two decisions are
  comparable at a glance
- **Signature blocks** — named approvers with role, date and approval reference
- **DRAFT watermark** on anything not yet approved. An unapproved resolution that
  prints identically to an approved one is a governance failure, not a cosmetic one
- **Footer** — page x of y, decision number, generation timestamp, and a
  verification path, matching the existing imprest document pattern
- **Immutability** — the PDF renders from the stored approved version, never from
  current data, so reprinting an old decision cannot silently produce new text
