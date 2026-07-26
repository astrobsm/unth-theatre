'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Package,
  Pill,
  Syringe,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Phone,
  ClipboardList,
  ArrowLeft,
  Send,
  User as UserIcon,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { whatsappLink, whatsappChatLink } from '@/lib/whatsapp';

// Local-timezone-safe YYYY-MM-DD for the date input (matches other dashboard pages).
function todayInputValue() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

type Contact = { name: string; phone: string | null; role?: string | null };
type PackSummary = {
  prescribed: boolean;
  total: number;
  packedCount: number;
  ready: boolean;
  statusLabel: string;
};
type Flag = {
  id: string;
  severity: 'high' | 'medium';
  label: string;
  targets: Contact[];
  message: string;
};
type CaseRow = {
  id: string;
  patientName: string;
  folderNumber: string | null;
  procedureName: string;
  unit: string;
  subspecialty: string;
  location: string | null;
  scheduledTime: string;
  status: string;
  magnitude: string | null;
  consumable: PackSummary;
  pharmacy: PackSummary;
  anaesthesia: PackSummary;
  contacts: {
    consultant: Contact;
    bookedBy: Contact;
    anaesthetist: Contact;
    pharmacists: Contact[];
    consumableProviders: Contact[];
  };
  flags: Flag[];
  allReady: boolean;
};
type UnitLog = {
  unit: string;
  cases: number;
  consumablePrescribed: number;
  consumableReady: number;
  pharmacyPrescribed: number;
  pharmacyReady: number;
  anaesthesiaPrescribed: number;
  anaesthesiaReady: number;
  flagged: number;
};
type Board = {
  date: string;
  summary: { totalCases: number; ready: number; flagged: number };
  unitLog: UnitLog[];
  cases: CaseRow[];
};

function openWhatsApp(phone: string | null, message: string) {
  const url = whatsappLink(phone, message);
  if (!url) {
    alert('No phone number is on file for this contact.');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

// Human date (DD/MM/YYYY) from a YYYY-MM-DD string, without timezone drift.
function humanDate(isoDay: string) {
  const [y, m, d] = isoDay.split('-');
  return d && m && y ? `${d}/${m}/${y}` : isoDay;
}

// Consolidated summary of every flagged case. Opens WhatsApp WITHOUT a fixed
// number so the sender can pick the recipient (e.g. the theatre coordination
// group) — a single wa.me link cannot address multiple different people.
function buildBulkMessage(cases: CaseRow[], dateLabel: string, sender: string) {
  const flagged = cases.filter((c) => c.flags.length > 0);
  const lines = [
    `🏥 UNTH Theatre — Case Readiness Summary (${dateLabel})`,
    ``,
    `${flagged.length} case(s) need attention:`,
    ``,
  ];
  flagged.forEach((c, idx) => {
    lines.push(
      `${idx + 1}. ${c.patientName}${c.folderNumber ? ` (Folder ${c.folderNumber})` : ''} — ` +
        `${c.procedureName}, ${c.unit}, ${c.scheduledTime}`
    );
    c.flags.forEach((f) => lines.push(`   • ${f.label}`));
  });
  lines.push('', 'Kindly action promptly so the cases proceed as scheduled. Thank you.', sender);
  return lines.join('\n');
}

// Colored pill describing a pack's readiness.
function PackPill({ label, pack }: { label: string; pack: PackSummary }) {
  let cls = 'bg-gray-100 text-gray-600';
  let text = 'Not prescribed';
  if (pack.prescribed) {
    if (pack.ready) {
      cls = 'bg-green-100 text-green-800';
      text = `Ready (${pack.packedCount}/${pack.total})`;
    } else if (pack.statusLabel === 'PACKING') {
      cls = 'bg-amber-100 text-amber-800';
      text = `Packing (${pack.packedCount}/${pack.total})`;
    } else {
      cls = 'bg-red-100 text-red-800';
      text = `Prescribed, not packed (0/${pack.total})`;
    }
  } else {
    cls = 'bg-red-100 text-red-800';
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      {label}: {text}
    </span>
  );
}

// A contact chip that opens a plain WhatsApp chat (or falls back to a phone call).
function ContactChip({ role, contact }: { role: string; contact: Contact }) {
  const link = whatsappChatLink(contact.phone);
  const href = link || (contact.phone ? `tel:${contact.phone.replace(/\s+/g, '')}` : undefined);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <UserIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-gray-400">{role}</div>
        <div className="truncate text-sm font-medium text-gray-800">{contact.name}</div>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex-shrink-0 text-green-600 hover:text-green-700"
          title={`Message ${contact.name} on WhatsApp`}
        >
          {link ? <MessageCircle className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
        </a>
      ) : (
        <span className="ml-auto flex-shrink-0 text-[11px] text-gray-400">no phone</span>
      )}
    </div>
  );
}

export default function CaseReadinessPage() {
  const { data: session } = useSession();
  const [selectedDate, setSelectedDate] = useState(todayInputValue);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [unitFilter, setUnitFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnitFilter(null); // a new date's cases may not include the previously picked unit
    try {
      const res = await fetch(`/api/surgery-readiness?date=${selectedDate}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = (await res.json()) as Board;
      setBoard(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleCases = useMemo(() => {
    if (!board) return [];
    return board.cases.filter(
      (c) => (!onlyFlagged || c.flags.length > 0) && (!unitFilter || c.unit === unitFilter)
    );
  }, [board, onlyFlagged, unitFilter]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link href="/dashboard" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <ClipboardList className="h-7 w-7 text-blue-600" />
            Case Pack Readiness
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Booked cases for the selected date — consumable &amp; pharmacy pack status, key contacts, and one-tap
            WhatsApp for anything that needs fixing.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col text-xs font-medium text-gray-500">
            <span className="mb-1 flex items-center gap-1">
              <CalendarDays className="h-4 w-4" /> Date
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || todayInputValue())}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <button
            onClick={load}
            className="flex h-[38px] items-center gap-1 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary */}
      {board && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{board.summary.totalCases}</div>
            <div className="text-xs text-gray-500">Cases booked</div>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{board.summary.ready}</div>
            <div className="text-xs text-green-700">Fully ready</div>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <div className="text-2xl font-bold text-red-700">{board.summary.flagged}</div>
            <div className="text-xs text-red-700">Need attention</div>
          </div>
        </div>
      )}

      {/* Per-unit log */}
      {board && board.unitLog.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
            Unit log — packs prescribed &amp; packed
            <span className="ml-2 font-normal text-xs text-gray-400">tap a row to show only that unit</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2">Unit</th>
                  <th className="px-3 py-2 text-center">Cases</th>
                  <th className="px-3 py-2 text-center">Consumable Rx</th>
                  <th className="px-3 py-2 text-center">Consumable ready</th>
                  <th className="px-3 py-2 text-center">Pharmacy Rx</th>
                  <th className="px-3 py-2 text-center">Pharmacy ready</th>
                  <th className="px-3 py-2 text-center">Anaesthesia Rx</th>
                  <th className="px-3 py-2 text-center">Anaesthesia ready</th>
                  <th className="px-3 py-2 text-center">Flagged</th>
                </tr>
              </thead>
              <tbody>
                {board.unitLog.map((u) => (
                  <tr
                    key={u.unit}
                    onClick={() => setUnitFilter((prev) => (prev === u.unit ? null : u.unit))}
                    className={`cursor-pointer border-t border-gray-100 transition-colors ${
                      unitFilter === u.unit ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {unitFilter === u.unit && <span className="mr-1 text-blue-600">▸</span>}
                      {u.unit}
                    </td>
                    <td className="px-3 py-2 text-center">{u.cases}</td>
                    <td className="px-3 py-2 text-center">{u.consumablePrescribed}/{u.cases}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={u.consumableReady === u.cases ? 'text-green-700' : 'text-amber-700'}>
                        {u.consumableReady}/{u.cases}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">{u.pharmacyPrescribed}/{u.cases}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={u.pharmacyReady === u.cases ? 'text-green-700' : 'text-amber-700'}>
                        {u.pharmacyReady}/{u.cases}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">{u.anaesthesiaPrescribed}/{u.cases}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={u.anaesthesiaReady === u.cases ? 'text-green-700' : 'text-amber-700'}>
                        {u.anaesthesiaReady}/{u.cases}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {u.flagged > 0 ? (
                        <span className="font-semibold text-red-700">{u.flagged}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter toggle + bulk WhatsApp */}
      {board && board.cases.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
              Show only cases needing attention
            </label>
            {unitFilter && (
              <button
                onClick={() => setUnitFilter(null)}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 hover:bg-blue-200"
                title="Clear unit filter"
              >
                Unit: {unitFilter} <span className="text-blue-500">✕</span>
              </button>
            )}
          </div>
          {board.summary.flagged > 0 && (
            <button
              onClick={() => {
                const sender = `— ${session?.user?.name || 'Theatre Coordinator'}, UNTH Theatre (ORM)`;
                const msg = buildBulkMessage(board.cases, humanDate(board.date), sender);
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
              title="Open WhatsApp with a summary of all flagged cases — pick the recipient or group"
            >
              <Send className="h-4 w-4" />
              WhatsApp all flagged ({board.summary.flagged})
            </button>
          )}
        </div>
      )}

      {/* States */}
      {loading && !board && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading cases…
        </div>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {board && visibleCases.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center text-gray-500">
          {board.cases.length === 0 ? 'No cases booked for this date.' : 'No cases need attention. 🎉'}
        </div>
      )}

      {/* Case cards */}
      <div className="space-y-4">
        {visibleCases.map((c) => (
          <div
            key={c.id}
            className={`rounded-xl border bg-white p-4 shadow-sm ${
              c.flags.length ? 'border-red-200' : 'border-green-200'
            }`}
          >
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-gray-900">{c.patientName}</span>
                  {c.folderNumber && <span className="text-xs text-gray-400">#{c.folderNumber}</span>}
                  {c.allReady ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div className="mt-0.5 text-sm text-gray-600">
                  {c.procedureName} · <span className="font-medium">{c.unit}</span>
                  {c.location ? ` · ${c.location}` : ''} · {c.scheduledTime}
                  {c.magnitude ? ` · ${c.magnitude}` : ''}
                </div>
              </div>
            </div>

            {/* Pack pills */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-gray-400">
                <Package className="h-4 w-4" />
              </span>
              <PackPill label="Consumable" pack={c.consumable} />
              <span className="inline-flex items-center gap-1 text-gray-400">
                <Pill className="h-4 w-4" />
              </span>
              <PackPill label="Pharmacy" pack={c.pharmacy} />
              <span className="inline-flex items-center gap-1 text-gray-400">
                <Syringe className="h-4 w-4" />
              </span>
              <PackPill label="Anaesthesia" pack={c.anaesthesia} />
            </div>

            {/* Contacts */}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <ContactChip role="Consultant" contact={c.contacts.consultant} />
              <ContactChip role="Booked by" contact={c.contacts.bookedBy} />
              <ContactChip role="Anaesthetist" contact={c.contacts.anaesthetist} />
              {c.contacts.pharmacists[0] && <ContactChip role="Pharmacist" contact={c.contacts.pharmacists[0]} />}
              {c.contacts.consumableProviders[0] && (
                <ContactChip role="Consumable provider" contact={c.contacts.consumableProviders[0]} />
              )}
            </div>

            {/* Flags + WhatsApp actions */}
            {c.flags.length > 0 && (
              <div className="mt-4 space-y-2 rounded-lg border border-red-100 bg-red-50 p-3">
                {c.flags.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-red-800">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      {f.label}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {f.targets.length === 0 && (
                        <span className="text-xs text-gray-500">no contact phone on file</span>
                      )}
                      {f.targets.map((t, i) => (
                        <button
                          key={`${f.id}-${i}`}
                          onClick={() => openWhatsApp(t.phone, f.message)}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                          title={`Send a professional WhatsApp message to ${t.name}`}
                        >
                          <MessageCircle className="h-4 w-4" />
                          WhatsApp {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
