'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ClipboardCheck,
  UserCheck,
  Users,
  Sparkles,
  CheckCircle2,
  Clock,
  Radio,
  RefreshCw,
  ListChecks,
  Timer,
  ArrowRight,
  Building2,
  Stethoscope,
  FileText,
  Pill,
} from 'lucide-react';

interface StaffOption {
  id: string;
  fullName: string;
  staffCode?: string | null;
}

interface CaseFlow {
  patientReceived: boolean;
  patientReceivedAt: string | null;
  porterNames: string[];
  surgeryCompleted: boolean;
  surgeryCompletedAt: string | null;
  cleaningCalled: boolean;
  cleaningCalledAt: string | null;
  cleanersStarted: boolean;
  cleanersStartedAt: string | null;
  cleanerNames: string[];
  cleaningCompleted: boolean;
  cleaningCompletedAt: string | null;
}

interface CaseItem {
  surgeryId: string;
  status: string;
  procedureName: string;
  scheduledTime: string | null;
  subspecialty: string | null;
  unit: string | null;
  surgeonName: string | null;
  theatreId: string | null;
  theatreName: string;
  patient: {
    id: string;
    name: string;
    folderNumber: string | null;
    age: number | null;
    gender: string | null;
    ward: string | null;
  } | null;
  flow: CaseFlow | null;
}

export default function TheatreReceptionPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [porters, setPorters] = useState<StaffOption[]>([]);
  const [cleaners, setCleaners] = useState<StaffOption[]>([]);
  const [userRole, setUserRole] = useState<string>('');
  const [theatreFilter, setTheatreFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  // Restore the last-selected theatre for this device.
  useEffect(() => {
    const saved =
      typeof window !== 'undefined'
        ? localStorage.getItem('orm.receptionTheatre')
        : null;
    if (saved) setTheatreFilter(saved);
  }, []);

  const selectTheatre = (name: string) => {
    setTheatreFilter(name);
    if (typeof window !== 'undefined') {
      localStorage.setItem('orm.receptionTheatre', name);
    }
  };

  // Roles allowed to run the scrub-nurse workflow (receive / complete / clean).
  const NURSE_ROLES = ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'];
  const FULL_ACCESS = [
    'ADMIN',
    'SYSTEM_ADMINISTRATOR',
    'THEATRE_MANAGER',
    'THEATRE_CHAIRMAN',
  ];
  const canRunWorkflow =
    !userRole || NURSE_ROLES.includes(userRole) || FULL_ACCESS.includes(userRole);

  // Per-case local selections
  const [porterSel, setPorterSel] = useState<Record<string, string[]>>({});
  const [cleanerSel, setCleanerSel] = useState<Record<string, string[]>>({});

  const showToast = (text: string, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/theatre-reception', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setCases(data.cases || []);
      setPorters(data.porters || []);
      setCleaners(data.cleaners || []);
      if (data.userRole) setUserRole(data.userRole);
    } catch (e) {
      showToast('Could not load cases', false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000); // keep flow state fresh
    return () => clearInterval(t);
  }, [load]);

  const post = async (payload: Record<string, unknown>, surgeryId: string) => {
    setBusyId(surgeryId);
    try {
      const res = await fetch('/api/theatre-reception', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      showToast(data.message || 'Done', true);
      await load();
    } catch (e: any) {
      showToast(e.message || 'Action failed', false);
    } finally {
      setBusyId(null);
    }
  };

  const toggleSel = (
    map: Record<string, string[]>,
    setMap: (v: Record<string, string[]>) => void,
    surgeryId: string,
    id: string,
  ) => {
    const cur = map[surgeryId] || [];
    const next = cur.includes(id)
      ? cur.filter((x) => x !== id)
      : [...cur, id];
    setMap({ ...map, [surgeryId]: next });
  };

  const namesFor = (opts: StaffOption[], ids: string[]) =>
    opts.filter((o) => ids.includes(o.id)).map((o) => o.fullName);

  const handleReceive = (c: CaseItem) => {
    const ids = porterSel[c.surgeryId] || [];
    post(
      {
        action: 'receive',
        surgeryId: c.surgeryId,
        theatreId: c.theatreId,
        theatreName: c.theatreName,
        porterIds: ids,
        porterNames: namesFor(porters, ids),
      },
      c.surgeryId,
    );
  };

  const handleCleanersStarted = (c: CaseItem) => {
    const ids = cleanerSel[c.surgeryId] || [];
    if (ids.length === 0) {
      showToast('Select at least one cleaner', false);
      return;
    }
    post(
      {
        action: 'cleaners-started',
        surgeryId: c.surgeryId,
        theatreName: c.theatreName,
        cleanerIds: ids,
        cleanerNames: namesFor(cleaners, ids),
      },
      c.surgeryId,
    );
  };

  const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  // Distinct theatres present in today's list, for the theatre picker.
  const theatreOptions = Array.from(
    new Set(cases.map((c) => c.theatreName).filter(Boolean)),
  ).sort();
  const visibleCases = theatreFilter
    ? cases.filter((c) => c.theatreName === theatreFilter)
    : cases;

  // Role-appropriate "perform your duty" links for a case.
  const dutyLinks = (surgeryId: string) => {
    const base = `/dashboard/surgeries/${surgeryId}`;
    const links: { href: string; label: string; icon: any }[] = [];
    const isAnaesthetist =
      userRole === 'ANAESTHETIST' || userRole === 'CONSULTANT_ANAESTHETIST';
    const isSurgeon = userRole === 'SURGEON';
    const isNurse = NURSE_ROLES.includes(userRole);
    const all = !userRole || FULL_ACCESS.includes(userRole);

    if (all || isNurse) {
      links.push({ href: `${base}/count`, label: 'Surgical Count', icon: ListChecks });
      links.push({ href: `${base}/timing`, label: 'Surgical Timing', icon: Timer });
    }
    if (all || isAnaesthetist) {
      links.push({ href: `${base}/anesthesia`, label: 'Anaesthesia', icon: Stethoscope });
    }
    if (all || isSurgeon) {
      links.push({ href: `${base}/post-op-notes`, label: 'Operation Notes', icon: FileText });
    }
    if (all || isSurgeon || isAnaesthetist) {
      links.push({ href: `${base}/post-op-prescription`, label: 'Post-op Rx', icon: Pill });
    }
    return links;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading theatre cases…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-7 h-7 text-emerald-600" />
            Theatre Reception &amp; Workflow
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Receive patients from the holding area, run the case, and manage
            between-case cleaning.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Theatre selector — show only the cases for your theatre */}
      <div className="mb-5 flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <Building2 className="w-4 h-4 text-emerald-600" /> Theatre:
        </span>
        <button
          onClick={() => selectTheatre('')}
          className={`text-sm px-3 py-1.5 rounded-lg border ${
            theatreFilter === ''
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400'
          }`}
        >
          All
        </button>
        {theatreOptions.map((t) => (
          <button
            key={t}
            onClick={() => selectTheatre(t)}
            className={`text-sm px-3 py-1.5 rounded-lg border ${
              theatreFilter === t
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm text-white ${
            toast.ok ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.text}
        </div>
      )}

      {visibleCases.length === 0 ? (
        <div className="text-center py-16 text-gray-500 bg-white rounded-xl border border-gray-200">
          {theatreFilter
            ? `No cases for ${theatreFilter} today.`
            : 'No cases scheduled for today.'}
        </div>
      ) : (
        <div className="space-y-5">
          {visibleCases.map((c) => {
            const f = c.flow;
            const received = f?.patientReceived;
            const surgeryDone = f?.surgeryCompleted;
            const cleaningCalled = f?.cleaningCalled;
            const cleanersStarted = f?.cleanersStarted;
            const cleaningDone = f?.cleaningCompleted;
            const busy = busyId === c.surgeryId;

            return (
              <div
                key={c.surgeryId}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                {/* Header / patient cross-check */}
                <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-white">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-gray-900">
                          {c.patient?.name || 'Unknown patient'}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                          {c.theatreName}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
                        <span>
                          <span className="text-gray-400">Folder:</span>{' '}
                          {c.patient?.folderNumber || '—'}
                        </span>
                        <span>
                          <span className="text-gray-400">Age/Sex:</span>{' '}
                          {c.patient?.age ?? '—'}/{c.patient?.gender || '—'}
                        </span>
                        <span>
                          <span className="text-gray-400">Ward:</span>{' '}
                          {c.patient?.ward || '—'}
                        </span>
                        <span>
                          <span className="text-gray-400">Time:</span>{' '}
                          {c.scheduledTime || '—'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 mt-1">
                        <span className="text-gray-400">Procedure:</span>{' '}
                        {c.procedureName}
                        {c.surgeonName ? (
                          <span className="text-gray-400">
                            {' '}
                            • {c.surgeonName}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        c.status === 'COMPLETED'
                          ? 'bg-gray-100 text-gray-600'
                          : c.status === 'IN_PROGRESS'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {c.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* Step 1: Receive patient */}
                  {!received && canRunWorkflow ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-center gap-2 text-amber-800 font-medium mb-2">
                        <UserCheck className="w-4 h-4" /> Step 1 — Receive patient
                        from holding area
                      </div>
                      <p className="text-xs text-gray-600 mb-2">
                        Cross-check the patient details above, then select the
                        porter(s) who brought the patient and confirm receipt.
                      </p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {porters.length === 0 ? (
                          <span className="text-xs text-gray-500">
                            No porters available.
                          </span>
                        ) : (
                          porters.map((p) => {
                            const sel = (
                              porterSel[c.surgeryId] || []
                            ).includes(p.id);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() =>
                                  toggleSel(
                                    porterSel,
                                    setPorterSel,
                                    c.surgeryId,
                                    p.id,
                                  )
                                }
                                className={`text-xs px-2.5 py-1 rounded-full border ${
                                  sel
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400'
                                }`}
                              >
                                {p.fullName}
                              </button>
                            );
                          })
                        )}
                      </div>
                      <button
                        onClick={() => handleReceive(c)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Radio className="w-4 h-4" /> Receive Patient &amp;
                        Announce
                      </button>
                    </div>
                  ) : received ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" /> Patient received
                      {f?.porterNames?.length
                        ? ` (from ${f.porterNames.join(', ')})`
                        : ''}{' '}
                      <span className="text-gray-400">
                        · {fmtTime(f?.patientReceivedAt || null)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Clock className="w-4 h-4" /> Awaiting reception by the scrub
                      nurse.
                    </div>
                  )}

                  {/* Step 2: Intra-op roles + complete */}
                  {received && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <div className="flex items-center gap-2 text-blue-800 font-medium mb-2">
                        <ListChecks className="w-4 h-4" /> Step 2 — Perform your
                        duties
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {dutyLinks(c.surgeryId).map((l) => {
                          const Icon = l.icon;
                          return (
                            <a
                              key={l.href}
                              href={l.href}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-100"
                            >
                              <Icon className="w-3.5 h-3.5" /> {l.label}
                            </a>
                          );
                        })}
                      </div>
                      {!surgeryDone ? (
                        canRunWorkflow ? (
                          <button
                            onClick={() =>
                              post(
                                {
                                  action: 'complete-surgery',
                                  surgeryId: c.surgeryId,
                                  theatreName: c.theatreName,
                                },
                                c.surgeryId,
                              )
                            }
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Mark Surgery
                            Completed
                          </button>
                        ) : null
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                          <CheckCircle2 className="w-4 h-4" /> Surgery completed
                          <span className="text-gray-400">
                            · {fmtTime(f?.surgeryCompletedAt || null)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 3: Between-case cleaning */}
                  {surgeryDone && canRunWorkflow && (
                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                      <div className="flex items-center gap-2 text-purple-800 font-medium mb-2">
                        <Sparkles className="w-4 h-4" /> Step 3 — Between-case
                        cleaning
                      </div>

                      {!cleaningCalled && (
                        <button
                          onClick={() =>
                            post(
                              {
                                action: 'call-cleaners',
                                surgeryId: c.surgeryId,
                                theatreId: c.theatreId,
                                theatreName: c.theatreName,
                              },
                              c.surgeryId,
                            )
                          }
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60"
                        >
                          <Radio className="w-4 h-4" /> Call Cleaners
                        </button>
                      )}

                      {cleaningCalled && !cleanersStarted && (
                        <div>
                          <div className="flex items-center gap-2 text-xs text-purple-700 mb-2">
                            <Clock className="w-3.5 h-3.5 animate-pulse" />
                            Announcing every 3 minutes until acknowledged —
                            select the cleaners once they arrive.
                          </div>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {cleaners.length === 0 ? (
                              <span className="text-xs text-gray-500">
                                No cleaners available.
                              </span>
                            ) : (
                              cleaners.map((cl) => {
                                const sel = (
                                  cleanerSel[c.surgeryId] || []
                                ).includes(cl.id);
                                return (
                                  <button
                                    key={cl.id}
                                    type="button"
                                    onClick={() =>
                                      toggleSel(
                                        cleanerSel,
                                        setCleanerSel,
                                        c.surgeryId,
                                        cl.id,
                                      )
                                    }
                                    className={`text-xs px-2.5 py-1 rounded-full border ${
                                      sel
                                        ? 'bg-purple-600 text-white border-purple-600'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400'
                                    }`}
                                  >
                                    {cl.fullName}
                                  </button>
                                );
                              })
                            )}
                          </div>
                          <button
                            onClick={() => handleCleanersStarted(c)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60"
                          >
                            <Users className="w-4 h-4" /> Cleaners Started
                          </button>
                        </div>
                      )}

                      {cleanersStarted && !cleaningDone && (
                        <div>
                          <div className="flex items-center gap-2 text-sm text-purple-700 mb-2">
                            <Users className="w-4 h-4" /> Cleaning in progress
                            {f?.cleanerNames?.length
                              ? ` (${f.cleanerNames.join(', ')})`
                              : ''}
                          </div>
                          <button
                            onClick={() =>
                              post(
                                {
                                  action: 'cleaning-complete',
                                  surgeryId: c.surgeryId,
                                  theatreName: c.theatreName,
                                },
                                c.surgeryId,
                              )
                            }
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            <ArrowRight className="w-4 h-4" /> Cleaning Complete —
                            Send Next Patient
                          </button>
                        </div>
                      )}

                      {cleaningDone && (
                        <div className="flex items-center gap-2 text-sm text-emerald-700">
                          <CheckCircle2 className="w-4 h-4" /> Cleaning complete —
                          holding area notified
                          <span className="text-gray-400">
                            · {fmtTime(f?.cleaningCompletedAt || null)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
