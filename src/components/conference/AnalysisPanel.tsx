'use client';

// ============================================================
// The analysis, and the resolution it produces
// ------------------------------------------------------------
// What this section does, stated plainly on the screen itself: it reads every
// point and every decision, works out the order they can actually be carried
// out in, and reports what is missing or self-contradictory. It does not
// decide anything, it does not weigh the arguments, and it writes no decision
// the committee did not take.
//
// Saying that on the screen is not modesty. A committee that believes the
// machine has an opinion will defer to it, and the one thing a governance
// record must never contain is a resolution nobody in the room actually took.
// ============================================================

import { useState } from 'react';
import {
  AlertTriangle, ArrowRight, Check, ClipboardCopy, Info, ListOrdered, Printer,
} from 'lucide-react';

export interface Finding {
  level: 'blocking' | 'advisory';
  code: string;
  message: string;
  ordinals: number[];
}

export interface Analysis {
  findings: Finding[];
  blocking: Finding[];
  sequence: {
    steps: Array<{ issue: { id: string; ordinal: number; title: string }; phase: number; after: number[] }>;
    circular: Array<{ ordinal: number; title: string }>;
  };
  counts: {
    points: number; decided: number; adopted: number; rejected: number;
    deferred: number; referred: number; noted: number; withOwner: number; withDate: number;
  };
  readyToAdopt: boolean;
}

interface Props {
  analysis: Analysis;
  resolution: string;
  adopted: boolean;
  adoptedByName?: string | null;
  adoptedAt?: string | null;
  canAdopt: boolean;
  onAdopt: () => Promise<void>;
  adopting: boolean;
}

export default function AnalysisPanel({
  analysis, resolution, adopted, adoptedByName, adoptedAt, canAdopt, onAdopt, adopting,
}: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resolution);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* a clipboard refusal is not worth an error box; the text is on screen */
    }
  };

  const phases = Array.from(new Set(analysis.sequence.steps.map((s) => s.phase)))
    .sort((a, b) => a - b);

  const advisory = analysis.findings.filter((f) => f.level === 'advisory');

  return (
    <section className="space-y-5 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-4 sm:p-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <ListOrdered className="h-5 w-5 text-indigo-600" />
          AI analysis
        </h2>
        {/* The honest description, where the committee will read it. */}
        <p className="mt-1 text-sm text-gray-700">
          Reads every point and every decision above, works out the order they can be carried
          out in, and reports what is missing or contradicts something else.
          <strong className="font-semibold"> It decides nothing.</strong> Every line below
          restates something recorded in the room — the only thing added is the ordering.
        </p>
      </div>

      {/* ── The sitting in numbers ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {[
          ['Points', analysis.counts.points],
          ['Decided', analysis.counts.decided],
          ['Adopted', analysis.counts.adopted],
          ['Deferred', analysis.counts.deferred],
          ['Not adopted', analysis.counts.rejected],
          ['With an owner', analysis.counts.withOwner],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
            <p className="text-[11px] font-medium text-gray-600">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* ── What has to be settled first ── */}
      {analysis.blocking.length > 0 && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3">
          <h3 className="flex items-center gap-2 font-bold text-red-900">
            <AlertTriangle className="h-4 w-4" />
            {analysis.blocking.length} {analysis.blocking.length === 1 ? 'thing' : 'things'} the
            conference has to settle before this can be adopted
          </h3>
          <ul className="mt-2 space-y-1.5">
            {analysis.blocking.map((f, i) => (
              <li key={i} className="text-sm text-red-900">• {f.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Worth knowing, but not in the way ── */}
      {advisory.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <h3 className="flex items-center gap-2 font-semibold text-amber-900">
            <Info className="h-4 w-4" /> Worth noting
          </h3>
          <ul className="mt-2 space-y-1.5">
            {advisory.map((f, i) => (
              <li key={i} className="text-sm text-amber-900">• {f.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── The order it can be done in ── */}
      <div>
        <h3 className="font-bold text-gray-900">The order it can be carried out in</h3>
        {analysis.sequence.steps.length === 0 ? (
          <p className="mt-1 text-sm text-gray-600">
            Nothing adopted so far commits the department to an action.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {phases.map((ph) => (
              <div key={ph} className="rounded-xl bg-white p-3 ring-1 ring-gray-200">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
                  {phases.length > 1
                    ? `Stage ${ph}${ph === 1 ? ' — may begin immediately' : ` — once stage ${ph - 1} is complete`}`
                    : 'Agreed actions'}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {analysis.sequence.steps.filter((s) => s.phase === ph).map((s) => (
                    <li key={s.issue.id} className="flex items-start gap-2 text-sm">
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span>
                        <span className="font-medium text-gray-900">
                          Point {s.issue.ordinal} — {s.issue.title}
                        </span>
                        {s.after.length > 0 && (
                          <span className="text-gray-600">
                            {' '}(follows point{s.after.length > 1 ? 's' : ''} {s.after.join(', ')})
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {analysis.sequence.circular.length > 0 && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
            Points {analysis.sequence.circular.map((c) => c.ordinal).join(', ')} each wait on one
            another, so none of them can start. Which goes first is a decision, and this section
            does not make those — the conference has to say.
          </p>
        )}
      </div>

      {/* ── The resolution ── */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-gray-900">
            {adopted ? 'Resolution as adopted' : 'Draft resolution'}
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <ClipboardCopy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
          </div>
        </div>

        {adopted && (
          <p className="mt-1 text-sm font-medium text-green-800">
            Adopted{adoptedByName ? ` by ${adoptedByName}` : ''}
            {adoptedAt ? ` on ${new Date(adoptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
            {/* Why the text cannot move once adopted. */}
            {' '}This is the text as it stood at adoption and no longer changes with the points above.
          </p>
        )}

        <pre className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl bg-white p-4 font-sans text-sm leading-relaxed text-gray-900 ring-1 ring-gray-200">
{resolution}
        </pre>
      </div>

      {/* ── Adoption ── */}
      {!adopted && canAdopt && (
        <div className="rounded-xl border-2 border-gray-300 bg-white p-3">
          <p className="text-sm text-gray-700">
            Adopting seals this conference: the points and decisions stop being editable and the
            resolution above is stored word for word. Revisiting any of it then means convening a
            further sitting.
          </p>
          <button
            type="button"
            onClick={() => void onAdopt()}
            disabled={!analysis.readyToAdopt || adopting}
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-green-700 px-5 py-2.5 font-semibold text-white hover:bg-green-800 disabled:opacity-50"
            title={analysis.readyToAdopt ? undefined : 'Settle the blocking items above first'}
          >
            <Check className="h-4 w-4" />
            {adopting ? 'Adopting…' : 'Adopt this resolution'}
          </button>
          {!analysis.readyToAdopt && (
            <p className="mt-1.5 text-xs text-gray-600">
              {analysis.counts.points === 0
                ? 'There is nothing on the agenda yet.'
                : 'Settle the items listed in red first. Advisory notes do not stand in the way.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
