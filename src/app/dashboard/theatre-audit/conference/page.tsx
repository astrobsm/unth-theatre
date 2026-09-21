'use client';

// ============================================================
// Hospital Theatre Audit Conference — the sittings
// ------------------------------------------------------------
// Every conference held, and the button that calls a new one.
//
// A new sitting can start from the proposals already on the table — the
// structural adjustments actually put to the department, most of them already
// built and running, which is precisely why they need ratifying. Every point
// is editable and deletable, and none arrives with a decision: the column
// beside it stays empty until somebody in the room fills it in.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays, CheckCircle2, ChevronLeft, ClipboardList, Loader2, Plus, Users,
} from 'lucide-react';

interface ConferenceRow {
  id: string;
  title: string;
  sittingDate: string;
  venue: string | null;
  status: string;
  chairName: string;
  adoptedAt: string | null;
  adoptedByName: string | null;
  points: number;
  attendees: number;
  undecided: number;
}

const MAY_CONVENE = [
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC', 'THEATRE_CHAIRMAN', 'THEATRE_MANAGER',
  'HEAD_OF_SURGERY', 'HEAD_OF_ANAESTHESIA', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'ADMIN', 'SYSTEM_ADMINISTRATOR',
];

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  IN_SESSION: 'bg-amber-100 text-amber-900',
  ANALYSED: 'bg-blue-100 text-blue-900',
  ADOPTED: 'bg-green-100 text-green-900',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Agenda being drawn up',
  IN_SESSION: 'In session',
  ANALYSED: 'Analysed',
  ADOPTED: 'Adopted',
};

export default function ConferenceListPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<ConferenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: 'Theatre structural review',
    sittingDate: new Date().toISOString().slice(0, 10),
    venue: '',
    chairName: '',
    purpose: '',
    useTemplate: true,
  });

  const canConvene = MAY_CONVENE.includes((session?.user?.role ?? '').toUpperCase());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/theatre-audit/conference');
      if (res.ok) {
        const data = await res.json();
        setRows(Array.isArray(data.conferences) ? data.conferences : []);
      }
    } catch {
      /* the page still draws; the list is simply empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // The chair defaults to whoever is opening the form — usually right, and
  // always editable, which beats an empty box on a required field.
  useEffect(() => {
    if (showForm && !form.chairName && session?.user?.name) {
      setForm((f) => ({ ...f, chairName: session.user.name as string }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, session]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/theatre-audit/conference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'The conference could not be created.');
        return;
      }
      router.push(`/dashboard/theatre-audit/conference/${data.conference.id}`);
    } catch {
      setError('The conference could not be created — check the connection.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/theatre-audit" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" /> Theatre audit
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Hospital Theatre Audit Conference</h1>
        <p className="text-gray-600">
          Structural adjustments taken point by point, each with its decision recorded beside it,
          and a sequenced resolution at the end.
        </p>
      </div>

      {canConvene && !showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" /> Convene a conference
        </button>
      )}

      {showForm && (
        <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/50 p-4">
          <h2 className="text-lg font-bold text-gray-900">Convene a conference</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="cTitle" className="mb-1 block text-sm font-semibold text-gray-800">Title</label>
              <input
                id="cTitle" name="title" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="cDate" className="mb-1 block text-sm font-semibold text-gray-800">Date of sitting</label>
              <input
                id="cDate" name="sittingDate" type="date" value={form.sittingDate}
                onChange={(e) => setForm({ ...form, sittingDate: e.target.value })}
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="cVenue" className="mb-1 block text-sm font-semibold text-gray-800">Venue</label>
              <input
                id="cVenue" name="venue" value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
                placeholder="Theatre seminar room"
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="cChair" className="mb-1 block text-sm font-semibold text-gray-800">Chair</label>
              <input
                id="cChair" name="chairName" value={form.chairName}
                onChange={(e) => setForm({ ...form, chairName: e.target.value })}
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="cPurpose" className="mb-1 block text-sm font-semibold text-gray-800">
                Why it was called <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <input
                id="cPurpose" name="purpose" value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl bg-white p-3 ring-1 ring-gray-200">
            <input
              type="checkbox"
              checked={form.useTemplate}
              onChange={(e) => setForm({ ...form, useTemplate: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-blue-600"
            />
            <span className="text-sm">
                <span className="font-semibold text-gray-900">
                Start from the proposals already on the table
              </span>
              <span className="block text-gray-600">
                The structural adjustments actually put to the department — booking as clerical
                work, the readiness tick-lists, team availability, the CMD board, the holding
                area, duplicate patients, post-operative notes, the Eye Theatre merge, awareness
                training, the backup drill and the outstanding role assignments. Each says what
                happens now, what is proposed, and whether it is already running. Every point can
                be renamed, reordered or deleted, and none of them arrives with a decision.
              </span>
            </span>
          </label>

          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={create}
              disabled={creating || !form.title.trim() || !form.chairName.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Convene
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl px-4 py-2.5 font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
          No conference has been held yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/theatre-audit/conference/${c.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900">{c.title}</p>
                    <p className="text-sm text-gray-600">
                      <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                      {new Date(c.sittingDate).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}
                      {c.venue ? ` · ${c.venue}` : ''} · chaired by {c.chairName}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[c.status] ?? ''}`}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
                  <span><ClipboardList className="mr-1 inline h-3.5 w-3.5" />{c.points} points</span>
                  <span><Users className="mr-1 inline h-3.5 w-3.5" />{c.attendees} present</span>
                  {/* Said on the list, so an unfinished sitting is visible
                      without opening it. */}
                  {c.undecided > 0 && (
                    <span className="font-medium text-amber-700">{c.undecided} still undecided</span>
                  )}
                  {c.adoptedAt && (
                    <span className="font-medium text-green-700">
                      <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                      Adopted{c.adoptedByName ? ` by ${c.adoptedByName}` : ''}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
