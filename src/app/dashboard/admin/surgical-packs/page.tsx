'use client';

/**
 * Admin surgical-pack management. Create, edit, activate and delete named
 * consumable/pharmacy packs for any subspecialty. Authoring is assisted by a
 * "suggest from history" helper that surfaces items most often requested for the
 * chosen subspecialty — packs are curated, never auto-generated.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Package, Pill, Plus, Trash2, Save, Sparkles, Loader2, CheckCircle2, XCircle, Pencil, X,
} from 'lucide-react';

type Kind = 'CONSUMABLE' | 'PHARMACY';

interface Item {
  name: string; quantity: number; unit: string;
  category?: string | null; size?: string | null;
  drugType?: string | null; dosage?: string | null; route?: string | null;
}
interface Pack {
  id: string; name: string; subspecialty: string; kind: Kind;
  description?: string | null; isActive: boolean; sortOrder: number; items: Item[];
}
interface Suggestion {
  name: string; surgeriesSeen: number; timesRequested: number; typicalQuantity: number;
  category?: string | null; size?: string | null; drugType?: string | null; dosage?: string | null; route?: string | null; unit?: string | null;
}

const SUBSPECIALTIES = [
  'General Surgery', 'Obstetrics & Gynaecology', 'Plastic Surgery', 'Ophthalmology',
  'Orthopaedics', 'Urology', 'Neurosurgery', 'Cardiothoracic Surgery',
  'ENT (Otorhinolaryngology)', 'Paediatric Surgery', 'Maxillofacial Surgery',
];

const emptyDraft = (): Pack => ({
  id: '', name: '', subspecialty: SUBSPECIALTIES[0], kind: 'CONSUMABLE',
  description: '', isActive: false, sortOrder: 0, items: [],
});

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'PHARMACIST', 'CONSUMABLE_PACK_PROVIDER'];

export default function SurgicalPacksAdminPage() {
  const { data: session } = useSession();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Pack | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/surgical-packs', { cache: 'no-store' });
      if (r.ok) setPacks((await r.json()).packs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startNew = () => { setDraft(emptyDraft()); setSuggestions([]); setError(null); };
  const startEdit = (p: Pack) => { setDraft(JSON.parse(JSON.stringify(p))); setSuggestions([]); setError(null); };
  const cancel = () => { setDraft(null); setSuggestions([]); };

  const fetchSuggestions = async () => {
    if (!draft) return;
    setSuggestLoading(true);
    try {
      const qs = new URLSearchParams({ subspecialty: draft.subspecialty, kind: draft.kind });
      const r = await fetch(`/api/admin/surgical-packs/suggestions?${qs}`, { cache: 'no-store' });
      setSuggestions(r.ok ? (await r.json()).suggestions ?? [] : []);
    } finally {
      setSuggestLoading(false);
    }
  };

  const addSuggestion = (s: Suggestion) => {
    if (!draft) return;
    if (draft.items.some((it) => it.name.toLowerCase() === s.name.toLowerCase())) return;
    const item: Item = draft.kind === 'CONSUMABLE'
      ? { name: s.name, quantity: s.typicalQuantity || 1, unit: s.unit || 'piece', category: s.category ?? 'OTHER', size: s.size ?? null }
      : { name: s.name, quantity: s.typicalQuantity || 1, unit: s.unit || 'vial', drugType: s.drugType ?? 'OTHER', dosage: s.dosage ?? null, route: s.route ?? null };
    setDraft({ ...draft, items: [...draft.items, item] });
  };

  const addBlankItem = () => {
    if (!draft) return;
    const item: Item = draft.kind === 'CONSUMABLE'
      ? { name: '', quantity: 1, unit: 'piece', category: 'OTHER' }
      : { name: '', quantity: 1, unit: 'vial', drugType: 'OTHER' };
    setDraft({ ...draft, items: [...draft.items, item] });
  };
  const updateItem = (i: number, patch: Partial<Item>) => {
    if (!draft) return;
    setDraft({ ...draft, items: draft.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  };
  const removeItem = (i: number) => {
    if (!draft) return;
    setDraft({ ...draft, items: draft.items.filter((_, idx) => idx !== i) });
  };

  const save = async () => {
    if (!draft) return;
    if (draft.name.trim().length < 2) { setError('Give the pack a name.'); return; }
    if (draft.items.length === 0) { setError('Add at least one item.'); return; }
    if (draft.items.some((it) => !it.name.trim())) { setError('Every item needs a name.'); return; }
    setSaving(true);
    setError(null);
    try {
      const isEdit = !!draft.id;
      const r = await fetch('/api/admin/surgical-packs', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setError(e.error || 'Failed to save');
        return;
      }
      setDraft(null);
      setSuggestions([]);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Pack) => {
    await fetch('/api/admin/surgical-packs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, isActive: !p.isActive }),
    });
    load();
  };
  const remove = async (p: Pack) => {
    if (!confirm(`Delete pack "${p.name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/surgical-packs?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    load();
  };

  if (session && !ADMIN_ROLES.includes((session.user as any).role)) {
    return <div className="text-center py-8 text-red-600">You do not have permission to manage surgical packs.</div>;
  }

  const grouped = SUBSPECIALTIES.map((s) => ({ sub: s, list: packs.filter((p) => p.subspecialty === s) }))
    .filter((g) => g.list.length > 0);
  const otherPacks = packs.filter((p) => !SUBSPECIALTIES.includes(p.subspecialty));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-primary-600" /> Surgical Packs
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Named consumable and pharmacy packs surgeons apply at booking. Only active packs are
            offered. The mandatory base pack is separate and always attaches.
          </p>
        </div>
        {!draft && (
          <button onClick={startNew} className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> New pack
          </button>
        )}
      </div>

      {/* Editor */}
      {draft && (
        <div className="card border-2 border-primary-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{draft.id ? 'Edit pack' : 'New pack'}</h2>
            <button onClick={cancel} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Pack name *</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="input-field" placeholder="e.g. Laparotomy consumable pack" />
            </div>
            <div>
              <label className="label">Subspecialty *</label>
              <input list="subspecialty-options" value={draft.subspecialty}
                onChange={(e) => setDraft({ ...draft, subspecialty: e.target.value })}
                className="input-field" placeholder="Type or pick a subspecialty" />
              <datalist id="subspecialty-options">
                {SUBSPECIALTIES.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="label">Kind *</label>
              <select value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind, items: [] })}
                className="input-field">
                <option value="CONSUMABLE">Consumable pack (→ pack providers)</option>
                <option value="PHARMACY">Pharmacy pack (→ pharmacy)</option>
              </select>
            </div>
            <div>
              <label className="label">Description</label>
              <input value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="input-field" placeholder="Optional note" />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm mb-4">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
            Active (offered to surgeons at booking)
          </label>

          {/* Items */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Items ({draft.items.length})</h3>
            <div className="flex gap-2">
              <button onClick={fetchSuggestions} disabled={suggestLoading}
                className="btn-secondary inline-flex items-center gap-1.5 text-sm">
                {suggestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Suggest from history
              </button>
              <button onClick={addBlankItem} className="btn-secondary inline-flex items-center gap-1.5 text-sm">
                <Plus className="w-4 h-4" /> Add item
              </button>
            </div>
          </div>

          {suggestions.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-3">
              <p className="text-xs font-semibold text-amber-900 mb-2">
                Most requested for {draft.subspecialty} — tap to add, then edit quantities:
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button key={s.name} onClick={() => addSuggestion(s)}
                    className="text-xs bg-white border border-amber-300 rounded-full px-2.5 py-1 hover:bg-amber-100">
                    {s.name} <span className="text-amber-600">×{s.typicalQuantity} · {s.surgeriesSeen} case(s)</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {draft.items.map((it, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2">
                <input value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })}
                  className="input-field flex-1 min-w-[12rem]" placeholder="Item name" />
                <input type="number" min={1} value={it.quantity}
                  onChange={(e) => updateItem(i, { quantity: parseInt(e.target.value) || 1 })}
                  className="input-field w-20" />
                <input value={it.unit} onChange={(e) => updateItem(i, { unit: e.target.value })}
                  className="input-field w-24" placeholder="unit" />
                {draft.kind === 'PHARMACY' && (
                  <input value={it.dosage ?? ''} onChange={(e) => updateItem(i, { dosage: e.target.value })}
                    className="input-field w-32" placeholder="dosage" />
                )}
                <button onClick={() => removeItem(i)} className="p-1.5 rounded hover:bg-red-50 text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {draft.items.length === 0 && (
              <p className="text-sm text-gray-400 py-2">No items yet. Add from history suggestions or manually.</p>
            )}
          </div>

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={cancel} className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {draft.id ? 'Save changes' : 'Create pack'}
            </button>
          </div>
        </div>
      )}

      {/* Existing packs */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
      ) : packs.length === 0 ? (
        <p className="text-gray-500">No packs yet. Create one to get started.</p>
      ) : (
        <div className="space-y-6">
          {[...grouped, ...(otherPacks.length ? [{ sub: 'Other', list: otherPacks }] : [])].map((g) => (
            <div key={g.sub}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{g.sub}</h2>
              <div className="space-y-2">
                {g.list.map((p) => (
                  <div key={p.id} className="card flex items-center gap-3 py-3">
                    {p.kind === 'CONSUMABLE'
                      ? <Package className="w-5 h-5 text-teal-600 flex-shrink-0" />
                      : <Pill className="w-5 h-5 text-purple-600 flex-shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">{p.name}</div>
                      <div className="text-xs text-gray-500">
                        {p.kind === 'CONSUMABLE' ? 'Consumable' : 'Pharmacy'} · {p.items.length} item(s)
                        {p.description ? ` · ${p.description}` : ''}
                      </div>
                    </div>
                    <button onClick={() => toggleActive(p)}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                        p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {p.isActive ? 'Active' : 'Draft'}
                    </button>
                    <button onClick={() => startEdit(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(p)} className="p-1.5 rounded hover:bg-red-50 text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
