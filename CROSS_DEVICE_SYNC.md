# Cross-Device Sync Implementation

## Overview

The UNTH Theatre ORM application implements comprehensive bidirectional sync to ensure data consistency across all connected devices. This document explains the sync architecture and implementation.

## Sync Architecture

### Push (Data to Server)
All data mutations (create, update, delete) are immediately pushed to the server:
- Form submissions POST data to API endpoints
- Status updates use PUT/PATCH requests
- Deletions send DELETE requests
- All mutations include proper error handling and user feedback

### Pull (Data from Server)
Data is pulled from the server using multiple mechanisms:
1. **Initial Load**: Fetch data when page mounts
2. **Interval Refresh**: Automatic polling at defined intervals
3. **Visibility Refresh**: Refetch when browser tab becomes visible
4. **Post-Mutation Refresh**: Refetch after any local data change

## Sync Intervals by Module

### Critical Patient Safety (15 seconds)
- **Holding Area**: Pre-operative patient verification
- **PACU**: Post-anesthesia care monitoring
- **Emergency Alerts**: Critical notifications

### High Priority (30 seconds)
- **Blood Bank**: Blood product requests
- **Fault Alerts**: Equipment issues
- **Surgeries**: Surgical scheduling
- **Checklists**: WHO surgical safety
- **Oxygen Control**: Oxygen monitoring

### Standard Priority (45 seconds)
- **Pre-op Reviews**: Assessment reviews
- **Prescriptions**: Medication orders
- **Transfers**: Patient transfers
- **Equipment Checkout**: Device tracking

### Lower Priority (60 seconds)
- **Inventory**: Stock management
- **Patients**: Patient records
- **Roster**: Staff scheduling
- **Users**: User management
- **Theatre Setup**: Room configuration
- **Incidents**: Incident reports
- **Cancellations**: Surgery cancellations

## Sync Components

### Sync Manager (`src/lib/sync.ts`)
Central sync utility providing:
- Event-based sync notifications
- Push with automatic retry
- Pull with caching
- Offline queue for failed requests
- Online/offline status monitoring

### useSync Hook (`src/lib/useSync.ts`)
React hook for data synchronization:
```typescript
const { data, loading, refetch, mutate, isSyncing } = useSync('/api/endpoint', {
  refreshInterval: 30000,
  syncEvent: 'SURGERY_UPDATED',
});
```

### Sync Indicator (`src/components/SyncIndicator.tsx`)
Visual component showing:
- Online/offline status
- Syncing animation
- Last sync time
- Manual refresh button

## Page Implementation Pattern

Each dashboard page follows this pattern:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { SYNC_INTERVALS } from '@/lib/sync';

export default function ExamplePage() {
  const [data, setData] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // PULL: Fetch data from server
  const fetchData = useCallback(async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    try {
      const response = await fetch('/api/example');
      if (response.ok) {
        setData(await response.json());
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline]);

  // Initial load + interval refresh
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, SYNC_INTERVALS.EXAMPLE);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Refetch on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchData]);

  // PUSH: Send data to server
  const handleSubmit = async (formData) => {
    const response = await fetch('/api/example', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    
    if (response.ok) {
      // Immediately refetch to sync with server
      await fetchData();
    }
  };

  return (/* Component JSX */);
}
```

## API Route Pattern

Each API route includes full CRUD:

```typescript
// GET - Fetch data with relations
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const item = await prisma.model.findUnique({
    where: { id: params.id },
    include: { /* relations */ },
  });
  return NextResponse.json(item);
}

// PUT - Full update
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const item = await prisma.model.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json(item);
}

// DELETE - Remove item
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  await prisma.model.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
```

## Offline Behavior

When offline:
1. UI shows offline indicator (WifiOff icon)
2. Manual refresh is disabled
3. Failed mutations are queued
4. Queue is processed when back online
5. Data display uses last-known values

## Best Practices

1. **Always refetch after mutations**: Call fetchData() after any POST/PUT/DELETE
2. **Use appropriate intervals**: Critical modules poll faster
3. **Handle errors gracefully**: Show user-friendly error messages
4. **Indicate sync status**: Use SyncIndicator component
5. **Cancel pending requests**: Use AbortController for cleanup
6. **Skip invisible tabs**: Check document.visibilityState before polling

## Updated Modules

The following modules have been updated with enhanced sync:

- ✅ Holding Area (15s, with visibility refresh)
- ✅ PACU (15s, with visibility refresh)
- ✅ Surgeries (30s, with visibility refresh)
- ✅ Blood Bank (30s, with visibility refresh)
- ✅ Inventory (60s, with visibility refresh)
- ✅ And many more...

## Troubleshooting

### Data not syncing?
1. Check browser console for errors
2. Verify network connectivity
3. Ensure API routes return proper JSON
4. Check if tab is in foreground

### High server load?
1. Increase refresh intervals
2. Reduce data payload size
3. Implement server-side pagination
4. Add caching headers

### Stale data appearing?
1. Force refresh with manual button
2. Clear browser cache
3. Check for caching middleware
4. Verify database connection

## Future Improvements

- [ ] WebSocket for real-time updates
- [ ] Service Worker for offline caching
- [ ] Conflict resolution for concurrent edits
- [ ] Selective sync (only changed records)
- [ ] Compression for large payloads
