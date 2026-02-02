'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, Clock, User, Activity, Droplet, Volume2, VolumeX } from 'lucide-react';

interface EmergencyAlert {
  id: string;
  patientName: string;
  folderNumber?: string;
  age: number;
  gender: string;
  procedureName: string;
  surgeonName: string;
  surgicalUnit?: string;
  indication?: string;
  diagnosis: string;
  priority: 'CRITICAL' | 'URGENT' | 'EMERGENCY';
  estimatedDuration: string;
  bloodType?: string;
  bloodRequired?: boolean;
  specialRequirements?: string;
  allergies?: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'IN_THEATRE' | 'RESOLVED';
  createdAt: string;
  alertTriggeredAt?: string;
  additionalNotes?: string;
}

export default function EmergencyAlertsDisplayPage() {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [lastAnnouncementTime, setLastAnnouncementTime] = useState<Record<string, number>>({});
  const announcementIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio context
  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    setAudioEnabled(true);
  }, []);

  // Play alert tone using Web Audio API
  const playAlertTone = useCallback(() => {
    if (!audioEnabled || !audioContextRef.current) return;
    
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    // Create oscillator for alert sound
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Alert tone pattern: 3 beeps
    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    
    // Beep pattern
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.setValueAtTime(0, ctx.currentTime + 0.2);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(0, ctx.currentTime + 0.5);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime + 0.6);
    gainNode.gain.setValueAtTime(0, ctx.currentTime + 0.8);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.9);
  }, [audioEnabled]);

  // Text-to-speech announcement
  const announceEmergency = useCallback((alert: EmergencyAlert) => {
    if (!audioEnabled || !('speechSynthesis' in window)) return;
    
    // Play alert tone first
    playAlertTone();
    
    // Wait a bit then speak
    setTimeout(() => {
      const message = `Attention! Emergency surgery alert. 
        Patient ${alert.patientName}, ${alert.age} years old, ${alert.gender}. 
        Procedure: ${alert.procedureName}. 
        Surgeon: ${alert.surgeonName}. 
        Unit: ${alert.surgicalUnit || 'Not specified'}. 
        ${alert.bloodRequired ? 'Blood transfusion required.' : ''}
        Priority: ${alert.priority}. 
        Please respond immediately.`;
      
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 0.9; // Slightly slower for clarity
      utterance.pitch = 1;
      utterance.volume = 1; // Maximum volume
      utterance.lang = 'en-US';
      
      // Use a clear voice if available
      const voices = speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Female')) 
        || voices.find(v => v.lang.startsWith('en'));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      speechSynthesis.speak(utterance);
    }, 1000);
  }, [audioEnabled, playAlertTone]);

  // Announce all active unacknowledged alerts every 2 minutes
  const announceActiveAlerts = useCallback(() => {
    const now = Date.now();
    const twoMinutes = 2 * 60 * 1000;
    
    alerts
      .filter(alert => alert.status === 'ACTIVE')
      .forEach(alert => {
        const lastAnnounced = lastAnnouncementTime[alert.id] || 0;
        
        if (now - lastAnnounced >= twoMinutes) {
          announceEmergency(alert);
          setLastAnnouncementTime(prev => ({
            ...prev,
            [alert.id]: now
          }));
        }
      });
  }, [alerts, lastAnnouncementTime, announceEmergency]);

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

  // Set up announcement interval
  useEffect(() => {
    if (audioEnabled) {
      // Initial announcement for any new active alerts
      const activeAlerts = alerts.filter(a => a.status === 'ACTIVE');
      activeAlerts.forEach(alert => {
        if (!lastAnnouncementTime[alert.id]) {
          announceEmergency(alert);
          setLastAnnouncementTime(prev => ({
            ...prev,
            [alert.id]: Date.now()
          }));
        }
      });

      // Check every 30 seconds if we need to announce (every 2 min)
      announcementIntervalRef.current = setInterval(announceActiveAlerts, 30000);
    }

    return () => {
      if (announcementIntervalRef.current) {
        clearInterval(announcementIntervalRef.current);
      }
    };
  }, [audioEnabled, alerts, announceActiveAlerts, announceEmergency, lastAnnouncementTime]);

  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/emergency-alerts?displayOnTv=true');
      if (response.ok) {
        const data = await response.json();
        setAlerts(data);
        
        // Check for escalation every time we fetch alerts
        await checkAndTriggerEscalation();
      }
    } catch (error) {
      console.error('Error fetching emergency alerts:', error);
    }
  };
  
  // Trigger escalation for alerts not acknowledged after 15 minutes
  const checkAndTriggerEscalation = async () => {
    try {
      await fetch('/api/emergency-alerts/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      // Silent fail - escalation will be retried next refresh
      console.error('Error checking escalation:', error);
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

  // Check if escalation deadline has passed (15 minutes without acknowledgment)
  const getEscalationStatus = (alert: EmergencyAlert) => {
    if (alert.status !== 'ACTIVE') return null;
    
    const created = new Date(alert.alertTriggeredAt || alert.createdAt);
    const fifteenMinutes = 15 * 60 * 1000;
    const deadline = new Date(created.getTime() + fifteenMinutes);
    const now = new Date();
    
    if (now > deadline) {
      return { escalated: true, timeRemaining: 0 };
    }
    
    const remaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60));
    return { escalated: false, timeRemaining: remaining };
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
          
          {/* Audio Control Button */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => {
                if (!audioEnabled) {
                  initAudio();
                } else {
                  setAudioEnabled(false);
                  speechSynthesis.cancel();
                }
              }}
              className={`flex items-center gap-3 px-6 py-3 rounded-xl font-bold text-xl transition-all ${
                audioEnabled 
                  ? 'bg-green-500 hover:bg-green-600 text-white' 
                  : 'bg-white text-red-600 hover:bg-red-50'
              }`}
            >
              {audioEnabled ? (
                <>
                  <Volume2 className="h-8 w-8" />
                  Audio ON
                </>
              ) : (
                <>
                  <VolumeX className="h-8 w-8" />
                  Click to Enable Audio
                </>
              )}
            </button>
            
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
                      {/* Escalation Status */}
                      {alert.status === 'ACTIVE' && (() => {
                        const escalation = getEscalationStatus(alert);
                        if (!escalation) return null;
                        
                        if (escalation.escalated) {
                          return (
                            <div className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg animate-pulse text-lg font-bold">
                              ⚠️ ESCALATED TO ADMINS
                            </div>
                          );
                        }
                        
                        return (
                          <div className={`mt-3 px-4 py-2 rounded-lg text-lg font-medium ${
                            escalation.timeRemaining <= 5 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            Escalates in {escalation.timeRemaining}m
                          </div>
                        );
                      })()}
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
