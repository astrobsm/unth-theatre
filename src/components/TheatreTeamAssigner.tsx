'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

/**
 * Assign any number of people to a theatre-team role.
 *
 * One component for both screens — the unit list and the emergency board — so the
 * two cannot drift into behaving differently. It also decides which categories to
 * SHOW based on the signed-in role, so a surgeon is not presented with controls
 * that will be refused by the server, and an anaesthetic technician sees the one
 * category that is theirs.
 *
 * The server enforces the same rule. This only spares people a forbidden error.
 */

export type TeamRole =
  | 'SCRUB_NURSE' | 'CIRCULATING_NURSE'
  | 'CONSULTANT_ANAESTHETIST' | 'ANAESTHETIST' | 'ANAESTHETIC_TECHNICIAN';

const FLOOR_MANAGERS = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

const ASSIGNERS: Record<TeamRole, string[]> = {
  SCRUB_NURSE: ['NURSE_MANAGER', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'NURSE'],
  CIRCULATING_NURSE: ['NURSE_MANAGER', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'NURSE'],
  CONSULTANT_ANAESTHETIST: ['CONSULTANT_ANAESTHETIST', 'ANAESTHETIST'],
  ANAESTHETIST: ['CONSULTANT_ANAESTHETIST', 'ANAESTHETIST'],
  ANAESTHETIC_TECHNICIAN: ['ANAESTHETIC_TECHNICIAN', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIST'],
};

/** Which staff role fills each team role, for the person list. */
const STAFF_ROLE: Record<TeamRole, string[]> = {
  SCRUB_NURSE: ['SCRUB_NURSE', 'CIRCULATING_NURSE', 'NURSE'],
  CIRCULATING_NURSE: ['SCRUB_NURSE', 'CIRCULATING_NURSE', 'NURSE'],
  CONSULTANT_ANAESTHETIST: ['CONSULTANT_ANAESTHETIST'],
  ANAESTHETIST: ['ANAESTHETIST'],
  ANAESTHETIC_TECHNICIAN: ['ANAESTHETIC_TECHNICIAN'],
};

const LABEL: Record<TeamRole, string> = {
  SCRUB_NURSE: 'Scrub nurse',
  CIRCULATING_NURSE: 'Circulating nurse',
  CONSULTANT_ANAESTHETIST: 'Consultant anaesthetist',
  ANAESTHETIST: 'Anaesthetist',
  ANAESTHETIC_TECHNICIAN: 'Anaesthetic technician',
};

const ORDER: TeamRole[] = [
  'CONSULTANT_ANAESTHETIST', 'ANAESTHETIST', 'ANAESTHETIC_TECHNICIAN',
  'SCRUB_NURSE', 'CIRCULATING_NURSE',
];

interface Person { id: string; fullName: string }
interface Assigned {
  id: string; role: string; userId: string; userName: string;
  assignedByName?: string | null; assignedByRole?: string | null; assignedAt?: string;
}

export default function TheatreTeamAssigner(props: {
  /** Assign to specific cases… */
  surgeryIds?: string[];
  /** …or to a unit's whole list for a day. */
  unit?: string;
  date?: string;
  /** Read the current team from this case (a unit's list shares one team). */
  readFromSurgeryId?: string;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const { data: session } = useSession();
  const myRole = (session?.user as { role?: string } | undefined)?.role ?? '';

  const visibleRoles = useMemo(
    () => ORDER.filter((r) => FLOOR_MANAGERS.includes(myRole) || ASSIGNERS[r].includes(myRole)),
    [myRole]
  );

  const [people, setPeople] = useState<Record<string, Person[]>>({});
  const [current, setCurrent] = useState<Record<string, Assigned[]>>({});
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string>('');

  // One request per distinct staff role, de-duplicated: the nursing categories
  // share a pool and would otherwise be fetched twice.
  useEffect(() => {
    const needed = Array.from(new Set(visibleRoles.flatMap((r) => STAFF_ROLE[r])));
    if (needed.length === 0) return;
    Promise.all(
      needed.map((sr) =>
        fetch(`/api/users?role=${sr}&status=APPROVED`)
          .then((r) => (r.ok ? r.json() : []))
          .then((d) => [sr, Array.isArray(d) ? d : d?.users ?? []] as const)
          .catch(() => [sr, []] as const)
      )
    ).then((pairs) => {
      const byStaffRole: Record<string, Person[]> = {};
      for (const [sr, list] of pairs) {
        byStaffRole[sr] = (list as Person[]).filter((u) => u?.id);
      }
      const out: Record<string, Person[]> = {};
      for (const r of visibleRoles) {
        const seen = new Map<string, Person>();
        for (const sr of STAFF_ROLE[r]) for (const p of byStaffRole[sr] ?? []) seen.set(p.id, p);
        out[r] = Array.from(seen.values());
      }
      setPeople(out);
    });
  }, [visibleRoles]);

  const loadCurrent = useCallback(() => {
    const id = props.readFromSurgeryId ?? props.surgeryIds?.[0];
    if (!id) return;
    fetch(`/api/theatres/assign-team?surgeryId=${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCurrent(d?.team ?? {}))
      .catch(() => {});
  }, [props.readFromSurgeryId, props.surgeryIds]);

  useEffect(() => { loadCurrent(); }, [loadCurrent]);

  const assign = async (role: TeamRole) => {
    const userIds = picked[role] ?? [];
    if (userIds.length === 0) return;
    setBusy(role);
    setNote('');
    try {
      const res = await fetch('/api/theatres/assign-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role, userIds,
          ...(props.surgeryIds?.length ? { surgeryIds: props.surgeryIds } : {}),
          ...(props.unit ? { unit: props.unit, date: props.date } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      setNote(res.ok ? (body.message ?? 'Assigned.') : (body.error ?? 'Could not assign.'));
      if (res.ok) {
        setPicked((p) => ({ ...p, [role]: [] }));
        loadCurrent();
        props.onChanged?.();
      }
    } catch {
      setNote('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  if (visibleRoles.length === 0) {
    // Nothing is shown rather than a disabled panel: a surgeon does not assign
    // theatre staff, and offering greyed-out controls only invites the question.
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-600">
        Theatre team
        {!FLOOR_MANAGERS.includes(myRole) && (
          <span className="ml-2 font-normal normal-case text-gray-500">
            — you can assign your own service
          </span>
        )}
      </p>

      <div className={props.compact ? 'space-y-2' : 'grid gap-3 md:grid-cols-2'}>
        {visibleRoles.map((role) => {
          const assigned = current[role] ?? [];
          const options = people[role] ?? [];
          const chosen = picked[role] ?? [];
          return (
            <div key={role} className="rounded border border-gray-100 bg-gray-50 p-2">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-gray-800">{LABEL[role]}</span>
                <span className="text-[11px] text-gray-500">
                  {assigned.length === 0 ? 'none assigned' : `${assigned.length} assigned`}
                </span>
              </div>

              {/* Who is already on, and who put them there. The attribution is
                  shown rather than merely stored — that is the question people
                  actually ask about a rota. */}
              {assigned.length > 0 && (
                <ul className="mb-1 space-y-0.5">
                  {assigned.map((a) => (
                    <li key={a.id} className="text-[11px] text-gray-700">
                      <span className="font-medium">{a.userName}</span>
                      {a.assignedByName && (
                        <span className="text-gray-500"> · by {a.assignedByName}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Multi-select, because more than one person covers a category.
                  A native multiple select is used deliberately: it works on a
                  theatre tablet without a custom widget to learn. */}
              <select
                multiple
                value={chosen}
                onChange={(e) => setPicked((p) => ({
                  ...p,
                  [role]: Array.from(e.target.selectedOptions).map((o) => o.value),
                }))}
                aria-label={`Choose ${LABEL[role]}s`}
                size={Math.min(4, Math.max(2, options.length))}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
              >
                {options.map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
              <p className="mt-0.5 text-[10px] text-gray-500">
                Hold Ctrl (or tap several) to choose more than one.
              </p>

              <button
                type="button"
                onClick={() => assign(role)}
                disabled={chosen.length === 0 || busy === role}
                className="mt-1 w-full rounded bg-slate-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-slate-800 disabled:bg-gray-300"
              >
                {busy === role ? 'Assigning…' : `Add ${chosen.length || ''} ${LABEL[role].toLowerCase()}${chosen.length === 1 ? '' : 's'}`}
              </button>
            </div>
          );
        })}
      </div>

      {note && <p className="mt-2 text-xs font-medium text-gray-800">{note}</p>}
    </div>
  );
}
