'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, User, Activity, Droplet } from 'lucide-react';

interface EmergencyAlert {
  id: string;
  patientName: string;
  age: number;
  gender: string;
  procedureName: string;
  surgeonName: string;
  diagnosis: string;
  priority: 'CRITICAL' | 'URGENT' | 'EMERGENCY';
  estimatedDuration: string;
  bloodType?: string;
  specialRequirements?: string;
  allergies?: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'IN_THEATRE' | 'RESOLVED';
  createdAt: string;
}

export default function EmergencyAlertsDisplayPage() {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Fetch alerts initially
    fetchAlerts();

    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchAlerts, 10000);

    // Update time every second
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timeInterval);
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/emergency-alerts?status=ACTIVE,ACKNOWLEDGED,IN_THEATRE');
      if (response.ok) {
        const data = await response.json();
        setAlerts(data);
      }
    } catch (error) {
      console.error('Error fetching emergency alerts:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'from-red-600 to-red-800';
      case 'URGENT':
        return 'from-orange-500 to-orange-700';
      default:
        return 'from-yellow-500 to-yellow-700';
    }
  };

  const getPriorityTextColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'text-red-600';
      case 'URGENT':
        return 'text-orange-600';
      default:
        return 'text-yellow-600';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'IN_THEATRE':
        return 'bg-green-600';
      case 'ACKNOWLEDGED':
        return 'bg-blue-600';
      default:
        return 'bg-red-600 animate-pulse';
    }
  };

  const getTimeSince = (date: string) => {
    const now = new Date();
    const created = new Date(date);
    const diffMinutes = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
    
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else {
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      return `${hours}h ${minutes}m ago`;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header Bar */}
      <div className="bg-red-600 text-white py-6 px-8 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <AlertTriangle className="h-12 w-12 animate-pulse" />
            <div>
              <h1 className="text-4xl font-bold tracking-tight">EMERGENCY SURGERIES</h1>
              <p className="text-red-100 text-lg">University of Nigeria Teaching Hospital Ituku Ozalla</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold font-mono">
              {currentTime.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit',
                hour12: false 
              })}
            </div>
            <div className="text-xl text-red-100">
              {currentTime.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-8">
        {alerts.length === 0 ? (
          <div className="bg-gray-800 rounded-2xl p-20 text-center shadow-2xl">
            <div className="flex flex-col items-center justify-center">
              <Activity className="h-32 w-32 text-gray-600 mb-6" />
              <h2 className="text-5xl font-bold text-gray-300 mb-4">No Active Emergency Alerts</h2>
              <p className="text-2xl text-gray-500">All systems operational</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {alerts.map((alert, index) => (
              <div
                key={alert.id}
                className={`bg-gradient-to-r ${getPriorityColor(alert.priority)} rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-500 hover:scale-[1.02]`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="bg-white bg-opacity-95 p-8">
                  {/* Alert Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3">
                        <span className={`px-6 py-2 rounded-full text-2xl font-bold ${getStatusColor(alert.status)} text-white shadow-lg`}>
                          {alert.priority}
                        </span>
                        <span className="px-4 py-2 rounded-full text-lg font-medium bg-gray-800 text-white">
                          {alert.status.replace('_', ' ')}
                        </span>
                      </div>
                      <h2 className="text-5xl font-bold text-gray-900 mb-2">
                        {alert.patientName}
                      </h2>
                      <div className="flex items-center gap-6 text-2xl text-gray-700">
                        <span>{alert.age} years • {alert.gender}</span>
                        {alert.bloodType && (
                          <div className="flex items-center gap-2">
                            <Droplet className="h-6 w-6 text-red-600" />
                            <span className="font-bold text-red-600">{alert.bloodType}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-3xl font-bold ${getPriorityTextColor(alert.priority)} mb-2`}>
                        {getTimeSince(alert.createdAt)}
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 text-xl">
                        <Clock className="h-6 w-6" />
                        <span>{alert.estimatedDuration}</span>
                      </div>
                    </div>
                  </div>

                  {/* Procedure Details */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 mb-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-gray-600 text-xl mb-2">Procedure</p>
                        <p className="text-3xl font-bold text-gray-900">{alert.procedureName}</p>
                      </div>
                      <div>
                        <p className="text-gray-600 text-xl mb-2 flex items-center gap-2">
                          <User className="h-6 w-6" />
                          Surgeon
                        </p>
                        <p className="text-3xl font-bold text-gray-900">{alert.surgeonName}</p>
                      </div>
                    </div>
                  </div>

                  {/* Diagnosis */}
                  <div className="bg-yellow-50 border-l-8 border-yellow-500 rounded-lg p-6 mb-6">
                    <p className="text-gray-700 text-xl mb-2 font-semibold">Diagnosis</p>
                    <p className="text-2xl text-gray-900">{alert.diagnosis}</p>
                  </div>

                  {/* Allergies Alert */}
                  {alert.allergies && (
                    <div className="bg-red-50 border-l-8 border-red-600 rounded-lg p-6 mb-6">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-10 w-10 text-red-600 flex-shrink-0 mt-1 animate-pulse" />
                        <div>
                          <p className="text-red-900 text-2xl font-bold mb-2">⚠️ ALLERGY ALERT</p>
                          <p className="text-xl text-red-800">{alert.allergies}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Special Requirements */}
                  {alert.specialRequirements && (
                    <div className="bg-purple-50 border-l-8 border-purple-500 rounded-lg p-6">
                      <p className="text-purple-900 text-xl font-semibold mb-2">Special Requirements</p>
                      <p className="text-xl text-purple-800">{alert.specialRequirements}</p>
                    </div>
                  )}
                </div>

                {/* Animated Bottom Bar */}
                <div className="h-3 bg-gradient-to-r from-transparent via-white to-transparent opacity-50 animate-pulse"></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 bg-opacity-90 text-white py-4 px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 bg-red-600 rounded-full animate-pulse"></div>
            <span className="text-xl">Live Updates - Refreshes every 10 seconds</span>
          </div>
          <div className="text-xl">
            Active Alerts: <span className="font-bold text-2xl">{alerts.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
