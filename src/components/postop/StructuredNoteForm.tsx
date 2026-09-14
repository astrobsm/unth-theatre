'use client';

// ============================================================
// The operation note form
// ------------------------------------------------------------
// This component renders whatever lib/postop/templates.ts describes. It knows
// about seven kinds of input and nothing at all about flaps, grafts, drains or
// skin preparation — which is the whole point: a new procedure template is an
// object in a TypeScript file, and this file does not change.
//
// THREE THINGS IT IS CAREFUL ABOUT.
//
// A BOOLEAN HAS THREE STATES HERE. Yes, no, and not answered. A checkbox has
// two, and using one would make "nobody asked about the tourniquet" identical
// to "there was no tourniquet". In a record that may be read years later by
// somebody deciding what happened, those must not collapse.
//
// SUGGESTED OPTIONS ARE MOVED, NOT TICKED. A flap case shows the flap
// monitoring options first, marked as usual for this operation. Nothing is
// selected on the surgeon's behalf, because selecting a clinical order is
// prescribing and a form does not get to prescribe.
//
// IT SAVES WHILE YOU TYPE. Operation notes are long and are written at the end
// of a list by somebody who has been standing for four hours. The previous
// free-text field lost notes to closed laptops and flat batteries often enough
// that this was the first thing asked for.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Info, Plus, Trash2 } from 'lucide-react';
import {
  type FieldDef, type NoteValues, type ResolvedTemplate, type SectionDef,
  suggestedFirst,
} from '@/lib/postop/templates';
import { CATALOGUES, type Option } from '@/lib/postop/vocabulary';
import { type ChildRows, type Problem } from '@/lib/postop/validate';

interface Props {
  template: ResolvedTemplate;
  values: NoteValues;
  rows: ChildRows;
  problems: Problem[];
  disabled?: boolean;
  onChange: (key: string, value: unknown) => void;
  onChildChange: (kind: keyof ChildRows, rows: NoteValues[]) => void;
}

/** Which catalogue a field's suggestions apply to, if any. */
function suggestionsFor(template: ResolvedTemplate, field: FieldDef): string[] | undefined {
  const s = template.suggests;
  if (field.key === 'woundMonitoring') return s.monitoring;
  if (field.key === 'escalationTriggers') return s.escalation;
  if (field.key === 'positionRestrictions') return s.positionRestrictions;
  if (field.key === 'observations') return s.observations;
  return undefined;
}

const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100';

function Importance({ level }: { level?: string }) {
  if (level === 'required') return <span className="ml-1 text-red-600" title="Needed before signing">*</span>;
  if (level === 'recommended') return <span className="ml-1 text-xs text-amber-600">(expected)</span>;
  return null;
}

function FieldProblems({ problems }: { problems: Problem[] }) {
  if (!problems.length) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {problems.map((p, i) => (
        <p
          key={i}
          className={`text-xs ${p.severity === 'blocking' ? 'text-red-700' : 'text-amber-700'}`}
        >
          {p.message}
        </p>
      ))}
    </div>
  );
}

function OneField({
  field, value, problems, disabled, suggested, onChange,
}: {
  field: FieldDef;
  value: unknown;
  problems: Problem[];
  disabled?: boolean;
  suggested?: string[];
  onChange: (v: unknown) => void;
}) {
  // Resolved inside the memo: the `?? []` fallback makes a fresh array on every
  // render, so reading it outside would make the memo recompute every time and
  // defeat its own purpose.
  const ordered = useMemo(() => {
    const options: Option[] = field.catalogue ? CATALOGUES[field.catalogue] ?? [] : [];
    return suggestedFirst(options, suggested);
  }, [field.catalogue, suggested]);
  const invalid = problems.some((p) => p.severity === 'blocking');
  const ring = invalid ? ' border-red-400 bg-red-50' : '';

  const body = () => {
    switch (field.kind) {
      case 'multi': {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {ordered.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])
                  }
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    on
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'
                  } ${disabled ? 'opacity-60' : ''}`}
                  title={(o as { suggested?: boolean }).suggested ? 'Commonly recorded for this operation' : undefined}
                >
                  {o.label}
                  {(o as { suggested?: boolean }).suggested && !on && (
                    <span className="ml-1 text-[10px] text-blue-600">•</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      }

      case 'single':
        return (
          <select
            className={inputClass + ring}
            disabled={disabled}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">—</option>
            {ordered.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        );

      case 'boolean': {
        // Three states. "Not answered" is a real one and must stay reachable,
        // so the chosen button toggles back off rather than locking in.
        const opts: [string, boolean | null][] = [['Yes', true], ['No', false], ['Not answered', null]];
        return (
          <div className="flex gap-1.5">
            {opts.map(([label, v]) => (
              <button
                key={label}
                type="button"
                disabled={disabled}
                onClick={() => onChange(v)}
                className={`rounded border px-3 py-1 text-xs ${
                  value === v || (v === null && (value === null || value === undefined))
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        );
      }

      case 'longtext':
        return (
          <textarea
            className={inputClass + ring}
            rows={field.rows ?? 6}
            disabled={disabled}
            placeholder={field.placeholder}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'number':
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              className={inputClass + ring}
              disabled={disabled}
              min={field.min}
              max={field.max}
              placeholder={field.placeholder}
              value={value === null || value === undefined ? '' : String(value)}
              onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            />
            {field.unit && <span className="whitespace-nowrap text-xs text-gray-500">{field.unit}</span>}
          </div>
        );

      case 'datetime':
        return (
          <input
            type="datetime-local"
            className={inputClass + ring}
            disabled={disabled}
            value={toLocalInput(value)}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
          />
        );

      default:
        return (
          <input
            type="text"
            className={inputClass + ring}
            disabled={disabled}
            placeholder={field.placeholder}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  };

  return (
    <div>
      <label className={labelClass}>
        {field.label}
        <Importance level={field.importance} />
      </label>
      {body()}
      {field.help && <p className="mt-1 text-xs text-gray-500">{field.help}</p>}
      <FieldProblems problems={problems} />
    </div>
  );
}

/** A datetime as the browser input wants it: local time, no timezone, no seconds. */
function toLocalInput(value: unknown): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function RepeatSection({
  section, rows, problems, disabled, onChange,
}: {
  section: SectionDef;
  rows: NoteValues[];
  problems: Problem[];
  disabled?: boolean;
  onChange: (rows: NoteValues[]) => void;
}) {
  const update = (i: number, key: string, value: unknown) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="text-sm text-gray-500">None recorded.</p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="rounded border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {section.title} {i + 1}
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              className="text-gray-400 hover:text-red-600"
              aria-label={`Remove entry ${i + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {section.fields
              .filter((f) => (f.showIf ? f.showIf(row) : true))
              .map((f) => (
                <OneField
                  key={f.key}
                  field={f}
                  value={row[f.key]}
                  disabled={disabled}
                  problems={problems.filter((p) => p.field === `${section.repeat}.${i}.${f.key}`)}
                  onChange={(v) => update(i, f.key, v)}
                />
              ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...rows, {}])}
        className="inline-flex items-center gap-1 rounded border border-dashed border-gray-400 px-3 py-1.5 text-sm text-gray-600 hover:border-blue-500 hover:text-blue-600"
      >
        <Plus className="h-4 w-4" /> Add {section.title.toLowerCase().replace(/s$/, '')}
      </button>
    </div>
  );
}

export default function StructuredNoteForm({
  template, values, rows, problems, disabled, onChange, onChildChange,
}: Props) {
  // Sections start open where they have something in them or something wrong
  // with them, and closed otherwise. A form of twenty-three headings opened
  // flat is one nobody reads to the bottom of.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const initialised = useRef(false);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const next: Record<string, boolean> = {};
    for (const s of template.sections) {
      const filled = s.repeat
        ? (rows[s.repeat]?.length ?? 0) > 0
        : s.fields.some((f) => {
            const v = values[f.key];
            return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length);
          });
      next[s.key] = filled || s.key === 'findings' || s.audience === 'nursing';
    }
    setOpen(next);
  }, [template, values, rows]);

  const toggle = useCallback((key: string) => setOpen((s) => ({ ...s, [key]: !s[key] })), []);

  return (
    <div className="space-y-3">
      {template.reminders.length > 0 && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-blue-900">
            <Info className="h-4 w-4" /> For this kind of operation
          </div>
          <ul className="ml-6 list-disc space-y-0.5 text-sm text-blue-900">
            {template.reminders.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {template.sections.map((section) => {
        if (section.showIf && !section.showIf(values)) return null;
        const sectionProblems = problems.filter((p) => p.section === section.key);
        const blocking = sectionProblems.filter((p) => p.severity === 'blocking').length;
        const isOpen = open[section.key] ?? false;

        return (
          <section key={section.key} className="rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => toggle(section.key)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                <span className="font-semibold text-gray-900">{section.title}</span>
                {section.audience === 'nursing' && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                    Nursing
                  </span>
                )}
              </span>
              {blocking > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> {blocking}
                </span>
              )}
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 px-4 py-4">
                {section.blurb && <p className="mb-3 text-sm text-gray-600">{section.blurb}</p>}

                {section.repeat ? (
                  <RepeatSection
                    section={section}
                    rows={rows[section.repeat] ?? []}
                    problems={sectionProblems}
                    disabled={disabled}
                    onChange={(rows) => onChildChange(section.repeat!, rows)}
                  />
                ) : (
                  <div className={`grid gap-4 ${section.key === 'findings' ? '' : 'sm:grid-cols-2'}`}>
                    {section.fields
                      .filter((f) => (f.showIf ? f.showIf(values) : true))
                      .map((f) => (
                        <div key={f.key} className={f.kind === 'longtext' || f.kind === 'multi' ? 'sm:col-span-2' : ''}>
                          <OneField
                            field={f}
                            value={values[f.key]}
                            disabled={disabled}
                            problems={problems.filter((p) => p.field === f.key)}
                            suggested={suggestionsFor(template, f)}
                            onChange={(v) => onChange(f.key, v)}
                          />
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
