'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useAdaptivePoll } from '@/lib/useAdaptivePoll';
import { useTabLeader } from '@/lib/useTabLeader';

// Notification list moves with real events; the timeline is aggregated and slow.
const NOTIFICATIONS_POLL_MS = 60_000;
const TIMELINE_POLL_MS = 180_000;

export interface Notification {
  id: string;
  userId: string | null;
  type: string;
  title: string;
  message: string;
  priority: string;
  isRead: boolean;
  actionUrl: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  scheduledAt: string | null;
  deadlineAt: string | null;
  isTimelineCritical: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface TimelineItem {
  category: string;
  title: string;
  subtitle?: string;
  location?: string;
  time?: string;
  status: string;
  urgency: 'critical' | 'warning' | 'upcoming' | 'normal';
  actionUrl: string;
  id: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  timeline: TimelineItem[];
  timelineCounts: Record<string, number>;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

// BroadcastChannel for cross-tab sync
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  broadcastChannel = new BroadcastChannel('orm-notifications');
}

export function useNotifications() {
  const { data: session } = useSession();
  const [state, setState] = useState<NotificationState>({
    notifications: [],
    unreadCount: 0,
    timeline: [],
    timelineCounts: {},
    isConnected: false,
    isLoading: true,
    error: null,
  });


  // Fetch notifications from REST API
  const fetchNotifications = useCallback(async (page = 1) => {
    try {
      const res = await fetch(`/api/notifications?page=${page}&limit=30`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setState(prev => ({
        ...prev,
        notifications: page === 1 ? data.notifications : [...prev.notifications, ...data.notifications],
        unreadCount: data.unreadCount,
        isLoading: false,
        error: null,
        // Reflects "reached the server on the last attempt". The bell shows this
        // as its live/offline indicator.
        isConnected: true,
      }));
      return data;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        isConnected: false,
        error: 'Failed to load notifications',
      }));
      return null;
    }
  }, []);

  // Fetch timeline data
  const fetchTimeline = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/timeline');
      if (!res.ok) throw new Error('Failed to fetch timeline');
      const data = await res.json();
      setState(prev => ({
        ...prev,
        timeline: data.timeline,
        timelineCounts: data.counts,
      }));
      return data;
    } catch {
      return null;
    }
  }, []);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      setState(prev => ({
        ...prev,
        notifications: prev.notifications.map(n =>
          n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, prev.unreadCount - 1),
      }));
      // Broadcast to other tabs
      broadcastChannel?.postMessage({ type: 'MARK_READ', notificationId });
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      setState(prev => ({
        ...prev,
        notifications: prev.notifications.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() })),
        unreadCount: 0,
      }));
      broadcastChannel?.postMessage({ type: 'MARK_ALL_READ' });
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }, []);

  // Cross-tab sync via BroadcastChannel
  useEffect(() => {
    if (!broadcastChannel) return;

    const handleMessage = (event: MessageEvent) => {
      const { type, notificationId, notifications } = event.data;
      switch (type) {
        case 'MARK_READ':
          setState(prev => ({
            ...prev,
            notifications: prev.notifications.map(n =>
              n.id === notificationId ? { ...n, isRead: true } : n
            ),
            unreadCount: Math.max(0, prev.unreadCount - 1),
          }));
          break;
        case 'MARK_ALL_READ':
          setState(prev => ({
            ...prev,
            notifications: prev.notifications.map(n => ({ ...n, isRead: true })),
            unreadCount: 0,
          }));
          break;
        case 'NEW_NOTIFICATIONS':
          setState(prev => ({
            ...prev,
            notifications: [
              ...notifications.filter(
                (n: Notification) => !prev.notifications.some(existing => existing.id === n.id)
              ),
              ...prev.notifications,
            ],
          }));
          break;
      }
    };

    broadcastChannel.addEventListener('message', handleMessage);
    return () => broadcastChannel?.removeEventListener('message', handleMessage);
  }, []);

  // Initial load for every tab, so a newly-opened tab shows the current state
  // immediately rather than waiting for the leader's next poll.
  useEffect(() => {
    if (!session?.user?.id) return;
    fetchNotifications();
    fetchTimeline();
  }, [session?.user?.id, fetchNotifications, fetchTimeline]);

  /*
   * Transport: leader-gated polling, deliberately NOT Server-Sent Events.
   *
   * /api/notifications/stream holds a serverless function open per connection
   * and runs its own 5s database poll inside it (5 queries per tick). Across
   * ~537 staff that is ~320 queries/second against the Supabase pooler plus 537
   * pinned function instances — it would not survive production, and on theatre
   * wifi the dropped connections produce reconnect storms on top.
   *
   * Polling one cheap endpoint instead costs ~9 req/s for the same population,
   * degrades gracefully on a bad link, and needs no reconnect logic. Only the
   * leader tab polls; the others are updated over BroadcastChannel by the
   * handlers above, so extra tabs are free.
   */
  const isLeader = useTabLeader();

  useAdaptivePoll(
    useCallback(async () => {
      await fetchNotifications();
    }, [fetchNotifications]),
    NOTIFICATIONS_POLL_MS,
    { enabled: !!session?.user?.id && isLeader, leading: false }
  );

  // The timeline is derived/aggregated data and moves far more slowly than the
  // notification list, so it gets its own slower cadence.
  useAdaptivePoll(
    useCallback(async () => {
      await fetchTimeline();
    }, [fetchTimeline]),
    TIMELINE_POLL_MS,
    { enabled: !!session?.user?.id && isLeader, leading: false }
  );

  // Request browser notification permission
  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }, []);

  // Register push subscription
  const registerPushSubscription = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      return res.ok;
    } catch (error) {
      console.error('Push subscription failed:', error);
      return false;
    }
  }, []);

  return {
    ...state,
    fetchNotifications,
    fetchTimeline,
    markAsRead,
    markAllAsRead,
    requestPermission,
    registerPushSubscription,
  };
}

// Browser Notification helper
function showBrowserNotification(title: string, body: string, url?: string | null) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  // Don't show if tab is focused
  if (document.visibilityState === 'visible') return;

  const notification = new window.Notification(title, {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: `orm-${Date.now()}`,
    requireInteraction: false,
  });

  if (url) {
    notification.onclick = () => {
      window.focus();
      window.location.href = url;
      notification.close();
    };
  }
}
