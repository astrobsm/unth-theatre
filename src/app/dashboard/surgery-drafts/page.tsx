'use client';

// ============================================================
// Tentative cases — what a unit is planning, before it has a date
// ------------------------------------------------------------
// The screen a unit uses between deciding to operate and booking. A plan sits
// here with as much or as little as is known, optionally with the date the
// unit is aiming for, and becomes a real case when somebody confirms a date
// and presses Publish.
//
// PUBLISH CALLS THE ORDINARY BOOKING ROUTE. Not a special one. The case that
// appears on the surgery schedule is created by POST /api/surgeries with the
// draft's fields, so it is bundled, quoted, audited and refused on exactly the
// same terms as a booking typed in by hand. The draft is then marked, and that
// mark is the only thing this module's own API writes.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CalendarDays, Plus, Send, Trash2, X, AlertTriangle, CheckCircle2 } from 'lucide-react';

import {
  type ScheduleDraft,
  missingForPublish,
  publishDefaults,
  publishIdempotencyKey,
  publishPayload,
  validatePublishChoice,
  asDateInput,
} from '@/lib/surgeryDrafts/draft';

const MAGNITUDES = ['MAJOR', 'INTERMEDIATE', 'MINOR', 'SUPER_MAJOR'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH'];

const emptyForm = {
  unit: '',
  subspecialty: '',
  patientId: '',
  patientName: '',
  patientFolderNumber: '',
  surgeonName: '',
  procedureName: '',
  indication: '',
  magnitude: '',
  surgeryType: 'ELECTIVE',
  estimatedDuration: '60',
  targetDate: '',
  preferredTime: '',
  priority: 'NORMAL',
  notes: '',
};

export default function SurgeryDraftsPage() {
  const { status: authStatus } = useSession();
  const [drafts, setDrafts] = useState<ScheduleDraft[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUnit, setFilterUnit] = useState('');
  const [filterStatus, setFilterStatus] = useState('DRAFT');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  // Which draft's Publish panel is open, and what date/time it is set to.
  const [publishing, setPublishing] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ date: string; time: string }>({ date: '', time: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterUnit) qs.set('unit', filterUnit);
      if (filterStatus) qs.set('status', filterStatus);
      const res = await fetch(`/api/surgery-drafts?${qs.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('could not load');
      const data = await res.json();
      setDrafts(data.drafts || []);
      setUnits(data.units || []);
    } catch {
      setNotice({ kind: 'bad', text: 'Could not load the planned cases.' });
    } finally {
      setLoading(false);
    }
  }, [filterUnit, filterStatus]);

  useEffect(() => {
    if (authStatus === 'authenticated') load();
  }, [authStatus, load]);

  const save = async () => {
    if (!form.unit.trim() || !form.subspecialty.trim() || !form.procedureName.trim()) {
      setNotice({ kind: 'bad', text: 'A plan needs at least the unit, the subspecialty and the operation.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/surgery-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'could not save');
      }
      setForm({ ...emptyForm });
      setShowForm(false);
      setNotice({ kind: 'ok', text: 'Plan saved. It is not on any list until it is published.' });
      load();
    } catch (e) {
      setNotice({ kind: 'bad', text: e instanceof Error ? e.message : 'Could not save the plan.' });
    } finally {
      setSaving(false);
    }
  };

  const openPublish = (d: ScheduleDraft) => {
    const defaults = publishDefaults(d);
    setChoice({ date: defaults.date, time: defaults.time || '08:00' });
    setPublishing(d.id);
  };

  /**
   * Publish: book the case, then mark the plan.
   *
   * In that order, and with an idempotency key tied to the draft and the date,
   * so that a second press — or a retry after the network dropped between the
   * two calls — replays the same booking instead of putting the patient on the
   * list twice.
   */
  const publish = async (d: ScheduleDraft) => {
    const problem = validatePublishChoice({ scheduledDate: choice.date, scheduledTime: choice.time });
    if (problem) {
      setNotice({ kind: 'bad', text: problem });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/surgeries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': publishIdempotencyKey(d.id, choice.date),
        },
        body: JSON.stringify(
          publishPayload(d, { scheduledDate: choice.date, scheduledTime: choice.time }),
        ),
      });
      const created = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The booking route's own words. It knows why it refused — a cut-off,
        // a clash, a patient that is not there — and anything written here
        // instead would be a worse answer arriving first.
        throw new Error(created.error || 'The case could not be booked.');
      }

      await fetch(`/api/surgery-drafts/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'PUBLISHED',
          publishedSurgeryId: created.id,
          publishedForDate: choice.date,
        }),
      });

      setPublishing(null);
      setNotice({
        kind: 'ok',
        text: `Booked for ${choice.date} at ${choice.time}. It is now on the surgery schedule for that date.`,
      });
      load();
    } catch (e) {
      setNotice({ kind: 'bad', text: e instanceof Error ? e.message : 'Could not publish.' });
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (d: ScheduleDraft) => {
    setBusy(true);
    try {
      await fetch(`/api/surgery-drafts/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'WITHDRAWN' }),
      });
      load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: ScheduleDraft) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/surgery-drafts/${d.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setNotice({ kind: 'bad', text: e.error || 'Could not remove that plan.' });
      }
      load();
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const withDate = drafts.filter((d) => d.targetDate);
    const noDate = drafts.filter((d) => !d.targetDate);
    return { withDate, noDate };
  }, [drafts]);

  if (authStatus === 'loading') return <div className="p-6 text-gray-500">Loading…</div>;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-blue-600" />
            Planned cases
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            What your unit intends to operate, before it is booked. Nothing here holds a theatre or
            a pack until you publish it.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> New plan
        </button>
      </div>

      {notice && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${
            notice.kind === 'ok'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {notice.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showForm && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3">A case the unit is planning</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Unit *" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} placeholder="e.g. GS Unit I" />
            <Field label="Subspecialty *" value={form.subspecialty} onChange={(v) => setForm({ ...form, subspecialty: v })} placeholder="e.g. General Surgery" />
            <Field label="Patient name" value={form.patientName} onChange={(v) => setForm({ ...form, patientName: v })} placeholder="If not yet registered" />
            <Field label="Folder number" value={form.patientFolderNumber} onChange={(v) => setForm({ ...form, patientFolderNumber: v })} />
            <Field label="Patient ID (from Patients)" value={form.patientId} onChange={(v) => setForm({ ...form, patientId: v })} placeholder="Needed to publish" />
            <Field label="Surgeon" value={form.surgeonName} onChange={(v) => setForm({ ...form, surgeonName: v })} />
            <Field label="Operation *" value={form.procedureName} onChange={(v) => setForm({ ...form, procedureName: v })} />
            <Field label="Indication" value={form.indication} onChange={(v) => setForm({ ...form, indication: v })} />
            <Select label="Magnitude" value={form.magnitude} onChange={(v) => setForm({ ...form, magnitude: v })} options={['', ...MAGNITUDES]} />
            <Select label="Priority" value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} options={PRIORITIES} />
            <Field label="Tentative date" type="date" value={form.targetDate} onChange={(v) => setForm({ ...form, targetDate: v })} />
            <Field label="Preferred start" type="time" value={form.preferredTime} onChange={(v) => setForm({ ...form, preferredTime: v })} />
            <Field label="Expected minutes" type="number" value={form.estimatedDuration} onChange={(v) => setForm({ ...form, estimatedDuration: v })} />
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Anything the theatre should know when this is booked"
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            The tentative date is optional, and it is only a plan — you choose the real date when you publish.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save plan'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={filterUnit}
          onChange={(e) => setFilterUnit(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All units</option>
          {units.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="DRAFT">Still planned</option>
          <option value="PUBLISHED">Published</option>
          <option value="WITHDRAWN">Withdrawn</option>
          <option value="">All</option>
        </select>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
          <CalendarDays className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p className="font-medium">Nothing planned here yet.</p>
          <p className="text-sm mt-1">Add a case your unit intends to do, with or without a date.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.withDate.length > 0 && (
            <Section title="With a tentative date">
              {grouped.withDate.map((d) => (
                <DraftCard
                  key={d.id} d={d} busy={busy}
                  publishing={publishing === d.id} choice={choice} setChoice={setChoice}
                  onOpenPublish={() => openPublish(d)} onCancelPublish={() => setPublishing(null)}
                  onPublish={() => publish(d)} onWithdraw={() => withdraw(d)} onRemove={() => remove(d)}
                />
              ))}
            </Section>
          )}
          {grouped.noDate.length > 0 && (
            <Section title="No date yet">
              {grouped.noDate.map((d) => (
                <DraftCard
                  key={d.id} d={d} busy={busy}
                  publishing={publishing === d.id} choice={choice} setChoice={setChoice}
                  onOpenPublish={() => openPublish(d)} onCancelPublish={() => setPublishing(null)}
                  onPublish={() => publish(d)} onWithdraw={() => withdraw(d)} onRemove={() => remove(d)}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o || '—'}</option>
        ))}
      </select>
    </div>
  );
}

function DraftCard({
  d, busy, publishing, choice, setChoice,
  onOpenPublish, onCancelPublish, onPublish, onWithdraw, onRemove,
}: {
  d: ScheduleDraft; busy: boolean; publishing: boolean;
  choice: { date: string; time: string };
  setChoice: (c: { date: string; time: string }) => void;
  onOpenPublish: () => void; onCancelPublish: () => void;
  onPublish: () => void; onWithdraw: () => void; onRemove: () => void;
}) {
  const missing = missingForPublish(d);
  const isDraft = d.status === 'DRAFT';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{d.procedureName}</span>
            {d.priority === 'HIGH' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">High priority</span>
            )}
            {d.status === 'PUBLISHED' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                On the list{d.publishedForDate ? ` · ${asDateInput(d.publishedForDate)}` : ''}
              </span>
            )}
            {d.status === 'WITHDRAWN' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">Withdrawn</span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-0.5">
            {d.patientName || d.patientId || 'No patient named'}
            {d.patientFolderNumber ? ` · ${d.patientFolderNumber}` : ''}
            {d.surgeonName ? ` · ${d.surgeonName}` : ''}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {d.unit} · {d.subspecialty}
            {d.targetDate ? ` · aiming for ${asDateInput(d.targetDate)}` : ''}
            {d.preferredTime ? ` at ${d.preferredTime}` : ''}
          </p>
          {d.notes && <p className="text-xs text-gray-500 mt-1 italic">{d.notes}</p>}
        </div>

        {isDraft && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onOpenPublish}
              disabled={busy || missing.length > 0}
              title={missing.length ? 'Something is still missing' : 'Choose a date and put it on the list'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" /> Publish
            </button>
            <button onClick={onWithdraw} disabled={busy} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm">
              Withdraw
            </button>
            <button onClick={onRemove} disabled={busy} className="p-1.5 rounded-lg border border-gray-300 text-gray-500" aria-label="Remove">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {isDraft && missing.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-semibold text-amber-900 mb-1">
            Still needed before this can go on a list
          </p>
          <ul className="text-xs text-amber-800 space-y-0.5 list-disc pl-4">
            {missing.map((m) => (
              <li key={m.field}>{m.say}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 mt-2">
            The plan is kept either way — this only stops it becoming a booked case.
          </p>
        </div>
      )}

      {publishing && (
        <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-3">
          <p className="text-xs font-semibold text-blue-900 mb-2">
            Which date is it actually being done?
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs text-blue-900 mb-1">Date</label>
              <input
                type="date"
                value={choice.date}
                onChange={(e) => setChoice({ ...choice, date: e.target.value })}
                className="rounded-lg border border-blue-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-blue-900 mb-1">Start</label>
              <input
                type="time"
                value={choice.time}
                onChange={(e) => setChoice({ ...choice, time: e.target.value })}
                className="rounded-lg border border-blue-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={onPublish}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Booking…' : 'Publish to the schedule'}
            </button>
            <button onClick={onCancelPublish} className="px-3 py-2 rounded-lg border border-gray-300 text-sm">
              Cancel
            </button>
          </div>
          {d.targetDate && (
            <p className="text-xs text-blue-700 mt-2">
              Filled in from the date your unit was aiming for. Change it if the plan has moved.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
