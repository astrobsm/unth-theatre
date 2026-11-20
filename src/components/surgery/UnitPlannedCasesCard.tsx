'use client';

/**
 * What a unit is planning to operate, on the dashboard of the people who do it.
 *
 * Planned Cases has existed as a page since 18 November and these roles could
 * all reach it. Reaching it was the problem: it is one entry among forty in the
 * menu, and a surgeon who has to remember a screen exists in order to look at
 * it is a surgeon who looks at it the day a case is booked rather than the
 * fortnight before. The whole value of planning a fortnight out is that
 * somebody reads it earlier than that.
 *
 * ONE REQUEST, THEN INSTANT SWITCHING. The list is fetched once and filtered in
 * the browser, so moving between units costs nothing and a consultant covering
 * three of them can actually flick through all three. The units offered are the
 * ones that HAVE something planned -- the route already decides that, and a
 * dropdown listing every unit that has ever existed makes the reader hunt for
 * the three that matter.
 *
 * RENDERS NOTHING when the person is not one of these roles and nothing when
 * there is nothing planned anywhere, which is the convention every other card
 * on this dashboard follows. An empty panel every morning is a panel that stops
 * being read on the morning it is not empty.
 *
 * READ ONLY. Publishing a plan, editing one and withdrawing one all stay on the
 * page that owns them. This answers "what is my unit planning" and hands over
 * to /dashboard/surgery-drafts for everything that changes a plan.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { CalendarDays, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { missingForPublish, asDateInput, type ScheduleDraft } from '@/lib/surgeryDrafts/draft';

/**
 * Who sees this card.
 *
 * The five that were asked for, plus two that would otherwise be an
 * unpredictable gap: CONSULTANT_ANAESTHETIST, because an anaesthetist grade
 * that sees less than the grade below it is the kind of drift this codebase has
 * already been bitten by, and SYSTEM_ADMINISTRATOR, which travels with ADMIN
 * everywhere else in this system.
 *
 * Not a permission. /api/surgery-drafts is readable by anybody signed in, by
 * design -- the pharmacy and the pack provider depend on that. This list only
 * decides whose dashboard the card is worth the space on.
 */
const VIEW_ROLES = new Set([
  'SURGEON',
  'CONSULTANT_SURGEON',
  'ANAESTHETIST',
  'CONSULTANT_ANAESTHETIST',
  'HOUSE_OFFICER',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
]);

/** Where the chosen unit is remembered, so the card opens where it was left. */
const REMEMBERED_UNIT = 'orm.plannedCases.unit';

export default function UnitPlannedCasesCard() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? '';

  const [drafts, setDrafts] = useState<ScheduleDraft[]>([]);
  const [unit, setUnit] = useState('');
  const [loaded, setLoaded] = useState(false);

  const mayView = VIEW_ROLES.has(role.toUpperCase());

  const load = useCallback(async () => {
    try {
      // Still planned only. A published plan is a booked case and lives on the
      // theatre list, where this reader already looks; repeating it here would
      // make the card a second, staler copy of the list.
      const res = await fetch('/api/surgery-drafts?status=DRAFT', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setDrafts(Array.isArray(data?.drafts) ? data.drafts : []);
    } catch {
      /* additive card: a failure here must not disturb the dashboard */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !mayView) return;
    void load();
  }, [status, mayView, load]);

  /** Units with something planned, each with its count. */
  const units = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of drafts) {
      const key = (d.unit || '').trim() || 'No unit named';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [drafts]);

  // Open on the unit this person last looked at. A consultant covering one unit
  // should not pick it from a dropdown every morning.
  useEffect(() => {
    if (!loaded || unit || units.length === 0) return;
    let remembered = '';
    try {
      remembered = window.localStorage.getItem(REMEMBERED_UNIT) ?? '';
    } catch {
      /* private window, or storage blocked. The first unit is a fine default. */
    }
    setUnit(units.some((u) => u.name === remembered) ? remembered : units[0].name);
  }, [loaded, unit, units]);

  const chooseUnit = (name: string) => {
    setUnit(name);
    try {
      window.localStorage.setItem(REMEMBERED_UNIT, name);
    } catch {
      /* remembering is a convenience, not a requirement */
    }
  };

  const shown = useMemo(() => {
    const time = (v: string | Date | null | undefined) => {
      if (!v) return Number.POSITIVE_INFINITY;
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };
    return drafts
      .filter((d) => ((d.unit || '').trim() || 'No unit named') === unit)
      .slice()
      .sort((a, b) => time(a.targetDate) - time(b.targetDate)
        || (a.procedureName || '').localeCompare(b.procedureName || ''));
  }, [drafts, unit]);

  if (status !== 'authenticated' || !mayView) return null;
  // Nothing planned anywhere. A permanent empty panel is a panel nobody reads
  // on the morning it fills up.
  if (loaded && drafts.length === 0) return null;
  if (!loaded) return null;

  return (
    <div className="card border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-3 rounded-lg flex-shrink-0">
            <CalendarDays className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Planned cases by unit</h2>
            <p className="text-sm text-gray-600">
              What each unit intends to operate, before it is booked.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/surgery-drafts"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
        >
          Open full page <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="planned-unit">
        Surgical unit
      </label>
      <select
        id="planned-unit"
        value={unit}
        onChange={(e) => chooseUnit(e.target.value)}
        className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
      >
        {units.map((u) => (
          <option key={u.name} value={u.name}>
            {u.name} ({u.count})
          </option>
        ))}
      </select>

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Nothing planned for this unit.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shown.map((d) => {
            const missing = missingForPublish(d);
            const needs = [
              d.anesthesiaType ? d.anesthesiaType.replace(/_/g, ' ').toLowerCase() : null,
              d.needBloodTransfusion ? (d.bloodUnits ? `blood × ${d.bloodUnits}` : 'blood') : null,
              d.needDiathermy ? 'diathermy' : null,
              d.needStereo ? 'stereo' : null,
              d.needMontrellMattress ? 'Montrell mattress' : null,
              d.isDayCase ? 'day case' : null,
            ].filter(Boolean);

            return (
              <li key={d.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{d.procedureName}</p>
                    <p className="text-sm text-gray-600">
                      {d.patientName || 'No patient named'}
                      {d.patientFolderNumber ? ` · ${d.patientFolderNumber}` : ''}
                      {d.surgeonName ? ` · ${d.surgeonName}` : ''}
                    </p>
                    <p className="text-xs text-gray-500">
                      {d.targetDate ? `aiming for ${asDateInput(d.targetDate)}` : 'no date yet'}
                      {d.preferredTime ? ` at ${d.preferredTime}` : ''}
                      {d.priority === 'HIGH' ? ' · high priority' : ''}
                    </p>
                    {/* What the unit asked to have ready. The anaesthetist
                        reading this card is reading it for exactly this line. */}
                    {needs.length > 0 && (
                      <p className="text-xs text-gray-700 mt-1">
                        <span className="font-medium">Needs:</span> {needs.join(' · ')}
                      </p>
                    )}
                  </div>
                  {missing.length > 0 ? (
                    <span
                      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                      title={missing.map((m) => m.say).join(' ')}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Not ready
                    </span>
                  ) : (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ready to publish
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
