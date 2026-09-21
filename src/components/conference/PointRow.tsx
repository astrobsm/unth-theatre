'use client';

// ============================================================
// One point, and the decision on it, side by side
// ------------------------------------------------------------
// The whole design of this screen is the pairing. A minute that records the
// proposals in one document and the resolutions in another forces every later
// reader to hold both open and match them up by number — and in practice they
// stop bothering, which is how a department comes to act on a decision without
// remembering what problem it was meant to solve.
//
// So the point as raised sits on the left, and what the room resolved about it
// sits immediately to its right, permanently. On a phone they stack, because
// the alternative is a table nobody can read; the pairing survives because the
// decision still comes directly under its own point.
//
// Nothing here writes as you type. A minute-taker in a live sitting needs to
// know exactly when something was committed, so each half saves on its own
// button and says so.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Check, ChevronDown, ChevronUp, Loader2, Trash2, Link2, AlertTriangle,
} from 'lucide-react';
import { AREA_LABEL, OUTCOME_LABEL } from '@/lib/audit/conference';

export interface PointDecision {
  outcome: string;
  decisionText: string;
  rationale?: string | null;
  ownerName?: string | null;
  dueDate?: string | null;
  dependsOnIssueIds?: string[];
  resourceImplication?: string | null;
  reviewOn?: string | null;
  referredTo?: string | null;
  recordedByName?: string | null;
  decidedAt?: string | null;
}

export interface Point {
  id: string;
  ordinal: number;
  title: string;
  area: string;
  background?: string | null;
  currentPractice?: string | null;
  proposal?: string | null;
  raisedByName?: string | null;
  decision?: PointDecision | null;
}

interface Props {
  point: Point;
  /** Every other point, for the "cannot start before" picker. */
  siblings: Array<{ id: string; ordinal: number; title: string }>;
  editable: boolean;
  /** Findings that named this point, so the trouble shows where the trouble is. */
  flags: Array<{ level: string; message: string }>;
  onSavePoint: (patch: Partial<Point>) => Promise<boolean>;
  onSaveDecision: (d: PointDecision) => Promise<boolean>;
  onWithdrawDecision: () => Promise<void>;
  onRemovePoint: () => Promise<void>;
  onMove: (dir: 'up' | 'down') => Promise<void>;
}

const OUTCOMES = Object.keys(OUTCOME_LABEL) as Array<keyof typeof OUTCOME_LABEL>;
const AREAS = Object.keys(AREA_LABEL) as Array<keyof typeof AREA_LABEL>;

const OUTCOME_TONE: Record<string, string> = {
  ADOPTED: 'bg-green-100 text-green-900 border-green-300',
  ADOPTED_WITH_MODIFICATION: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  REJECTED: 'bg-red-100 text-red-900 border-red-300',
  DEFERRED: 'bg-amber-100 text-amber-900 border-amber-300',
  REFERRED: 'bg-blue-100 text-blue-900 border-blue-300',
  NOTED: 'bg-gray-100 text-gray-800 border-gray-300',
};

const dateValue = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

/**
 * An empty decision.
 *
 * A factory rather than a shared constant: each row edits its own copy, and a
 * single object handed to every row would have them all typing into the same
 * draft.
 */
const blankDecision = (): PointDecision => ({
  outcome: 'ADOPTED', decisionText: '', rationale: '', ownerName: '',
  dueDate: '', dependsOnIssueIds: [], resourceImplication: '',
  reviewOn: '', referredTo: '',
});

export default function PointRow({
  point, siblings, editable, flags,
  onSavePoint, onSaveDecision, onWithdrawDecision, onRemovePoint, onMove,
}: Props) {
  const [open, setOpen] = useState(true);
  const [savingLeft, setSavingLeft] = useState(false);
  const [savingRight, setSavingRight] = useState(false);
  const [savedLeft, setSavedLeft] = useState(false);
  const [savedRight, setSavedRight] = useState(false);

  const [left, setLeft] = useState({
    title: point.title,
    area: point.area,
    background: point.background ?? '',
    currentPractice: point.currentPractice ?? '',
    proposal: point.proposal ?? '',
  });

  const [right, setRight] = useState<PointDecision>(point.decision ?? blankDecision());

  // Re-seeded when the server's copy changes underneath — another recorder in
  // the same sitting, or this row's own save coming back.
  useEffect(() => {
    setLeft({
      title: point.title,
      area: point.area,
      background: point.background ?? '',
      currentPractice: point.currentPractice ?? '',
      proposal: point.proposal ?? '',
    });
  }, [point.id, point.title, point.area, point.background, point.currentPractice, point.proposal]);

  useEffect(() => { setRight(point.decision ?? blankDecision()); }, [point.id, point.decision]);

  const leftDirty = useMemo(() => (
    left.title !== point.title
    || left.area !== point.area
    || left.background !== (point.background ?? '')
    || left.currentPractice !== (point.currentPractice ?? '')
    || left.proposal !== (point.proposal ?? '')
  ), [left, point]);

  const rightDirty = useMemo(() => {
    const d = point.decision;
    if (!d) return right.decisionText.trim().length > 0;
    return (
      right.outcome !== d.outcome
      || right.decisionText !== d.decisionText
      || (right.rationale ?? '') !== (d.rationale ?? '')
      || (right.ownerName ?? '') !== (d.ownerName ?? '')
      || dateValue(right.dueDate) !== dateValue(d.dueDate)
      || (right.resourceImplication ?? '') !== (d.resourceImplication ?? '')
      || dateValue(right.reviewOn) !== dateValue(d.reviewOn)
      || (right.referredTo ?? '') !== (d.referredTo ?? '')
      || JSON.stringify(right.dependsOnIssueIds ?? []) !== JSON.stringify(d.dependsOnIssueIds ?? [])
    );
  }, [right, point.decision]);

  const flash = (set: (v: boolean) => void) => {
    set(true);
    window.setTimeout(() => set(false), 2500);
  };

  const saveLeft = async () => {
    setSavingLeft(true);
    if (await onSavePoint(left)) flash(setSavedLeft);
    setSavingLeft(false);
  };

  const saveRight = async () => {
    setSavingRight(true);
    if (await onSaveDecision(right)) flash(setSavedRight);
    setSavingRight(false);
  };

  const toggleDep = (id: string) =>
    setRight((r) => {
      const cur = r.dependsOnIssueIds ?? [];
      return {
        ...r,
        dependsOnIssueIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
      };
    });

  const decided = !!point.decision;
  const blocking = flags.filter((f) => f.level === 'blocking');

  return (
    <div className={`overflow-hidden rounded-xl border-2 ${
      blocking.length ? 'border-red-300' : decided ? 'border-gray-200' : 'border-amber-200'
    }`}>
      {/* Heading strip, always visible, so a long agenda can be skimmed. */}
      <div className="flex flex-wrap items-center gap-2 bg-gray-50 px-3 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-800 text-sm font-bold text-white">
          {point.ordinal}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">{point.title}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-gray-300">
          {AREA_LABEL[left.area as keyof typeof AREA_LABEL] ?? 'Other'}
        </span>
        {decided ? (
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${OUTCOME_TONE[point.decision!.outcome] ?? ''}`}>
            {OUTCOME_LABEL[point.decision!.outcome as keyof typeof OUTCOME_LABEL]}
          </span>
        ) : (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900">
            No decision yet
          </span>
        )}
        {editable && (
          <span className="flex items-center gap-0.5">
            <button type="button" onClick={() => void onMove('up')} title="Move up" className="rounded p-1 hover:bg-gray-200">
              <ChevronUp className="h-4 w-4 text-gray-500" />
            </button>
            <button type="button" onClick={() => void onMove('down')} title="Move down" className="rounded p-1 hover:bg-gray-200">
              <ChevronDown className="h-4 w-4 text-gray-500" />
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
        >
          {open ? 'Collapse' : 'Open'}
        </button>
      </div>

      {/* What the analysis found about THIS point, shown here rather than only
          in a list at the bottom — a contradiction is most useful next to the
          thing that contradicts. */}
      {flags.length > 0 && (
        <ul className="space-y-1 border-b border-gray-200 bg-red-50/60 px-3 py-2">
          {flags.map((f, i) => (
            <li key={i} className={`flex items-start gap-1.5 text-xs ${
              f.level === 'blocking' ? 'text-red-800' : 'text-amber-800'
            }`}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {f.message}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="grid gap-0 md:grid-cols-2">
          {/* ── LEFT: the point as raised ── */}
          <div className="space-y-3 border-b border-gray-200 p-3 md:border-b-0 md:border-r">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              The point as raised
            </p>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Title</label>
              <input
                value={left.title}
                disabled={!editable}
                onChange={(e) => setLeft({ ...left, title: e.target.value })}
                className="w-full rounded-lg border-2 border-gray-300 px-2.5 py-2 text-sm disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Area</label>
              <select
                value={left.area}
                disabled={!editable}
                onChange={(e) => setLeft({ ...left, area: e.target.value })}
                className="w-full rounded-lg border-2 border-gray-300 px-2.5 py-2 text-sm disabled:bg-gray-50"
              >
                {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
              </select>
            </div>

            {/* Three boxes, not one. What happens now, what is proposed, and
                why it was raised are three different claims, and a committee
                that cannot see them apart argues about all three at once. */}
            {([
              ['background', 'Why it was raised'],
              ['currentPractice', 'What happens now'],
              ['proposal', 'What is proposed'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-semibold text-gray-700">{label}</label>
                <textarea
                  rows={3}
                  value={left[key]}
                  disabled={!editable}
                  onChange={(e) => setLeft({ ...left, [key]: e.target.value })}
                  className="w-full rounded-lg border-2 border-gray-300 px-2.5 py-2 text-sm disabled:bg-gray-50"
                />
              </div>
            ))}

            {point.raisedByName && (
              <p className="text-xs text-gray-500">Raised by {point.raisedByName}</p>
            )}

            {editable && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={saveLeft}
                  disabled={!leftDirty || savingLeft}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {savingLeft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save point
                </button>
                {savedLeft && <span className="text-xs font-medium text-green-700">Saved</span>}
                {!decided && (
                  <button
                    type="button"
                    onClick={() => void onRemovePoint()}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove point
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: what was decided ── */}
          <div className="space-y-3 bg-gray-50/60 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              The decision taken
            </p>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Outcome</label>
              <select
                value={right.outcome}
                disabled={!editable}
                onChange={(e) => setRight({ ...right, outcome: e.target.value })}
                className="w-full rounded-lg border-2 border-gray-300 px-2.5 py-2 text-sm disabled:bg-gray-100"
              >
                {OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                What was decided <span className="font-normal text-gray-500">— in the words that will be read out</span>
              </label>
              <textarea
                rows={3}
                value={right.decisionText}
                disabled={!editable}
                onChange={(e) => setRight({ ...right, decisionText: e.target.value })}
                placeholder="The elective list closes at 14:00 the day before."
                className="w-full rounded-lg border-2 border-gray-300 px-2.5 py-2 text-sm disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                Reason <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={right.rationale ?? ''}
                disabled={!editable}
                onChange={(e) => setRight({ ...right, rationale: e.target.value })}
                className="w-full rounded-lg border-2 border-gray-300 px-2.5 py-2 text-sm disabled:bg-gray-100"
              />
            </div>

            {/* Only where somebody has to do something. An owner and a date on
                a rejected point are a name against an action that does not
                exist. */}
            {['ADOPTED', 'ADOPTED_WITH_MODIFICATION'].includes(right.outcome) && (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-700">Who does it</label>
                    <input
                      value={right.ownerName ?? ''}
                      disabled={!editable}
                      onChange={(e) => setRight({ ...right, ownerName: e.target.value })}
                      placeholder="Name or post"
                      className="w-full rounded-lg border-2 border-gray-300 px-2.5 py-2 text-sm disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-700">By when</label>
                    <input
                      type="date"
                      value={dateValue(right.dueDate)}
                      disabled={!editable}
                      onChange={(e) => setRight({ ...right, dueDate: e.target.value })}
                      className="w-full rounded-lg border-2 border-gray-300 px-2.5 py-2 text-sm disabled:bg-gray-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">
                    What it needs <span className="font-normal text-gray-500">(staff, money, equipment, a room)</span>
                  </label>
                  <input
                    value={right.resourceImplication ?? ''}
                    disabled={!editable}
                    onChange={(e) => setRight({ ...right, resourceImplication: e.target.value })}
                    className="w-full rounded-lg border-2 border-gray-300 px-2.5 py-2 text-sm disabled:bg-gray-100"
                  />
                </div>

                {/* This is what lets the analysis order the resolution — and
                    what lets it notice a decision resting on one that was
                    turned down. */}
                {siblings.length > 0 && (
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-gray-700">
                      <Link2 className="h-3.5 w-3.5" /> Cannot start before
                    </label>
                    <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border-2 border-gray-200 bg-white p-2">
                      {siblings.map((s) => (
                        <label key={s.id} className="flex cursor-pointer items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            disabled={!editable}
                            checked={(right.dependsOnIssueIds ?? []).includes(s.id)}
                            onChange={() => toggleDep(s.id)}
                            className="mt-0.5 h-3.5 w-3.5 accent-gray-700"
                          />
                          <span className="text-gray-700">
                            <span className="font-semibold">{s.ordinal}.</span> {s.title}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* A deferral with no return date is how a point disappears. */}
            {right.outcome === 'DEFERRED' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Comes back on</label>
                <input
                  type="date"
                  value={dateValue(right.reviewOn)}
                  disabled={!editable}
                  onChange={(e) => setRight({ ...right, reviewOn: e.target.value })}
                  className="w-full rounded-lg border-2 border-gray-300 px-2.5 py-2 text-sm disabled:bg-gray-100"
                />
              </div>
            )}

            {right.outcome === 'REFERRED' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Referred to</label>
                <input
                  value={right.referredTo ?? ''}
                  disabled={!editable}
                  onChange={(e) => setRight({ ...right, referredTo: e.target.value })}
                  placeholder="e.g. Management board"
                  className="w-full rounded-lg border-2 border-gray-300 px-2.5 py-2 text-sm disabled:bg-gray-100"
                />
              </div>
            )}

            {editable && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={saveRight}
                  disabled={!rightDirty || savingRight || !right.decisionText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {savingRight ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {decided ? 'Amend decision' : 'Record decision'}
                </button>
                {savedRight && <span className="text-xs font-medium text-green-700">Saved</span>}
                {decided && (
                  <button
                    type="button"
                    onClick={() => void onWithdrawDecision()}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Withdraw
                  </button>
                )}
              </div>
            )}

            {point.decision?.recordedByName && (
              <p className="text-xs text-gray-500">
                Recorded by {point.decision.recordedByName}
                {point.decision.decidedAt
                  ? ` on ${new Date(point.decision.decidedAt).toLocaleDateString('en-GB')}`
                  : ''}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
