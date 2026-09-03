// ============================================================
// Which tables sync, and what happens when both sides changed a row
// ------------------------------------------------------------
// This file is the clinical policy, expressed as code. Everything else in the
// sync layer is mechanism; this is the part where a wrong decision corrupts a
// patient record rather than merely breaking a build.
//
// THE DEFAULT IS "DO NOT SYNC". A table with no entry here is never
// replicated, so forgetting to classify something cannot silently mangle it.
// That is deliberate and should stay that way: the failure mode of an
// unsynced table is visible divergence, which an operator notices. The failure
// mode of a wrongly-classified one is a confidently wrong record, which nobody
// notices until it matters.
// ============================================================

export type SyncClass =
  /** Insert-only event streams. Both sides' rows are unioned; no conflict exists. */
  | 'APPEND_ONLY'
  /** Administrative state where the latest intent is correct. Loser archived. */
  | 'LWW'
  /** Clinical content. Nothing is overwritten; a person resolves it. */
  | 'QUARANTINE'
  /** Identity and access. The cloud is authoritative, unconditionally. */
  | 'CLOUD_AUTHORITATIVE'
  /**
   * Operational state that the theatre server owns. The mirror image of
   * CLOUD_AUTHORITATIVE: an edit arriving from the cloud for an EXISTING row is
   * refused and quarantined, so the local version stands and the cloud's
   * version is kept for a person to look at rather than discarded.
   *
   * NO TABLE USES THIS YET, and that is a deliberate decision rather than an
   * oversight.
   *
   * It exists for `surgeries` — who is operating in which room is an
   * operational fact and theatre owns it. But measured on 20 August, 641 edits
   * to existing surgeries ORIGINATED ON THE CLOUD in ten days, about
   * sixty-four a day, because remote users genuinely book and amend through it.
   *
   * Turning this on while that is true picks a way to lose: quarantine buries a
   * queue nobody can then read at sixty-four conflicts a day, and ignoring
   * throws away real clinical work. The cloud has to stop being a WRITER first
   * — remote changes submitted as requests for local confirmation — and then
   * this becomes correct rather than merely strict.
   *
   * A NEW row from the cloud is still applied, here as everywhere: that is
   * decided above, before any class is consulted, so a remote booking still
   * reaches theatre. Authority governs disagreement about a row that exists,
   * which is the only thing it can sensibly govern.
   */
  | 'LOCAL_AUTHORITATIVE';

export interface TablePolicy {
  table: string;
  cls: SyncClass;
  /** Why this class. Read by whoever changes it next. */
  why: string;
}

/**
 * Preferring APPEND_ONLY is the single most effective conflict-avoidance
 * measure available, and most clinical volume in this system is already
 * event-shaped: milestones, movements, announcements, stock ledger entries.
 * Where a design choice exists, record an event rather than mutate a state.
 */
export const TABLE_POLICIES: TablePolicy[] = [
  // ---- Class 1: append-only event streams -------------------------------
  { table: 'audit_logs', cls: 'APPEND_ONLY', why: 'Immutable by definition; an edited audit log is not an audit log.' },
  // notifications is deliberately ABSENT from this list as of 22 August 2026.
  //
  // Its zz_sync_capture triggers were dropped on both databases, so nothing
  // from it is journalled or replicated any more. The reason is not that
  // replicating it was wrong in principle — it is that nothing reads it.
  // Measured: 45 write call-sites (30 create, 15 createMany), ZERO reads
  // through Prisma, no retention, 79,275 rows and 40 MB. Every row crossed a
  // domestic uplink to a cloud database where nothing read it either, and on
  // 18 August that journal deadlocked with 176 unsent entries, 154 of them
  // notifications.
  //
  // If a feature ever reads notifications across nodes, re-enable capture with
  // sync_enable_table('notifications') and put the APPEND_ONLY entry back —
  // the old rationale, "insert then read; the read flag is per-node noise",
  // was sound. It was simply describing a read that never happened.
  { table: 'patient_movements', cls: 'APPEND_ONLY', why: 'The single patient timeline, milestones included. Two nodes recording different events both happened.' },
  { table: 'radio_acknowledgments', cls: 'APPEND_ONLY', why: 'Who confirmed hearing an announcement, and when. The record that an announcement was answered; two nodes recording different confirmations both happened.' },
  { table: 'patient_transfers', cls: 'APPEND_ONLY', why: 'A movement between two locations at a time, by a named person. It has no lifecycle to conflict over — the row is the event.' },
  { table: 'surgery_team_check_ins', cls: 'APPEND_ONLY', why: 'One row per person per case, uniquely keyed; union is safe.' },
  { table: 'stock_movements', cls: 'APPEND_ONLY', why: 'A ledger. Quantities are derived by summing, never by overwriting a balance.' },
  { table: 'idempotency_keys', cls: 'APPEND_ONLY', why: 'Replay protection must be shared, or a retry across nodes double-applies.' },

  // ---- Class 2: last writer wins ----------------------------------------
  { table: 'surgeries', cls: 'LWW', why: 'Scheduling fields dominate. Clinical fields on this row are covered by the quarantine list below at column level.' },
  { table: 'theatre_allocations', cls: 'LWW', why: 'Whoever allocated most recently meant it.' },
  { table: 'rosters', cls: 'LWW', why: 'Draft rosters are replaced wholesale; the previous draft has no standing.' },
  { table: 'equipment', cls: 'LWW', why: 'Current status of a device; history lives in maintenance records.' },
  { table: 'theatre_meals', cls: 'LWW', why: 'Administrative counts.' },
  { table: 'wards', cls: 'LWW', why: 'Reference data. Renaming or adding a ward has no clinical history to lose.' },
  // Reclassified from APPEND_ONLY on 17 August 2026. It was never append-only:
  // status walks PENDING → PLAYING → PLAYED → ACKNOWLEDGED → EXPIRED, and
  // lastPlayedAt, acknowledgedAt and acknowledgedById are all written after
  // the insert by seven different routes. decide() saw those updates arrive on
  // a table declared insert-only and quarantined every one of them as
  // "classification looks wrong" — which is exactly what it is for, and is why
  // 45 conflicts sat open with nothing for a person to actually decide.
  // The record of WHO acknowledged lives in radio_acknowledgments above, so
  // resolving the announcement row by clock loses no audit trail.
  { table: 'radio_announcements', cls: 'LWW', why: 'Playback state of one announcement. The latest status is the true one; the acknowledgement record lives in radio_acknowledgments.' },
  // LWW for the descriptive fields; quantity and reorderLevel are protected in
  // PROTECTED_COLUMNS, because a stock count cannot be merged by taking the
  // later of two absolute values.
  { table: 'inventory_items', cls: 'LWW', why: 'Current state of a stock item. Renames and prices resolve by clock; the counts do not, and are quarantined.' },
  // ── What a booked case is packed with ────────────────────────────────────
  // A case booked in theatre reached the cloud without its lists, because
  // neither request table replicated: the booking appeared outside the
  // hospital stripped of the consumables and drugs it had been booked with,
  // which reads as a booking somebody forgot to complete.
  //
  // The templates come with them because the set must be CLOSED UNDER ITS
  // FOREIGN KEYS. A request carries templateId, so a request arriving on a
  // node that has never seen that template is rejected by the FK and parks in
  // sync_deferred forever — which is exactly how the notifications backlog
  // happened, and the mistake is only ever made once per relationship.
  { table: 'surgery_consumable_requests', cls: 'LWW', why: 'A supply line for one case. Status walks REQUESTED to PACKED; the latest state is the true one, and withdrawals are recorded as CANCELLED rather than deleted.' },
  { table: 'surgery_drug_dressing_requests', cls: 'LWW', why: 'The pharmacy half of the same list, with the same lifecycle.' },
  { table: 'surgical_consumable_templates', cls: 'LWW', why: 'Reference data, and the parent of every consumable request. Must travel or its children cannot be inserted.' },
  { table: 'surgical_drug_dressing_templates', cls: 'LWW', why: 'Reference data, and the parent of every drug or dressing request.' },

  // ---- Class 3: quarantine ----------------------------------------------
  // The parent of nearly everything else here. It was missing from this list,
  // and its absence is why cloud bookings could not land locally at all: a
  // surgery arrived referencing a patient this node had never seen, and
  // surgeries_patientId_fkey rejected it.
  //
  // Chosen for conflict-risk originally; the set must ALSO be closed under its
  // foreign keys, or a child can never be inserted anywhere.
  //
  // QUARANTINE, not LWW: this row carries blood group and allergies. A new
  // patient still inserts cleanly — only two divergent EDITS need a person.
  { table: 'patients', cls: 'QUARANTINE', why: 'Identity, blood group and allergies. Silently overwriting either is a patient-safety event.' },
  { table: 'preoperative_investigations', cls: 'QUARANTINE', why: 'A result is a claim about a patient. Two differing claims need a person.' },
  { table: 'pre_operative_visits', cls: 'QUARANTINE', why: 'Clearance decisions; silently overwriting one hides that it was ever made.' },
  { table: 'holding_area_assessments', cls: 'QUARANTINE', why: 'The last check before the theatre door; both versions must survive.' },
  { table: 'pacu_assessments', cls: 'QUARANTINE', why: 'Recovery observations and the discharge decision resting on them.' },
  { table: 'pacu_vital_signs', cls: 'QUARANTINE', why: 'Observations on a recovering patient; a differing reading was still taken.' },
  { table: 'pacu_medications', cls: 'QUARANTINE', why: 'What was given in recovery. Overwriting hides an administration.' },
  { table: 'anesthetic_prescriptions', cls: 'QUARANTINE', why: 'Drug orders. An overwritten dose is a patient-safety event.' },
  { table: 'postop_prescriptions', cls: 'QUARANTINE', why: 'Drug orders after surgery; same reasoning as the anaesthetic ones.' },
  { table: 'emergency_prescriptions', cls: 'QUARANTINE', why: 'Written under time pressure, and least safe to resolve automatically.' },
  { table: 'prescription_medication_items', cls: 'QUARANTINE', why: 'The individual drugs and doses within a prescription.' },
  { table: 'blood_requests', cls: 'QUARANTINE', why: 'Availability disagreements must surface, not resolve quietly.' },

  // ---- Class 4: cloud authoritative --------------------------------------
  // ── Communications ───────────────────────────────────────────────────────
  // Sending is CLOUD-ONLY: the theatre server has no public inbound address, so
  // webhooks reach only the cloud — and if both nodes sent, a message queued
  // locally and then synced would go out twice, once from each.
  //
  // So the local node QUEUES and the cloud TRANSMITS. A queued message must
  // therefore travel up (append-only), while its delivery status is the cloud's
  // to own and travel down.
  { table: 'communication_messages', cls: 'APPEND_ONLY', why: 'A message queued on either node was still requested. The cloud transmits it; nothing may overwrite the request.' },
  { table: 'communication_events', cls: 'APPEND_ONLY', why: 'Provider receipts. A webhook arriving twice must not move a message backwards from READ to DELIVERED.' },
  { table: 'communication_templates', cls: 'CLOUD_AUTHORITATIVE', why: 'Wording and provider approval are decided centrally; two nodes must not send different versions of one template.' },
  { table: 'workflow_rules', cls: 'CLOUD_AUTHORITATIVE', why: 'A rule enabled on one node only would fire inconsistently, and the kill switch must work everywhere at once.' },
  { table: 'escalation_policies', cls: 'CLOUD_AUTHORITATIVE', why: 'Who gets escalated to is an institutional decision.' },
  { table: 'feedback_requests', cls: 'APPEND_ONLY', why: 'A request issued and a response submitted are both events; neither is editable.' },

  // ── Clinical OCR ─────────────────────────────────────────────────────────
  // These rows carry only metadata and text. The scanned FILE is not in the
  // database and does not travel through this journal: it goes to the document
  // store, and the two nodes reconcile it by content hash. Sending multi-
  // megabyte scans through the row journal would be the end of sync working at
  // all, which is why documents were kept out of Postgres in the first place.
  { table: 'ocr_documents', cls: 'LWW', why: 'Metadata about one scan. Status and review flags advance; the original key and hash never change once written.' },
  { table: 'ocr_provider_runs', cls: 'APPEND_ONLY', why: 'A run happened. Two nodes running different engines on the same document produced two real results, and provider comparison depends on keeping both.' },
  { table: 'ocr_pages', cls: 'APPEND_ONLY', why: 'Uniquely keyed by document and page number; a page recognised on either node is the same page.' },
  { table: 'ocr_tokens', cls: 'APPEND_ONLY', why: 'The word-level record of what an engine read. Corrections are recorded as versions and verifications, never by rewriting what the engine actually output.' },
  { table: 'ocr_versions', cls: 'APPEND_ONLY', why: 'Never destroy a previous version. Two nodes correcting the same document produce two versions, both of which a clinician must see.' },

  // QUARANTINE, not LWW. This row is the record that a named clinician
  // confirmed a drug dose or a patient identifier against the original
  // document. If two nodes hold different verifications of the same scan, one
  // of them attributes a clinical confirmation to somebody who did not make it.
  // That must be resolved by a person, never by a timestamp.
  { table: 'ocr_verifications', cls: 'QUARANTINE', why: 'Attributed clinical confirmation of high-risk values. A silent overwrite would credit or blame the wrong clinician.' },

  { table: 'ocr_quality_assessments', cls: 'APPEND_ONLY', why: 'A measurement taken at capture time on one device. Two are two observations, not a conflict.' },
  { table: 'ocr_signature_regions', cls: 'APPEND_ONLY', why: 'Where a signature sits on a page does not change once detected.' },

  // ── Conflict Resolver ────────────────────────────────────────────────────
  // A response submitted on either node was still submitted, and must never be
  // overwritten by the other — losing one silently changes a consensus figure
  // that a published policy rests on.
  { table: 'conflict_responses', cls: 'APPEND_ONLY', why: 'A stakeholder response given on either node was still given. Union, never overwrite.' },
  { table: 'conflict_answers', cls: 'APPEND_ONLY', why: 'The answers within a response; same reasoning.' },
  { table: 'conflict_reviews', cls: 'APPEND_ONLY', why: 'A reviewer comment is a statement someone made. It is not editable history.' },
  // Policy is decided centrally: a decision, its questions and its approvals are
  // the cloud's to own, or two nodes could publish different versions of one
  // policy.
  { table: 'conflict_decisions', cls: 'CLOUD_AUTHORITATIVE', why: 'Policy is decided centrally; two nodes must not publish different versions.' },
  { table: 'conflict_questions', cls: 'CLOUD_AUTHORITATIVE', why: 'Editing a question after answers exist would invalidate them, so one node owns it.' },
  { table: 'conflict_stakeholders', cls: 'CLOUD_AUTHORITATIVE', why: 'Who was invited is part of the quorum calculation.' },
  { table: 'conflict_analyses', cls: 'CLOUD_AUTHORITATIVE', why: 'Recomputed from responses; the cloud has all of them.' },
  { table: 'conflict_approvals', cls: 'CLOUD_AUTHORITATIVE', why: 'An approval chain with two truths is not an approval chain.' },

  { table: 'users', cls: 'CLOUD_AUTHORITATIVE', why: 'A merged or revoked account must not be resurrected by a stale local copy.' },

  // ── The emergency board ──────────────────────────────────────────────────
  // Absent from this list until 31 August, and that absence is what let the
  // theatre hear an alert for a case no screen could show: the surgery and the
  // announcement both replicated, the booking the display renders from did not.
  // LWW rather than APPEND_ONLY because a booking has a lifecycle — SUBMITTED
  // to APPROVED to THEATRE_ASSIGNED — and the latest state is the true one.
  { table: 'emergency_surgery_bookings', cls: 'LWW', why: 'One emergency case moving through its lifecycle. The latest status is the true one, and the theatre must see it on whichever node it is looking at.' },
  { table: 'emergency_surgery_alerts', cls: 'LWW', why: 'The alert raised for that booking, and whether it is still active. It drives the emergency display, so it has to travel with the booking or the board is blank on one node.' },
  // How far the chase has got for an emergency that never started. One row per
  // booking walking 0 -> 3, so the latest state is the true one. It must travel:
  // the case is chased from the theatre and the invitations are sent from the
  // cloud, and a stage fired on one node must not fire again on the other.
  { table: 'emergency_delay_escalations', cls: 'LWW', why: 'One escalation per booking moving through its stages; the latest stage is the true one, and a stage already fired must not fire twice on the other node.' },
  { table: 'audit_committee_invitations', cls: 'LWW', why: 'One drafted invitation per person, edited and then marked sent by an administrator. The sent mark is the whole point and the later state is correct.' },
  // Why a case did not start. Replicated from the day it was created, having
  // watched two tables cause incidents by not being.
  { table: 'case_blocker_reports', cls: 'LWW', why: 'One report of what stopped a case, with an outcome added later. The reason and reporter never change; the latest outcome is the true one.' },

  // ── The patient journey, enabled 1 September ─────────────────────────────
  // These were the tables a patient actually crosses between the ward and
  // recovery, and none of them replicated. On 1 September a patient was
  // admitted to the holding area on one node and did not exist on the other:
  // the nurse read "No patients in holding area" with the patient in front of
  // her. Being classified here was never enough — see the migration; the
  // policy records intent, the trigger does the work.
  { table: 'holding_area_red_alerts', cls: 'APPEND_ONLY', why: 'An alarm raised about a patient at the theatre door. Two nodes raising different alarms both raised them.' },
  { table: 'preoperative_safety_checks', cls: 'QUARANTINE', why: 'The last safety check before the door. Two differing versions both need a person to look at them.' },
  { table: 'patient_call_ups', cls: 'LWW', why: 'The theatre asking the ward to send a patient. Status walks INVITED to ARRIVED; the latest is the true one, and the holding area cannot admit anybody without it.' },
  { table: 'daily_first_case_sending', cls: 'LWW', why: 'Whether the first case was sent for, per theatre per day. One row, latest state.' },
  { table: 'patient_transport_logs', cls: 'APPEND_ONLY', why: 'A porter moved a patient at a time. The row is the event.' },
  { table: 'who_checklists', cls: 'QUARANTINE', why: 'The surgical safety checklist. Silently overwriting one side of it would hide that a check was ever made.' },
  { table: 'surgical_timings', cls: 'LWW', why: 'Knife to skin, closure, out of theatre. Times are corrected occasionally; the latest correction is meant.' },
  { table: 'surgical_events', cls: 'APPEND_ONLY', why: 'Things that happened during a case. Two nodes recording different events both happened.' },
  { table: 'surgical_count_checklists', cls: 'QUARANTINE', why: 'The swab and instrument count. A count is a patient-safety record and must never be silently merged.' },
  { table: 'surgical_count_events', cls: 'APPEND_ONLY', why: 'Each count as it was taken.' },
  { table: 'intraoperative_records', cls: 'QUARANTINE', why: 'What was done to the patient. Two differing accounts need a person.' },
  { table: 'anesthesia_monitoring_records', cls: 'QUARANTINE', why: 'The anaesthetic record for one case.' },
  { table: 'anesthesia_vital_signs', cls: 'APPEND_ONLY', why: 'An observation taken at a time. A differing reading was still taken.' },
  { table: 'anesthesia_medication_records', cls: 'QUARANTINE', why: 'Drugs given under anaesthesia. An overwritten dose is a patient-safety event.' },
  { table: 'anesthesia_setup_logs', cls: 'APPEND_ONLY', why: 'A machine check performed at a time.' },
  { table: 'preoperative_anesthetic_reviews', cls: 'QUARANTINE', why: 'A fitness decision. Overwriting one hides that it was made.' },
  { table: 'emergency_pre_anaesthetic_reviews', cls: 'QUARANTINE', why: 'The same decision under time pressure, and least safe to resolve automatically.' },
  { table: 'pacu_red_alerts', cls: 'APPEND_ONLY', why: 'A deterioration flagged in recovery. Both nodes flagging it means both saw it.' },
  { table: 'nurse_handovers', cls: 'LWW', why: 'One shift handing over to the next. Written through the shift; the latest version is the one being handed over.' },
  { table: 'handover_checklist_items', cls: 'LWW', why: 'The items within that handover.' },

  // ── The departments that keep the journey possible ───────────────────────
  // Enabled 1 September, in the same sweep as the patient journey. Classified
  // in bulk because they share a shape: a department records its own work, and
  // the other node needs to see it. Where a row is an EVENT it is APPEND_ONLY;
  // where it is the CURRENT STATE of a thing, LWW.
  { table: 'roster_publications', cls: 'LWW', why: 'An immutable snapshot per version, but the ARCHIVED flag moves. Latest wins.' },
  { table: 'surgical_units', cls: 'LWW', why: 'Reference data. Renaming a unit has no clinical history to lose.' },
  { table: 'surgical_unit_schedules', cls: 'LWW', why: 'Which unit operates on which day.' },
  { table: 'theatre_suites', cls: 'LWW', why: 'The rooms themselves. Reference data.' },
  { table: 'case_cancellations', cls: 'APPEND_ONLY', why: 'A cancellation happened, with a reason and a person. Never edited.' },
  { table: 'theatre_setups', cls: 'LWW', why: 'What was drawn for a case; status walks COLLECTED to RETURNED.' },
  { table: 'store_consumables', cls: 'LWW', why: 'Current state of a stock line; movements carry the quantities.' },
  { table: 'consumable_consumptions', cls: 'APPEND_ONLY', why: 'A ledger entry. Balances are summed, never overwritten.' },
  { table: 'medication_collections', cls: 'APPEND_ONLY', why: 'A collection from pharmacy at a time.' },
  { table: 'medication_usage_records', cls: 'QUARANTINE', why: 'What was given to a patient. An overwritten dose is a patient-safety event.' },
  { table: 'medication_returns', cls: 'APPEND_ONLY', why: 'A return happened; two nodes recording different returns both happened.' },
  { table: 'emergency_lab_requests', cls: 'LWW', why: 'A request with a lifecycle from requested to resulted.' },
  { table: 'emergency_lab_tests', cls: 'QUARANTINE', why: 'A result is a claim about a patient. Two differing claims need a person.' },
  { table: 'cssd_inventory', cls: 'LWW', why: 'Where a set is and whether it is sterile. Latest movement is the true one.' },
  { table: 'cssd_sterilization_logs', cls: 'APPEND_ONLY', why: 'A cycle ran with parameters and a result. That is traceability.' },
  { table: 'equipment_checkouts', cls: 'LWW', why: 'Out or back. The latest state is where the machine is.' },
  { table: 'equipment_fault_alerts', cls: 'LWW', why: 'A fault and its repair status.' },
  { table: 'power_house_status', cls: 'LWW', why: 'Mains, generators and fuel right now.' },
  { table: 'oxygen_alerts', cls: 'APPEND_ONLY', why: 'An alarm raised at a time.' },
  { table: 'plumbing_faults', cls: 'LWW', why: 'A fault and whether it is fixed.' },
  { table: 'disciplinary_queries', cls: 'LWW', why: 'A query walks ISSUED to RESPONDED to RESOLVED. The recipient must see it on whichever node they open.' },
  { table: 'incident_reports', cls: 'QUARANTINE', why: 'An account of something that went wrong. Both versions must survive.' },
  { table: 'mortalities', cls: 'QUARANTINE', why: 'The formal record of a death. Nothing here may be silently merged.' },
  { table: 'anonymous_tips', cls: 'APPEND_ONLY', why: 'Raised without a name, and never editable — that is the whole guarantee.' },
  { table: 'security_reports', cls: 'APPEND_ONLY', why: 'An account of an event at a time.' },
  { table: 'announcements', cls: 'LWW', why: 'What the suite hears and when. Latest wording wins.' },
  { table: 'emergency_team_availability', cls: 'LWW', why: 'Who answered an emergency call and whether they are coming.' },

  // ── Account recovery ─────────────────────────────────────────────────────
  // NOT REPLICATED, and that is a decision rather than an oversight.
  //
  // A one-time code is a short-lived authentication secret with an attempt
  // counter. Replicating it would put a live credential on a second node and,
  // worse, split the attempt cap across two databases — five guesses on the
  // cloud plus five on the theatre server is ten, and the whole strength of a
  // six-digit code rests on that number being five.
  //
  // The practical cost is small: a code is requested and typed within ten
  // minutes on whichever server the user is already looking at. `users` is
  // CLOUD_AUTHORITATIVE above, so the changed PASSWORD does travel.
  //
  // Recorded here explicitly because on 27 August emergency_surgery_bookings
  // was absent from this list, and an absent table looks exactly like a
  // forgotten one.
  // { table: 'auth_otps', cls: <intentionally none> }
  { table: 'user_module_grants', cls: 'CLOUD_AUTHORITATIVE', why: 'Access control is decided centrally.' },
  // Authority over one department's duty roster. Same class and the same
  // cloud-only capture as identity, and for the same reason: an in-sequence
  // edit is applied before the class is consulted, so a privilege row written
  // on the theatre server would reach the cloud. Supervisors are appointed
  // centrally and the appointment travels downward.
  { table: 'roster_supervisors', cls: 'CLOUD_AUTHORITATIVE', why: 'Who may edit a duty roster is a permission, and permissions are granted centrally.' },
  { table: 'onboarding_submissions', cls: 'CLOUD_AUTHORITATIVE', why: 'Imported centrally; local copies are read-only in practice.' },

  // ── The remaining modules, classified 2 September 2026 ──────────────────
  //
  // Capture was switched on for 47 tables by 20260901130000_sync_remaining_modules
  // and NONE of them was classified here. That is not a harmless omission:
  // decide() returns UNKNOWN_TABLE for an unclassified table, which parks the
  // change rather than applying it. Nothing was destroyed — the applier keeps
  // what it cannot classify, exactly so this mistake is recoverable — but
  // nothing landed either, so every one of these modules was journalling
  // faithfully and replicating nothing.
  //
  // Three of the 47 are NOT here: additional_medication_requests,
  // medication_non_return_queries and medication_reconciliations all carry a
  // prescriptionId, and anesthetic_prescriptions is classified but not yet
  // captured. A child whose parent does not replicate fails its foreign key
  // and parks for ever, which is the failure the pack-request note above
  // describes. Their capture is switched off again until prescriptions travel.

  // Insert-only. Every one verified as having no update/upsert call-site —
  // an UPDATE arriving on an append-only table is quarantined as misclassified,
  // which is precisely what happened to radio_announcements.
  { table: 'announcement_playbacks', cls: 'APPEND_ONLY', why: 'One row per time an announcement played. Two nodes each playing it both happened.' },
  { table: 'handover_audit_logs', cls: 'APPEND_ONLY', why: 'What changed on a nurse handover. An edited audit line is not an audit line.' },
  { table: 'supply_records', cls: 'APPEND_ONLY', why: 'A delivery against an inventory item; the row is the event.' },
  { table: 'surgery_items', cls: 'APPEND_ONLY', why: 'An item attached to a case. Written once; verified as having no update call-site.' },
  { table: 'surgical_team_members', cls: 'APPEND_ONLY', why: 'Who was on the team for a case. Both nodes naming different people is a union, not a conflict.' },
  { table: 'theatre_setup_items', cls: 'APPEND_ONLY', why: 'What was laid out for a setup; written once at setup time.' },
  { table: 'theatre_setup_returns', cls: 'APPEND_ONLY', why: 'What came back afterwards. A return is an event.' },
  { table: 'tv_alert_display_logs', cls: 'APPEND_ONLY', why: 'What the wall screen showed, and when. A display log nobody may rewrite.' },

  // Clinical content: nothing is overwritten, a person resolves it.
  //
  // The first two are CLASSIFIED BUT NOT CAPTURED — see the note above about
  // their prescriptionId parent. Deciding the class now means enabling them
  // later is one migration, not a fresh judgement about patient safety.
  { table: 'additional_medication_requests', cls: 'QUARANTINE', why: 'Extra drugs asked for against a prescription. An overwritten request is an overwritten drug order. NOT YET CAPTURED: its prescription parent does not replicate.' },
  { table: 'medication_reconciliations', cls: 'QUARANTINE', why: 'What was actually given against what was ordered. Overwriting hides an administration. NOT YET CAPTURED: its prescription parent does not replicate.' },
  { table: 'medication_non_return_queries', cls: 'LWW', why: 'A query raised about medication not returned, moving through to answered. Workflow around the drug record rather than the record itself. NOT YET CAPTURED: its prescription parent does not replicate.' },
  { table: 'anaesthetic_optimisation_requirements', cls: 'QUARANTINE', why: 'What must be corrected before this patient is fit for surgery. Overwriting one hides a requirement a clinician recorded.' },
  { table: 'mortality_audits', cls: 'QUARANTINE', why: 'The review of a death. Two differing accounts both need to survive to be read.' },
  { table: 'preoperative_fitness_assessments', cls: 'QUARANTINE', why: 'A judgement about whether a patient can undergo anaesthesia. Same reasoning as the pre-operative visits above.' },

  // Operational state where the latest intent is the correct one. Each of
  // these carries a status or an updatedAt, so it is edited after insert.
  { table: 'checkout_items', cls: 'LWW', why: 'Lines on an equipment checkout. Quantity and return state are edited in place.' },
  { table: 'cssd_readiness_reports', cls: 'LWW', why: 'One CSSD readiness statement per shift; the latest is the operative one.' },
  { table: 'cssd_usage_history', cls: 'LWW', why: 'A sterile-item usage record. NOT append-only: the code edits it after insert, and an update on an insert-only table is quarantined as misclassified.' },
  { table: 'daily_equipment_status', cls: 'LWW', why: 'Today status of one device. Latest reading is the true one; history is in the check logs.' },
  { table: 'emergency_lab_notifications', cls: 'LWW', why: 'Whether the lab was told, and answered. Edited after insert, so it resolves by clock.' },
  { table: 'equipment_check_logs', cls: 'LWW', why: 'A pre-list equipment check, amended as items are verified.' },
  { table: 'equipment_maintenance', cls: 'LWW', why: 'Maintenance state of a device; the latest intent is correct.' },
  { table: 'fault_reports', cls: 'LWW', why: 'A reported fault moving through triage to repair. The lifecycle is the point.' },
  { table: 'laundry_readiness', cls: 'LWW', why: 'Linen readiness for the day; latest statement stands.' },
  { table: 'maintenance_alerts', cls: 'LWW', why: 'Alert state for an inventory item; acknowledged and cleared in place.' },
  { table: 'maintenance_logs', cls: 'LWW', why: 'Work done on an item, edited as the job progresses.' },
  { table: 'oxygen_readiness_reports', cls: 'LWW', why: 'Oxygen supply readiness for the day; latest statement stands.' },
  { table: 'patient_feedback', cls: 'LWW', why: 'Feedback and its triage state. Two nodes triaging one row is rare; the later decision is the operative one.' },
  { table: 'plumbing_water_status', cls: 'LWW', why: 'Current plumbing state; a status board, not a ledger.' },
  { table: 'power_fuel_consumption', cls: 'LWW', why: 'Fuel logged against a power-house status, corrected in place.' },
  { table: 'power_maintenance_logs', cls: 'LWW', why: 'Generator maintenance, edited as the work proceeds.' },
  { table: 'power_readiness_reports', cls: 'LWW', why: 'Power readiness for the day; latest statement stands.' },
  { table: 'radio_broadcasts', cls: 'LWW', why: 'A broadcast and its playback state, exactly as radio_announcements above.' },
  { table: 'staff_duty_logs', cls: 'LWW', why: 'Who was on, and whether they signed out. Edited after the fact.' },
  { table: 'staff_feedback', cls: 'LWW', why: 'Staff submission and its handling state.' },
  { table: 'stock_transfers', cls: 'LWW', why: 'A transfer between stores, moving REQUESTED to RECEIVED.' },
  { table: 'sub_store_item_faults', cls: 'LWW', why: 'A faulty item in a sub-store, resolved in place.' },
  { table: 'sub_store_restock_requests', cls: 'LWW', why: 'A restock request through its approval lifecycle.' },
  { table: 'sub_store_usage_logs', cls: 'LWW', why: 'Sub-store consumption, corrected in place when a count is wrong.' },
  { table: 'surgery_drafts', cls: 'LWW', why: 'An unfinished booking. The most recent draft is the only one anybody wants.' },
  { table: 'theatre_case_flows', cls: 'LWW', why: 'Where a case has reached in the theatre flow; the latest position is the true one.' },
  { table: 'theatre_cleaning_logs', cls: 'LWW', why: 'A cleaning record, completed in place after it is started.' },
  { table: 'theatre_extra_requests', cls: 'LWW', why: 'An extra item asked for mid-case, through to supplied.' },
  { table: 'theatre_sub_stores', cls: 'LWW', why: 'The sub-store itself. Reference data with no clinical history to lose.' },
  { table: 'user_reports', cls: 'LWW', why: 'A report raised by a user, moving through triage.' },
  { table: 'walkie_talkie_logs', cls: 'LWW', why: 'Handset issue and return; the return is written onto the issue row.' },
  { table: 'water_supply_logs', cls: 'LWW', why: 'Water deliveries and readings, corrected in place.' },
  { table: 'water_supply_readiness', cls: 'LWW', why: 'Water readiness for the day; latest statement stands.' },
];

const BY_TABLE = new Map(TABLE_POLICIES.map((p) => [p.table, p]));

export const policyFor = (table: string): TablePolicy | null => BY_TABLE.get(table) ?? null;
export const isSynced = (table: string): boolean => BY_TABLE.has(table);
export const syncedTables = (): string[] => TABLE_POLICIES.map((p) => p.table);

/**
 * Columns on `surgeries` that are clinical rather than administrative.
 *
 * The surgeries row is LWW because scheduling churn dominates it, but these
 * particular columns carry clinical claims and must not be silently
 * overwritten by an older node. A change touching any of them is quarantined
 * even though the table as a whole is LWW.
 *
 * This column-level exception exists because splitting the table would be a
 * far larger change to a 184-model schema than the problem warrants.
 */
export const SURGERY_CLINICAL_COLUMNS = new Set([
  'recentHb', 'hbSampleAt', 'potassium', 'sodium', 'creatinine',
  'hbsAgStatus', 'hcvStatus', 'hivStatus',
  'bloodPressureSystolic', 'bloodPressureDiastolic',
  'bleedingRiskLevel', 'nutritionalStatusAtBooking', 'pressureSoreRiskAtBooking',
  'consentSignedElectronically', 'consentFileData', 'consentFormData', 'consentCompletedAt',
  'complexityData', 'postOpNotes',
]);

/**
 * Columns that quarantine even when their table is LWW.
 *
 * The same reasoning as the surgeries list above, applied wherever an LWW row
 * carries one field that must not be resolved by "whoever wrote last".
 *
 * inventory_items.quantity is the second such case and it is not clinical, it
 * is arithmetic. Two nodes each issuing stock from the same item both compute
 * a new absolute quantity from the value they hold; last-writer-wins keeps one
 * and discards the other, so the item ends up showing stock that has already
 * been issued. Nothing about that failure is visible — the number simply
 * reads high, which is the one direction that matters, because stock believed
 * to be on the shelf is stock nobody orders.
 *
 * The ledger in stock_movements is append-only and holds BOTH issues, so the
 * truth is never lost; it is the cached total on the item that cannot be
 * merged automatically. Quarantining sends it to a person, who can read the
 * ledger and set the count.
 *
 * Note this only bites on CONCURRENT edits. A node updating stock in sequence
 * applies normally, which is almost every update.
 */
export const PROTECTED_COLUMNS: Record<string, Set<string>> = {
  surgeries: SURGERY_CLINICAL_COLUMNS,
  inventory_items: new Set(['quantity', 'reorderLevel']),
};

export type Decision =
  | { action: 'APPLY'; reason: string }
  | { action: 'IGNORE'; reason: string }
  | { action: 'QUARANTINE'; reason: string }
  /**
   * This node has no policy for the table, so it cannot say what to do.
   *
   * Deliberately NOT an IGNORE, though for a long time it was one. The two are
   * opposite outcomes wearing the same word: IGNORE means "I considered this
   * and the local version stands", and the sender is right to treat it as
   * settled and drop the entry. This means "I do not know what this is",
   * which almost always means the peer is running older code — and dropping
   * the entry then destroys it silently, on both sides, forever.
   *
   * That is exactly how pack lists booked in theatre never reached the cloud
   * while the outbound queue read as empty and nothing was parked anywhere.
   */
  | { action: 'UNKNOWN_TABLE'; reason: string };

export interface IncomingChange {
  table: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  /** Version the sender derived this change from. */
  baseVersion: number;
  /** HLC stamp of the sender's write, already serialised. */
  hlc: string;
  originNode: string;
  changedColumns?: string[];
}

export interface LocalRowState {
  exists: boolean;
  version: number;
  hlc: string;
}

/**
 * Decide what to do with one incoming change.
 *
 * Pure, so the policy can be exercised exhaustively without a database. The
 * conflict test is exact rather than heuristic: a change conflicts if and only
 * if the version it was derived from is no longer the version we hold.
 */
export function decide(
  change: IncomingChange,
  local: LocalRowState | null,
  opts: { thisNode: string; cloudNode: string }
): Decision {
  const policy = policyFor(change.table);
  if (!policy) {
    return {
      action: 'UNKNOWN_TABLE',
      reason: `Table "${change.table}" has no sync policy on this node. `
        + 'It is probably running older code than the sender; the change is kept, not discarded.',
    };
  }

  // Nothing here yet: every class simply accepts the row.
  if (!local || !local.exists) {
    return change.op === 'DELETE'
      ? { action: 'IGNORE', reason: 'Delete for a row we do not have.' }
      : { action: 'APPLY', reason: 'New row.' };
  }

  // Cloud-authoritative tables are decided BEFORE the in-sequence shortcut.
  //
  // The shortcut below applies any change whose baseVersion matches what we
  // hold, on the reasoning that it is not a conflict. For every other class
  // that is right. For this one it was a hole: "the cloud is authoritative,
  // unconditionally" was enforced only when two nodes had diverged, so a local
  // edit made while the two sides agreed sailed straight through and became
  // the cloud's version of a user, a grant, or an onboarding decision.
  //
  // That is the lockout the phase-3 migration was written to avoid, and it was
  // reachable the whole time. An INSERT is still accepted, because a row the
  // receiving node has never seen is handled above and is not a conflict with
  // anything — a person who registers on the theatre server has to be able to
  // reach the cloud somehow.
  if (policy.cls === 'CLOUD_AUTHORITATIVE') {
    return change.originNode === opts.cloudNode
      ? { action: 'APPLY', reason: 'Cloud is authoritative for this table.' }
      : { action: 'IGNORE', reason: 'Local change to a cloud-authoritative table; cloud state stands.' };
  }

  // The mirror image, decided in the same place and for the same reason: before
  // the in-sequence shortcut, so authority is not quietly bypassed whenever the
  // two sides happened to agree a moment ago.
  //
  // QUARANTINE rather than IGNORE for a refused cloud edit. IGNORE tells the
  // sender the matter is settled and the change is dropped — which is right
  // when the local version genuinely supersedes it, and wrong here, where a
  // clinician on the other side wrote something real. The local row is
  // untouched, so the operational state IS local; the cloud's version is kept
  // beside it for a person. That satisfies "local wins" without also meaning
  // "the other version never existed".
  if (policy.cls === 'LOCAL_AUTHORITATIVE') {
    return change.originNode === opts.cloudNode
      ? { action: 'QUARANTINE', reason: `Cloud edit to "${change.table}", which the theatre server owns; local state stands and both versions are kept.` }
      : { action: 'APPLY', reason: 'Local node is authoritative for this table.' };
  }

  // Not a conflict: the sender was working from what we currently hold.
  if (change.baseVersion === local.version) {
    return { action: 'APPLY', reason: 'In sequence; sender had our current version.' };
  }

  // From here the change is CONCURRENT: the sender was working from a version
  // we no longer hold. What that means depends entirely on the class, so there
  // is deliberately no shortcut above this point. An earlier version of this
  // function discarded any change that looked "already superseded" before
  // consulting the class, which silently threw away concurrent clinical edits
  // — precisely what quarantine exists to prevent.
  switch (policy.cls) {
    case 'APPEND_ONLY':
      // Concurrent inserts of distinct rows are the normal case and are not a
      // conflict at all. An UPDATE here means the table is not actually
      // append-only and the classification is wrong — say so rather than guess.
      return change.op === 'INSERT'
        ? { action: 'APPLY', reason: 'Append-only; union of both sides.' }
        : { action: 'QUARANTINE', reason: `Update on append-only table "${change.table}" — classification looks wrong.` };

    // CLOUD_AUTHORITATIVE is settled above, before the in-sequence shortcut,
    // and so cannot reach this switch. It is not repeated here: a second
    // branch would read as live and invite somebody to edit the copy that
    // never runs.

    case 'LWW': {
      // Some columns are exempt even on an LWW table. Looked up per table
      // rather than tested against surgeries by name, so adding a protected
      // column is a change to the data above and not to this branch.
      const protectedCols = PROTECTED_COLUMNS[change.table];
      const touched = protectedCols
        && (change.changedColumns ?? []).some((c) => protectedCols.has(c));
      if (touched) {
        return { action: 'QUARANTINE', reason: `Protected column on an LWW row in "${change.table}"; not overwritten automatically.` };
      }
      return change.hlc > local.hlc
        ? { action: 'APPLY', reason: 'Later by hybrid logical clock.' }
        : { action: 'IGNORE', reason: 'Earlier by hybrid logical clock; local value stands.' };
    }

    case 'QUARANTINE':
      return { action: 'QUARANTINE', reason: 'Concurrent edit to clinical content; both versions preserved.' };
  }
}
