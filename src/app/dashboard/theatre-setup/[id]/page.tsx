'use client';

// ============================================================
// One theatre setup
// ------------------------------------------------------------
// "View Details" on the Theatre Setup list pointed here and there was no page
// here, so the detail of what a nurse actually collected for a theatre — and
// whether she then confirmed the theatre ready — could not be read back by
// anybody.
//
// The three readiness confirmations are shown as three separate lines rather
// than one tick, because that is how they are recorded and how they fail: a
// theatre is routinely materials-complete with no radio signed out, and a
// single green tick would hide exactly the gap worth seeing.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, ClipboardList, Circle, Radio, Undo2,
} from 'lucide-react';

interface SetupItem {
  id: string;
  quantityTaken: number;
  inventoryItem: { id: string; name: string } | null;
}

interface SetupReturn {
  id: string;
  returnTime: string;
  returnReason: string;
  notes: string | null;
  nurse: { fullName: string } | null;
  [key: string]: unknown;
}

interface Setup {
  id: string;
  setupDate: string;
  collectionTime: string;
  status: string;
  scrubNurseName: string | null;
  location: string | null;
  notes: string | null;
  materialsConfirmed: boolean;
  radioOnChannel7: boolean;
  inTheatreReady: boolean;
  theatreReady: boolean;
  readyConfirmedAt: string | null;
  walkieTalkieId: string | null;
  walkieTalkieSignedOutAt: string | null;
  theatre: { id: string; name: string } | null;
  nurse: { id: string; fullName: string; role: string } | null;
  items: SetupItem[];
  returns: SetupReturn[];
  spiritQuantity: number;
  savlonQuantity: number;
  povidoneQuantity: number;
  faceMaskQuantity: number;
  nursesCapQuantity: number;
  cssdGauzeQuantity: number;
  cssdCottonQuantity: number;
  surgicalBladesQuantity: number;
  suctionTubbingsQuantity: number;
  disposablesQuantity: number;
}

/** The fixed columns that predate the dynamic item list. Zeroes are hidden. */
const LEGACY_FIELDS: { key: keyof Setup; label: string }[] = [
  { key: 'spiritQuantity', label: 'Spirit' },
  { key: 'savlonQuantity', label: 'Savlon' },
  { key: 'povidoneQuantity', label: 'Povidone' },
  { key: 'faceMaskQuantity', label: 'Face masks' },
  { key: 'nursesCapQuantity', label: "Nurses' caps" },
  { key: 'cssdGauzeQuantity', label: 'CSSD gauze' },
  { key: 'cssdCottonQuantity', label: 'CSSD cotton' },
  { key: 'surgicalBladesQuantity', label: 'Surgical blades' },
  { key: 'suctionTubbingsQuantity', label: 'Suction tubings' },
  { key: 'disposablesQuantity', label: 'Disposables' },
];

const words = (s: string) => (s || '').replace(/_/g, ' ');
const when = (v: string | null) => (v
  ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  : '—');

export default function TheatreSetupDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/theatre-setup/${id}`);
      if (res.status === 404) { setMissing(true); return; }
      if (!res.ok) return;
      setSetup(await res.json());
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-lg">Loading…</div>;
  }

  if (missing || !setup) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/dashboard/theatre-setup" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Theatre Setup
        </Link>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <ClipboardList className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700">That setup record is no longer there.</p>
        </div>
      </div>
    );
  }

  const theatreName = setup.theatre?.name || 'Theatre';
  const legacy = LEGACY_FIELDS.filter((f) => Number(setup[f.key] ?? 0) > 0);

  const Check = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <div className="flex items-start gap-2 text-sm">
      {ok
        ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
        : <Circle className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />}
      <span className={ok ? 'text-gray-900' : 'text-gray-500'}>{children}</span>
    </div>
  );

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm text-gray-900 mt-0.5">{children}</div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/dashboard/theatre-setup" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Theatre Setup
      </Link>

      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-indigo-600" />
            {theatreName}
          </h1>
          <p className="text-gray-600 mt-1">
            Collected {when(setup.collectionTime)} for {new Date(setup.setupDate).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 self-start">
          {words(setup.status)}
        </span>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Row label="Collected by">
          {setup.nurse?.fullName || setup.scrubNurseName || 'Not recorded'}
          {setup.nurse?.role ? ` · ${words(setup.nurse.role)}` : ''}
        </Row>
        <Row label="Collected at">{setup.location || 'Not recorded'}</Row>
        <Row label="Walkie-talkie">
          {setup.walkieTalkieId
            ? <span className="inline-flex items-center gap-1"><Radio className="w-4 h-4 text-gray-400" />{setup.walkieTalkieId}{setup.walkieTalkieSignedOutAt ? ` · signed out ${when(setup.walkieTalkieSignedOutAt)}` : ''}</span>
            : 'None signed out'}
        </Row>
        <Row label="Theatre confirmed ready">
          {setup.theatreReady ? when(setup.readyConfirmedAt) : 'Not yet'}
        </Row>
        {setup.notes && (
          <div className="md:col-span-2"><Row label="Notes"><span className="whitespace-pre-wrap">{setup.notes}</span></Row></div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Readiness</h2>
        <div className="space-y-2">
          <Check ok={setup.materialsConfirmed}>All materials collected</Check>
          <Check ok={setup.radioOnChannel7}>Walkie-talkie signed out and set to channel 7</Check>
          <Check ok={setup.inTheatreReady}>Nurse in the theatre, ready for patients</Check>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">What was taken</h2>
        {setup.items.length === 0 && legacy.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing itemised on this record.</p>
        ) : (
          <div className="space-y-4">
            {setup.items.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {setup.items.map((it) => (
                  <li key={it.id} className="py-2 flex items-center justify-between text-sm">
                    <span className="text-gray-900">
                      {it.inventoryItem?.name || 'Item'}
                    </span>
                    <span className="font-medium text-gray-700">
                      {it.quantityTaken}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {legacy.length > 0 && (
              <div className={setup.items.length > 0 ? 'pt-4 border-t border-gray-100' : ''}>
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Standard items</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  {legacy.map((f) => (
                    <div key={String(f.key)} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
                      <span className="text-gray-700">{f.label}</span>
                      <span className="font-medium text-gray-900">{String(setup[f.key])}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {setup.returns.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-gray-500" /> Returned
          </h2>
          <div className="space-y-3">
            {setup.returns.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-200 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-gray-900">{r.returnReason}</span>
                  <span className="text-gray-500">{when(r.returnTime)}</span>
                </div>
                <div className="text-gray-600 mt-1">Returned by {r.nurse?.fullName ?? 'unknown'}</div>
                {r.notes && <div className="text-gray-600 mt-1 whitespace-pre-wrap">{r.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
