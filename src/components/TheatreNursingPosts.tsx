'use client';

// ============================================================
// Staffing the theatre nursing posts for a day
// ------------------------------------------------------------
// The main-theatre emergency pair, the A/E theatre pair, and the nurse
// supervisors. Asked for on 7 November, with one reason running through all
// three: the emergency chase has been looking for these people since the day
// it was built and finding nobody, because there was nowhere in the
// application to name them.
//
// A POST OFFERS ONLY THE SHIFTS IT CAN BE FOUND ON. The shift list comes from
// the server's own catalogue rather than being retyped here, so the screen
// cannot offer a choice the resolver ignores. The main-theatre emergency posts
// have no "Morning" for that reason: an emergency never reads the morning
// roster, and a name written there would look staffed and be chased by
// nobody.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, ShieldCheck, Trash2, UserPlus, Stethoscope, Ambulance, Eye,
} from 'lucide-react';

interface Post {
  key: string;
  label: string;
  location: string;
  subRole: string;
  shifts: string[];
  why: string;
}

interface Entry {
  rosterId: string;
  userId: string;
  name: string;
  role: string;
  shift: string;
  subRole: string;
  location: string;
  notes: string | null;
  allocatedByName: string | null;
  allocatedAt: string | null;
}

interface StaffOption { id: string; fullName: string; role?: string }

/** Matches the server's PERIOPERATIVE_NURSE_ROLES. */
const NURSE_ROLES = ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'INFECTION_CONTROL_NURSE'];

const SHIFT_LABEL: Record<string, string> = {
  MORNING: 'Morning',
  CALL: 'Day call',
  NIGHT: 'Night',
};

const ICON: Record<string, typeof Stethoscope> = {
  MAIN_SCRUB: Stethoscope,
  MAIN_CIRCULATING: Stethoscope,
  AE_SCRUB: Ambulance,
  AE_CIRCULATING: Ambulance,
  SUPERVISOR: Eye,
};

export default function TheatreNursingPosts({
  date, canAllocate,
}: { date: string; canAllocate: boolean }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [staff, setStaff] = useState<Entry[]>([]);
  const [nurses, setNurses] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [postKey, setPostKey] = useState('MAIN_SCRUB');
  const [userId, setUserId] = useState('');
  const [shift, setShift] = useState('CALL');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const load = useCallback(async (forDate: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/theatre-nursing/staffing?date=${forDate}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(Array.isArray(data.posts) ? data.posts : []);
        setStaff(Array.isArray(data.staff) ? data.staff : []);
      }
    } catch {
      /* the section still draws; the day simply shows empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(date); }, [date, load]);

  // "From among the perioperative nurses", as asked. All three nurse registers,
  // because a picker that offers half of them sends the person filling it to
  // the telephone instead.
  useEffect(() => {
    (async () => {
      const lists = await Promise.all(NURSE_ROLES.map(async (role) => {
        try {
          const res = await fetch(`/api/users?role=${role}&status=APPROVED`);
          if (!res.ok) return [];
          const data = await res.json();
          return (Array.isArray(data) ? data : data.users || []) as StaffOption[];
        } catch { return []; }
      }));
      const seen = new Set<string>();
      const merged: StaffOption[] = [];
      lists.flat().forEach((u) => {
        if (u?.id && !seen.has(u.id)) { seen.add(u.id); merged.push(u); }
      });
      merged.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setNurses(merged);
    })();
  }, []);

  const current = posts.find((p) => p.key === postKey) ?? null;

  // Keep the chosen shift inside what the chosen post actually offers, so the
  // form cannot submit a combination the server is bound to refuse.
  useEffect(() => {
    if (current && !current.shifts.includes(shift)) setShift(current.shifts[0]);
  }, [current, shift]);

  const allocate = async () => {
    if (!userId) { setMessage({ tone: 'bad', text: 'Choose which nurse holds the post.' }); return; }
    setSaving(true); setMessage(null);
    try {
      const res = await fetch('/api/theatre-nursing/staffing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postKey, userId, shift, notes, date }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: 'bad', text: data.error || 'That could not be saved.' });
        return;
      }
      setMessage({
        tone: 'good',
        text: `${data.allocated?.staffName ?? 'Staff'} is on ${current?.label ?? 'the post'}.`,
      });
      setUserId(''); setNotes('');
      await load(date);
    } catch {
      setMessage({ tone: 'bad', text: 'That could not be saved — check the connection.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: Entry, label: string) => {
    if (!window.confirm(`Take ${e.name} off ${label} for the ${SHIFT_LABEL[e.shift] ?? e.shift} shift?`)) return;
    try {
      const res = await fetch(`/api/theatre-nursing/staffing?id=${encodeURIComponent(e.rosterId)}`, {
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

  /** The people on a post: matched on the same two fields the server writes. */
  const holders = (post: Post) => staff.filter(
    (s) => s.subRole === post.subRole
      && (post.subRole === 'SUPERVISING' || s.location === post.location),
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Theatre nursing posts</h2>
        <p className="text-sm text-gray-600">
          The emergency pair in the main theatre, the A/E theatre pair, and the
          nurse supervisors. Names put here are what the emergency chase reaches
          when a booked emergency has no theatre and nobody has acknowledged it,
          and they carry through to the surgery schedule, the theatre meal count
          and duty performance.
        </p>
      </div>

      {canAllocate && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <UserPlus className="h-5 w-5 text-emerald-600" /> Put a nurse on a post
          </h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="tnPost" className="mb-1 block text-sm font-semibold text-gray-800">Post</label>
              <select id="tnPost" name="tnPost" value={postKey}
                onChange={(e) => setPostKey(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm">
                {posts.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="tnNurse" className="mb-1 block text-sm font-semibold text-gray-800">Which nurse</label>
              <select id="tnNurse" name="tnNurse" value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm">
                <option value="">Select a perioperative nurse</option>
                {nurses.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="tnShift" className="mb-1 block text-sm font-semibold text-gray-800">Shift</label>
              <select id="tnShift" name="tnShift" value={shift}
                onChange={(e) => setShift(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm">
                {(current?.shifts ?? []).map((s) => (
                  <option key={s} value={s}>{SHIFT_LABEL[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tnNotes" className="mb-1 block text-sm font-semibold text-gray-800">
                Note <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <input id="tnNotes" name="tnNotes" value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. second room if needed"
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm" />
            </div>
          </div>

          {current && (
            <p className="mt-2 text-xs text-gray-600">{current.why}</p>
          )}

          <button type="button" onClick={allocate} disabled={saving}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Put on this post
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

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {posts.map((post) => {
            const rows = holders(post);
            const Icon = ICON[post.key] ?? Stethoscope;
            return (
              <section key={post.key} className="rounded-2xl border border-gray-200 bg-white p-4">
                <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <Icon className="h-5 w-5 text-gray-500" /> {post.label}
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {post.shifts.map((s) => SHIFT_LABEL[s] ?? s).join(' · ')}
                </p>

                {rows.length === 0 ? (
                  <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {/* Said as a consequence, not as an empty list. An unstaffed
                        post is the reason a chase reaches nobody. */}
                    Nobody is on this post today
                    {post.key === 'SUPERVISOR'
                      ? ' — the surgery schedule will show no supervisor.'
                      : ' — a chase for this post will reach nobody.'}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {rows.map((e) => (
                      <li key={e.rosterId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2">
                        <span className="min-w-0">
                          <span className="block font-semibold text-gray-900">{e.name}</span>
                          <span className="block text-xs text-gray-600">
                            {SHIFT_LABEL[e.shift] ?? e.shift} shift
                            {e.allocatedByName && (
                              <>
                                {' · '}
                                <ShieldCheck className="mr-0.5 inline h-3.5 w-3.5 text-gray-400" />
                                by {e.allocatedByName}
                              </>
                            )}
                          </span>
                          {e.notes && <span className="block text-xs text-gray-700">“{e.notes}”</span>}
                        </span>
                        {canAllocate && (
                          <button type="button" onClick={() => void remove(e, post.label)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
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
      )}
    </div>
  );
}
