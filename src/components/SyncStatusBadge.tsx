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
  dismissFailedMutation, processOfflineQueue, type FailedMutation,
} from '@/lib/offlineStore';

export default function SyncStatusBadge() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FailedMutation[]>([]);

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

  const openPanel = async () => { setItems(await getFailedMutations()); setOpen(true); };
  const onRetry = async (id?: number) => {
    if (id == null) return;
    await retryFailedMutation(id);
    await processOfflineQueue().catch(() => {});
    setItems(await getFailedMutations());
    await refresh();
  };
  const onDismiss = async (id?: number) => {
    if (id == null) return;
    await dismissFailedMutation(id);
    setItems(await getFailedMutations());
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
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200" title={`${pending} change(s) waiting to sync`}>
            <RefreshCw className={`w-3.5 h-3.5 ${online ? 'animate-spin' : ''}`} /> {pending} to sync
          </span>
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
              {items.length === 0 ? (
                <p className="text-sm text-green-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> All changes are synced.</p>
              ) : items.map((it) => (
                <div key={it.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="text-sm font-medium text-gray-900 capitalize">{it.entityType.replace(/-/g, ' ')} — {it.method}</div>
                  <div className="text-[11px] text-gray-400 break-all">{it.url}</div>
                  <div className="text-xs text-red-600 mt-1">{it.lastError || 'Sync failed'}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Failed {new Date(it.failedAt).toLocaleString()}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => onRetry(it.id)} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"><RotateCcw className="w-3.5 h-3.5" /> Retry</button>
                    <button onClick={() => onDismiss(it.id)} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /> Dismiss</button>
                  </div>
                </div>
              ))}
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
