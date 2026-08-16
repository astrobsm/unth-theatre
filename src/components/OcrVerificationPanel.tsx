'use client';

import { useMemo, useState } from 'react';
import type { HighRiskCategory, ConfidenceBand } from '@/lib/ocr/confidence';

/**
 * Checking a scan before it becomes part of a record.
 *
 * The measured reason this exists: the best engine available reads 60.7% of
 * clinical numbers correctly on real African clinical handwriting, with seven
 * order-of-magnitude errors across forty-two documents. Four in ten numbers are
 * wrong. Text that good is genuinely useful as a first draft and genuinely
 * dangerous written straight into a record, and this screen is the whole
 * difference between the two.
 *
 * Three rules it enforces, none of which the caller can bypass:
 *
 *   - Every drug name, dose, unit, route, allergy, identifier and blood group
 *     must be confirmed against the original, WHATEVER the engine's confidence.
 *     A recogniser's confidence is a statement about pixels, not about medicine.
 *   - Nothing is auto-corrected. Alternatives are offered; the clinician
 *     chooses. Context may identify a candidate, it may never select one.
 *   - The original photograph stays on screen throughout, because the page is
 *     the source of truth and the transcription is not.
 */

export interface VerificationWord {
  text: string;
  confidence: number | null;
  band: ConfidenceBand;
  isUncertain: boolean;
  highRisk: HighRiskCategory[];
  reason: string | null;
  alternatives?: string[];
}

export interface OcrVerificationPanelProps {
  /** The photograph as taken. Never replaced by a processed version. */
  imageDataUrl: string;
  words: VerificationWord[];
  /** Whole-document text, used when there is no word detail to work with. */
  fallbackText?: string;
  onAccept: (verifiedText: string, summary: VerificationSummary) => void;
  onCancel: () => void;
  busy?: boolean;
}

export interface VerificationSummary {
  tokensReviewed: number;
  tokensCorrected: number;
  highRiskConfirmed: number;
  highRiskCategories: string[];
}

const RISK_WORDS: Record<HighRiskCategory, string> = {
  DRUG_NAME: 'drug name', DOSE: 'dose or number', UNIT: 'unit',
  ROUTE: 'route', FREQUENCY: 'frequency', ALLERGY: 'allergy',
  BLOOD_GROUP: 'blood group', PATIENT_IDENTIFIER: 'patient identifier',
  DIAGNOSIS: 'diagnosis', PROCEDURE: 'procedure', DATE_TIME: 'date or time',
  VITAL_SIGN: 'vital sign', LAB_VALUE: 'laboratory value',
  IMPLANT: 'implant', BLOOD_PRODUCT: 'blood product', CONSENT: 'consent',
};

export default function OcrVerificationPanel({
  imageDataUrl, words, fallbackText, onAccept, onCancel, busy = false,
}: OcrVerificationPanelProps) {
  const [corrections, setCorrections] = useState<Record<number, string>>({});
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);

  const textOf = (i: number) => corrections[i] ?? words[i].text;

  const highRiskIndexes = useMemo(
    () => words.map((w, i) => (w.highRisk.length ? i : -1)).filter((i) => i >= 0),
    [words],
  );
  const outstanding = highRiskIndexes.filter((i) => !confirmed.has(i));
  const canSave = outstanding.length === 0 && !busy;

  // No word detail: an engine that returned only text. Still editable, but the
  // interface must not pretend it has checked anything.
  if (words.length === 0) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-900">
          This scan came back without word-level detail, so nothing can be highlighted.
        </p>
        <p className="mt-1 text-sm text-amber-800">
          Read the whole transcription against the original before saving.
        </p>
        <textarea
          className="mt-3 h-48 w-full rounded border border-amber-300 p-2 font-mono text-sm"
          defaultValue={fallbackText ?? ''}
          id="ocr-fallback-text"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="rounded bg-slate-200 px-3 py-1.5 text-sm"
            onClick={onCancel}
          >
            Discard
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
            onClick={() => {
              const el = document.getElementById('ocr-fallback-text') as HTMLTextAreaElement | null;
              onAccept(el?.value ?? fallbackText ?? '', {
                tokensReviewed: 0, tokensCorrected: 0,
                highRiskConfirmed: 0, highRiskCategories: [],
              });
            }}
          >
            Use this text
          </button>
        </div>
      </div>
    );
  }

  const accept = () => {
    const verified = words.map((_, i) => textOf(i)).join(' ');
    const categories = Array.from(new Set(
      highRiskIndexes.flatMap((i) => words[i].highRisk as string[]),
    ));
    onAccept(verified, {
      tokensReviewed: words.length,
      tokensCorrected: Object.keys(corrections).length,
      highRiskConfirmed: confirmed.size,
      highRiskCategories: categories,
    });
  };

  const wordClass = (w: VerificationWord, i: number) => {
    const base = 'cursor-pointer rounded px-1 py-0.5 transition-colors ';
    if (w.highRisk.length) {
      return base + (confirmed.has(i)
        ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300'
        : 'bg-red-100 text-red-900 ring-1 ring-red-400 font-medium');
    }
    if (w.band === 'LOW') return base + 'bg-amber-100 text-amber-900';
    if (w.band === 'MODERATE') return base + 'bg-amber-50 text-amber-800';
    return base + 'hover:bg-slate-100';
  };

  const current = selected === null ? null : words[selected];

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      {/* The original. Kept beside the text, not behind a tab: a transcription
          checked without the page in view is not checked. */}
      <div className="lg:w-1/2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Original document
          </span>
          <button
            type="button"
            className="text-xs text-blue-600 underline"
            onClick={() => setZoomed((z) => !z)}
          >
            {zoomed ? 'Fit to width' : 'Zoom'}
          </button>
        </div>
        <div className={`overflow-auto rounded border border-slate-300 bg-slate-50 ${zoomed ? 'max-h-[70vh]' : 'max-h-[45vh]'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageDataUrl}
            alt="The scanned document"
            className={zoomed ? 'max-w-none' : 'w-full'}
            style={zoomed ? { width: '200%' } : undefined}
          />
        </div>
      </div>

      <div className="lg:w-1/2">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Transcription — tap any word to correct it
        </div>

        <div className="max-h-[45vh] overflow-auto rounded border border-slate-300 p-3 leading-8">
          {words.map((w, i) => (
            <span
              key={i}
              className={wordClass(w, i)}
              onClick={() => setSelected(selected === i ? null : i)}
              title={w.reason ?? undefined}
            >
              {textOf(i)}{' '}
            </span>
          ))}
        </div>

        {current && selected !== null && (
          <div className="mt-2 rounded border border-slate-300 bg-white p-3">
            <div className="text-sm text-slate-700">{current.reason ?? 'Read normally.'}</div>

            <input
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
              value={textOf(selected)}
              onChange={(e) => setCorrections((c) => ({ ...c, [selected]: e.target.value }))}
            />

            {/* Offered, never applied. */}
            {current.alternatives && current.alternatives.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
                <span className="text-slate-500">Another engine read:</span>
                {current.alternatives.map((alt) => (
                  <button
                    key={alt}
                    type="button"
                    className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100"
                    onClick={() => setCorrections((c) => ({ ...c, [selected]: alt }))}
                  >
                    {alt}
                  </button>
                ))}
              </div>
            )}

            {current.highRisk.length > 0 && (
              <label className="mt-2 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmed.has(selected)}
                  onChange={(e) => setConfirmed((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(selected); else next.delete(selected);
                    return next;
                  })}
                />
                <span>
                  I have checked this {current.highRisk.map((c) => RISK_WORDS[c]).join(' and ')}
                  {' '}against the original document.
                </span>
              </label>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-sm">
            {outstanding.length > 0 ? (
              <button
                type="button"
                className="text-red-700 underline"
                onClick={() => setSelected(outstanding[0])}
              >
                {outstanding.length} value{outstanding.length === 1 ? '' : 's'} still to confirm
              </button>
            ) : (
              <span className="text-emerald-700">All values confirmed.</span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-slate-200 px-3 py-1.5 text-sm"
              onClick={onCancel}
              disabled={busy}
            >
              Discard
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1.5 text-sm text-white ${canSave ? 'bg-blue-600' : 'cursor-not-allowed bg-slate-400'}`}
              onClick={accept}
              disabled={!canSave}
              // The gate is also enforced server-side; this only makes the
              // reason visible rather than leaving a button mysteriously dead.
              title={canSave ? undefined
                : `Confirm ${outstanding.length} value(s) against the original first`}
            >
              {busy ? 'Saving…' : 'Save verified text'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
