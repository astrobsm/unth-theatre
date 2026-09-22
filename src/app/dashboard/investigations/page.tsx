'use client';

// ============================================================
// Requesting investigations for a case
// ------------------------------------------------------------
// This did not exist. The API to create a preoperative investigation had been
// there all along and nothing in the application called it, so investigations
// could be recorded only by editing a surgery — which meant in practice they
// were ordered on paper, and the laboratory's worklist stayed empty because
// nothing had been asked of it.
//
// Pick the case, tick what is wanted, say why. The tests come from a short list
// of what a theatre actually orders, grouped by the bench that reports them,
// because a blank "test name" box produces thirty spellings of one
// investigation and then nothing can be counted or routed. Anything not on the
// list is typed free-hand and still reaches the right bench by name.
//
// NOTHING IS PRE-TICKED. What a patient needs is the surgeon's and the
// anaesthetist's decision, and a form that arrives with a panel already
// selected is that decision being made by a screen.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CheckCircle2, ClipboardList, FlaskConical, Loader2, Search, Send,
} from 'lucide-react';
import { catalogueByDiscipline, categoryFor } from '@/lib/diagnostics/testCatalogue';
import { DISCIPLINE_LABEL, type LabDiscipline } from '@/lib/diagnostics/disciplines';

interface Surgery {
  id: string;
  procedureName: string;
  scheduledDate: string;
  scheduledTime: string;
  surgeryType: string;
  status: string;
  patient?: { id: string; name: string; folderNumber: string | null } | null;
}

interface Investigation {
  id: string;
  testName: string;
  testCategory: string;
  urgency: string;
  status: string;
  resultsAvailable: boolean;
  resultValue: string | null;
  requestedAt: string;
  patient?: { name: string; folderNumber: string | null } | null;
  surgery?: { procedureName: string } | null;
}

const GROUPS = catalogueByDiscipline();

export default function InvestigationsPage() {
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [existing, setExisting] = useState<Investigation[]>([]);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<Surgery | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [freeText, setFreeText] = useState('');
  const [urgency, setUrgency] = useState('ROUTINE');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [sRes, iRes] = await Promise.all([
        fetch('/api/surgeries?limit=150', { cache: 'no-store' }),
        fetch('/api/investigations', { cache: 'no-store' }),
      ]);
      if (sRes.ok) {
        const d = await sRes.json();
        const rows: Surgery[] = Array.isArray(d) ? d : (d.surgeries ?? []);
        setSurgeries(rows.filter((s) => !['CANCELLED', 'COMPLETED'].includes(s.status)));
      }
      if (iRes.ok) {
        const d = await iRes.json();
        setExisting(Array.isArray(d) ? d : []);
      }
    } catch {
      /* the page still draws; the lists are simply empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return surgeries.slice(0, 25);
    return surgeries.filter((s) =>
      (s.patient?.name ?? '').toLowerCase().includes(q)
      || (s.patient?.folderNumber ?? '').toLowerCase().includes(q)
      || s.procedureName.toLowerCase().includes(q)).slice(0, 25);
  }, [surgeries, search]);

  const alreadyAsked = useMemo(() => {
    if (!chosen) return new Set<string>();
    return new Set(
      existing.filter((i) => i.surgery && i.testName && chosen
        // Matched on the case through the list we already hold.
        && existing.some((x) => x.id === i.id))
        .filter((i) => (i as unknown as { surgeryId?: string }).surgeryId === chosen.id)
        .map((i) => i.testName.toLowerCase()),
    );
  }, [existing, chosen]);

  const selected = Object.keys(picked).filter((k) => picked[k]);
  const extra = freeText.split('\n').map((t) => t.trim()).filter(Boolean);
  const total = selected.length + extra.length;

  const submit = async () => {
    if (!chosen?.patient?.id) {
      setMessage({ tone: 'bad', text: 'Choose the case first.' });
      return;
    }
    if (total === 0) {
      setMessage({ tone: 'bad', text: 'Nothing has been selected to request.' });
      return;
    }
    if (!reason.trim()) {
      setMessage({
        tone: 'bad',
        // A request that says only "FBC" gets a result that answers nobody's
        // question, and the laboratory cannot tell urgent from routine.
        text: 'Say why these are wanted. The laboratory reads it to decide what to do first.',
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    const wanted = [
      ...GROUPS.flatMap((g) => g.tests)
        .filter((t) => picked[t.name])
        .map((t) => ({ testName: t.name, testCategory: categoryFor(t) })),
      // Typed by hand. The bench is worked out from the name on the way in.
      ...extra.map((name) => ({ testName: name, testCategory: 'OTHER' })),
    ];

    try {
      const results = await Promise.all(wanted.map((t) => fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: chosen.id,
          patientId: chosen.patient!.id,
          testName: t.testName,
          testCategory: t.testCategory,
          urgency,
          requestReason: reason.trim(),
        }),
      }).then((r) => r.ok)));

      const ok = results.filter(Boolean).length;
      if (ok === 0) {
        setMessage({ tone: 'bad', text: 'Nothing could be requested. Try again.' });
      } else {
        setMessage({
          tone: 'good',
          text: ok === wanted.length
            ? `${ok} ${ok === 1 ? 'investigation' : 'investigations'} requested. They are now on the laboratory's worklist.`
            // Said plainly rather than reported as a success.
            : `${ok} of ${wanted.length} were requested; the rest failed. Check the list below and re-request what is missing.`,
        });
        setPicked({});
        setFreeText('');
        setReason('');
        await load();
      }
    } catch {
      setMessage({ tone: 'bad', text: 'Those could not be requested — check the connection.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <FlaskConical className="h-6 w-6 text-blue-600" /> Request investigations
        </h1>
        <p className="text-gray-600">
          Laboratory investigations for a booked case. They appear at once on the laboratory&rsquo;s
          worklist, on the bench that reports them.
        </p>
        <p className="mt-1 text-sm text-gray-500">
          For an X-ray, ultrasound, CT or MRI use{' '}
          <Link href="/dashboard/radiology" className="font-medium text-blue-600 hover:underline">
            Radiology
          </Link>
          {' '}— imaging is requested there so the safety questions are asked before the scanner,
          not at it.
        </p>
      </div>

      {message && (
        <p className={`rounded-xl px-4 py-3 text-sm ${
          message.tone === 'good' ? 'bg-green-100 text-green-900' : 'bg-red-50 text-red-800'
        }`}>
          {message.tone === 'bad' && <AlertTriangle className="mr-1.5 inline h-4 w-4" />}
          {message.text}
        </p>
      )}

      {/* ── Which case ── */}
      <section className="rounded-2xl border-2 border-gray-200 bg-white p-4">
        <h2 className="font-bold text-gray-900">1. Which case</h2>
        {chosen ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 px-4 py-3">
            <span>
              <span className="font-semibold text-gray-900">
                {chosen.patient?.name ?? 'Patient'}
                {chosen.patient?.folderNumber ? ` (${chosen.patient.folderNumber})` : ''}
              </span>
              <span className="block text-sm text-gray-600">
                {chosen.procedureName} ·{' '}
                {new Date(chosen.scheduledDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
                {chosen.scheduledTime ? ` at ${chosen.scheduledTime}` : ''}
                {chosen.surgeryType === 'EMERGENCY' ? ' · EMERGENCY' : ''}
              </span>
            </span>
            <button
              type="button" onClick={() => setChosen(null)}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="caseSearch" name="caseSearch"
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient, folder number or procedure"
                className="w-full rounded-xl border-2 border-gray-300 py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
            {loading ? (
              <p className="mt-2 text-sm text-gray-500">Loading cases…</p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {matches.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button" onClick={() => { setChosen(s); setMessage(null); }}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-900">
                        {s.patient?.name ?? 'Patient'}
                        {s.patient?.folderNumber ? ` (${s.patient.folderNumber})` : ''}
                      </span>
                      <span className="block text-xs text-gray-600">
                        {s.procedureName} ·{' '}
                        {new Date(s.scheduledDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {s.surgeryType === 'EMERGENCY' ? ' · EMERGENCY' : ''}
                      </span>
                    </button>
                  </li>
                ))}
                {matches.length === 0 && (
                  <li className="px-3 py-2 text-sm text-gray-500">No case matches that.</li>
                )}
              </ul>
            )}
          </>
        )}
      </section>

      {/* ── What is wanted ── */}
      {chosen && (
        <section className="rounded-2xl border-2 border-gray-200 bg-white p-4">
          <h2 className="font-bold text-gray-900">2. What is wanted</h2>
          <p className="text-sm text-gray-600">
            Nothing is pre-selected — what this patient needs is your decision, not the form&rsquo;s.
          </p>

          <div className="mt-3 space-y-4">
            {GROUPS.map((g) => (
              <div key={g.discipline}>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  {DISCIPLINE_LABEL[g.discipline as LabDiscipline]}
                </p>
                <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                  {g.tests.map((t) => {
                    const already = alreadyAsked.has(t.name.toLowerCase());
                    return (
                      <label
                        key={t.name}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                          picked[t.name] ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                        }`}
                      >
                        <input
                          type="checkbox" checked={!!picked[t.name]}
                          onChange={(e) => setPicked({ ...picked, [t.name]: e.target.checked })}
                          className="mt-0.5 h-4 w-4 accent-blue-600"
                        />
                        <span className="min-w-0">
                          <span className="text-gray-900">{t.name}</span>
                          {/* Said, not blocked. A repeat may be exactly what is
                              wanted — a falling haemoglobin is the reason for
                              checking it twice. */}
                          {already && (
                            <span className="block text-xs text-amber-700">
                              Already requested for this case
                            </span>
                          )}
                          {t.note && <span className="block text-xs text-gray-500">{t.note}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            <div>
              <label htmlFor="freeTests" className="mb-1 block text-sm font-semibold text-gray-800">
                Anything else <span className="font-normal text-gray-500">(one per line)</span>
              </label>
              <textarea
                id="freeTests" name="freeTests" rows={2}
                value={freeText} onChange={(e) => setFreeText(e.target.value)}
                placeholder="Serum lipase"
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
              />
            </div>
          </div>
        </section>
      )}

      {/* ── Why, and how soon ── */}
      {chosen && (
        <section className="rounded-2xl border-2 border-gray-200 bg-white p-4">
          <h2 className="font-bold text-gray-900">3. Why, and how soon</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="reason" className="mb-1 block text-sm font-semibold text-gray-800">
                Clinical indication
              </label>
              <input
                id="reason" name="reason" value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Pre-operative assessment for laparotomy; anaemic on examination"
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="urgency" className="mb-1 block text-sm font-semibold text-gray-800">
                Urgency
              </label>
              <select
                id="urgency" name="urgency" value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
              >
                <option value="ROUTINE">Routine</option>
                <option value="URGENT">Urgent</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </div>
          </div>

          <button
            type="button" onClick={submit} disabled={saving || total === 0}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Request {total > 0 ? `${total} ${total === 1 ? 'investigation' : 'investigations'}` : ''}
          </button>
        </section>
      )}

      {/* ── Already requested ── */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <ClipboardList className="h-5 w-5 text-gray-500" /> Recently requested
        </h2>
        {existing.length === 0 ? (
          <p className="mt-2 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
            Nothing has been requested yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {existing.slice(0, 30).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-gray-900">{i.testName}</span>
                  <span className="text-gray-600">
                    {' '}— {i.patient?.name ?? 'Patient'}
                    {i.patient?.folderNumber ? ` (${i.patient.folderNumber})` : ''}
                  </span>
                  {i.resultValue && (
                    <span className="block text-xs text-gray-700">Result: {i.resultValue}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {i.urgency !== 'ROUTINE' && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                      {i.urgency}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    i.resultsAvailable ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
                  }`}>
                    {i.resultsAvailable
                      ? <><CheckCircle2 className="h-3 w-3" /> Resulted</>
                      : 'Awaiting'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
