'use client';

/**
 * One round, as the Chairman sees it.
 *
 * Every figure on this page is computed from the response rows on each load
 * (src/lib/policy/owner.ts). Nothing is cached, because the AI analysis later
 * reports its own stance counts and the server refuses a run whose counts
 * disagree with these — a cached figure would leave nothing to check against.
 *
 * ON THE AGREEMENT BARS. Four stances, in one fixed order, with the numbers
 * printed beside every bar and a legend above them. Identity is never carried
 * by colour alone: a reader who cannot distinguish amber from rose still has
 * "3 agree, 2 with changes, 1 disagree" in text. That is also why there is no
 * chart library here — a stacked div per row says it, and the counts are the
 * part the committee quotes.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardCopy,
  Clock,
  Eye,
  Loader2,
  Lock,
  MessageSquareWarning,
  Play,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  UserPlus,
  Users,
} from 'lucide-react';

interface Participation {
  invited: number; selfEnrolled: number; opened: number; inProgress: number;
  submitted: number; notStarted: number;
  byUnit: Array<{ unit: string; invited: number; submitted: number }>;
  byRole: Array<{ role: string; invited: number; submitted: number }>;
}

interface SectionAgreement {
  sectionId: string; number: string | null; title: string;
  agree: number; agreeWithChanges: number; disagree: number; notMyArea: number;
  answered: number; changeRequests: number; patientSafety: number; highPriority: number;
}

interface DecisionItemTally {
  decisionItemId: string; sectionNumber: string | null; sectionTitle: string;
  placeholder: string; surroundingSentence: string; type: string; currentValue: string;
  accepted: number; answered: number;
  proposals: Array<{ value: string; support: number; reasons: string[] }>;
}

interface Flagged {
  sectionId: string; sectionNumber: string | null; sectionTitle: string;
  stance: string; concernType: string | null; priority: string | null;
  comment: string | null; proposedWording: string | null;
  attributedTo: string; updatedAt: string;
}

interface Invitation {
  id: string; inviteeName: string; inviteeRole: string | null; inviteeUnit: string | null;
  phone: string | null; email: string | null; selfEnrolled: boolean;
  sentAt: string | null; openedAt: string | null; submittedAt: string | null;
  revokedAt: string | null; reminderCount: number;
  participation: { lastSeenAt: string; currentStepId: string | null } | null;
}

interface RoundData {
  round: {
    id: string; title: string | null; version: string; status: string;
    opensAt: string | null; closesAt: string; closedAt: string | null;
    resultsVisibility: string; quorumPercent: number | null; createdByName: string | null;
    document: { id: string; title: string; version: string } | null;
  };
  viewer: { who: string; isOwner: boolean; attribution: string };
  generalLink: string | null;
  participation: Participation;
  quorumMet: boolean | null;
  sections: SectionAgreement[];
  decisionItems: DecisionItemTally[];
  flagged: Flagged[];
}

interface NewLink {
  invitationId: string; inviteeName: string; url: string;
  message: string; whatsapp: string | null; alreadyInvited?: boolean;
}

const STANCE_BARS = [
  { key: 'agree' as const, label: 'Agree', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { key: 'agreeWithChanges' as const, label: 'With changes', bar: 'bg-amber-500', dot: 'bg-amber-500' },
  { key: 'disagree' as const, label: 'Disagree', bar: 'bg-rose-500', dot: 'bg-rose-500' },
  { key: 'notMyArea' as const, label: 'Not my area', bar: 'bg-slate-300', dot: 'bg-slate-300' },
];

const CONCERN_LABEL: Record<string, string> = {
  PATIENT_SAFETY: 'Patient safety',
  FEASIBILITY: 'Not workable',
  RESOURCES: 'Resources',
  LEGAL_OR_DISCIPLINARY: 'Legal / fairness',
  CLARITY: 'Clarity',
  OTHER: 'Other',
};

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Africa/Lagos',
  }).format(new Date(iso));

export default function PolicyRoundPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<RoundData | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [bulk, setBulk] = useState('');
  const [newLinks, setNewLinks] = useState<NewLink[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'Could not load the round.');
        return;
      }
      setData(body as RoundData);
      setError(null);

      if ((body as RoundData).viewer.isOwner) {
        const inv = await fetch(`/api/policy/rounds/${params.id}/invitations`, { cache: 'no-store' });
        if (inv.ok) setInvitations((await inv.json()).invitations ?? []);
      }
    } catch {
      setError('Could not load the round.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'That did not work.');
        return;
      }
      await load();
    } catch {
      setError('That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError('Could not copy — select the text and copy it by hand.');
    }
  };

  /**
   * One invitee per line: Name | Role | Unit | Phone
   *
   * A paste-a-list box rather than a form repeated eleven times, because the
   * committee roster arrives as a list in a message and typing it twice is how
   * a head of department gets left out.
   */
  const invite = async () => {
    const invitees = bulk
      .split('\n')
      .map((line) => line.split(/\s*[|\t]\s*/).map((c) => c.trim()))
      .filter((cols) => (cols[0] ?? '') !== '')
      .map((cols) => ({
        inviteeName: cols[0],
        inviteeRole: cols[1] || null,
        inviteeUnit: cols[2] || null,
        phone: cols[3] || null,
      }));

    if (invitees.length === 0) {
      setError('Put one person per line: Name | Role | Unit | Phone');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitees }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'Could not create the invitations.');
        return;
      }
      setNewLinks(body.created ?? []);
      setBulk('');
      setShowInvite(false);
      await load();
    } catch {
      setError('Could not create the invitations.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading the round…</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { round, viewer, participation } = data;
  const isOpen = round.status === 'OPEN';

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link
        href="/dashboard/policy-review"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Policy Review
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">
            {round.title || round.document?.title || 'Review round'}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Version {round.version} · closes {dateTime(round.closesAt)}
            {round.createdByName ? ` · opened by ${round.createdByName}` : ''}
          </p>
        </div>

        {viewer.isOwner && (
          <div className="flex flex-wrap gap-2">
            {!isOpen ? (
              <button
                type="button"
                onClick={() => act({ action: round.status === 'CLOSED' ? 'reopen' : 'open' })}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                <Play className="h-3.5 w-3.5" />
                {round.status === 'CLOSED' ? 'Reopen' : 'Open the round'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => act({ action: 'close' })}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-60"
              >
                <Square className="h-3.5 w-3.5" />
                Close it
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowInvite((s) => !s)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Invite
            </button>
            <Link
              href={`/dashboard/policy-review/${params.id}/analysis`}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Analysis &amp; decisions
            </Link>
          </div>
        )}
      </header>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-sm text-rose-900">{error}</p>
        </div>
      )}

      {round.status === 'DRAFT' && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
          <p className="text-xs leading-relaxed text-blue-900">
            This round is not open yet. Invite the committee and check the links first — anybody
            who opens a link now is told to keep the message, not shown an empty review. Press
            <strong> Open the round</strong> when you are ready.
          </p>
        </div>
      )}

      {/* ── Invite ─────────────────────────────────────────────────────── */}
      {viewer.isOwner && showInvite && (
        <div className="mb-5 rounded-xl border border-slate-300 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Invite committee members</p>
          <p className="mt-1 text-xs text-slate-600">
            One person per line: <code className="rounded bg-slate-100 px-1">Name | Role | Unit | Phone</code>.
            Role, unit and phone may be left out, but the phone is what makes the WhatsApp
            button work.
          </p>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={6}
            className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
            placeholder={'Dr A. Example | Head of Surgery | Surgery | 08030000000\nDr B. Example | Head of Anaesthesia | Anaesthesia |'}
          />
          <button
            type="button"
            onClick={invite}
            disabled={busy}
            className="mt-2 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Create links
          </button>
        </div>
      )}

      {newLinks && newLinks.length > 0 && (
        <div className="mb-5 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <ShieldAlert className="h-4 w-4" />
            Copy these links now — they cannot be shown again
          </p>
          <p className="mt-1 text-xs text-amber-900">
            Only a hash of each link is stored, so nobody can read them back later. If one is
            lost, reissue it from the list below.
          </p>
          <ul className="mt-3 space-y-2">
            {newLinks.map((l) => (
              <li key={l.invitationId} className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-900">{l.inviteeName}</p>
                {l.alreadyInvited ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Already invited in this round — no second link was created.
                  </p>
                ) : (
                  <>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{l.url}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copy(l.url, `url-${l.invitationId}`)}
                        className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium"
                      >
                        {copied === `url-${l.invitationId}` ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
                        Copy link
                      </button>
                      <button
                        type="button"
                        onClick={() => copy(l.message, `msg-${l.invitationId}`)}
                        className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium"
                      >
                        {copied === `msg-${l.invitationId}` ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
                        Copy message
                      </button>
                      {l.whatsapp && (
                        <a
                          href={l.whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                        >
                          <Send className="h-3 w-3" />
                          Send on WhatsApp
                        </a>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setNewLinks(null)}
            className="mt-3 text-xs font-medium text-amber-900 underline"
          >
            I have copied them
          </button>
        </div>
      )}

      {/* ── Participation ──────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-500">
          <Users className="h-4 w-4" />
          Participation
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ['Invited', participation.invited],
            ['Opened', participation.opened],
            ['In progress', participation.inProgress],
            ['Submitted', participation.submitted],
            ['Not started', participation.notStarted],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-[11px] text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {data.quorumMet !== null && (
          <p className={`mt-2 text-xs font-medium ${data.quorumMet ? 'text-emerald-700' : 'text-amber-700'}`}>
            Quorum of {round.quorumPercent}% {data.quorumMet ? 'met' : 'not yet met'}.
          </p>
        )}

        {participation.byUnit.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Unit</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">Invited</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {participation.byUnit.map((u) => (
                  <tr key={u.unit} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 text-slate-800">{u.unit}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{u.invited}</td>
                    <td className={`px-3 py-1.5 text-right font-medium ${u.submitted === 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {u.submitted}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Flagged first: the thing that must not scroll away ─────────── */}
      {data.flagged.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-rose-700">
            <MessageSquareWarning className="h-4 w-4" />
            Safety, fairness and high-priority comments
          </h2>
          <p className="mb-2 text-xs text-slate-600">
            Shown before the counts on purpose. A single patient-safety objection is the most
            important thing in a review, and it is not a majority of anything.
          </p>
          <ul className="space-y-2">
            {data.flagged.map((f, i) => (
              <li
                key={`${f.sectionId}-${i}`}
                className={`rounded-xl border bg-white p-3 ${
                  f.concernType === 'PATIENT_SAFETY' ? 'border-rose-300' : 'border-amber-200'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {f.concernType && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      f.concernType === 'PATIENT_SAFETY'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {CONCERN_LABEL[f.concernType] ?? f.concernType}
                    </span>
                  )}
                  {f.priority === 'HIGH' && (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-white">
                      high priority
                    </span>
                  )}
                  <span className="text-xs font-semibold text-slate-900">
                    {f.sectionNumber ? `${f.sectionNumber}. ` : ''}{f.sectionTitle}
                  </span>
                </div>
                {f.comment && (
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{f.comment}</p>
                )}
                {f.proposedWording && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[11px] font-medium text-blue-700">
                      Proposed wording
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
                      {f.proposedWording}
                    </pre>
                  </details>
                )}
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {f.attributedTo} · {dateTime(f.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {viewer.attribution === 'none' && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p className="text-xs text-slate-600">
            You are reading this as an observer. Individual responses are not released yet, so
            only the counts are shown.
          </p>
        </div>
      )}

      {/* ── Agreement per section ──────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Agreement, section by section
        </h2>
        <div className="mb-2 flex flex-wrap gap-3">
          {STANCE_BARS.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-sm ${s.dot}`} />
              {s.label}
            </span>
          ))}
        </div>
        <ul className="space-y-1.5">
          {data.sections.map((s) => {
            const total = s.agree + s.agreeWithChanges + s.disagree + s.notMyArea;
            return (
              <li key={s.sectionId} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-900">
                    {s.number ? `${s.number}. ` : ''}{s.title}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {total === 0 ? 'no answers yet' : `${total} answered`}
                    {s.changeRequests > 0 ? ` · ${s.changeRequests} commented` : ''}
                  </p>
                </div>

                {total > 0 && (
                  <>
                    <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      {STANCE_BARS.map((bar) => {
                        const value = s[bar.key];
                        if (value === 0) return null;
                        return (
                          <div
                            key={bar.key}
                            className={bar.bar}
                            style={{ width: `${(value / total) * 100}%` }}
                            title={`${bar.label}: ${value}`}
                          />
                        );
                      })}
                    </div>
                    {/* The numbers in text, so the bars are never the only
                        way to read this. */}
                    <p className="mt-1 text-[11px] text-slate-600">
                      {s.agree} agree · {s.agreeWithChanges} with changes · {s.disagree} disagree
                      {s.notMyArea > 0 ? ` · ${s.notMyArea} not their area` : ''}
                      {s.patientSafety > 0 && (
                        <strong className="text-rose-700"> · {s.patientSafety} safety</strong>
                      )}
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── The open values ────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          The values still to be settled
        </h2>
        {data.decisionItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">
            No open values were imported for this draft.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.decisionItems.map((d) => (
              <li key={d.decisionItemId} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">
                  {d.sectionNumber ? `${d.sectionNumber}. ` : ''}{d.sectionTitle}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-700">
                  &ldquo;{d.surroundingSentence}&rdquo;
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">
                    {d.currentValue}
                  </span>
                  <span className="text-slate-500">
                    as drafted · {d.accepted} accepted it · {d.answered} answered
                  </span>
                </div>

                {d.proposals.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {d.proposals.map((p) => (
                      <div key={p.value} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-xs">
                          <strong className="text-slate-900">{p.value}</strong>
                          <span className="text-slate-500"> — {p.support} proposed this</span>
                        </p>
                        {p.reasons.length > 0 && (
                          <ul className="mt-0.5 list-disc pl-4 text-[11px] text-slate-600">
                            {p.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Sharing + the invited list ─────────────────────────────────── */}
      {viewer.isOwner && (
        <>
          {data.generalLink && (
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-bold text-slate-900">The link for the group</h2>
              <p className="mt-1 text-xs text-slate-600">
                Post this in the committee&rsquo;s WhatsApp group. It needs an ORM sign-in, so
                whoever opens it answers under their own name.
              </p>
              <p className="mt-2 break-all font-mono text-[11px] text-slate-600">{data.generalLink}</p>
              <button
                type="button"
                onClick={() => copy(data.generalLink!, 'general')}
                className="mt-2 flex items-center gap-1.5 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium"
              >
                {copied === 'general' ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                Copy the group link
              </button>
            </section>
          )}

          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-500">
              <Eye className="h-4 w-4" />
              Who was invited
            </h2>
            {invitations.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">
                Nobody is invited yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Member</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Unit</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((i) => (
                      <tr key={i.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">{i.inviteeName}</p>
                          {i.inviteeRole && <p className="text-[11px] text-slate-500">{i.inviteeRole}</p>}
                          {i.selfEnrolled && (
                            <span className="text-[10px] font-medium text-blue-700">joined via group link</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{i.inviteeUnit ?? '—'}</td>
                        <td className="px-3 py-2">
                          {i.revokedAt ? (
                            <span className="text-rose-700">withdrawn</span>
                          ) : i.submittedAt ? (
                            <span className="font-medium text-emerald-700">
                              submitted {dateTime(i.submittedAt)}
                            </span>
                          ) : i.openedAt ? (
                            <span className="text-amber-700">
                              in progress
                              {i.participation?.lastSeenAt
                                ? ` · last seen ${dateTime(i.participation.lastSeenAt)}`
                                : ''}
                            </span>
                          ) : (
                            <span className="text-slate-500">not opened</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
