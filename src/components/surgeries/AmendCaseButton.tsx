'use client';

// ============================================================
// Correcting a booking from the list it is wrong on
// ------------------------------------------------------------
// A case scheduled for the 8th was marked COMPLETED on the 7th. The ordinary
// edit path refuses to touch a completed surgery — correctly, because a
// finished operation is a clinical record — and so there was no way back from
// an ordinary mis-click on a list of near-identical rows.
//
// The fix is a separate, reason-required, audited path, and this is its front
// end. It sits on the row because that is where somebody is standing when they
// notice: the moment you see COMPLETED against tomorrow's case is the moment to
// fix it, not after navigating somewhere else and losing which row it was.
//
// WHAT IT ASKS FOR, AND WHY IT INSISTS. A reason, in words, before it will
// save anything. The server enforces the same rule, so this is a courtesy
// rather than the control — but it is the courtesy that stops somebody getting
// three fields in and then being refused.
//
// THE DUPLICATE CASE. When the same patient is booked twice for the same
// procedure on the same day, one of them is almost always a form submitted
// again after the first appeared to fail. The panel offers to cancel this one
// AS a duplicate of the other, which records both the reason and which booking
// it repeats. It is never automatic: two genuine operations on one patient in
// one day do happen, and a system that cancelled one unasked would be far
// worse than one that points and waits.
//
// Cancelled, never deleted — a booking that vanishes takes with it the record
// that it was ever made.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Copy, Loader2, PencilLine, X } from 'lucide-react';

/** Mirrors MIN_REASON_LENGTH on the server, so the two cannot disagree. */
const MIN_REASON = 10;

const STATUSES = [
  'SCHEDULED', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE', 'IN_PROGRESS',
  'COMPLETED', 'CANCELLED',
] as const;

interface Option { id: string; name: string }

export interface DuplicateCandidate {
  id: string;
  label: string;
}

interface Props {
  surgeryId: string;
  patientName?: string | null;
  procedureName?: string | null;
  status: string;
  theatreId?: string | null;
  surgeonId?: string | null;
  anesthetistId?: string | null;
  scrubNurseId?: string | null;
  theatreTechnicianId?: string | null;
  /** Other bookings that look like the same case on the same day. */
  duplicates?: DuplicateCandidate[];
  onAmended?: () => void;
}

export default function AmendCaseButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [status, setStatus] = useState(props.status);
  const [theatreId, setTheatreId] = useState(props.theatreId ?? '');
  const [surgeonId, setSurgeonId] = useState(props.surgeonId ?? '');
  const [anesthetistId, setAnesthetistId] = useState(props.anesthetistId ?? '');
  const [scrubNurseId, setScrubNurseId] = useState(props.scrubNurseId ?? '');
  const [technicianId, setTechnicianId] = useState(props.theatreTechnicianId ?? '');
  const [reason, setReason] = useState('');
  const [duplicateOf, setDuplicateOf] = useState('');

  const [theatres, setTheatres] = useState<Option[]>([]);
  const [surgeons, setSurgeons] = useState<Option[]>([]);
  const [anaesthetists, setAnaesthetists] = useState<Option[]>([]);
  const [scrubNurses, setScrubNurses] = useState<Option[]>([]);
  const [technicians, setTechnicians] = useState<Option[]>([]);

  // Loaded when the panel opens, not with the page. A theatre list on every
  // row of a hundred-row table is a hundred requests nobody asked for.
  const loadOptions = useCallback(async () => {
    const asOptions = (d: unknown): Option[] => {
      const list = Array.isArray(d) ? d : ((d as { users?: unknown[] })?.users
        ?? (d as { theatres?: unknown[] })?.theatres ?? []);
      return (list as Array<{ id: string; name?: string; fullName?: string }>)
        .map((x) => ({ id: x.id, name: x.fullName ?? x.name ?? x.id }));
    };
    const get = async (url: string) => {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        return r.ok ? asOptions(await r.json()) : [];
      } catch { return []; }
    };
    const [t, a, s, k, g] = await Promise.all([
      get('/api/theatres'),
      get('/api/users?role=ANAESTHETIST&status=APPROVED'),
      get('/api/users?role=SCRUB_NURSE&status=APPROVED'),
      get('/api/users?role=ANAESTHETIC_TECHNICIAN&status=APPROVED'),
      // Consultants and surgeons both operate, so the list is both, by name.
      Promise.all([
        get('/api/users?role=CONSULTANT_SURGEON&status=APPROVED'),
        get('/api/users?role=SURGEON&status=APPROVED'),
      ]).then(([c, sg]) => c.concat(sg).sort((x, y) => x.name.localeCompare(y.name))),
    ]);
    setTheatres(t); setAnaesthetists(a); setScrubNurses(s); setTechnicians(k); setSurgeons(g);
  }, []);

  useEffect(() => { if (open) void loadOptions(); }, [open, loadOptions]);

  const save = async () => {
    setError(null);

    if (reason.trim().length < MIN_REASON) {
      setError(`Say why, in at least ${MIN_REASON} characters. A correction with no reason `
        + 'cannot be told apart from a mistake by whoever reads this next.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/surgeries/${props.surgeryId}/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          ...(duplicateOf
            // Removing a duplicate forces CANCELLED on the server, so the
            // other fields are not sent — they would only be noise in the
            // audit entry for a booking being withdrawn.
            ? { duplicateOf }
            : {
                status,
                theatreId,
                surgeonId,
                anesthetistId,
                scrubNurseId,
                theatreTechnicianId: technicianId,
              }),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'That could not be saved.'); return; }

      setDone(true);
      window.setTimeout(() => { setOpen(false); setDone(false); setReason(''); }, 1200);
      props.onAmended?.();
    } catch {
      setError('The connection dropped before this could be saved. Check the row before '
        + 'trying again — it may already have gone through.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:text-amber-900"
        title="Correct this booking (records who and why)"
      >
        <PencilLine className="h-4 w-4" />
        Amend
      </button>
    );
  }

  const removingDuplicate = Boolean(duplicateOf);

  // Rendered into <body>, not where the button sits.
  //
  // The button lives in the actions cell of the theatre list, and that cell is
  // `whitespace-nowrap text-right`. A dialog rendered inside it inherits both:
  // every paragraph refuses to wrap and runs straight out of the box, and
  // every label aligns right. The table also scrolls horizontally, which clips
  // a fixed child in some browsers.
  //
  // A portal escapes all of it — the dialog is no longer inside a table at
  // all. The explicit text-left and whitespace-normal below are belt and
  // braces for anything a future ancestor sets.
  const dialog = (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 text-left [white-space:normal]">
      <div className="mt-10 w-full max-w-lg rounded-2xl bg-white p-5 text-left shadow-xl [white-space:normal]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Correct this booking</h2>
            <p className="text-sm text-gray-600">
              {props.patientName ?? 'Patient'} — {props.procedureName ?? 'procedure'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Close without changing anything"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Shown before the fields, because if this IS a duplicate then
            nothing else on the panel matters. */}
        {(props.duplicates?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
            <p className="flex items-start gap-2 text-sm font-semibold text-amber-900">
              <Copy className="mt-0.5 h-4 w-4 shrink-0" />
              This patient is booked more than once for this procedure on this day.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Usually the booking form was sent again after the first attempt appeared to
              fail. If this row is the repeat, withdraw it against the one it duplicates —
              it is cancelled and kept on record, never deleted.
            </p>
            {/* Radios, not a dropdown.
                A collapsed select showed only "Not a duplicate", so the one
                action somebody opened this panel for was hidden behind a click
                they had no reason to make. Every choice is visible now. */}
            <fieldset className="mt-3">
              <legend className="text-xs font-semibold text-amber-900">
                Is this row the repeat?
              </legend>

              <label className="mt-1.5 flex cursor-pointer items-start gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-amber-200">
                <input
                  type="radio"
                  name={`dup-${props.surgeryId}`}
                  checked={duplicateOf === ''}
                  onChange={() => setDuplicateOf('')}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="text-sm text-gray-800">
                  <span className="font-semibold">No — keep it.</span> I am correcting its
                  details instead.
                </span>
              </label>

              {props.duplicates!.map((d) => (
                <label
                  key={d.id}
                  className="mt-1.5 flex cursor-pointer items-start gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-amber-200"
                >
                  <input
                    type="radio"
                    name={`dup-${props.surgeryId}`}
                    checked={duplicateOf === d.id}
                    onChange={() => setDuplicateOf(d.id)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="text-sm text-gray-800">
                    <span className="font-semibold text-red-700">Yes — withdraw this row.</span>{' '}
                    It repeats the booking at {d.label}, which stays.
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        )}

        {!removingDuplicate && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-700">Theatre</span>
              <select
                value={theatreId}
                onChange={(e) => setTheatreId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Not assigned</option>
                {theatres.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="block text-xs font-semibold text-gray-700">
                Surgeon
                <span className="ml-1 font-normal text-gray-500">
                  — changes who is accountable for the case
                </span>
              </span>
              <select
                value={surgeonId}
                onChange={(e) => setSurgeonId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Not assigned</option>
                {surgeons.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-700">Anaesthetist</span>
              <select
                value={anesthetistId}
                onChange={(e) => setAnesthetistId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Not assigned</option>
                {anaesthetists.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-700">Scrub nurse</span>
              <select
                value={scrubNurseId}
                onChange={(e) => setScrubNurseId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Not assigned</option>
                {scrubNurses.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="block text-xs font-semibold text-gray-700">
                Anaesthetic technician
              </span>
              <select
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Not assigned</option>
                {technicians.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          </div>
        )}

        <label className="mt-4 block">
          <span className="block text-xs font-semibold text-gray-700">
            Why {removingDuplicate ? 'is this being withdrawn' : 'is this being changed'}?
            <span className="text-red-600"> *</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={removingDuplicate
              ? 'e.g. Booking form submitted twice; this is the repeat.'
              : 'e.g. Marked complete by mistake — the case is tomorrow.'}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-gray-500">
            Recorded against your name in the audit register, with what changed. This is what
            lets the next person tell a correction from an error.
          </span>
        </label>

        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || done}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              removingDuplicate ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" />
              : done ? <Check className="h-4 w-4" /> : null}
            {done ? 'Saved'
              : removingDuplicate ? 'Withdraw this duplicate' : 'Save the correction'}
          </button>
        </div>
      </div>
    </div>
  );

  // document is absent during the server render; the dialog only ever opens
  // from a click, so there is nothing to show until the browser has it.
  return typeof document === 'undefined' ? null : createPortal(dialog, document.body);
}
