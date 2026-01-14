'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Wifi, WifiOff, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface SyncIndicatorProps {
  /** Last sync timestamp */
  lastSyncTime: number | null;
  /** Whether currently syncing */
  isSyncing?: boolean;
  /** Refresh interval in ms */
  refreshInterval?: number;
  /** Manual refresh callback */
  onRefresh?: () => void;
  /** Show detailed status */
  showDetails?: boolean;
  /** Custom className */
  className?: string;
}

export function SyncIndicator({
  lastSyncTime,
  isSyncing = false,
  refreshInterval = 30000,
  onRefresh,
  showDetails = true,
  className = '',
}: SyncIndicatorProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [timeSinceSync, setTimeSinceSync] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'stale' | 'offline'>('synced');

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  // Update time since last sync
  useEffect(() => {
    const updateTimeSinceSync = () => {
      if (!lastSyncTime) {
        setTimeSinceSync('Never');
        setSyncStatus('stale');
        return;
      }

      const now = Date.now();
      const diff = now - lastSyncTime;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);

      if (seconds < 5) {
        setTimeSinceSync('Just now');
      } else if (seconds < 60) {
        setTimeSinceSync(`${seconds}s ago`);
      } else if (minutes < 60) {
        setTimeSinceSync(`${minutes}m ago`);
      } else {
        setTimeSinceSync(`${Math.floor(minutes / 60)}h ago`);
      }

      // Determine sync status
      if (!isOnline) {
        setSyncStatus('offline');
      } else if (isSyncing) {
        setSyncStatus('syncing');
      } else if (diff > refreshInterval * 2) {
        setSyncStatus('stale');
      } else {
        setSyncStatus('synced');
      }
    };

    updateTimeSinceSync();
    const interval = setInterval(updateTimeSinceSync, 1000);

    return () => clearInterval(interval);
  }, [lastSyncTime, isSyncing, isOnline, refreshInterval]);

  const getStatusIcon = () => {
    if (!isOnline) {
      return <WifiOff className="w-4 h-4 text-gray-500" />;
    }
    if (isSyncing) {
      return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
    }
    switch (syncStatus) {
      case 'synced':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'stale':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    if (!isOnline) {
      return 'Offline';
    }
    if (isSyncing) {
      return 'Syncing...';
    }
    switch (syncStatus) {
      case 'synced':
        return showDetails ? `Synced ${timeSinceSync}` : 'Synced';
      case 'stale':
        return showDetails ? `Stale - ${timeSinceSync}` : 'Stale';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = () => {
    if (!isOnline) return 'bg-gray-100 text-gray-600 border-gray-200';
    if (isSyncing) return 'bg-blue-50 text-blue-600 border-blue-200';
    switch (syncStatus) {
      case 'synced':
        return 'bg-green-50 text-green-600 border-green-200';
      case 'stale':
        return 'bg-yellow-50 text-yellow-600 border-yellow-200';
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${getStatusColor()}`}
      >
        {getStatusIcon()}
        <span>{getStatusText()}</span>
      </div>
      
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isSyncing || !isOnline}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Refresh data"
        >
          <RefreshCw className={`w-4 h-4 text-gray-500 ${isSyncing ? 'animate-spin' : ''}`} />
        </button>
      )}

      {!isOnline && (
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <WifiOff className="w-3 h-3" />
          Offline mode
        </span>
      )}
    </div>
  );
}

// Compact version for table headers or tight spaces
export function SyncIndicatorCompact({
  isSyncing,
  isOnline = true,
  className = '',
}: {
  isSyncing?: boolean;
  isOnline?: boolean;
  className?: string;
}) {
  if (!isOnline) {
    return (
      <span className={`inline-flex items-center ${className}`} title="Offline">
        <WifiOff className="w-4 h-4 text-gray-400" />
      </span>
    );
  }

  if (isSyncing) {
    return (
      <span className={`inline-flex items-center ${className}`} title="Syncing...">
        <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center ${className}`} title="Connected">
      <Wifi className="w-4 h-4 text-green-500" />
    </span>
  );
}

export default SyncIndicator;
