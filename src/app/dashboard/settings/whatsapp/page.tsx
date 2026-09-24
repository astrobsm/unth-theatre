'use client';

// ============================================================
// Setting up WhatsApp reminders
// ------------------------------------------------------------
// SHAPED AS A CHECKLIST, not a settings form, because the hard part of this is
// not configuration — it is four steps at Meta that happen outside this app and
// in a required order. A page of toggles would imply the work is here. It is
// not: the app is ready, and what stands between the hospital and a working
// reminder is a business account, a phone number, six approved templates and
// two credentials.
//
// So the page says, in order, what is done and what is next, and it refuses to
// pretend. "Ready" appears only when a message could actually be delivered.
//
// AND IT DEFAULTS TO SAFE. With no credentials it runs as a dry run, showing
// exactly what would have been sent to whom. That is the state a hospital
// should sit in while the wording is reviewed, and it is the state it starts
// in without anybody choosing it.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Check, CheckCircle2, ClipboardCopy, Loader2, MessageSquare,
  Play, RefreshCw, ShieldAlert, X,
} from 'lucide-react';

interface TemplateRow {
  code: string;
  metaName: string;
  category: string;
  language: string;
  when: string;
  metaBody: string;
  variables: string[];
  buttonLabel: string | null;
  installed: boolean;
  providerStatus: string | null;
  approved: boolean;
  problems: string[];
  nextStep: string;
}

interface Settings {
  mode: { live: boolean; reason: string };
  credentials: { configured: boolean; phoneNumberIdSet: boolean; accessTokenSet: boolean };
  settings: { allDisabled: boolean; dryRun: boolean; note: string | null };
  envOverride: boolean;
  counts: Record<string, number>;
  staff: { optedOut: number; withoutPhone: number };
  recent: Array<{
    id: string; status: string; recipientName: string | null; templateCode: string | null;
    queuedAt: string; sentAt: string | null; failureReason: string | null;
  }>;
}

const STATUS_TONE: Record<string, string> = {
  SENT: 'bg-green-100 text-green-800',
  DELIVERED: 'bg-green-100 text-green-800',
  READ: 'bg-green-100 text-green-800',
  QUEUED: 'bg-blue-100 text-blue-800',
  SENDING: 'bg-blue-100 text-blue-800',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-700',
  EXPIRED: 'bg-gray-100 text-gray-700',
};

export default function WhatsAppSetupPage() {
  const [data, setData] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        fetch('/api/comms/settings', { cache: 'no-store' }),
        fetch('/api/comms/templates', { cache: 'no-store' }),
      ]);
      if (s.status === 403 || t.status === 403) { setDenied(true); return; }
      if (s.ok) setData(await s.json());
      if (t.ok) setTemplates((await t.json()).templates ?? []);
    } catch {
      setMessage('The settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patch = async (body: Record<string, unknown>) => {
    setBusy('settings');
    try {
      const r = await fetch('/api/comms/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setMessage(r.ok ? 'Saved.' : 'That could not be saved.');
      if (r.ok) await load();
    } finally { setBusy(null); }
  };

  const installTemplates = async () => {
    setBusy('install');
    try {
      const r = await fetch('/api/comms/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const d = await r.json().catch(() => ({}));
      setMessage(r.ok
        ? `Installed ${d.installed?.length ?? 0}. ${d.refused?.length ? `${d.refused.length} refused.` : ''}`
        : 'The templates could not be installed.');
      await load();
    } finally { setBusy(null); }
  };

  const recordApproval = async (code: string, status: string) => {
    setBusy(code);
    try {
      const r = await fetch('/api/comms/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record-approval', code, providerStatus: status }),
      });
      setMessage(r.ok ? `${code} recorded as ${status}.` : 'That could not be recorded.');
      await load();
    } finally { setBusy(null); }
  };

  const runNow = async (what: 'dispatch' | 'tomorrow' | 'emergency') => {
    setBusy(what);
    setMessage(null);
    try {
      const url = what === 'dispatch'
        ? '/api/comms/dispatch'
        : `/api/comms/reminders?job=${what}`;
      const r = await fetch(url, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMessage(d.error ?? 'That could not be run.'); return; }
      setMessage(
        what === 'dispatch'
          ? `Sent ${d.sent ?? 0}, failed ${d.failed ?? 0}${d.dryRun ? ' — dry run, nothing left the building.' : '.'}`
          : `Queued ${d.queued ?? 0} message${d.queued === 1 ? '' : 's'}.`);
      await load();
    } finally { setBusy(null); }
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2500);
    } catch { /* the text is on screen anyway */ }
  };

  if (denied) {
    return (
      <div className="rounded-2xl bg-white p-6 ring-1 ring-gray-200">
        <h1 className="text-lg font-bold text-gray-900">Messaging setup</h1>
        <p className="mt-1 text-sm text-gray-600">
          This is managed by an administrator or theatre management.
        </p>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </p>
    );
  }

  const approved = templates.filter((t) => t.approved).length;
  const live = data?.mode.live ?? false;

  // The four things that have to be true, in the order they have to be done.
  const steps = [
    {
      done: data?.credentials.configured ?? false,
      title: 'A WhatsApp Business account, a number, and two credentials',
      detail: data?.credentials.configured
        ? 'Credentials are present on this deployment.'
        : 'WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are not set. '
          + 'Until they are, everything below runs as a dry run.',
    },
    {
      done: templates.length > 0 && templates.every((t) => t.installed),
      title: 'Install the message catalogue',
      detail: templates.every((t) => t.installed)
        ? 'All templates are installed in this database.'
        : 'Writes the wording into the database so a message sent today can still '
          + 'be read exactly as it was worded next year.',
    },
    {
      done: approved === templates.length && templates.length > 0,
      title: 'Get the templates approved by Meta',
      detail: `${approved} of ${templates.length} approved. Meta must approve every template `
        + 'before it can be sent — free text is not permitted for a message the hospital starts.',
    },
    {
      done: live,
      title: 'Switch sending on',
      detail: data?.mode.reason ?? '',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <MessageSquare className="h-6 w-6 text-green-600" /> WhatsApp reminders
        </h1>
        <p className="mt-1 text-gray-600">
          Automatic reminders about outstanding items and delayed emergencies, sent where
          staff actually read things.
        </p>
      </div>

      {/* ── Where it stands ── */}
      <div className={`rounded-2xl border-2 p-4 ${
        live ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
        <p className={`flex items-center gap-2 font-bold ${live ? 'text-green-900' : 'text-amber-900'}`}>
          {live ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          {live ? 'Sending is live' : 'Dry run — nothing is being delivered'}
        </p>
        <p className={`mt-1 text-sm ${live ? 'text-green-800' : 'text-amber-800'}`}>
          {data?.mode.reason}
        </p>
        {!live && (
          <p className="mt-2 text-sm text-amber-800">
            Everything still runs: reminders are worked out, queued and recorded, and you can
            see exactly who would have been messaged. Nothing reaches a phone.
          </p>
        )}
      </div>

      {message && (
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">{message}</p>
      )}

      {/* ── The four steps ── */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
        <h2 className="text-lg font-bold text-gray-900">What has to be true</h2>
        <p className="mt-0.5 text-sm text-gray-600">
          In this order. Steps one and three happen at Meta, not here.
        </p>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                s.done ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                {s.done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <div>
                <p className="font-semibold text-gray-900">{s.title}</p>
                <p className="text-sm text-gray-600">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void installTemplates()}
            disabled={busy === 'install'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy === 'install' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Install / refresh the catalogue
          </button>
        </div>
      </section>

      {/* ── Controls ── */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
        <h2 className="text-lg font-bold text-gray-900">Controls</h2>

        {data?.envOverride && (
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            All automated communication is switched off by COMMUNICATION_DISABLED in the
            environment. That cannot be released from this screen, which is deliberate.
          </p>
        )}

        <div className="mt-3 space-y-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={data?.settings.dryRun ?? false}
              onChange={(e) => void patch({ dryRun: e.target.checked })}
              disabled={busy === 'settings'}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="block font-semibold text-gray-900">Dry run</span>
              <span className="block text-sm text-gray-600">
                Work out and record every reminder, deliver none. The state to sit in while the
                wording is being reviewed.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={data?.settings.allDisabled ?? false}
              onChange={(e) => void patch({ allDisabled: e.target.checked })}
              disabled={busy === 'settings'}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="block font-semibold text-gray-900">
                Stop all automated communication
              </span>
              <span className="block text-sm text-gray-600">
                Every channel, immediately, including the in-app notices. Takes effect on the
                next message without a redeploy.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          <button type="button" onClick={() => void runNow('tomorrow')} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-800 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-60">
            {busy === 'tomorrow' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run tomorrow&rsquo;s digest now
          </button>
          <button type="button" onClick={() => void runNow('emergency')} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-800 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-60">
            {busy === 'emergency' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Check delayed emergencies now
          </button>
          <button type="button" onClick={() => void runNow('dispatch')} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60">
            {busy === 'dispatch' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Send the queue now
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          These run on a schedule anyway — 6 p.m. for the digest, every fifteen minutes for
          emergencies, every five for sending. The buttons are for trying it without waiting.
        </p>
      </section>

      {/* ── Who can be reached ── */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
        <h2 className="text-lg font-bold text-gray-900">Who can be reached</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-amber-50 px-4 py-3">
            <p className="text-2xl font-bold text-amber-900">{data?.staff.withoutPhone ?? 0}</p>
            <p className="text-sm text-amber-800">
              approved staff with no phone number. No reminder can reach them, and this is the
              commonest reason one never arrives.
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-2xl font-bold text-gray-900">{data?.staff.optedOut ?? 0}</p>
            <p className="text-sm text-gray-600">
              have opted out of WhatsApp. They still see everything in the app.
            </p>
          </div>
        </div>
      </section>

      {/* ── The messages ── */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
        <h2 className="text-lg font-bold text-gray-900">The messages</h2>
        <p className="mt-0.5 text-sm text-gray-600">
          Copy each body into Meta&rsquo;s template console exactly as it appears, then record
          what Meta decided.
        </p>

        <div className="mt-4 space-y-4">
          {templates.map((t) => (
            <div key={t.code} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">{t.code}</p>
                  <p className="text-xs text-gray-500">
                    Meta name <span className="font-mono">{t.metaName}</span> · {t.category} · {t.language}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  t.approved ? 'bg-green-100 text-green-800'
                    : t.installed ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-gray-700'}`}>
                  {t.approved ? 'Approved' : t.providerStatus ?? 'Not installed'}
                </span>
              </div>

              <p className="mt-2 text-sm text-gray-700"><span className="font-semibold">When:</span> {t.when}</p>

              {t.problems.length > 0 && (
                <ul className="mt-2 list-disc rounded-lg bg-red-50 py-2 pl-8 pr-3 text-sm text-red-800">
                  {t.problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}

              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-800">
                {t.metaBody}
              </pre>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void copy(t.metaBody, t.code)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 ring-1 ring-gray-300 hover:bg-gray-50">
                  {copied === t.code ? <Check className="h-3.5 w-3.5 text-green-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                  {copied === t.code ? 'Copied' : 'Copy the body'}
                </button>
                {t.buttonLabel && (
                  <span className="text-xs text-gray-500">
                    Add one URL button labelled &ldquo;{t.buttonLabel}&rdquo;, dynamic suffix.
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                <span className="text-xs font-semibold text-gray-700">Meta said:</span>
                {(['APPROVED', 'PENDING', 'REJECTED'] as const).map((s) => (
                  <button key={s} type="button" disabled={!t.installed || busy === t.code}
                    onClick={() => void recordApproval(t.code, s)}
                    className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-40">
                    {s}
                  </button>
                ))}
                <span className="text-xs text-gray-500">{t.nextStep}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── What it has done ── */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Recent messages</h2>
          <button type="button" onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(data?.counts ?? {}).map(([k, v]) => (
            <span key={k} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[k] ?? 'bg-gray-100 text-gray-700'}`}>
              {k.toLowerCase()} {v}
            </span>
          ))}
          {!Object.keys(data?.counts ?? {}).length && (
            <span className="text-sm text-gray-500">Nothing has been queued yet.</span>
          )}
        </div>

        {(data?.recent.length ?? 0) > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-3">Who</th>
                  <th className="py-2 pr-3">Message</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2">Why not</th>
                </tr>
              </thead>
              <tbody>
                {data?.recent.map((m) => (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="py-2 pr-3">{m.recipientName ?? '—'}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{m.templateCode ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[m.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {m.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-gray-600">{m.failureReason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* The honest limit, where somebody would otherwise go looking. */}
      <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
        <span className="font-semibold">Why no message contains clinical detail.</span>{' '}
        A WhatsApp message sits unencrypted on a lock screen. Every template says what is
        outstanding and how many, never which patient or what is wrong with them — the button
        opens the detail behind a login. That is a privacy rule the app enforces rather than a
        wording choice, and it is also what makes the reminder do its job: the only way to find
        out more is to open the app.
      </p>
    </div>
  );
}
