'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  SURGICAL_SUBSPECIALTIES,
  searchInstruments,
  type SurgicalInstrument,
} from '@/lib/surgical-instruments-catalog';

/* ============================================================
   Phase 8 — Surgical Count Checklist (3-column model)
   Columns per item: Initial | At Start of Closure | Final
   Maps to schema: preCount* | firstCount* | secondCount*
   ============================================================ */

type InstrumentRow = {
  id: string;
  name: string;
  category: string;
  subspecialty: string;
  initial: number;
  added: number;
  atClosure: number;
  final: number;
};

interface CountChecklist {
  id: string;
  surgeryId: string;
  surgery: {
    procedureName: string;
    patient: { name: string; folderNumber: string };
  };
  surgeonName: string;
  scrubNurseName: string;
  circulatingNurseName: string;

  preCountSmallSwabs: number;
  preCountAbdominalPack: number;
  preCountRollSwabs: number;
  preCountOthers: string | null;
  preCountBlades: number;
  preCountNeedles: number;
  preCountSutures: number;
  preCountClips: number;

  firstCountSmallSwabs: number;
  firstCountAbdominalPack: number;
  firstCountRollSwabs: number;
  firstCountOthers: string | null;
  firstCountBlades: number;
  firstCountNeedles: number;
  firstCountSutures: number;
  firstCountClips: number;
  firstCountCorrect: boolean | null;
  firstCountDiscrepancy: string | null;

  secondCountSmallSwabs: number;
  secondCountAbdominalPack: number;
  secondCountRollSwabs: number;
  secondCountOthers: string | null;
  secondCountBlades: number;
  secondCountNeedles: number;
  secondCountSutures: number;
  secondCountClips: number;
  secondCountCorrect: boolean | null;

  instrumentSet: InstrumentRow[] | null;

  allCountsCorrect: boolean;
  discrepancyOccurred: boolean;
  xRayOrdered: boolean;
  incidentReportFiled: boolean;
}

interface NurseUser {
  id: string;
  fullName: string;
  role: string;
  staffCode?: string | null;
}

const CONSUMABLE_ROWS: Array<{
  key: string;
  label: string;
  group: 'swabs' | 'sharps';
  initialField: keyof CountChecklist;
  closureField: keyof CountChecklist;
  finalField: keyof CountChecklist;
}> = [
  { key: 'gauze', label: 'Gauze (Roll Swabs)', group: 'swabs',
    initialField: 'preCountRollSwabs', closureField: 'firstCountRollSwabs', finalField: 'secondCountRollSwabs' },
  { key: 'abdo-sponge', label: 'Abdominal Sponges / Packs', group: 'swabs',
    initialField: 'preCountAbdominalPack', closureField: 'firstCountAbdominalPack', finalField: 'secondCountAbdominalPack' },
  { key: 'cotton-swabs', label: 'Cotton Swabs (Small Swabs)', group: 'swabs',
    initialField: 'preCountSmallSwabs', closureField: 'firstCountSmallSwabs', finalField: 'secondCountSmallSwabs' },
  { key: 'sutures', label: 'Sutures', group: 'sharps',
    initialField: 'preCountSutures', closureField: 'firstCountSutures', finalField: 'secondCountSutures' },
  { key: 'needles', label: 'Needles', group: 'sharps',
    initialField: 'preCountNeedles', closureField: 'firstCountNeedles', finalField: 'secondCountNeedles' },
  { key: 'blades', label: 'Blades', group: 'sharps',
    initialField: 'preCountBlades', closureField: 'firstCountBlades', finalField: 'secondCountBlades' },
  { key: 'clips', label: 'Clips', group: 'sharps',
    initialField: 'preCountClips', closureField: 'firstCountClips', finalField: 'secondCountClips' },
];

const DEFAULT_INIT_DATA = {
  scrubNurseName: '',
  circulatingNurseName: '',
  preCountRollSwabs: 0,
  preCountAbdominalPack: 0,
  preCountSmallSwabs: 0,
  preCountOthers: '',
  preCountSutures: 0,
  preCountNeedles: 0,
  preCountBlades: 0,
  preCountClips: 0,
  instrumentSet: [] as InstrumentRow[],
};

type InitData = typeof DEFAULT_INIT_DATA;

export default function SurgicalCountPage({ params }: { params: { id: string } }) {
  const [count, setCount] = useState<CountChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showInitDialog, setShowInitDialog] = useState(false);

  const [nurses, setNurses] = useState<NurseUser[]>([]);
  const [nursesLoading, setNursesLoading] = useState(true);

  const [initData, setInitData] = useState<InitData>(DEFAULT_INIT_DATA);

  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerSubspecialty, setPickerSubspecialty] = useState<string>('All');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    fetchCount();
    fetchNurses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const fetchCount = async () => {
    try {
      const r = await fetch(`/api/surgeries/${params.id}/count`);
      if (r.ok) setCount(await r.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchNurses = async () => {
    try {
      const r = await fetch(
        `/api/users?roles=SCRUB_NURSE,RECOVERY_ROOM_NURSE,THEATRE_MANAGER&status=APPROVED&limit=100`
      );
      if (r.ok) {
        const data: NurseUser[] = await r.json();
        setNurses(data);
      }
    } catch (e) {
      console.error('Nurse fetch failed', e);
    } finally {
      setNursesLoading(false);
    }
  };

  const initializeCount = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/surgeries/${params.id}/count`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initData),
      });
      if (r.ok) {
        setCount(await r.json());
        setShowInitDialog(false);
      } else {
        const err = await r.json();
        alert(err.error || 'Failed to initialize count');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to initialize count');
    } finally {
      setSaving(false);
    }
  };

  const updateCount = async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/surgeries/${params.id}/count`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (r.ok) setCount(await r.json());
    } catch (e) {
      console.error(e);
      alert('Failed to update count');
    } finally {
      setSaving(false);
    }
  };

  const filteredCatalog = useMemo(
    () => searchInstruments(pickerQuery, pickerSubspecialty),
    [pickerQuery, pickerSubspecialty]
  );

  const addInstrumentToInit = (inst: SurgicalInstrument) => {
    if (initData.instrumentSet.some((i) => i.id === inst.id)) return;
    setInitData((d) => ({
      ...d,
      instrumentSet: [
        ...d.instrumentSet,
        {
          id: inst.id,
          name: inst.name,
          category: inst.category,
          subspecialty: inst.subspecialty,
          initial: 1,
          added: 0,
          atClosure: 0,
          final: 0,
        },
      ],
    }));
    setPickerQuery('');
  };

  const setInitInstrumentQty = (id: string, qty: number) => {
    setInitData((d) => ({
      ...d,
      instrumentSet: d.instrumentSet.map((i) =>
        i.id === id ? { ...i, initial: Math.max(0, qty) } : i
      ),
    }));
  };

  const removeInitInstrument = (id: string) => {
    setInitData((d) => ({
      ...d,
      instrumentSet: d.instrumentSet.filter((i) => i.id !== id),
    }));
  };

  const updateInstrumentField = async (
    id: string,
    field: 'initial' | 'added' | 'atClosure' | 'final',
    value: number
  ) => {
    if (!count) return;
    const current = (count.instrumentSet || []) as InstrumentRow[];
    const next = current.map((i) =>
      i.id === id ? { ...i, [field]: Math.max(0, value) } : i
    );
    setCount({ ...count, instrumentSet: next });
    await updateCount({ instrumentSet: next });
  };

  const addInstrumentLive = async (inst: SurgicalInstrument, addedQty: number) => {
    if (!count) return;
    const qty = Math.max(1, addedQty || 1);
    const current = (count.instrumentSet || []) as InstrumentRow[];
    const existing = current.find((i) => i.id === inst.id);
    let next: InstrumentRow[];
    if (existing) {
      next = current.map((i) =>
        i.id === inst.id ? { ...i, added: (i.added || 0) + qty } : i
      );
    } else {
      next = [
        ...current,
        {
          id: inst.id,
          name: inst.name,
          category: inst.category,
          subspecialty: inst.subspecialty,
          initial: 0,
          added: qty,
          atClosure: 0,
          final: 0,
        },
      ];
    }
    setCount({ ...count, instrumentSet: next });
    await updateCount({ instrumentSet: next });
  };

  const removeInstrumentLive = async (id: string) => {
    if (!count) return;
    const next = (count.instrumentSet || []).filter((i) => i.id !== id);
    setCount({ ...count, instrumentSet: next });
    await updateCount({ instrumentSet: next });
  };

  const verification = useMemo(() => {
    if (!count) return null;
    const issues: Array<{ item: string; initial: number; final: number; missing: number }> = [];

    for (const row of CONSUMABLE_ROWS) {
      const initial = Number(count[row.initialField] || 0);
      const final = Number(count[row.finalField] || 0);
      if (initial !== final) {
        issues.push({ item: row.label, initial, final, missing: initial - final });
      }
    }

    for (const inst of (count.instrumentSet || []) as InstrumentRow[]) {
      const expected = (inst.initial || 0) + (inst.added || 0);
      const final = inst.final || 0;
      if (expected !== final) {
        issues.push({
          item: `${inst.name} (${inst.subspecialty})`,
          initial: expected,
          final,
          missing: expected - final,
        });
      }
    }

    return {
      issues,
      allCorrect:
        issues.length === 0 &&
        ((count.instrumentSet || []).length > 0 ||
          CONSUMABLE_ROWS.some((r) => Number(count[r.initialField] || 0) > 0)),
    };
  }, [count]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading…</div>
      </div>
    );
  }

  if (!count) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-6">
          <Link href={`/dashboard/surgeries/${params.id}`} className="text-blue-600 hover:underline">
            ← Back to Surgery
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-4">Surgical Count Checklist</h1>
        </div>

        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-8 text-center">
          <h2 className="text-2xl font-semibold text-yellow-800 mb-4">Count Checklist Not Started</h2>
          <p className="text-yellow-700 mb-6">
            Initialize the surgical count to begin tracking instruments, swabs, sharps and other items.
          </p>
          <button
            onClick={() => setShowInitDialog(true)}
            className="bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 font-semibold"
          >
            Initialize Count Checklist
          </button>
        </div>

        {showInitDialog && (
          <InitDialog
            initData={initData}
            setInitData={setInitData}
            nurses={nurses}
            nursesLoading={nursesLoading}
            pickerQuery={pickerQuery}
            setPickerQuery={setPickerQuery}
            pickerSubspecialty={pickerSubspecialty}
            setPickerSubspecialty={setPickerSubspecialty}
            pickerOpen={pickerOpen}
            setPickerOpen={setPickerOpen}
            filteredCatalog={filteredCatalog}
            addInstrumentToInit={addInstrumentToInit}
            setInitInstrumentQty={setInitInstrumentQty}
            removeInitInstrument={removeInitInstrument}
            onSubmit={initializeCount}
            onCancel={() => setShowInitDialog(false)}
            saving={saving}
          />
        )}
      </div>
    );
  }

  const swabRows = CONSUMABLE_ROWS.filter((r) => r.group === 'swabs');
  const sharpRows = CONSUMABLE_ROWS.filter((r) => r.group === 'sharps');
  const instruments = (count.instrumentSet || []) as InstrumentRow[];

  return (
    <div className="max-w-7xl mx-auto p-6 print:p-2">
      <div className="mb-6 print:mb-2">
        <Link
          href={`/dashboard/surgeries/${params.id}`}
          className="text-blue-600 hover:underline print:hidden"
        >
          ← Back to Surgery
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-4">Surgical Count Checklist</h1>
        <p className="text-gray-600 mt-2">
          {count.surgery.procedureName} — {count.surgery?.patient?.name || 'Unknown Patient'}
        </p>
        <div className="text-sm text-gray-500 mt-1">
          Perioperative Nurse 1 (Scrub): <b>{count.scrubNurseName}</b>
          {count.circulatingNurseName ? (
            <> · Perioperative Nurse 2 (Circulating): <b>{count.circulatingNurseName}</b></>
          ) : null}
        </div>
      </div>

      {verification && (
        <div
          className={`mb-6 rounded-lg border p-4 ${
            verification.allCorrect
              ? 'bg-green-50 border-green-300'
              : verification.issues.length > 0
                ? 'bg-red-50 border-red-300'
                : 'bg-yellow-50 border-yellow-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <h3
              className={`text-lg font-semibold ${
                verification.allCorrect
                  ? 'text-green-800'
                  : verification.issues.length > 0
                    ? 'text-red-800'
                    : 'text-yellow-800'
              }`}
            >
              {verification.allCorrect
                ? '✅ Count Verified — All items accounted for'
                : verification.issues.length > 0
                  ? `⚠️ Discrepancy — ${verification.issues.length} item(s) do not match`
                  : '⏳ Final count pending'}
            </h3>
            <button
              onClick={() => window.print()}
              className="text-sm border px-3 py-1 rounded hover:bg-white print:hidden"
            >
              🖨 Print
            </button>
          </div>
          {verification.issues.length > 0 && (
            <ul className="mt-3 text-sm text-red-900 list-disc list-inside space-y-1">
              {verification.issues.map((iss) => (
                <li key={iss.item}>
                  <b>{iss.item}</b> — initial {iss.initial}, final {iss.final}
                  {iss.missing > 0 ? (
                    <span className="ml-2 px-2 py-0.5 rounded bg-red-200 text-red-900">
                      Missing {iss.missing}
                    </span>
                  ) : (
                    <span className="ml-2 px-2 py-0.5 rounded bg-amber-200 text-amber-900">
                      Excess {Math.abs(iss.missing)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <SectionTable title="Swab / Sponge Count" rows={swabRows} count={count} updateCount={updateCount} />

      <OthersBlock
        title="Other Swab Items"
        initialValue={count.preCountOthers || ''}
        closureValue={count.firstCountOthers || ''}
        finalValue={count.secondCountOthers || ''}
        onInitial={(v) => updateCount({ preCountOthers: v })}
        onClosure={(v) => updateCount({ firstCountOthers: v })}
        onFinal={(v) => updateCount({ secondCountOthers: v })}
      />

      <SectionTable title="Sharp Count" rows={sharpRows} count={count} updateCount={updateCount} />

      <div className="bg-white border rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Instruments</h3>
          <span className="text-xs text-gray-500">{instruments.length} selected</span>
        </div>

        <LiveInstrumentPicker onAdd={addInstrumentLive} />

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Instrument</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Subspecialty</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700"># Initial count</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700"># Added</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700"># At Start of Closure</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700"># Final Count</th>
                <th className="px-3 py-2 text-center font-medium text-gray-700">Status</th>
                <th className="px-3 py-2 print:hidden"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {instruments.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                    No instruments added. Use the search above to add instruments to the count.
                  </td>
                </tr>
              )}
              {instruments.map((inst) => {
                const expected = (inst.initial || 0) + (inst.added || 0);
                const ok = expected === inst.final && expected > 0;
                const pending = inst.final === 0 && expected > 0;
                return (
                  <tr key={inst.id}>
                    <td className="px-3 py-2 font-medium">
                      {inst.name}
                      {(inst.added || 0) > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] align-middle">
                          +{inst.added} added
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{inst.subspecialty}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        aria-label={`Initial count for ${inst.name}`}
                        min={0}
                        value={inst.initial}
                        onChange={(e) =>
                          updateInstrumentField(inst.id, 'initial', parseInt(e.target.value) || 0)
                        }
                        className="w-20 border rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        aria-label={`Added quantity for ${inst.name}`}
                        min={0}
                        value={inst.added || 0}
                        onChange={(e) =>
                          updateInstrumentField(inst.id, 'added', parseInt(e.target.value) || 0)
                        }
                        className="w-20 border rounded px-2 py-1 text-right bg-blue-50"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        aria-label={`At-closure count for ${inst.name}`}
                        min={0}
                        value={inst.atClosure}
                        onChange={(e) =>
                          updateInstrumentField(inst.id, 'atClosure', parseInt(e.target.value) || 0)
                        }
                        className="w-20 border rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        aria-label={`Final count for ${inst.name}`}
                        min={0}
                        value={inst.final}
                        onChange={(e) =>
                          updateInstrumentField(inst.id, 'final', parseInt(e.target.value) || 0)
                        }
                        className="w-20 border rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {ok ? (
                        <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs">✓ OK</span>
                      ) : pending ? (
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">Pending</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs">
                          ✗ {expected - inst.final > 0 ? 'Missing' : 'Excess'} {Math.abs(expected - inst.final)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right print:hidden">
                      <button
                        onClick={() => removeInstrumentLive(inst.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold mb-3">Final Verification</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={count.firstCountCorrect || false}
              onChange={(e) => updateCount({ firstCountCorrect: e.target.checked })}
              className="w-5 h-5"
            />
            <span>At-Closure count correct</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={count.secondCountCorrect || false}
              onChange={(e) => updateCount({ secondCountCorrect: e.target.checked })}
              className="w-5 h-5"
            />
            <span>Final count correct</span>
          </label>
          <label className="flex items-center gap-3 md:col-span-2">
            <input
              type="checkbox"
              checked={count.allCountsCorrect}
              onChange={(e) =>
                updateCount({
                  allCountsCorrect: e.target.checked,
                  discrepancyOccurred:
                    !e.target.checked && (verification?.issues.length || 0) > 0,
                })
              }
              className="w-5 h-5"
            />
            <span className="font-medium text-green-700">All counts verified &amp; signed off</span>
          </label>
        </div>

        {(verification?.issues.length || 0) > 0 && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
            <h4 className="font-semibold text-red-800 mb-2">⚠️ Discrepancy Management</h4>
            <label className="flex items-center gap-3 mb-2">
              <input
                type="checkbox"
                checked={count.xRayOrdered}
                onChange={(e) => updateCount({ xRayOrdered: e.target.checked })}
                className="w-5 h-5"
              />
              <span>X-Ray ordered</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={count.incidentReportFiled}
                onChange={(e) => updateCount({ incidentReportFiled: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Incident report filed</span>
            </label>
          </div>
        )}
      </div>

      {saving && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg print:hidden">
          Saving…
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Helper components
   ============================================================ */

function SectionTable({
  title,
  rows,
  count,
  updateCount,
}: {
  title: string;
  rows: typeof CONSUMABLE_ROWS;
  count: CountChecklist;
  updateCount: (u: Record<string, unknown>) => void;
}) {
  return (
    <div className="bg-white border rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Item</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700"># Initial count</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700"># At Start of Closure</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700"># Final Count</th>
              <th className="px-3 py-2 text-center font-medium text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const initial = Number(count[row.initialField] || 0);
              const closure = Number(count[row.closureField] || 0);
              const final = Number(count[row.finalField] || 0);
              const status =
                initial === 0
                  ? 'none'
                  : final === 0
                    ? 'pending'
                    : initial === final
                      ? 'ok'
                      : 'mismatch';
              return (
                <tr key={row.key}>
                  <td className="px-3 py-2 font-medium">{row.label}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={initial}
                      onChange={(e) =>
                        updateCount({ [row.initialField]: parseInt(e.target.value) || 0 })
                      }
                      className="w-20 border rounded px-2 py-1 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={closure}
                      onChange={(e) =>
                        updateCount({ [row.closureField]: parseInt(e.target.value) || 0 })
                      }
                      className="w-20 border rounded px-2 py-1 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={final}
                      onChange={(e) =>
                        updateCount({ [row.finalField]: parseInt(e.target.value) || 0 })
                      }
                      className="w-20 border rounded px-2 py-1 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {status === 'ok' ? (
                      <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs">✓ OK</span>
                    ) : status === 'mismatch' ? (
                      <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs">
                        ✗ {initial - final > 0 ? 'Missing' : 'Excess'} {Math.abs(initial - final)}
                      </span>
                    ) : status === 'pending' ? (
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">Pending</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-gray-50 text-gray-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OthersBlock({
  title,
  initialValue,
  closureValue,
  finalValue,
  onInitial,
  onClosure,
  onFinal,
}: {
  title: string;
  initialValue: string;
  closureValue: string;
  finalValue: string;
  onInitial: (v: string) => void;
  onClosure: (v: string) => void;
  onFinal: (v: string) => void;
}) {
  return (
    <div className="bg-white border rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1"># Initial count</label>
          <textarea
            value={initialValue}
            onChange={(e) => onInitial(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
            rows={2}
            placeholder="e.g. Peanuts × 4"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1"># At Start of Closure</label>
          <textarea
            value={closureValue}
            onChange={(e) => onClosure(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
            rows={2}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1"># Final Count</label>
          <textarea
            value={finalValue}
            onChange={(e) => onFinal(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}

function LiveInstrumentPicker({
  onAdd,
}: {
  onAdd: (i: SurgicalInstrument, qty: number) => void;
}) {
  const [q, setQ] = useState('');
  const [sub, setSub] = useState('All');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<SurgicalInstrument | null>(null);
  const [pendingQty, setPendingQty] = useState<number>(1);
  const results = useMemo(() => searchInstruments(q, sub).slice(0, 50), [q, sub]);

  return (
    <div className="relative print:hidden">
      <div className="text-sm font-medium text-gray-700 mb-2">
        Add instrument during surgery (select instrument &amp; quantity added)
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          aria-label="Filter instruments by subspecialty"
          value={sub}
          onChange={(e) => setSub(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="All">All subspecialties</option>
          {SURGICAL_SUBSPECIALTIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="text"
          aria-label="Search instruments"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search instruments to add (e.g. Mayo, Mosquito, Babcock)…"
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-sm px-3 py-2 border rounded hover:bg-gray-50"
        >
          {open ? 'Hide' : 'Browse'}
        </button>
      </div>
      {open && !pending && (
        <div className="mt-2 border rounded bg-white max-h-72 overflow-y-auto shadow-sm">
          {results.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No matches.</div>
          )}
          {results.map((inst) => (
            <button
              key={inst.id}
              type="button"
              onClick={() => {
                setPending(inst);
                setPendingQty(1);
              }}
              className="w-full text-left px-3 py-2 text-sm border-b last:border-b-0 hover:bg-blue-50"
            >
              <div className="font-medium">{inst.name}</div>
              <div className="text-xs text-gray-500">
                {inst.subspecialty} · {inst.category}
              </div>
            </button>
          ))}
        </div>
      )}
      {pending && (
        <div className="mt-2 border-2 border-blue-400 rounded bg-blue-50 p-3">
          <div className="text-sm mb-2">
            Adding <b>{pending.name}</b>{' '}
            <span className="text-xs text-gray-600">({pending.subspecialty})</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm" htmlFor="added-qty">
              Quantity added:
            </label>
            <input
              id="added-qty"
              type="number"
              min={1}
              value={pendingQty}
              onChange={(e) => setPendingQty(parseInt(e.target.value) || 1)}
              className="w-24 border rounded px-2 py-1 text-right"
            />
            <button
              type="button"
              onClick={() => {
                onAdd(pending, pendingQty);
                setPending(null);
                setPendingQty(1);
                setQ('');
              }}
              className="bg-blue-600 text-white text-sm px-3 py-1 rounded hover:bg-blue-700"
            >
              Confirm Add
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="text-sm px-3 py-1 border rounded hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface InitDialogProps {
  initData: InitData;
  setInitData: React.Dispatch<React.SetStateAction<InitData>>;
  nurses: NurseUser[];
  nursesLoading: boolean;
  pickerQuery: string;
  setPickerQuery: (v: string) => void;
  pickerSubspecialty: string;
  setPickerSubspecialty: (v: string) => void;
  pickerOpen: boolean;
  setPickerOpen: (v: boolean) => void;
  filteredCatalog: SurgicalInstrument[];
  addInstrumentToInit: (i: SurgicalInstrument) => void;
  setInitInstrumentQty: (id: string, qty: number) => void;
  removeInitInstrument: (id: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
}

function InitDialog({
  initData,
  setInitData,
  nurses,
  nursesLoading,
  pickerQuery,
  setPickerQuery,
  pickerSubspecialty,
  setPickerSubspecialty,
  pickerOpen,
  setPickerOpen,
  filteredCatalog,
  addInstrumentToInit,
  setInitInstrumentQty,
  removeInitInstrument,
  onSubmit,
  onCancel,
  saving,
}: InitDialogProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[92vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4">Initialize Surgical Count</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Perioperative Nurse 1 (Scrub) *
            </label>
            <select
              aria-label="Perioperative Nurse 1 (Scrub)"
              value={initData.scrubNurseName}
              onChange={(e) => setInitData({ ...initData, scrubNurseName: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              required
            >
              <option value="">{nursesLoading ? 'Loading nurses…' : 'Select nurse…'}</option>
              {nurses.map((n) => (
                <option key={n.id} value={n.fullName}>
                  {n.fullName}
                  {n.staffCode ? ` (${n.staffCode})` : ''} — {n.role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Perioperative Nurse 2 (Circulating)
            </label>
            <select
              aria-label="Perioperative Nurse 2 (Circulating)"
              value={initData.circulatingNurseName}
              onChange={(e) => setInitData({ ...initData, circulatingNurseName: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">{nursesLoading ? 'Loading nurses…' : 'Select nurse…'}</option>
              {nurses.map((n) => (
                <option key={n.id} value={n.fullName}>
                  {n.fullName}
                  {n.staffCode ? ` (${n.staffCode})` : ''} — {n.role}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t mt-5 pt-4">
          <h4 className="font-semibold mb-3">Swab / Sponge Count — Initial</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <NumField
              label="Gauze (Roll Swabs)"
              value={initData.preCountRollSwabs}
              onChange={(v) => setInitData({ ...initData, preCountRollSwabs: v })}
            />
            <NumField
              label="Abdominal Sponges"
              value={initData.preCountAbdominalPack}
              onChange={(v) => setInitData({ ...initData, preCountAbdominalPack: v })}
            />
            <NumField
              label="Cotton Swabs"
              value={initData.preCountSmallSwabs}
              onChange={(v) => setInitData({ ...initData, preCountSmallSwabs: v })}
            />
          </div>
          <div className="mt-3">
            <label className="block text-xs text-gray-600 mb-1">Other swab items</label>
            <input
              type="text"
              value={initData.preCountOthers}
              onChange={(e) => setInitData({ ...initData, preCountOthers: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="e.g. Peanut swabs × 4, Neuro patties × 6"
            />
          </div>
        </div>

        <div className="border-t mt-5 pt-4">
          <h4 className="font-semibold mb-3">Sharp Count — Initial</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumField
              label="Sutures"
              value={initData.preCountSutures}
              onChange={(v) => setInitData({ ...initData, preCountSutures: v })}
            />
            <NumField
              label="Needles"
              value={initData.preCountNeedles}
              onChange={(v) => setInitData({ ...initData, preCountNeedles: v })}
            />
            <NumField
              label="Blades"
              value={initData.preCountBlades}
              onChange={(v) => setInitData({ ...initData, preCountBlades: v })}
            />
            <NumField
              label="Clips"
              value={initData.preCountClips}
              onChange={(v) => setInitData({ ...initData, preCountClips: v })}
            />
          </div>
        </div>

        <div className="border-t mt-5 pt-4">
          <h4 className="font-semibold mb-3">Instruments — Initial</h4>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              aria-label="Filter instrument catalog by subspecialty"
              value={pickerSubspecialty}
              onChange={(e) => setPickerSubspecialty(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="All">All subspecialties</option>
              {SURGICAL_SUBSPECIALTIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={pickerQuery}
              onChange={(e) => {
                setPickerQuery(e.target.value);
                setPickerOpen(true);
              }}
              onFocus={() => setPickerOpen(true)}
              placeholder="Search the catalog (e.g. Mayo, Babcock, Kocher, Hohmann)…"
              className="flex-1 border rounded px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setPickerOpen(!pickerOpen)}
              className="text-sm px-3 py-2 border rounded hover:bg-gray-50"
            >
              {pickerOpen ? 'Hide' : 'Browse'}
            </button>
          </div>

          {pickerOpen && (
            <div className="mt-2 border rounded bg-white max-h-56 overflow-y-auto">
              {filteredCatalog.slice(0, 60).map((inst) => {
                const already = initData.instrumentSet.some(
                  (i: InstrumentRow) => i.id === inst.id
                );
                return (
                  <button
                    key={inst.id}
                    type="button"
                    disabled={already}
                    onClick={() => addInstrumentToInit(inst)}
                    className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${
                      already ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'hover:bg-blue-50'
                    }`}
                  >
                    <div className="font-medium">{inst.name}</div>
                    <div className="text-xs text-gray-500">
                      {inst.subspecialty} · {inst.category}
                      {already && ' · already added'}
                    </div>
                  </button>
                );
              })}
              {filteredCatalog.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">No matches.</div>
              )}
            </div>
          )}

          {initData.instrumentSet.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Instrument</th>
                    <th className="px-3 py-2 text-left">Subspecialty</th>
                    <th className="px-3 py-2 text-right"># Initial</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {initData.instrumentSet.map((inst: InstrumentRow) => (
                    <tr key={inst.id}>
                      <td className="px-3 py-2">{inst.name}</td>
                      <td className="px-3 py-2 text-gray-600">{inst.subspecialty}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={inst.initial}
                          onChange={(e) =>
                            setInitInstrumentQty(inst.id, parseInt(e.target.value) || 0)
                          }
                          className="w-20 border rounded px-2 py-1 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeInitInstrument(inst.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onSubmit}
            disabled={saving || !initData.scrubNurseName}
            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Initializing…' : 'Initialize Count'}
          </button>
          <button onClick={onCancel} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-full border rounded px-3 py-2 text-sm"
      />
    </div>
  );
}
