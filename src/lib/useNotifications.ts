'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

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

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

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
      }));
      return data;
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false, error: 'Failed to load notifications' }));
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

  // Connect SSE stream
  const connectSSE = useCallback(() => {
    if (!session?.user?.id || typeof window === 'undefined') return;

    // Close existing connection
    eventSourceRef.current?.close();

    const es = new EventSource('/api/notifications/stream');
    eventSourceRef.current = es;

    es.addEventListener('init', (event) => {
      const data = JSON.parse(event.data);
      setState(prev => ({
        ...prev,
        unreadCount: data.unreadCount,
        isConnected: true,
        error: null,
      }));
      reconnectAttempts.current = 0;
    });

    es.addEventListener('notifications', (event) => {
      const data = JSON.parse(event.data);
      setState(prev => ({
        ...prev,
        notifications: [
          ...data.notifications.filter(
            (n: Notification) => !prev.notifications.some(existing => existing.id === n.id)
          ),
          ...prev.notifications,
        ],
        unreadCount: data.unreadCount,
      }));

      // Show browser notification for high-priority items
      data.notifications.forEach((notif: Notification) => {
        if (notif.priority === 'HIGH' || notif.priority === 'URGENT') {
          showBrowserNotification(notif.title, notif.message, notif.actionUrl);
        }
      });

      // Broadcast to other tabs
      broadcastChannel?.postMessage({ type: 'NEW_NOTIFICATIONS', notifications: data.notifications });
    });

    es.addEventListener('timeline-alert', (event) => {
      const data = JSON.parse(event.data);
      // Show browser notification for timeline alerts
      data.events.forEach((evt: any) => {
        showBrowserNotification(`⏰ ${evt.title}`, evt.message, evt.actionUrl);
      });
    });

    es.onerror = () => {
      setState(prev => ({ ...prev, isConnected: false }));
      es.close();

      // Exponential backoff reconnect
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current++;
      reconnectTimeoutRef.current = setTimeout(connectSSE, delay);
    };
  }, [session?.user?.id]);

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

  // Initial load and SSE connection
  useEffect(() => {
    if (!session?.user?.id) return;

    fetchNotifications();
    fetchTimeline();
    connectSSE();

    // Refresh timeline every 2 minutes
    const timelineInterval = setInterval(fetchTimeline, 120000);

    // Re-fetch when tab becomes visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications();
        fetchTimeline();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      clearInterval(timelineInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session?.user?.id, connectSSE, fetchNotifications, fetchTimeline]);

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
