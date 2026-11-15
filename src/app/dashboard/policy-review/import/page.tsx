'use client';

/**
 * Import the draft, and look at what the parse actually produced.
 *
 * WHY THERE IS A PREVIEW AT ALL. A review is section by section, so a parse
 * that merges two sections removes a question the committee was supposed to
 * answer — and nothing downstream shows it. The dashboard simply reports that
 * fewer people commented on section 7. This screen is the only place that
 * failure is visible, so it is deliberately hard to click past: the warnings
 * are above the button, and the tree is shown in full.
 *
 * Titles can be corrected, sections removed, and false decision items
 * dismissed. The server stores what is shown here rather than re-parsing,
 * because re-parsing would discard exactly those corrections.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';

import PolicyMarkdown from '@/components/policy/PolicyMarkdown';

interface DetectedItem {
  placeholder: string;
  currentValue: string;
  surroundingSentence: string;
  type: string;
  options: string[] | null;
  dismissed?: boolean;
}

interface PreviewSection {
  key: string;
  parentKey: string | null;
  number: string | null;
  title: string;
  level: number;
  order: number;
  body: string;
  isAppendix: boolean;
  decisionItems: DetectedItem[];
  removed?: boolean;
}

interface Preview {
  ok: true;
  sourceFormat: 'MARKDOWN' | 'DOCX' | 'PASTED';
  fileName: string | null;
  sections: PreviewSection[];
  summary: { sections: number; topLevel: number; appendices: number; unnumbered: number; decisionItems: number };
  warnings: string[];
}

const TYPES = ['TIME', 'PERCENTAGE', 'NUMBER', 'DURATION', 'FREE_TEXT', 'CHOICE'];

export default function PolicyImportPage() {
  const router = useRouter();

  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const [title, setTitle] = useState(
    'UNTH Theatre Operational Flow Policy: Booking, Pre-operative Preparation, '
    + 'Investigations and Cancellation',
  );
  const [version, setVersion] = useState('0.2');
  const [saving, setSaving] = useState(false);

  const parseFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/policy/import', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || data?.ok !== true) {
        setError(data?.error ?? 'Could not read that file.');
        return;
      }
      setPreview(data as Preview);
    } catch {
      setError('Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const parsePasted = async () => {
    if (pasted.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/policy/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: pasted }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok !== true) {
        setError(data?.error ?? 'Could not read that text.');
        return;
      }
      setPreview(data as Preview);
    } catch {
      setError('Could not read that text.');
    } finally {
      setBusy(false);
    }
  };

  const patchSection = (key: string, patch: Partial<PreviewSection>) => {
    setPreview((p) => (p ? {
      ...p,
      sections: p.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    } : p));
  };

  const toggleItem = (sectionKey: string, index: number) => {
    setPreview((p) => (p ? {
      ...p,
      sections: p.sections.map((s) => (s.key === sectionKey
        ? {
          ...s,
          decisionItems: s.decisionItems.map((d, i) => (i === index
            ? { ...d, dismissed: !d.dismissed }
            : d)),
        }
        : s)),
    } : p));
  };

  const setItemType = (sectionKey: string, index: number, type: string) => {
    setPreview((p) => (p ? {
      ...p,
      sections: p.sections.map((s) => (s.key === sectionKey
        ? {
          ...s,
          decisionItems: s.decisionItems.map((d, i) => (i === index ? { ...d, type } : d)),
        }
        : s)),
    } : p));
  };

  const commit = async () => {
    if (!preview) return;
    setSaving(true);
    setError(null);
    try {
      const kept = preview.sections.filter((s) => !s.removed);
      const keptKeys = new Set(kept.map((s) => s.key));

      const res = await fetch('/api/policy/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          version: version.trim(),
          sourceFormat: preview.sourceFormat,
          sourceFileName: preview.fileName,
          sections: kept.map((s) => ({
            key: s.key,
            // A removed parent would orphan its children, which the route
            // refuses. Promoting them is the kinder answer: a section nobody
            // is asked about is worse than one shown at the wrong depth.
            parentKey: s.parentKey && keptKeys.has(s.parentKey) ? s.parentKey : null,
            number: s.number,
            title: s.title,
            order: s.order,
            body: s.body,
            isAppendix: s.isAppendix,
            decisionItems: s.decisionItems
              .filter((d) => !d.dismissed)
              .map((d) => ({
                placeholder: d.placeholder,
                currentValue: d.currentValue,
                surroundingSentence: d.surroundingSentence,
                type: d.type,
                options: d.options ?? null,
              })),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok !== true) {
        setError(data?.error ?? 'Could not store the imported policy.');
        return;
      }
      router.push('/dashboard/policy-review');
    } catch {
      setError('Could not store the imported policy.');
    } finally {
      setSaving(false);
    }
  };

  const kept = preview?.sections.filter((s) => !s.removed) ?? [];
  const keptItems = kept.reduce(
    (n, s) => n + s.decisionItems.filter((d) => !d.dismissed).length,
    0,
  );

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link
        href="/dashboard/policy-review"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Policy Review
      </Link>

      <h1 className="text-xl font-bold text-slate-900">Import the draft policy</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Upload the committee&rsquo;s latest export, or paste it. Nothing is stored until you have
        looked at the preview.
      </p>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-sm text-rose-900">{error}</p>
        </div>
      )}

      {!preview && (
        <div className="mt-5 space-y-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
            <Upload className="h-6 w-6 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800">
              Choose the Word or Markdown file
            </span>
            <span className="text-xs text-slate-500">
              .docx or .md — up to 8 MB
            </span>
            <input
              type="file"
              accept=".docx,.md,.markdown,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void parseFile(file);
              }}
            />
          </label>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-700">…or paste the draft</p>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={8}
              className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
              placeholder={'# 1 Purpose and scope\n\nThis policy covers…'}
            />
            <button
              type="button"
              onClick={parsePasted}
              disabled={busy || pasted.trim() === ''}
              className="mt-2 flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Parse it
            </button>
          </div>
        </div>
      )}

      {busy && !preview && (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading the draft…
        </p>
      )}

      {preview && (
        <div className="mt-5 space-y-5">
          {/* Warnings FIRST, above everything, because they are the point. */}
          {preview.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                Check these before you continue
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-amber-900">
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Sections', kept.length],
              ['Top level', kept.filter((s) => s.parentKey === null).length],
              ['Appendices', kept.filter((s) => s.isAppendix).length],
              ['Open values', keptItems],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-lg font-bold text-slate-900">{value}</p>
                <p className="text-[11px] text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Policy title</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Version</span>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                />
              </label>
            </div>
          </div>

          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              The sections as parsed
            </h2>
            <ul className="space-y-2">
              {preview.sections.map((s) => (
                <li
                  key={s.key}
                  className={`rounded-xl border bg-white p-3 ${
                    s.removed ? 'border-slate-200 opacity-50' : 'border-slate-200'
                  }`}
                  style={s.parentKey ? { marginLeft: 20 } : undefined}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={s.number ?? ''}
                          onChange={(e) => patchSection(s.key, { number: e.target.value || null })}
                          placeholder="no."
                          className="w-16 rounded border border-slate-300 px-1.5 py-1 text-xs"
                        />
                        <input
                          type="text"
                          value={s.title}
                          onChange={(e) => patchSection(s.key, { title: e.target.value })}
                          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm font-semibold"
                        />
                        {s.isAppendix && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                            appendix
                          </span>
                        )}
                        {s.parentKey && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                            subsection
                          </span>
                        )}
                      </div>

                      {s.body.trim() === '' ? (
                        <p className="mt-1.5 text-[11px] italic text-amber-700">
                          No text of its own — reviewers will still be asked for a stance.
                        </p>
                      ) : (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-[11px] font-medium text-blue-700">
                            Show the text
                          </summary>
                          <div className="mt-1 rounded bg-slate-50 p-2">
                            <PolicyMarkdown markdown={s.body} />
                          </div>
                        </details>
                      )}

                      {s.decisionItems.length > 0 && (
                        <div className="mt-2 space-y-1.5 rounded-lg bg-amber-50/70 p-2">
                          <p className="text-[11px] font-bold text-amber-900">
                            Open values found here
                          </p>
                          {s.decisionItems.map((d, i) => (
                            <div
                              key={`${d.placeholder}-${i}`}
                              className={`flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-white px-2 py-1.5 ${
                                d.dismissed ? 'opacity-40' : ''
                              }`}
                            >
                              <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                                {d.placeholder}
                              </code>
                              <select
                                value={d.type}
                                onChange={(e) => setItemType(s.key, i, e.target.value)}
                                className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
                              >
                                {TYPES.map((t) => (
                                  <option key={t} value={t}>{t.toLowerCase().replace('_', ' ')}</option>
                                ))}
                              </select>
                              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                                {d.surroundingSentence}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleItem(s.key, i)}
                                className="text-[11px] font-medium text-slate-500 underline"
                              >
                                {d.dismissed ? 'keep after all' : 'not a decision'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => patchSection(s.key, { removed: !s.removed })}
                      title={s.removed ? 'Put this section back' : 'Remove this section'}
                      className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white px-4 py-3 sm:-mx-6 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-600">
                {kept.length} sections and {keptItems} open values will be stored.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setPreview(null); setPasted(''); }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Start again
                </button>
                <button
                  type="button"
                  onClick={commit}
                  disabled={saving || kept.length === 0 || title.trim() === ''}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Store this draft
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
