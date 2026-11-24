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

import { Fragment, useCallback, useEffect, useState } from 'react';
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
  CalendarClock,
  KeyRound,
  Ban,
  BellRing,
  Search,
  RotateCcw,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  reissueRisk, reissueWarning, needsConfirmation,
  bulkReissueTargets, bulkReissueSentence,
} from '@/lib/policy/reissue';
// From ./messages, not ./invite: invite.ts imports node:crypto and this is a
// client component, so importing it here would break the page bundle.
import { buildPolicyReminderMessage } from '@/lib/policy/messages';
import {
  describeDirectory, selectableEntries, selectionProblem, describeSelection,
  filterEntries, inviteeFromUser,
  type DirectoryUser,
} from '@/lib/policy/directory';
import { whatsappLink } from '@/lib/whatsapp';
import {
  EXTENSION_PRESETS, DEFAULT_EXTENSION_HOURS, presetLabel,
  extendFrom, deadlinePassed, extensionProblem, deadlineText,
  toLocalInputValue, fromLocalInputValue, describeExtension, extensionPayload,
} from '@/lib/policy/extend';

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
  /** Sections answered so far, from the invitations endpoint. */
  answered?: number;
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
  /**
   * The extend panel.
   *
   * Held open as its own state rather than a prompt() because the owner has
   * to SEE the date they are about to set. A deadline typed blind into a
   * browser dialog is how a round gets reopened into last week.
   */
  const [showExtend, setShowExtend] = useState(false);
  const [newClose, setNewClose] = useState('');
  const [bulk, setBulk] = useState('');
  /**
   * Inviting from the ORM directory.
   *
   * The pasted list stays -- it is still the right answer for somebody with
   * no ORM account -- but picking from the directory is the default, because
   * it carries `userId`. Without that the same head of department invited by
   * name and then arriving through the general link is two invitations and
   * two counts in every participation figure.
   */
  const [inviteMode, setInviteMode] = useState<'directory' | 'paste'>('directory');
  const [dirQuery, setDirQuery] = useState('');
  const [dirRole, setDirRole] = useState('');
  const [dirUsers, setDirUsers] = useState<DirectoryUser[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirSearched, setDirSearched] = useState(false);
  const [picked, setPicked] = useState<Record<string, DirectoryUser>>({});
  const [hideInvited, setHideInvited] = useState(true);
  const [newLinks, setNewLinks] = useState<NewLink[] | null>(null);
  /**
   * Replacing a lost link.
   *
   * `confirmId` holds the one invitation whose replacement needs saying out
   * loud first -- a member who already has a working link. It is a separate
   * piece of state rather than a window.confirm() because the warning differs
   * per member (opened / submitted / withdrawn) and a browser dialog cannot
   * show which.
   */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  /**
   * The member whose reminder is being composed.
   *
   * The message is handed to the Chairman to send himself -- Copy, or straight
   * into WhatsApp. That is deliberately different from the bulk chase, which
   * QUEUES through queueMessage so the send policy, the kill switch and the
   * audit trail all apply. One is “I will message Prof Okeke now”; the other is
   * a chase of everybody.
   *
   * IT IS NOW COMPOSED BY THE SERVER, because the reminder carries the member's
   * link and a browser cannot mint one -- only the token's SHA-256 is stored.
   * The local builder is kept as the fallback for when that call fails: it
   * produces the same message minus the link, pointing at the one they already
   * have, which is strictly better than an empty panel.
   */
  const [remindId, setRemindId] = useState<string | null>(null);
  const [remindComposed, setRemindComposed] = useState<Record<string, string>>({});
  const [remindBusy, setRemindBusy] = useState<string | null>(null);
  const [totalSections, setTotalSections] = useState(0);
  const [remindNotice, setRemindNotice] = useState<string | null>(null);
  const [showBulkReissue, setShowBulkReissue] = useState(false);

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
        if (inv.ok) {
          const payload = await inv.json();
          setInvitations(payload.invitations ?? []);
          setTotalSections(payload.totalSections ?? 0);
        }
      }
    } catch {
      setError('Could not load the round.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Keep the participation figures live while the page is open.
   *
   * These counts are what the Chairman watches during a round, and until now
   * they were whatever they had been when the page was opened -- a response
   * submitted five minutes ago stayed invisible until a manual refresh.
   *
   * Thirty seconds, and only while the tab is actually visible: a forgotten
   * tab polling all night on a theatre handset is somebody else battery and
   * somebody else data.
   */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

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

  /** Open the panel pre-filled with the 48 hours that always gets asked for. */
  const openExtend = (closesAt: string) => {
    setNewClose(toLocalInputValue(
      extendFrom(new Date(closesAt), new Date(), DEFAULT_EXTENSION_HOURS),
    ));
    setShowExtend(true);
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
   * Search the ORM directory.
   *
   * APPROVED accounts only. A PENDING account's phone number is one nobody
   * has verified, and an unverified number is worse than none at all when it
   * is carrying a personal link that records answers under somebody's name --
   * the same rule the oxygen room lookup uses.
   */
  const searchDirectory = async () => {
    setDirLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ status: 'APPROVED', slim: '1', limit: '100' });
      if (dirQuery.trim()) qs.set('q', dirQuery.trim());
      if (dirRole.trim()) qs.set('role', dirRole.trim());
      const res = await fetch(`/api/users?${qs.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        setError('Could not search the directory.');
        return;
      }
      const body = await res.json();
      const rows: DirectoryUser[] = Array.isArray(body) ? body : (body.users ?? []);
      setDirUsers(rows);
      setDirSearched(true);
    } catch {
      setError('Could not search the directory.');
    } finally {
      setDirLoading(false);
    }
  };

  const togglePick = (u: DirectoryUser) => {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[u.id]) delete next[u.id];
      else next[u.id] = u;
      return next;
    });
  };

  /** Invite everybody ticked, as accounts rather than as typed names. */
  const inviteFromDirectory = async () => {
    const selected = Object.values(picked);
    const problem = selectionProblem(selected);
    if (problem) { setError(problem); return; }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitees: selected.map(inviteeFromUser) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'Could not create the invitations.');
        return;
      }
      setNewLinks(body.created ?? []);
      setPicked({});
      setShowInvite(false);
      await load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Could not create the invitations.');
    } finally {
      setBusy(false);
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

  /**
   * A fresh link for one member. The old one stops working immediately.
   *
   * The result goes into the SAME shown-once panel the invite flow uses, so
   * there is one place on this page where a link is ever displayed and one
   * set of copy buttons to learn. The page scrolls to it, because a link that
   * appears above the fold the owner is looking at is a link nobody copies --
   * and this one cannot be shown again either.
   */
  const reissue = async (invitationId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/invitations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId, action: 'reissue' }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'Could not issue a new link.');
        return;
      }
      setNewLinks((prev) => [
        ...(prev ?? []).filter((l) => l.invitationId !== body.invitationId),
        {
          invitationId: body.invitationId,
          inviteeName: body.inviteeName,
          url: body.url,
          message: body.message,
          whatsapp: body.whatsapp ?? null,
        },
      ]);
      setConfirmId(null);
      await load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Could not issue a new link.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * The reminder for one member, without a link.
   *
   * THE FALLBACK, not the normal path. A browser cannot mint a link -- only the
   * token’s SHA-256 is stored -- so this wording points at the link the member
   * already holds. It is what is shown while the server is composing, and what
   * is left if that call fails.
   */
  const reminderFor = (i: Invitation): string => buildPolicyReminderMessage({
    inviteeName: i.inviteeName,
    policyTitle: data?.round.document?.title ?? null,
    closesAt: new Date(data?.round.closesAt ?? Date.now()),
    answered: i.answered ?? 0,
    totalSections,
  });

  /** What to show in the panel: the server’s version where we have it. */
  const reminderText = (i: Invitation): string => remindComposed[i.id] ?? reminderFor(i);

  /**
   * Open the panel for one member, and ask the server to compose the message.
   *
   * The link in it is FRESH, and the one the member already holds goes on
   * working -- the server keeps the previous hash alive on purpose. So opening
   * this panel is not a withdrawal of anything, which is the difference between
   * it and “New link”.
   */
  const openReminder = async (i: Invitation) => {
    if (remindId === i.id) {
      setRemindId(null);
      return;
    }
    setRemindId(i.id);
    if (remindComposed[i.id]) return;

    setRemindBusy(i.id);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/invitations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId: i.id, action: 'remind-link' }),
      });
      if (!res.ok) return;
      const body = await res.json();
      if (typeof body?.message === 'string') {
        setRemindComposed((prev) => ({ ...prev, [i.id]: body.message }));
      }
    } catch {
      // The linkless wording is already on screen. Saying nothing is right
      // here: the Chairman has a sendable message either way.
    } finally {
      setRemindBusy(null);
    }
  };

  /** Queue a chase to everybody who has not submitted. */
  const remindEveryone = async () => {
    setBusy(true);
    setError(null);
    setRemindNotice(null);
    try {
      const res = await fetch(`/api/policy/reminders?round=${params.id}`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'Could not queue the reminders.');
        return;
      }
      // The skipped count is reported rather than hidden: it is almost always
      // members with no phone number and no account, which is something only
      // the Chairman can fix.
      setRemindNotice(
        `Queued ${body.queued} reminder(s) to the ${body.nonResponders} member(s) who `
        + 'have not submitted.'
        + (body.skipped > 0
          ? ` ${body.skipped} could not be sent — no phone number or ORM account on file.`
          : ''),
      );
      await load();
    } catch {
      setError('Could not queue the reminders.');
    } finally {
      setBusy(false);
    }
  };

  /** Withdraw a member, or put them back. */
  const setInviteState = async (invitationId: string, action: 'revoke' | 'restore') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/invitations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId, action }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body?.error ?? 'Could not change that invitation.');
        return;
      }
      await load();
    } catch {
      setError('Could not change that invitation.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Fresh links for everybody who never opened theirs.
   *
   * Sequential rather than Promise.all: each one is a token write, the list is
   * at most the committee's size, and a partial failure half way through a
   * parallel burst leaves the owner unable to tell which links are now live.
   */
  const bulkReissue = async () => {
    const targets = bulkReissueTargets(invitations);
    if (targets.length === 0) return;

    setBusy(true);
    setError(null);
    const made: NewLink[] = [];
    try {
      for (const t of targets) {
        const res = await fetch(`/api/policy/rounds/${params.id}/invitations`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invitationId: t.id, action: 'reissue' }),
        });
        if (!res.ok) continue;
        const body = await res.json();
        made.push({
          invitationId: body.invitationId,
          inviteeName: body.inviteeName,
          url: body.url,
          message: body.message,
          whatsapp: body.whatsapp ?? null,
        });
      }
      if (made.length === 0) {
        setError('Could not issue the new links.');
        return;
      }
      if (made.length < targets.length) {
        setError(`Only ${made.length} of ${targets.length} links could be issued. `
          + 'The ones below are live; try the rest again from the list.');
      }
      setNewLinks(made);
      setShowBulkReissue(false);
      await load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
            {/*
              Reopening a LAPSED round goes through the extend panel, because
              the API refuses `reopen` without a new closing date -- rightly:
              every personal link expires with the round, so reopening on the
              old deadline hands every member an EXPIRED page. This button used
              to send the bare action and could therefore never succeed on the
              one round anybody ever wants to reopen.
            */}
            {!isOpen ? (
              <button
                type="button"
                onClick={() => {
                  if (round.status === 'CLOSED') openExtend(round.closesAt);
                  else act({ action: 'open' });
                }}
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

            {/*
              An OPEN round whose deadline has merely lapsed needs the date
              moved and nothing else -- sending `reopen` for one is refused
              with "That round is already open". Its reviewers are being shown
              an EXPIRED page right now, so the control has to be here too.
            */}
            <button
              type="button"
              onClick={() => openExtend(round.closesAt)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {deadlinePassed(new Date(round.closesAt), new Date()) ? 'Give it more time' : 'Change the deadline'}
            </button>
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
      {/*
        Giving the round more time.

        Three things this panel does that the bare button could not:
        it SHOWS the date being set, it offers the 48 hours that is what
        actually gets asked for, and it sends the right shape -- `reopen`
        plus a date for a CLOSED round, a date alone for one that is still
        OPEN but lapsed. Getting that pair the wrong way round is refused by
        the API, which is why one function decides it rather than the JSX.
      */}
      {viewer.isOwner && showExtend && (
        <section className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-sky-900">
            <CalendarClock className="h-4 w-4" />
            {deadlinePassed(new Date(round.closesAt), new Date())
              ? 'Reopen the review'
              : 'Change the closing date'}
          </h2>
          <p className="mt-1 text-xs text-sky-900">
            Closed {deadlineText(new Date(round.closesAt))}. Every personal link expires
            with the round, so the new date moves all of them too — nobody has to be
            re-invited and no link already sent on WhatsApp stops working.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {EXTENSION_PRESETS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setNewClose(toLocalInputValue(
                  extendFrom(new Date(round.closesAt), new Date(), h),
                ))}
                className="rounded-full border border-sky-300 bg-white px-3 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100"
              >
                +{presetLabel(h)}
              </button>
            ))}
          </div>

          <label className="mt-3 block text-xs font-semibold text-sky-900" htmlFor="policy-new-close">
            Closes at
          </label>
          <input
            id="policy-new-close"
            type="datetime-local"
            value={newClose}
            onChange={(e) => setNewClose(e.target.value)}
            className="mt-1 rounded-lg border border-sky-300 px-3 py-2 text-sm"
          />

          {(() => {
            const parsed = fromLocalInputValue(newClose);
            const problem = extensionProblem({ closesAt: parsed, now: new Date() });
            return (
              <>
                {problem ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-900">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                    {problem}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-sky-900">
                    {describeExtension(new Date(round.closesAt), parsed!, new Date())}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !!problem}
                    onClick={async () => {
                      await act(extensionPayload({ status: round.status, closesAt: parsed! }));
                      setShowExtend(false);
                    }}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {busy ? 'Saving…' : 'Set the new closing date'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowExtend(false)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            );
          })()}
        </section>
      )}

      {viewer.isOwner && showInvite && (
        <div className="mb-5 rounded-xl border border-slate-300 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Invite committee members</p>

          {/*
            Two ways in, and the directory is the default.

            Picking from ORM carries the account id onto the invitation, which
            is what lets a member arrive later through the general link and be
            recognised as the same person -- the unique index on
            (roundId, userId) enforces it. A pasted name has no account id, so
            the same head of department invited by name and then signing in
            counts twice in every participation figure.

            The pasted list stays, because somebody with no ORM account still
            has to be invitable, and most of this committee's guests are.
          */}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setInviteMode('directory')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                inviteMode === 'directory'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700'
              }`}
            >
              From the ORM directory
            </button>
            <button
              type="button"
              onClick={() => setInviteMode('paste')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                inviteMode === 'paste'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700'
              }`}
            >
              Paste a list
            </button>
          </div>

          {inviteMode === 'directory' && (() => {
            const entries = filterEntries(
              describeDirectory(dirUsers, invitations),
              { hideInvited },
            );
            const selected = Object.values(picked);
            return (
              <div className="mt-3">
                <p className="text-xs text-slate-600">
                  Search the staff directory and tick the members to invite. Their name,
                  role, unit and phone number come from their ORM record, so nothing is
                  retyped — a wrong digit in a phone number means the invitation is never
                  delivered and every reminder goes to a stranger.
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={dirQuery}
                    onChange={(e) => setDirQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void searchDirectory(); }}
                    placeholder="Name, username or staff code"
                    className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={dirRole}
                    onChange={(e) => setDirRole(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void searchDirectory(); }}
                    placeholder="Role (optional), e.g. CONSULTANT_SURGEON"
                    className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void searchDirectory()}
                    disabled={dirLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {dirLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Search
                  </button>
                </div>

                <label className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={hideInvited}
                    onChange={(e) => setHideInvited(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Hide members already invited to this round
                </label>

                {dirSearched && entries.length === 0 && (
                  <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
                    Nobody matched. Try part of a surname, or clear the role box — only
                    APPROVED accounts are offered, because a pending account&rsquo;s phone
                    number is one nobody has verified.
                  </p>
                )}

                {entries.length > 0 && (
                  <ul className="mt-3 max-h-72 space-y-1 overflow-auto rounded-lg border border-slate-200 p-1">
                    {entries.map((e) => (
                      <li key={e.id}>
                        <label
                          className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs ${
                            e.alreadyInvited ? 'opacity-60' : 'hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4"
                            disabled={e.alreadyInvited}
                            checked={Boolean(picked[e.id])}
                            onChange={() => togglePick(e)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-slate-900">{e.fullName}</span>
                            <span className="text-slate-500">
                              {e.role ? ` · ${e.role.replace(/_/g, ' ')}` : ''}
                              {e.department ? ` · ${e.department}` : ''}
                            </span>
                            {/*
                              A missing number is a warning, never a refusal: plenty
                              of heads of department are reached through a secretary.
                              What must not happen is inviting them believing a
                              reminder will chase them.
                            */}
                            {e.note && (
                              <span
                                className={`block text-[11px] ${
                                  e.alreadyInvited ? 'text-slate-500' : 'text-amber-800'
                                }`}
                              >
                                {e.note}
                              </span>
                            )}
                          </span>
                          {e.reachable && (
                            <span className="shrink-0 font-mono text-[10px] text-slate-400">
                              {e.phoneNumber}
                            </span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                {entries.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next: Record<string, DirectoryUser> = { ...picked };
                        for (const e of selectableEntries(entries)) next[e.id] = e;
                        setPicked(next);
                      }}
                      className="rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700"
                    >
                      Select all shown
                    </button>
                    <button
                      type="button"
                      onClick={() => setPicked({})}
                      className="rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700"
                    >
                      Clear selection
                    </button>
                  </div>
                )}

                <p className="mt-2 text-xs text-slate-700">{describeSelection(selected)}</p>

                <button
                  type="button"
                  onClick={() => void inviteFromDirectory()}
                  disabled={busy || selected.length === 0}
                  className="mt-2 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Create links for {selected.length || 'the'} selected
                </button>
              </div>
            );
          })()}

          {inviteMode === 'paste' && (
          <>
          <p className="mt-3 text-xs text-slate-600">
            One person per line: <code className="rounded bg-slate-100 px-1">Name | Role | Unit | Phone</code>.
            Role, unit and phone may be left out, but the phone is what makes the WhatsApp
            button work. Use this for somebody with no ORM account — anybody who has one
            should be picked from the directory, so their invitation carries it.
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
          </>
          )}
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

            {/*
              Replacing links in bulk.

              This is the case that actually happens: eleven names are pasted in,
              eleven links appear in the amber panel, the panel is dismissed and
              the links are gone -- they are stored only as hashes, so no screen
              and no query can show them again. The button covers exactly the
              members holding nothing, and says so, because over a roster that is
              half-way through a review it otherwise reads as if it will disturb
              everybody.
            */}
            {remindNotice && (
              <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                {remindNotice}
              </p>
            )}

            {invitations.length > 0 && (
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {!showBulkReissue ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-600">
                      Lost the links? They are stored as hashes and cannot be shown again —
                      but a fresh one can be issued for anybody who has not opened theirs.
                      <strong className="font-semibold">
                        {' '}A fresh link replaces the old one, so any link already sent to
                        that member stops working and they must be sent the new one.
                      </strong>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setShowBulkReissue(true)}
                        disabled={busy || bulkReissueTargets(invitations).length === 0}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Issue fresh links
                      </button>
                      {/*
                        The bulk chase QUEUES through queueMessage, so the send
                        policy, the kill switch and the audit trail all apply.
                        The per-member button beside each name instead hands over
                        the text for the Chairman to send himself.
                      */}
                      <button
                        type="button"
                        onClick={() => void remindEveryone()}
                        disabled={busy || invitations.every((i) => i.submittedAt || i.revokedAt)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      >
                        <BellRing className="h-3.5 w-3.5" />
                        Remind non-responders
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Issue fresh links</p>
                    <p className="mt-1 text-xs text-slate-700">
                      {bulkReissueSentence(invitations)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void bulkReissue()}
                        disabled={busy}
                        className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {busy ? 'Issuing…' : `Issue ${bulkReissueTargets(invitations).length} link(s)`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowBulkReissue(false)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
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
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((i) => (
                      <Fragment key={i.id}>
                      <tr className="border-t border-slate-100">
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
                              {totalSections > 0 && (i.answered ?? 0) > 0
                                ? ` · ${i.answered} of ${totalSections} sections`
                                : ''}
                              {i.participation?.lastSeenAt
                                ? ` · last seen ${dateTime(i.participation.lastSeenAt)}`
                                : ''}
                            </span>
                          ) : (
                            <span className="text-slate-500">not opened</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right align-top">
                          {confirmId === i.id ? (
                            // The warning for THIS member, not a generic one. What is at
                            // stake differs: an unopened link costs nothing to replace, a
                            // submitted member's link is how they would revise before the
                            // deadline.
                            <div className="inline-block max-w-xs rounded-lg border border-amber-300 bg-amber-50 p-2 text-left">
                              <p className="text-[11px] text-amber-900">
                                {reissueWarning(reissueRisk(i))}
                              </p>
                              <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void reissue(i.id)}
                                  disabled={busy}
                                  className="rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                                >
                                  Replace it
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmId(null)}
                                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700"
                                >
                                  Keep
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {/*
                                Offered only where there is something to chase. A
                                Remind button beside somebody who has already
                                submitted is an invitation to send a pointless
                                message to a head of department.
                              */}
                              {!i.submittedAt && !i.revokedAt && (
                                <button
                                  type="button"
                                  onClick={() => void openReminder(i)}
                                  className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700"
                                >
                                  <BellRing className="h-3 w-3" />
                                  Remind
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (needsConfirmation(reissueRisk(i))) setConfirmId(i.id);
                                  else void reissue(i.id);
                                }}
                                disabled={busy}
                                className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 disabled:opacity-50"
                                title={reissueWarning(reissueRisk(i)) ?? 'Issue a new link for this member'}
                              >
                                <KeyRound className="h-3 w-3" />
                                New link
                              </button>
                              {i.revokedAt ? (
                                <button
                                  type="button"
                                  onClick={() => void setInviteState(i.id, 'restore')}
                                  disabled={busy}
                                  className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 disabled:opacity-50"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Restore
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void setInviteState(i.id, 'revoke')}
                                  disabled={busy}
                                  className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-rose-700 disabled:opacity-50"
                                >
                                  <Ban className="h-3 w-3" />
                                  Withdraw
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>

                      {/*
                        The composed reminder, shown in full before it is sent.
                        The Chairman is about to message a head of department; he
                        should see the words, not trust a button labelled Remind.
                      */}
                      {remindId === i.id && (
                        <tr className="bg-slate-50">
                          <td colSpan={4} className="px-3 py-3">
                            <p className="text-[11px] font-semibold text-slate-700">
                              Reminder for {i.inviteeName}
                              {remindBusy === i.id && (
                                <span className="ml-2 font-normal text-slate-500">
                                  composing a link…
                                </span>
                              )}
                            </p>
                            <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 font-sans text-[11px] leading-relaxed text-slate-800">
                              {reminderText(i)}
                            </pre>
                            {/*
                              Said out loud, because the Chairman has been
                              taught by the “New link” button to expect that a
                              fresh link kills the old one. This one does not.
                            */}
                            {remindComposed[i.id] && (
                              <p className="mt-1 text-[11px] text-slate-500">
                                This message carries a new link. The one already in
                                their WhatsApp goes on working, so nothing is broken
                                by sending it.
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => copy(reminderText(i), `rem-${i.id}`)}
                                className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium"
                              >
                                {copied === `rem-${i.id}` ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
                                Copy message
                              </button>
                              {i.phone ? (
                                <a
                                  href={whatsappLink(i.phone, reminderText(i)) ?? '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                                >
                                  <Send className="h-3 w-3" />
                                  Send on WhatsApp
                                </a>
                              ) : (
                                <span className="text-[11px] text-slate-500">
                                  No phone number on file — copy the message instead.
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setRemindId(null)}
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700"
                              >
                                Close
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
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
