'use client';

// ============================================================
// The laboratory's own worklist
// ------------------------------------------------------------
// What am I to report on today, for patients who are going to theatre.
//
// Before this, the answer lived in two places and neither was the laboratory's:
// the elective investigations were on the booking form, the emergency workup on
// its own screen, and a scientist wanting their own outstanding work had to
// know both and go looking.
//
// ONE SCREEN, BOTH STREAMS, BY BENCH. Elective and emergency together, because
// the scientist's job is the same and a second screen for emergencies is a
// second screen to forget to open. Filtered to the bench this person reports
// on, because a worklist showing every discipline to everybody is a worklist
// nobody owns.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardList, FileUp, FlaskConical, Loader2, Upload,
} from 'lucide-react';
import { DISCIPLINE_LABEL, type LabDiscipline } from '@/lib/diagnostics/disciplines';

interface WorkItem {
  key: string;
  source: 'ELECTIVE' | 'EMERGENCY';
  requestId: string;
  patientId: string | null;
  patientName: string;
  folderNumber: string | null;
  surgeryId: string | null;
  procedureName: string | null;
  scheduledDate: string | null;
  urgent: boolean;
  testName: string;
  discipline: LabDiscipline;
  requestedAt: string;
  resulted: boolean;
}

interface Report {
  id: string;
  discipline: string;
  testName: string;
  resultSummary: string;
  status: string;
  critical: boolean;
  abnormal: boolean;
  enteredByName: string;
  enteredAt: string;
  attachmentName: string | null;
}

/** Roughly 4 MB of file once base64 has inflated it. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export default function LaboratoryPage() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [mine, setMine] = useState<LabDiscipline[]>([]);
  const [canVerify, setCanVerify] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [open, setOpen] = useState<WorkItem | null>(null);

  const [form, setForm] = useState({
    resultSummary: '', resultValues: '', referenceRange: '',
    abnormal: false, critical: false, verified: false, notes: '',
    attachment: '', attachmentName: '', attachmentType: '',
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/laboratory', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setItems(Array.isArray(d.items) ? d.items : []);
        setReports(Array.isArray(d.reports) ? d.reports : []);
        setMine(Array.isArray(d.myDisciplines) ? d.myDisciplines : []);
        setCanVerify(Array.isArray(d.canVerify) ? d.canVerify : []);
      }
    } catch {
      /* the page still draws; the worklist is simply empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(
    () => (filter === 'ALL' ? items : items.filter((i) => i.discipline === filter)),
    [items, filter],
  );

  const startResult = (item: WorkItem) => {
    setOpen(item);
    setMessage(null);
    setForm({
      resultSummary: '', resultValues: '', referenceRange: '',
      abnormal: false, critical: false,
      // Defaults to released where this person may release, because that is
      // the ordinary case for a scientist and an extra tick on every result is
      // an extra tick that gets forgotten.
      verified: canVerify.includes(item.discipline),
      notes: '', attachment: '', attachmentName: '', attachmentType: '',
    });
  };

  const pickFile = (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setMessage({
        tone: 'bad',
        text: 'That file is over 4 MB. A photograph taken on a phone usually is — attach the PDF, or photograph it at a lower setting.',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({
      ...f,
      attachment: String(reader.result ?? ''),
      attachmentName: file.name,
      attachmentType: file.type,
    }));
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!open) return;
    if (!open.patientId) {
      setMessage({
        tone: 'bad',
        // Honest about the limitation rather than failing silently at the API.
        text: 'This emergency request does not carry a patient record id, so the result cannot be filed against the patient here. Enter it on the Emergency Lab Workup screen.',
      });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/laboratory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: open.patientId,
          surgeryId: open.surgeryId,
          emergencyLabRequestId: open.source === 'EMERGENCY' ? open.requestId : null,
          discipline: open.discipline,
          testName: open.testName,
          urgent: open.urgent,
          ...form,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: 'bad', text: d.error || 'That result could not be saved.' });
        return;
      }
      setMessage({
        tone: 'good',
        text: d.notified ? `${d.message} ${d.notified}.` : d.message,
      });
      setOpen(null);
      await load();
    } catch {
      setMessage({ tone: 'bad', text: 'That result could not be saved — check the connection.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <FlaskConical className="h-6 w-6 text-teal-600" /> Laboratory results
        </h1>
        <p className="text-gray-600">
          Outstanding work for patients going to theatre — elective and emergency together,
          on your own bench.
        </p>
        {mine.length > 0 && (
          <p className="mt-1 text-sm text-gray-500">
            You report on: {mine.map((d) => DISCIPLINE_LABEL[d]).join(', ')}.
            {canVerify.length === 0 && ' You may enter results; a scientist verifies them for release.'}
          </p>
        )}
      </div>

      {message && (
        <p className={`rounded-xl px-4 py-3 text-sm ${
          message.tone === 'good' ? 'bg-green-100 text-green-900' : 'bg-red-50 text-red-800'
        }`}>
          {message.tone === 'bad' && <AlertTriangle className="mr-1.5 inline h-4 w-4" />}
          {message.text}
        </p>
      )}

      {/* Benches. Only the ones this person has work on, plus All. */}
      <div className="flex flex-wrap gap-2">
        {['ALL', ...Array.from(new Set(items.map((i) => i.discipline)))].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setFilter(d)}
            className={`rounded-xl border-2 px-3 py-1.5 text-sm font-semibold transition ${
              filter === d
                ? 'border-teal-600 bg-teal-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-teal-400'
            }`}
          >
            {d === 'ALL' ? 'All benches' : DISCIPLINE_LABEL[d as LabDiscipline]}
            <span className="ml-1.5 text-xs opacity-75">
              {d === 'ALL' ? items.length : items.filter((i) => i.discipline === d).length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Worklist ── */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <ClipboardList className="h-5 w-5 text-gray-500" /> Outstanding ({shown.filter((i) => !i.resulted).length})
        </h2>
        {loading ? (
          <p className="mt-2 text-sm text-gray-500">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="mt-2 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
            Nothing outstanding on your bench for the cases coming up.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {shown.map((i) => (
              <li
                key={i.key}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 bg-white px-4 py-3 ${
                  i.resulted ? 'border-gray-200 opacity-70' : i.urgent ? 'border-red-300' : 'border-gray-200'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">
                    {i.testName}
                    {i.urgent && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                        {i.source === 'EMERGENCY' ? 'EMERGENCY' : 'URGENT'}
                      </span>
                    )}
                    {i.resulted && (
                      <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-bold text-green-800">
                        RESULTED
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-600">
                    {i.patientName}{i.folderNumber ? ` (${i.folderNumber})` : ''}
                    {i.procedureName ? ` · ${i.procedureName}` : ''}
                    {i.scheduledDate
                      ? ` · theatre ${new Date(i.scheduledDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                      : ''}
                  </p>
                  <p className="text-xs text-gray-500">
                    {DISCIPLINE_LABEL[i.discipline]} · requested{' '}
                    {new Date(i.requestedAt).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startResult(i)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                >
                  <Upload className="h-4 w-4" /> Enter result
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Issued recently ── */}
      {reports.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900">Issued in the last week</h2>
          <ul className="mt-2 space-y-1.5">
            {reports.slice(0, 25).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-gray-900">{r.testName}</span>
                  <span className="text-gray-600"> — {r.resultSummary.slice(0, 90)}</span>
                  {r.attachmentName && (
                    <span className="ml-2 text-xs text-gray-500">
                      <FileUp className="mr-0.5 inline h-3 w-3" />{r.attachmentName}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {r.critical && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">CRITICAL</span>
                  )}
                  {r.abnormal && !r.critical && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">ABNORMAL</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    r.status === 'VERIFIED' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {r.status === 'VERIFIED' ? 'Released' : 'Provisional'}
                  </span>
                  <span className="text-xs text-gray-500">{r.enteredByName}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Entry ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5">
            <h2 className="text-lg font-bold text-gray-900">{open.testName}</h2>
            <p className="text-sm text-gray-600">
              {open.patientName}{open.folderNumber ? ` (${open.folderNumber})` : ''} · {DISCIPLINE_LABEL[open.discipline]}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="labSummary" className="mb-1 block text-sm font-semibold text-gray-800">
                  The result <span className="font-normal text-gray-500">— what a clinician reads</span>
                </label>
                <textarea
                  id="labSummary" rows={3} value={form.resultSummary}
                  onChange={(e) => setForm({ ...form, resultSummary: e.target.value })}
                  placeholder="Hb 7.2 g/dL, WCC 14.1, platelets 180"
                  className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="labValues" className="mb-1 block text-sm font-semibold text-gray-800">
                    Values <span className="font-normal text-gray-500">(optional)</span>
                  </label>
                  <input
                    id="labValues" value={form.resultValues}
                    onChange={(e) => setForm({ ...form, resultValues: e.target.value })}
                    className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="labRange" className="mb-1 block text-sm font-semibold text-gray-800">
                    Reference range <span className="font-normal text-gray-500">(optional)</span>
                  </label>
                  <input
                    id="labRange" value={form.referenceRange}
                    onChange={(e) => setForm({ ...form, referenceRange: e.target.value })}
                    className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="labFile" className="mb-1 block text-sm font-semibold text-gray-800">
                  Attach the report <span className="font-normal text-gray-500">(optional, up to 4 MB)</span>
                </label>
                <input
                  id="labFile" type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-xl border-2 border-gray-300 px-3 py-2 text-sm"
                />
                {form.attachmentName && (
                  <p className="mt-1 text-xs text-green-700">Attached: {form.attachmentName}</p>
                )}
              </div>

              <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" checked={form.abnormal} className="mt-0.5 h-4 w-4 accent-amber-600"
                    onChange={(e) => setForm({ ...form, abnormal: e.target.checked })} />
                  <span className="text-gray-800">Outside the reference range</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" checked={form.critical} className="mt-0.5 h-4 w-4 accent-red-600"
                    onChange={(e) => setForm({ ...form, critical: e.target.checked })} />
                  <span className="text-gray-800">
                    <span className="font-semibold">Critical — changes what happens today</span>
                    {/* A critical result is not delivered by being in the
                        system. Ticking this tells the people on the case by
                        name, and the acknowledgement is recorded. */}
                    <span className="block text-xs text-gray-600">
                      Everyone on the case is told by name, and it stays unacknowledged on the
                      board until somebody confirms they have seen it.
                    </span>
                  </span>
                </label>
                {canVerify.includes(open.discipline) ? (
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" checked={form.verified} className="mt-0.5 h-4 w-4 accent-green-600"
                      onChange={(e) => setForm({ ...form, verified: e.target.checked })} />
                    <span className="text-gray-800">
                      <span className="font-semibold">Verify and release</span>
                      <span className="block text-xs text-gray-600">
                        Releasing is the statement that this is fit to operate on, and it carries
                        your name. Leave it unticked to save as provisional.
                      </span>
                    </span>
                  </label>
                ) : (
                  <p className="text-xs text-gray-600">
                    This will be saved as provisional. A scientist on this bench verifies it for release.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button" onClick={submit} disabled={saving || !form.resultSummary.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save result
              </button>
              <button type="button" onClick={() => setOpen(null)} className="rounded-xl px-4 py-2.5 font-medium text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
