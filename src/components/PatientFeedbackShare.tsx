'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users, Search, Loader2, X, Copy, Check, MessageCircle, Send } from 'lucide-react';
import { whatsappChatLink } from '@/lib/whatsapp';

interface Patient {
  id: string;
  name: string;
  folderNumber?: string | null;
  phoneNumber?: string | null;
  caregiverName?: string | null;
  caregiverPhone?: string | null;
}

// Builds the very short public feedback link shared with patients.
function buildPatientLink(origin: string): string {
  return `${origin}/f`;
}

function buildMessage(origin: string, p: Patient): string {
  const link = buildPatientLink(origin);
  return (
    `University of Nigeria Teaching Hospital (UNTH) — Theatre Complex\n\n` +
    `Dear ${p.name || 'patient'},\n` +
    `Your honest feedback about your surgical journey helps us serve you and other ` +
    `patients better. It is anonymous unless you choose to share your details.\n\n` +
    `Share your experience here: ${link}`
  );
}

/**
 * A button + modal that lets staff (surgeons, nurses, admins, super admins)
 * pick patients and share each one a personalised feedback link via WhatsApp
 * or by copying the link.
 */
export default function PatientFeedbackShare() {
  const [open, setOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/patients', { cache: 'no-store' });
      if (!res.ok) {
        setError('Could not load patients.');
        return;
      }
      const data = await res.json();
      setPatients(Array.isArray(data) ? data : data.patients ?? []);
    } catch {
      setError('Could not load patients.');
    } finally {
      setLoading(false);
    }
  }

  function openModal() {
    setOpen(true);
    if (patients.length === 0) load();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        (p.folderNumber || '').toLowerCase().includes(q) ||
        (p.phoneNumber || '').includes(q)
    );
  }, [patients, search]);

  async function copyLink(p: Patient) {
    const link = buildPatientLink(origin);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId((c) => (c === p.id ? null : c)), 1500);
    } catch {
      window.prompt('Copy this feedback link:', link);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
      >
        <Users className="w-4 h-4" /> Share with patients
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center gap-2 border-b px-5 py-4">
              <Users className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-gray-900">Share feedback link with patients</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="ml-auto p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-5 py-3 border-b">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, folder number or phone…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                  aria-label="Search patients"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {loading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-6 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading patients…
                </div>
              ) : error ? (
                <div className="text-sm text-red-600 py-4">{error}</div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No matching patients.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filtered.map((p) => {
                    const waSelf = whatsappChatLink(p.phoneNumber, buildMessage(origin, p));
                    const waCaregiver = whatsappChatLink(
                      p.caregiverPhone,
                      buildMessage(origin, p)
                    );
                    return (
                      <li key={p.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{p.name}</div>
                            <div className="text-xs text-gray-500">
                              {p.folderNumber && <>Folder {p.folderNumber}</>}
                              {p.phoneNumber && <> · {p.phoneNumber}</>}
                            </div>
                            {p.caregiverName && p.caregiverPhone && (
                              <div className="text-xs text-gray-400">
                                Caregiver: {p.caregiverName} · {p.caregiverPhone}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => copyLink(p)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50"
                            >
                              {copiedId === p.id ? (
                                <Check className="w-3.5 h-3.5 text-green-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              {copiedId === p.id ? 'Copied' : 'Copy'}
                            </button>
                            {waSelf ? (
                              <a
                                href={waSelf}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                              </a>
                            ) : waCaregiver ? (
                              <a
                                href={waCaregiver}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                              </a>
                            ) : (
                              <span className="text-xs text-gray-300 px-2">No phone</span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between border-t px-5 py-3">
              <span className="text-xs text-gray-500">
                {filtered.length} patient{filtered.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                <Send className="w-4 h-4" /> Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
