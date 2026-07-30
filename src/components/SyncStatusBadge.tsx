'use client';

// Shows offline / pending-sync / failed-sync status in the dashboard header.
// - Offline: a grey "Offline" pill.
// - Pending queued writes: an amber "Syncing N" pill.
// - Failed writes (client-rejected or retries exhausted): a red "N failed" button
//   that opens a panel to view / retry / dismiss each dead-lettered mutation.

import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw, AlertTriangle, X, RotateCcw, Trash2, CheckCircle2 } from 'lucide-react';
import {
  getOfflineQueueCount, getFailedCount, getFailedMutations, retryFailedMutation,
  discardFailedMutation, processOfflineQueue, getPendingRecords,
  resolveConflictKeepMine, resolveConflictKeepServer, type FailedMutation,
} from '@/lib/offlineStore';
import type { PendingRecord } from '@/lib/offlineMerge';

/** The handful of fields that actually differ between two versions of a record. */
function changedFields(mine: unknown, theirs: unknown): { field: string; mine: string; theirs: string }[] {
  if (!mine || typeof mine !== 'object' || !theirs || typeof theirs !== 'object') return [];
  const a = mine as Record<string, unknown>;
  const b = theirs as Record<string, unknown>;
  const show = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : String(v));
  return Object.keys(a)
    .filter((k) => !['id', 'createdAt', 'updatedAt'].includes(k))
    .filter((k) => typeof a[k] !== 'object' && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .slice(0, 8)
    .map((k) => ({ field: k, mine: show(a[k]), theirs: show(b[k]) }));
}

/** A short human label for a locally-held record, e.g. "EMLSCS — Ada Obi". */
function describePending(p: PendingRecord): string {
  const b = (p.body ?? {}) as Record<string, unknown>;
  const primary = b.procedure ?? b.name ?? b.fullName ?? b.title ?? b.itemName ?? b.description;
  const secondary = b.patientName ?? b.patient ?? b.folderNumber ?? b.staffName;
  const parts = [primary, secondary].filter(Boolean).map(String);
  if (parts.length) return parts.join(' — ');
  return `${p.op} ${p.entityType.replace(/-/g, ' ')}`;
}

export default function SyncStatusBadge() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FailedMutation[]>([]);
  const [localRecords, setLocalRecords] = useState<PendingRecord[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([getOfflineQueueCount(), getFailedCount()]);
      setPending(p); setFailed(f);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    refresh();
    const on = () => { setOnline(true); refresh(); };
    const off = () => { setOnline(false); refresh(); };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('orm:offline-queued', refresh as EventListener);
    window.addEventListener('orm:sync-failed', refresh as EventListener);
    const t = setInterval(refresh, 8000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('orm:offline-queued', refresh as EventListener);
      window.removeEventListener('orm:sync-failed', refresh as EventListener);
      clearInterval(t);
    };
  }, [refresh]);

  const loadPanel = useCallback(async () => {
    const [f, p] = await Promise.all([getFailedMutations(), getPendingRecords()]);
    setItems(f);
    setLocalRecords(p.filter((r) => !r.failed));
  }, []);

  const openPanel = async () => { await loadPanel(); setOpen(true); };
  const onRetry = async (id?: number) => {
    if (id == null) return;
    await retryFailedMutation(id);
    await processOfflineQueue().catch(() => {});
    await loadPanel();
    await refresh();
  };
  const onDismiss = async (id?: number) => {
    if (id == null) return;
    // Discards the dead-letter entry AND the local row it produced, so the
    // list stops showing work that will never be saved.
    await discardFailedMutation(id);
    await loadPanel();
    await refresh();
  };
  const onKeepMine = async (id?: number) => {
    if (id == null) return;
    await resolveConflictKeepMine(id);
    await processOfflineQueue().catch(() => {});
    await loadPanel();
    await refresh();
  };
  const onKeepServer = async (id?: number) => {
    if (id == null) return;
    await resolveConflictKeepServer(id);
    await loadPanel();
    await refresh();
  };

  // Nothing to show when everything is synced and online.
  if (online && pending === 0 && failed === 0) return null;

  return (
    <>
      <div className="flex items-center gap-1.5">
        {!online && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200" title="You are offline. Changes are saved and will sync automatically.">
            <CloudOff className="w-3.5 h-3.5" /> Offline
          </span>
        )}
        {pending > 0 && (
          <button
            onClick={openPanel}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200"
            title={`${pending} change(s) saved on this device — click to see what is waiting to sync`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${online ? 'animate-spin' : ''}`} /> {pending} to sync
          </button>
        )}
        {failed > 0 && (
          <button onClick={openPanel} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-red-100 text-red-800 border border-red-200 hover:bg-red-200" title="Some changes could not be synced — click to review">
            <AlertTriangle className="w-3.5 h-3.5" /> {failed} failed
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-16" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" /> Unsynced changes</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {/* Work saved on this device that has not reached the server yet.
                  It is already visible in the app's lists, badged as pending. */}
              {localRecords.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
                  <div className="text-sm font-medium text-amber-900 flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 ${online ? 'animate-spin' : ''}`} />
                    Saved on this device ({localRecords.length})
                  </div>
                  {localRecords.map((r) => (
                    <div key={r.clientId} className="text-xs text-amber-900/90 flex items-baseline gap-2">
                      <span className="uppercase text-[9px] font-semibold tracking-wide text-amber-700 shrink-0">{r.op}</span>
                      <span className="truncate">{describePending(r)}</span>
                    </div>
                  ))}
                  <p className="text-[11px] text-amber-700 pt-0.5">
                    These are visible in the app now and upload automatically when the network returns.
                  </p>
                </div>
              )}

              {items.length === 0 ? (
                localRecords.length === 0 && (
                  <p className="text-sm text-green-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> All changes are synced.</p>
                )
              ) : items.map((it) => {
                const diffs = it.conflict ? changedFields(it.body, it.conflict.serverRecord) : [];
                return (
                <div key={it.id} className={`rounded-lg border p-3 ${it.conflict ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
                  <div className="text-sm font-medium text-gray-900 capitalize">{it.entityType.replace(/-/g, ' ')} — {it.method}</div>
                  <div className="text-[11px] text-gray-400 break-all">{it.url}</div>
                  <div className={`text-xs mt-1 ${it.conflict ? 'text-orange-800' : 'text-red-600'}`}>{it.lastError || 'Sync failed'}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Failed {new Date(it.failedAt).toLocaleString()}</div>

                  {it.conflict && (
                    <div className="mt-2 rounded-md bg-white border border-orange-200 overflow-hidden">
                      {diffs.length > 0 ? (
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="bg-orange-100/60 text-orange-900">
                              <th className="text-left font-semibold px-2 py-1">Field</th>
                              <th className="text-left font-semibold px-2 py-1">Your version</th>
                              <th className="text-left font-semibold px-2 py-1">On the server now</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diffs.map((d) => (
                              <tr key={d.field} className="border-t border-orange-100">
                                <td className="px-2 py-1 font-medium text-gray-700">{d.field}</td>
                                <td className="px-2 py-1 text-gray-900">{d.mine}</td>
                                <td className="px-2 py-1 text-gray-900">{d.theirs}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-[11px] text-gray-600 px-2 py-1.5">
                          The server copy changed after yours was made.
                        </p>
                      )}
                      {it.conflict.serverVersion && (
                        <p className="text-[10px] text-gray-400 px-2 pb-1.5">
                          Server last changed {new Date(it.conflict.serverVersion).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {it.conflict ? (
                      <>
                        <button onClick={() => onKeepMine(it.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:text-orange-900">
                          <RotateCcw className="w-3.5 h-3.5" /> Apply my version
                        </button>
                        <button onClick={() => onKeepServer(it.id)} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Keep the server version
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => onRetry(it.id)} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"><RotateCcw className="w-3.5 h-3.5" /> Retry</button>
                        <button onClick={() => onDismiss(it.id)} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /> Dismiss</button>
                      </>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
            <div className="p-3 border-t border-gray-100 text-[11px] text-gray-400">
              Retrying re-queues the change for the next sync. Dismiss removes it permanently — use only if it is no longer needed.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
