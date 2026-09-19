'use client';

// ============================================================
// Who is on the holding area today
// ------------------------------------------------------------
// The holding area had nobody named to it. It sat in the theatre list as
// though it were a theatre — which is a separate wrong thing, now fixed — but
// a room that is not a theatre still has staff in it. Patients wait there, are
// verified there, and are handed over from there, and "who was on the holding
// area on Tuesday morning" had no answer at all.
//
// Names go into the roster rather than into a table of this screen's own, so
// the on-duty board, the duty sheets and the meal count already know about
// them. A second list would have been a second answer to the same question.
//
// ACCOUNTABILITY CUTS BOTH WAYS, and that is the point. The record says who
// was on it, and equally who put them there.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ChevronLeft, Loader2, ShieldCheck, Trash2, UserPlus, Users,
} from 'lucide-react';

interface Allocation {
  id: string;
  userId: string;
  staffName: string;
  shift: string;
  notes: string | null;
  allocatedByName: string | null;
  allocatedAt: string;
}

interface StaffOption { id: string; fullName: string; role?: string }

const SHIFTS = [
  { value: 'MORNING', label: 'Morning' },
  { value: 'CALL', label: 'Call' },
  { value: 'NIGHT', label: 'Night' },
];

const MAY_ALLOCATE = [
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'INFECTION_CONTROL_NURSE',
  'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
];

export default function HoldingAreaStaffingPage() {
  const { data: session } = useSession();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [userId, setUserId] = useState('');
  const [shift, setShift] = useState('MORNING');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const canAllocate = MAY_ALLOCATE.includes((session?.user?.role ?? '').toUpperCase());

  const load = useCallback(async (forDate: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/holding-area/staffing?date=${forDate}`);
      if (res.ok) {
        const data = await res.json();
        setAllocations(Array.isArray(data.staff) ? data.staff : []);
      }
    } catch {
      /* the screen still draws; the day simply shows empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(date); }, [date, load]);

  // The people who staff a holding area: theatre nurses and recovery nurses.
  // Both registers, because the holding area is covered from whichever has
  // somebody free, and a picker that only offers half of them sends the person
  // filling it to the telephone instead.
  useEffect(() => {
    (async () => {
      const lists = await Promise.all(
        ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'].map(async (role) => {
          try {
            const res = await fetch(`/api/users?role=${role}&status=APPROVED`);
            if (!res.ok) return [];
            const data = await res.json();
            return (Array.isArray(data) ? data : data.users || []) as StaffOption[];
          } catch { return []; }
        }),
      );
      const seen = new Set<string>();
      const merged: StaffOption[] = [];
      lists.flat().forEach((u) => {
        if (u?.id && !seen.has(u.id)) { seen.add(u.id); merged.push(u); }
      });
      merged.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setStaff(merged);
    })();
  }, []);

  const allocate = async () => {
    if (!userId) {
      setMessage({ tone: 'bad', text: 'Choose who is on the holding area.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/holding-area/staffing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, shift, notes, date }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: 'bad', text: data.error || 'That could not be saved.' });
        return;
      }
      setMessage({ tone: 'good', text: `${data.allocated?.staffName ?? 'Staff'} is on the holding area.` });
      setUserId('');
      setNotes('');
      await load(date);
    } catch {
      setMessage({ tone: 'bad', text: 'That could not be saved — check the connection.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Allocation) => {
    if (!window.confirm(`Take ${row.staffName} off the holding area for this shift?`)) return;
    try {
      const res = await fetch(`/api/holding-area/staffing?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ tone: 'bad', text: data.error || 'That could not be removed.' });
        return;
      }
      await load(date);
    } catch {
      setMessage({ tone: 'bad', text: 'That could not be removed — check the connection.' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/holding-area" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" /> Holding area
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Holding area staffing</h1>
        <p className="text-gray-600">
          Who is on the holding area, by shift. The holding area is a waiting area, not a
          theatre — no operation happens in it — but patients are received, verified and
          handed over there, so it needs named staff.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="haDate" className="mb-1 block text-sm font-semibold text-gray-800">Day</label>
          <input
            id="haDate"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border-2 border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {canAllocate && (
        <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/50 p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <UserPlus className="h-5 w-5 text-blue-600" /> Put somebody on the holding area
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="haStaff" className="mb-1 block text-sm font-semibold text-gray-800">Who</label>
              <select
                id="haStaff"
                name="haStaff"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
              >
                <option value="">Select a member of staff</option>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="haShift" className="mb-1 block text-sm font-semibold text-gray-800">Shift</label>
              <select
                id="haShift"
                name="haShift"
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
              >
                {SHIFTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="haNotes" className="mb-1 block text-sm font-semibold text-gray-800">
                Note <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <input
                id="haNotes"
                name="haNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. covering until 12:00"
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={allocate}
            disabled={saving}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Allocate
          </button>
          {message && (
            <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${
              message.tone === 'good' ? 'bg-green-100 text-green-900' : 'bg-red-50 text-red-800'
            }`}>
              {message.text}
            </p>
          )}
        </div>
      )}

      {/* By shift, because that is how the floor is covered and how anybody
          reading this later will ask the question. */}
      {SHIFTS.map((s) => {
        const rows = allocations.filter((a) => a.shift === s.value);
        return (
          <section key={s.value}>
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Users className="h-5 w-5 text-gray-500" /> {s.label} shift
              <span className="text-sm font-normal text-gray-500">
                {rows.length} {rows.length === 1 ? 'person' : 'people'}
              </span>
            </h2>
            {loading ? (
              <p className="mt-2 text-sm text-gray-500">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="mt-2 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Nobody is named to the holding area for this shift.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {rows.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <span className="min-w-0">
                      <span className="block font-semibold text-gray-900">{a.staffName}</span>
                      <span className="block text-xs text-gray-600">
                        {/* Who put them there. A record that says only who was
                            on duty answers half the question. */}
                        <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-gray-400" />
                        Allocated by {a.allocatedByName ?? 'unknown'} on{' '}
                        {new Date(a.allocatedAt).toLocaleString([], {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      {a.notes && <span className="block text-xs text-gray-700">“{a.notes}”</span>}
                    </span>
                    {canAllocate && (
                      <button
                        type="button"
                        onClick={() => void remove(a)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" /> Take off
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
