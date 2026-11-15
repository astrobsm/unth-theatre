'use client';

/**
 * The Chairman's side of a policy review: the drafts, and the rounds.
 *
 * Gated to the Chairman of the Theatre Users Committee, named deputies, and
 * Management as read-only observers. The committee members who actually answer
 * never come here — they open /policy-review with a token from WhatsApp.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Upload,
  Users,
} from 'lucide-react';

interface DocumentRow {
  id: string;
  title: string;
  version: string;
  status: string;
  importedAt: string;
  importedByName: string | null;
  sourceFormat: string;
  _count: { sections: number; rounds: number };
}

interface RoundRow {
  id: string;
  title: string | null;
  version: string;
  status: string;
  opensAt: string | null;
  closesAt: string;
  resultsVisibility: string;
  createdByName: string | null;
  createdAt: string;
  document: { id: string; title: string; version: string } | null;
  _count: { invitations: number; sectionResponses: number };
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  OPEN: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-amber-100 text-amber-800',
  ANALYSED: 'bg-blue-100 text-blue-800',
  FINALISED: 'bg-violet-100 text-violet-800',
  UNDER_REVIEW: 'bg-emerald-100 text-emerald-800',
  FINAL: 'bg-violet-100 text-violet-800',
};

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos',
  }).format(new Date(iso));

const dateOnly = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos',
  }).format(new Date(iso));

/** Default: the Thursday before the Saturday the recommendation is due. */
function defaultClosing(): string {
  const d = new Date();
  d.setDate(d.getDate() + 4);
  d.setHours(23, 59, 0, 0);
  // datetime-local wants a local string with no zone.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PolicyReviewHubPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [documentId, setDocumentId] = useState('');
  const [closesAt, setClosesAt] = useState(defaultClosing());
  const [roundTitle, setRoundTitle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docRes, roundRes] = await Promise.all([
        fetch('/api/policy/documents', { cache: 'no-store' }),
        fetch('/api/policy/rounds', { cache: 'no-store' }),
      ]);
      if (docRes.status === 403 || roundRes.status === 403) {
        setError('You do not have access to the policy review.');
        return;
      }
      const docs = await docRes.json();
      const rs = await roundRes.json();
      setDocuments(docs.documents ?? []);
      setRounds(rs.rounds ?? []);
      if ((docs.documents ?? []).length > 0) setDocumentId(docs.documents[0].id);
      setError(null);
    } catch {
      setError('Could not load the policy review.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createRound = async () => {
    if (!documentId) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/policy/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          title: roundTitle.trim() || null,
          // datetime-local has no zone; the committee works in Lagos time and
          // so does the browser it is typed into, so it is sent as an offset
          // the server can trust rather than a bare local string.
          closesAt: new Date(closesAt).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Could not create the round.');
        return;
      }
      setShowCreate(false);
      setRoundTitle('');
      await load();
    } catch {
      setError('Could not create the round.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Policy Review</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              The Theatre Users Committee reviewing a draft policy: import the draft, open a
              round, share the link, and see what every unit said — section by section, with
              every bracketed value tallied.
            </p>
          </div>
          <Link
            href="/dashboard/policy-review/import"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Upload className="h-4 w-4" />
            Import a draft
          </Link>
        </div>
      </header>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-sm text-rose-900">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : (
        <>
          {/* ── Rounds ──────────────────────────────────────────────────── */}
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Review rounds
              </h2>
              {documents.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCreate((s) => !s)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New round
                </button>
              )}
            </div>

            {showCreate && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">Which draft?</span>
                    <select
                      value={documentId}
                      onChange={(e) => setDocumentId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                    >
                      {documents.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title} (v{d.version}) — {d._count.sections} sections
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">Closes</span>
                    <input
                      type="datetime-local"
                      value={closesAt}
                      onChange={(e) => setClosesAt(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Name this round <span className="font-normal text-slate-400">(optional)</span>
                    </span>
                    <input
                      type="text"
                      value={roundTitle}
                      onChange={(e) => setRoundTitle(e.target.value)}
                      placeholder="First review by the committee"
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  The round is created closed. You invite people and check the links, then open it
                  — a member who opens a link early is told to keep the message rather than shown
                  an empty review.
                </p>
                <button
                  type="button"
                  onClick={createRound}
                  disabled={creating || !documentId}
                  className="mt-3 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create round
                </button>
              </div>
            )}

            {rounds.length === 0 ? (
              <EmptyCard
                icon={<CalendarClock className="h-5 w-5" />}
                title="No rounds yet"
                body={
                  documents.length === 0
                    ? 'Import the draft policy first, then open a round and share the link with the committee.'
                    : 'Create a round, invite the committee, and open it when you are ready.'
                }
              />
            ) : (
              <ul className="space-y-2">
                {rounds.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/dashboard/policy-review/${r.id}`}
                      className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {r.title || r.document?.title || 'Review round'}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Version {r.version} · closes {dateTime(r.closesAt)}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[r.status] ?? 'bg-slate-100 text-slate-700'}`}>
                          {r.status.toLowerCase()}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          {r._count.invitations} invited
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {r._count.sectionResponses} section responses
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Drafts ──────────────────────────────────────────────────── */}
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
              Imported drafts
            </h2>
            {documents.length === 0 ? (
              <EmptyCard
                icon={<FileText className="h-5 w-5" />}
                title="Nothing imported yet"
                body="Upload the committee's latest export — Word (.docx) or Markdown — and check the preview before anybody is invited."
              />
            ) : (
              <ul className="space-y-2">
                {documents.map((d) => (
                  <li key={d.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{d.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Version {d.version} · {d._count.sections} sections ·{' '}
                          {d._count.rounds} round{d._count.rounds === 1 ? '' : 's'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          Imported {dateOnly(d.importedAt)}
                          {d.importedByName ? ` by ${d.importedByName}` : ''} from {d.sourceFormat.toLowerCase()}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[d.status] ?? 'bg-slate-100 text-slate-700'}`}>
                        {d.status.toLowerCase().replace(/_/g, ' ')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function EmptyCard({
  icon, title, body,
}: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        {icon}
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">{body}</p>
    </div>
  );
}
