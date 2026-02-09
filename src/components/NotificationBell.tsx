'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Clock,
  AlertTriangle,
  Calendar,
  Package,
  Wrench,
  Heart,
  ArrowLeftRight,
  Bed,
  X,
  ChevronRight,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useNotifications, type Notification, type TimelineItem } from '@/lib/useNotifications';

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function getTimeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return 'Overdue';
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (minutes < 60) return `in ${minutes}m`;
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.floor(hours / 24)}d`;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'SURGERY_SCHEDULED': return <Calendar className="w-4 h-4" />;
    case 'STOCK_ALERT': return <Package className="w-4 h-4" />;
    case 'EQUIPMENT_FAULT':
    case 'FAULT_REPORTED': return <AlertTriangle className="w-4 h-4" />;
    case 'MAINTENANCE_DUE': return <Wrench className="w-4 h-4" />;
    case 'HOLDING_AREA_ALERT': return <Bed className="w-4 h-4" />;
    case 'PACU_ALERT': return <Heart className="w-4 h-4" />;
    case 'REQUISITION_APPROVAL': return <ArrowLeftRight className="w-4 h-4" />;
    case 'RED_ALERT':
    case 'SAFETY_CONCERN': return <AlertTriangle className="w-4 h-4 text-red-500" />;
    default: return <Bell className="w-4 h-4" />;
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'URGENT': return 'border-l-red-500 bg-red-50';
    case 'HIGH': return 'border-l-orange-500 bg-orange-50';
    default: return 'border-l-blue-500 bg-white';
  }
}

function getTimelineIcon(category: string) {
  switch (category) {
    case 'surgery': return <Calendar className="w-4 h-4 text-blue-600" />;
    case 'maintenance': return <Wrench className="w-4 h-4 text-orange-600" />;
    case 'stock': return <Package className="w-4 h-4 text-yellow-600" />;
    case 'fault': return <AlertTriangle className="w-4 h-4 text-red-600" />;
    case 'holding-area': return <Bed className="w-4 h-4 text-purple-600" />;
    case 'pacu': return <Heart className="w-4 h-4 text-pink-600" />;
    case 'transfer': return <ArrowLeftRight className="w-4 h-4 text-green-600" />;
    default: return <Clock className="w-4 h-4 text-gray-600" />;
  }
}

function getUrgencyBadge(urgency: string) {
  switch (urgency) {
    case 'critical':
      return <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded-full animate-pulse">CRITICAL</span>;
    case 'warning':
      return <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 rounded-full">URGENT</span>;
    default:
      return null;
  }
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'notifications' | 'timeline'>('notifications');
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const {
    notifications,
    unreadCount,
    timeline,
    timelineCounts,
    isConnected,
    isLoading,
    markAsRead,
    markAllAsRead,
    requestPermission,
    fetchNotifications,
    fetchTimeline,
  } = useNotifications();

  // Close panel on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Request notification permission on first open
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      requestPermission();
    }
  }, [isOpen, requestPermission]);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
      setIsOpen(false);
    }
  };

  const handleTimelineClick = (item: TimelineItem) => {
    router.push(item.actionUrl);
    setIsOpen(false);
  };

  const criticalTimelineCount = timeline.filter(t => t.urgency === 'critical').length;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            fetchNotifications();
            fetchTimeline();
          }
        }}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        {unreadCount > 0 || criticalTimelineCount > 0 ? (
          <BellRing className="w-6 h-6 text-primary-700 animate-[ring_0.5s_ease-in-out]" />
        ) : (
          <Bell className="w-6 h-6 text-gray-600" />
        )}

        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[20px] h-5 px-1 text-[11px] font-bold text-white bg-red-500 rounded-full shadow-lg animate-bounce">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* Connection indicator dot */}
        <span className={`absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-gray-300'}`} />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-h-[80vh] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-primary-50 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-800">Notifications</h3>
                {isConnected ? (
                  <span className="flex items-center gap-1 text-[10px] text-green-600">
                    <Wifi className="w-3 h-3" /> Live
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-gray-400">
                    <WifiOff className="w-3 h-3" /> Offline
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Read all
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex mt-2 gap-1">
              <button
                onClick={() => setActiveTab('notifications')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === 'notifications'
                    ? 'bg-primary-100 text-primary-800'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                Alerts {unreadCount > 0 && `(${unreadCount})`}
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === 'timeline'
                    ? 'bg-primary-100 text-primary-800'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                Timeline {criticalTimelineCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px]">
                    {criticalTimelineCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 max-h-[60vh]">
            {activeTab === 'notifications' && (
              <div>
                {isLoading ? (
                  <div className="p-8 text-center text-gray-400">
                    <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-2" />
                    Loading...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    <Bell className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No notifications yet</p>
                    <p className="text-xs mt-1">You&apos;ll be notified about surgeries, alerts, and more</p>
                  </div>
                ) : (
                  notifications.map(notification => (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full text-left px-4 py-3 border-l-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                        getPriorityColor(notification.priority)
                      } ${!notification.isRead ? 'font-medium' : 'opacity-75'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 p-1.5 rounded-lg ${
                          notification.priority === 'URGENT' ? 'bg-red-100' :
                          notification.priority === 'HIGH' ? 'bg-orange-100' : 'bg-blue-50'
                        }`}>
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm truncate">{notification.title}</span>
                            {!notification.isRead && (
                              <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-400">{getTimeAgo(notification.createdAt)}</span>
                            {notification.scheduledAt && (
                              <span className="text-[10px] text-primary-500 flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                {getTimeUntil(notification.scheduledAt)}
                              </span>
                            )}
                          </div>
                        </div>
                        {notification.actionUrl && (
                          <ChevronRight className="w-4 h-4 text-gray-300 mt-1 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {activeTab === 'timeline' && (
              <div>
                {timeline.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No upcoming events</p>
                    <p className="text-xs mt-1">Timeline will show surgeries, deadlines, and alerts</p>
                  </div>
                ) : (
                  <>
                    {/* Summary counts */}
                    <div className="px-4 py-2 bg-gray-50 border-b flex flex-wrap gap-2">
                      {Object.entries(timelineCounts).map(([key, count]) => (
                        count > 0 && (
                          <span key={key} className="text-[10px] px-2 py-0.5 bg-white rounded-full border text-gray-600">
                            {key.replace(/([A-Z])/g, ' $1').trim()}: {count}
                          </span>
                        )
                      ))}
                    </div>

                    {timeline.map((item, index) => (
                      <button
                        key={`${item.category}-${item.id}-${index}`}
                        onClick={() => handleTimelineClick(item)}
                        className="w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 p-1.5 rounded-lg ${
                            item.urgency === 'critical' ? 'bg-red-50' :
                            item.urgency === 'warning' ? 'bg-orange-50' : 'bg-gray-50'
                          }`}>
                            {getTimelineIcon(item.category)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{item.title}</span>
                              {getUrgencyBadge(item.urgency)}
                            </div>
                            {item.subtitle && (
                              <p className="text-xs text-gray-500 mt-0.5 truncate">{item.subtitle}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              {item.time && (
                                <span className={`text-[10px] flex items-center gap-0.5 ${
                                  item.urgency === 'critical' ? 'text-red-600 font-semibold' : 'text-gray-400'
                                }`}>
                                  <Clock className="w-3 h-3" />
                                  {getTimeUntil(item.time)}
                                </span>
                              )}
                              {item.location && (
                                <span className="text-[10px] text-gray-400">{item.location}</span>
                              )}
                              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                                {item.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 mt-1" />
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => {
                router.push('/dashboard/alerts');
                setIsOpen(false);
              }}
              className="w-full text-xs text-center text-primary-600 hover:text-primary-800 font-medium py-1"
            >
              View All Alerts & Events →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
