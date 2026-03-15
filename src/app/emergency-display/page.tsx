'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ==================== TYPES ====================
interface EmergencyItem {
  id: string;
  type: 'ALERT' | 'BOOKING';
  patientName: string;
  folderNumber?: string;
  age?: number;
  gender?: string;
  ward?: string;
  diagnosis?: string;
  procedureName: string;
  surgicalUnit?: string;
  indication?: string;
  surgeonName: string;
  anesthetistName?: string | null;
  theatreName?: string | null;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  status: string;
  classification?: string;
  bloodRequired?: boolean;
  bloodType?: string;
  bloodUnits?: number;
  specialEquipment?: string;
  specialRequirements?: string;
  alertMessage?: string;
  additionalNotes?: string;
  alertTriggeredAt?: string;
  estimatedStartTime?: string;
  requiredByTime?: string;
  requestedAt?: string;
  estimatedDuration?: number;
  createdAt: string;
}

// ==================== AUDIO ALERT ENGINE ====================
// Pleasant, professional hospital notification chime using Web Audio API
// Three-tone ascending chime followed by voice announcement
// Priority-aware: CRITICAL = firm tone, HIGH = moderate, MEDIUM = gentle
class AudioAlertEngine {
  private enabled = false;
  private alarmInterval: NodeJS.Timeout | null = null;
  private playing = false;
  private audioCtx: AudioContext | null = null;
  private lastPlayTime = 0; // cooldown to prevent rapid re-triggers
  private static COOLDOWN_MS = 15_000; // minimum 15s between announcements

  init() {
    this.enabled = true;
    if (typeof window !== 'undefined') {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Preload audio element during user gesture so browser allows playback
      if (!this.audioElement) {
        this.audioElement = new Audio('/audio/announcement-default.mp3');
        this.audioElement.volume = 1.0;
        this.audioElement.load();
        // Unlock audio on iOS/Chrome by playing a silent blip
        this.audioElement.play().then(() => {
          this.audioElement!.pause();
          this.audioElement!.currentTime = 0;
          console.log('[AudioEngine] Audio element unlocked');
        }).catch(() => {
          console.log('[AudioEngine] Audio unlock deferred');
        });
      }
    }
  }

  isEnabled() { return this.enabled; }
  isPlaying() { return this.playing; }
  hasAlarmRunning() { return this.alarmInterval !== null; }

  disable() {
    this.enabled = false;
    this.playing = false;
    this.stopContinuousAlarm();
    // Stop any playing audio element
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
  }

  // Play a single clean tone at given frequency and duration
  private playTone(freq: number, startTime: number, duration: number, volume: number) {
    if (!this.audioCtx) return;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    // Smooth envelope: quick attack, sustain, gentle fade
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.05);
    gain.gain.setValueAtTime(volume, startTime + duration - 0.15);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  // Play a pleasant 3-tone ascending chime (hospital notification style)
  private playChime(priority: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.audioCtx) { resolve(); return; }
      // Resume audio context if suspended (browser policy)
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      let tones: [number, number, number][];   // [freq, duration, volume]
      let gap: number;

      switch (priority) {
        case 'CRITICAL':
          // Firm but pleasant: C5 → E5 → G5 → C6 (major arpeggio, brighter)
          tones = [[523, 0.3, 0.35], [659, 0.3, 0.35], [784, 0.3, 0.35], [1047, 0.5, 0.3]];
          gap = 0.15;
          break;
        case 'HIGH':
          // Moderate: C5 → E5 → G5 (major triad)
          tones = [[523, 0.35, 0.3], [659, 0.35, 0.3], [784, 0.5, 0.28]];
          gap = 0.18;
          break;
        default:
          // Gentle: E5 → G5 → B5 (open, warm)
          tones = [[659, 0.4, 0.25], [784, 0.4, 0.25], [988, 0.55, 0.22]];
          gap = 0.22;
          break;
      }

      let t = now + 0.05;
      for (const [freq, dur, vol] of tones) {
        this.playTone(freq, t, dur, vol);
        t += dur + gap;
      }

      // Total chime duration
      const totalDuration = (t - now) * 1000 + 200;
      setTimeout(resolve, totalDuration);
    });
  }

  // Play pre-recorded voice announcement MP3.
  // Place your recordings in /public/audio/:
  //   announcement-critical.mp3  — for CRITICAL priority
  //   announcement-high.mp3      — for HIGH priority
  //   announcement-default.mp3   — fallback for all priorities
  // If a priority-specific file doesn't exist, falls back to announcement-default.mp3
  private audioElement: HTMLAudioElement | null = null;

  private playAnnouncement(priority: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        this.playing = false;
        resolve();
        return;
      }

      // Pick the best matching audio file for this priority
      const priorityFile = priority === 'CRITICAL'
        ? '/audio/announcement-critical.mp3'
        : priority === 'HIGH'
        ? '/audio/announcement-high.mp3'
        : '/audio/announcement-default.mp3';

      const fallbackFile = '/audio/announcement-default.mp3';

      // Reuse preloaded audio element (created during init user gesture)
      if (!this.audioElement) {
        this.audioElement = new Audio(fallbackFile);
        this.audioElement.volume = 1.0;
      }

      const audio = this.audioElement;
      audio.pause();
      audio.currentTime = 0;
      audio.src = priorityFile;
      audio.volume = 1.0;

      const cleanup = () => {
        this.playing = false;
        resolve();
      };

      // Safety timeout: 3 minutes max
      const safetyTimeout = setTimeout(cleanup, 180000);

      audio.onended = () => { clearTimeout(safetyTimeout); cleanup(); };
      audio.onerror = (e) => {
        console.error('[AudioEngine] Audio error:', e);
        // If priority-specific file not found, try fallback
        if (audio.src !== new URL(fallbackFile, window.location.origin).href) {
          console.log('[AudioEngine] Trying fallback:', fallbackFile);
          audio.src = fallbackFile;
          audio.play().catch((err) => { console.error('[AudioEngine] Fallback play failed:', err); clearTimeout(safetyTimeout); cleanup(); });
        } else {
          clearTimeout(safetyTimeout);
          cleanup();
        }
      };

      console.log('[AudioEngine] Playing:', priorityFile);
      audio.play().then(() => {
        console.log('[AudioEngine] Playback started');
      }).catch((err) => {
        console.error('[AudioEngine] Play failed:', err);
        // If priority file fails, try fallback
        if (audio.src !== new URL(fallbackFile, window.location.origin).href) {
          console.log('[AudioEngine] Trying fallback:', fallbackFile);
          audio.src = fallbackFile;
          audio.play().catch((err2) => { console.error('[AudioEngine] Fallback play failed:', err2); clearTimeout(safetyTimeout); cleanup(); });
        } else {
          clearTimeout(safetyTimeout);
          cleanup();
        }
      });
    });
  }

  // Full alert sequence: chime → short pause → recorded voice announcement
  async playVoiceAlert(priority = 'HIGH') {
    if (!this.enabled || this.playing) return;

    // Enforce cooldown — prevent rapid re-triggers from polling/SSE updates
    const now = Date.now();
    if (now - this.lastPlayTime < AudioAlertEngine.COOLDOWN_MS) return;

    this.playing = true;
    this.lastPlayTime = now;

    try {
      await this.playChime(priority);
      // Brief pause between chime and voice
      await new Promise(r => setTimeout(r, 400));
      await this.playAnnouncement(priority);
    } catch {
      this.playing = false;
    }
  }

  playForPriority(priority: string) {
    this.playVoiceAlert(priority);
  }

  // Continuous alert loop — plays every 5 minutes while emergencies exist
  // Safe to call multiple times; will not restart if already running
  startContinuousAlarm(priority: string) {
    // If alarm is already running, don't restart it
    // This prevents SSE/polling updates from re-triggering the alarm loop
    if (this.alarmInterval) return;

    // Play immediately
    this.playVoiceAlert(priority);
    // Then repeat every 5 minutes
    this.alarmInterval = setInterval(() => {
      this.playVoiceAlert(priority);
    }, 300_000);
  }

  stopContinuousAlarm() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
    this.playing = false;
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
  }
}

// ==================== COMPONENT ====================
export default function EmergencyDisplayPage() {
  const [emergencies, setEmergencies] = useState<EmergencyItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'polling'>('connecting');
  const [slideTransition, setSlideTransition] = useState(false);

  const audioRef = useRef<AudioAlertEngine | null>(null);
  const previousIdsRef = useRef<Set<string>>(new Set());
  const slideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize audio engine
  const initAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new AudioAlertEngine();
    }
    audioRef.current.init();
    setAudioEnabled(true);
  }, []);

  const disableAudio = useCallback(() => {
    audioRef.current?.disable();
    setAudioEnabled(false);
  }, []);

  // Enter fullscreen
  const enterFullscreen = useCallback(() => {
    const el = containerRef.current || document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen();
    } else if ((el as any).webkitRequestFullscreen) {
      (el as any).webkitRequestFullscreen();
    }
    setIsFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    setIsFullscreen(false);
  }, []);

  // Process incoming emergency data
  const processEmergencies = useCallback((items: EmergencyItem[]) => {
    const newIds = new Set(items.map(e => e.id));
    const prevIds = previousIdsRef.current;

    // Detect newly added emergencies
    const newlyAdded = items.filter(e => !prevIds.has(e.id));

    if (newlyAdded.length > 0 && audioRef.current?.isEnabled()) {
      // Only play one-shot alert if no continuous alarm is already running
      // The continuous alarm handles ongoing notifications;
      // this handles genuinely new emergencies arriving between alarm cycles
      if (!audioRef.current.hasAlarmRunning()) {
        const highestPriority = newlyAdded.reduce((best, e) => {
          const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
          return (order[e.priority] ?? 2) < (order[best.priority] ?? 2) ? e : best;
        }, newlyAdded[0]);
        audioRef.current.playForPriority(highestPriority.priority);
      }
    }

    previousIdsRef.current = newIds;
    setEmergencies(items);
  }, []);

  // Connect to SSE stream
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionStatus('connecting');
    const es = new EventSource('/api/emergency-display/stream');
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setConnectionStatus('connected');
    });

    es.addEventListener('emergencies', (event) => {
      const data = JSON.parse(event.data);
      const allItems: EmergencyItem[] = [
        ...(data.alerts || []),
        ...(data.bookings || []),
      ];
      processEmergencies(allItems);
    });

    es.addEventListener('reconnect', () => {
      es.close();
      // Reconnect after a short delay
      setTimeout(connectSSE, 1000);
    });

    es.addEventListener('error', () => {
      es.close();
      setConnectionStatus('polling');
      // Fall back to polling
      startPolling();
    });

    es.onerror = () => {
      es.close();
      setConnectionStatus('polling');
      startPolling();
    };
  }, [processEmergencies]);

  // Fallback polling
  const startPolling = useCallback(() => {
    const pollFn = async () => {
      try {
        const res = await fetch('/api/emergency-display');
        if (res.ok) {
          const data = await res.json();
          processEmergencies(data.emergencies || []);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    pollFn(); // Immediate first poll
    const interval = setInterval(pollFn, 5000);
    return () => clearInterval(interval);
  }, [processEmergencies]);

  // Connect on mount
  useEffect(() => {
    // Try SSE first, fall back to polling
    if (typeof EventSource !== 'undefined') {
      connectSSE();
    } else {
      setConnectionStatus('polling');
      const cleanup = startPolling();
      return cleanup;
    }

    return () => {
      eventSourceRef.current?.close();
    };
  }, [connectSSE, startPolling]);

  // Clock — set initial time on client only to avoid hydration mismatch
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Slideshow auto-advance (8 seconds per slide)
  useEffect(() => {
    if (slideTimerRef.current) clearInterval(slideTimerRef.current);

    if (emergencies.length > 1) {
      slideTimerRef.current = setInterval(() => {
        setSlideTransition(true);
        setTimeout(() => {
          setCurrentIndex(prev => (prev + 1) % emergencies.length);
          setSlideTransition(false);
        }, 500); // 500ms transition
      }, 8000);
    } else {
      setCurrentIndex(0);
    }

    return () => {
      if (slideTimerRef.current) clearInterval(slideTimerRef.current);
    };
  }, [emergencies.length]);

  // Keep index in bounds
  useEffect(() => {
    if (currentIndex >= emergencies.length && emergencies.length > 0) {
      setCurrentIndex(0);
    }
  }, [currentIndex, emergencies.length]);

  // Continuous alarm — start once when emergencies appear, stop when cleared.
  // Uses emergencies.length instead of full array to avoid restarting on every SSE update.
  const hasEmergencies = emergencies.length > 0;
  const highestPriorityRef = useRef<string>('MEDIUM');

  // Track highest priority without triggering effect re-runs
  useEffect(() => {
    if (emergencies.length > 0) {
      const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
      const highest = emergencies.reduce((best, e) =>
        (order[e.priority] ?? 2) < (order[best.priority] ?? 2) ? e : best
      , emergencies[0]);
      highestPriorityRef.current = highest.priority;
    }
  }, [emergencies]);

  useEffect(() => {
    if (!audioEnabled || !hasEmergencies) {
      audioRef.current?.stopContinuousAlarm();
      return;
    }

    // Start alarm only if not already running — startContinuousAlarm is now idempotent
    audioRef.current?.startContinuousAlarm(highestPriorityRef.current);

    return () => {
      audioRef.current?.stopContinuousAlarm();
    };
  }, [audioEnabled, hasEmergencies]);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ==================== HELPERS ====================
  const getTimeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  };

  const getTimeUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff <= 0) return 'NOW';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `in ${hrs}h ${mins % 60}m`;
  };

  const getPriorityConfig = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return {
        bg: 'from-red-900 via-red-800 to-red-900',
        headerBg: 'bg-red-700',
        badge: 'bg-red-500 text-white',
        accent: 'border-red-500',
        glow: 'shadow-red-500/50',
        text: 'text-red-300',
        label: '🚨 CRITICAL',
        pulse: true,
      };
      case 'HIGH': return {
        bg: 'from-orange-900 via-orange-800 to-orange-900',
        headerBg: 'bg-orange-700',
        badge: 'bg-orange-500 text-white',
        accent: 'border-orange-500',
        glow: 'shadow-orange-500/50',
        text: 'text-orange-300',
        label: '⚠️ HIGH',
        pulse: false,
      };
      default: return {
        bg: 'from-yellow-900 via-yellow-800 to-yellow-900',
        headerBg: 'bg-yellow-700',
        badge: 'bg-yellow-500 text-black',
        accent: 'border-yellow-500',
        glow: 'shadow-yellow-500/50',
        text: 'text-yellow-300',
        label: '📋 MEDIUM',
        pulse: false,
      };
    }
  };

  const currentEmergency = emergencies[currentIndex];
  const config = currentEmergency ? getPriorityConfig(currentEmergency.priority) : null;

  // ==================== RENDER ====================
  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-black text-white select-none overflow-hidden"
      style={{ cursor: 'none' }}
    >
      {/* ===== TOP BAR ===== */}
      <div className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b-2 border-red-600">
        <div className="flex items-center gap-4">
          <div className={`h-4 w-4 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'polling' ? 'bg-yellow-500' : 'bg-red-500'} animate-pulse`} />
          <span className="text-lg font-bold tracking-widest text-red-500 uppercase">
            🏥 UNTH Emergency Theatre Display
          </span>
        </div>

        <div className="flex items-center gap-6">
          {/* Audio toggle */}
          <button
            onClick={() => audioEnabled ? disableAudio() : initAudio()}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              audioEnabled
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
            }`}
          >
            {audioEnabled ? '🔊 AUDIO ON' : '🔇 TAP FOR AUDIO'}
          </button>

          {/* Test Audio button — plays announcement immediately */}
          {audioEnabled && (
            <button
              onClick={() => {
                if (audioRef.current) {
                  // Reset cooldown so test always works
                  (audioRef.current as any).lastPlayTime = 0;
                  (audioRef.current as any).playing = false;
                  audioRef.current.playVoiceAlert('HIGH');
                }
              }}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-bold text-sm"
            >
              🔔 TEST AUDIO
            </button>
          )}

          {/* Fullscreen toggle */}
          <button
            onClick={() => isFullscreen ? exitFullscreen() : enterFullscreen()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-sm"
          >
            {isFullscreen ? '◱ EXIT FS' : '⛶ FULLSCREEN'}
          </button>

          {/* Slide counter */}
          {emergencies.length > 0 && (
            <div className="text-lg font-mono text-gray-400">
              {currentIndex + 1} / {emergencies.length}
            </div>
          )}

          {/* Clock */}
          <div className="text-right">
            <div className="text-2xl font-bold font-mono text-white">
              {currentTime ? currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '--:--:--'}
            </div>
            <div className="text-xs text-gray-400">
              {currentTime ? currentTime.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''}
            </div>
          </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      {emergencies.length === 0 ? (
        // No emergencies — idle screen
        <div className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-120px)]">
          <div className="text-center">
            <div className="text-[120px] mb-6 opacity-30">🏥</div>
            <h1 className="text-5xl font-bold text-gray-500 mb-4">No Active Emergencies</h1>
            <p className="text-2xl text-gray-600">All systems operational</p>
            <div className="mt-8 flex items-center gap-3 justify-center text-gray-600">
              <div className="h-3 w-3 bg-green-600 rounded-full animate-pulse" />
              <span className="text-lg">Monitoring for new emergency bookings...</span>
            </div>
          </div>
        </div>
      ) : currentEmergency && config ? (
        // Single emergency slide — FULL SCREEN
        <div
          className={`min-h-[calc(100vh-60px)] bg-gradient-to-br ${config.bg} transition-opacity duration-500 ${
            slideTransition ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {/* Priority Banner */}
          <div className={`${config.headerBg} ${config.pulse ? 'animate-pulse' : ''} py-4 px-8 flex items-center justify-between`}>
            <div className="flex items-center gap-4">
              <span className="text-5xl">
                {currentEmergency.priority === 'CRITICAL' ? '🚨' : currentEmergency.priority === 'HIGH' ? '⚠️' : '📋'}
              </span>
              <div>
                <div className="text-4xl font-black tracking-wider text-white">
                  EMERGENCY SURGERY {currentEmergency.priority === 'CRITICAL' ? '— IMMEDIATE' : ''}
                </div>
                <div className="text-xl text-white/80">
                  Priority: {config.label} &nbsp;|&nbsp; Status: {currentEmergency.status.replace(/_/g, ' ')}
                  {currentEmergency.type === 'BOOKING' && ' (Booking)'}
                </div>
              </div>
            </div>
            <div className={`px-6 py-3 rounded-2xl ${config.badge} text-3xl font-black`}>
              {currentEmergency.priority}
            </div>
          </div>

          {/* Patient Info — LARGE */}
          <div className="px-10 py-8">
            <div className="grid grid-cols-12 gap-8">
              {/* Left: Patient & Procedure */}
              <div className="col-span-7 space-y-6">
                {/* Patient Name — Huge */}
                <div className={`bg-black/30 backdrop-blur rounded-2xl p-8 border-l-8 ${config.accent}`}>
                  <p className={`text-xl font-semibold ${config.text} mb-2`}>👤 PATIENT</p>
                  <h1 className="text-6xl font-black text-white leading-tight">
                    {currentEmergency.patientName}
                  </h1>
                  <div className="mt-4 flex items-center gap-6 text-2xl text-gray-300">
                    {currentEmergency.folderNumber && (
                      <span className="bg-white/10 px-4 py-1 rounded-lg font-mono">
                        📁 {currentEmergency.folderNumber}
                      </span>
                    )}
                    {currentEmergency.age && <span>{currentEmergency.age} yrs</span>}
                    {currentEmergency.gender && <span>{currentEmergency.gender}</span>}
                    {currentEmergency.ward && <span>Ward: {currentEmergency.ward}</span>}
                  </div>
                </div>

                {/* Procedure */}
                <div className={`bg-black/30 backdrop-blur rounded-2xl p-8 border-l-8 ${config.accent}`}>
                  <p className={`text-xl font-semibold ${config.text} mb-2`}>🔪 PROCEDURE</p>
                  <h2 className="text-5xl font-bold text-white leading-tight">
                    {currentEmergency.procedureName}
                  </h2>
                  {currentEmergency.surgicalUnit && (
                    <p className="text-2xl text-gray-300 mt-3">Unit: {currentEmergency.surgicalUnit}</p>
                  )}
                </div>

                {/* Indication / Diagnosis */}
                <div className={`bg-black/30 backdrop-blur rounded-2xl p-6 border-l-8 ${config.accent}`}>
                  <p className={`text-xl font-semibold ${config.text} mb-2`}>📋 INDICATION</p>
                  <p className="text-3xl text-white">
                    {currentEmergency.indication || currentEmergency.diagnosis || 'Emergency case'}
                  </p>
                </div>
              </div>

              {/* Right: Team, Blood, Time */}
              <div className="col-span-5 space-y-6">
                {/* Surgeon */}
                <div className="bg-blue-900/50 backdrop-blur rounded-2xl p-6 border border-blue-500/30">
                  <p className="text-lg font-semibold text-blue-300 mb-1">🩺 SURGEON</p>
                  <p className="text-4xl font-bold text-white">{currentEmergency.surgeonName}</p>
                </div>

                {/* Anesthetist */}
                {currentEmergency.anesthetistName && (
                  <div className="bg-purple-900/50 backdrop-blur rounded-2xl p-6 border border-purple-500/30">
                    <p className="text-lg font-semibold text-purple-300 mb-1">💉 ANAESTHETIST</p>
                    <p className="text-4xl font-bold text-white">{currentEmergency.anesthetistName}</p>
                  </div>
                )}

                {/* Theatre */}
                {currentEmergency.theatreName && (
                  <div className="bg-green-900/50 backdrop-blur rounded-2xl p-6 border border-green-500/30">
                    <p className="text-lg font-semibold text-green-300 mb-1">🏥 THEATRE</p>
                    <p className="text-4xl font-bold text-white">{currentEmergency.theatreName}</p>
                  </div>
                )}

                {/* Blood Required */}
                {currentEmergency.bloodRequired && (
                  <div className="bg-red-900/80 backdrop-blur rounded-2xl p-6 border-2 border-red-500 animate-pulse">
                    <p className="text-lg font-semibold text-red-300 mb-1">🩸 BLOOD REQUIRED</p>
                    <div className="flex items-center gap-4">
                      <span className="text-5xl font-black text-red-400">
                        {currentEmergency.bloodUnits || '?'} UNITS
                      </span>
                      {currentEmergency.bloodType && (
                        <span className="text-3xl text-red-300">({currentEmergency.bloodType})</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Time Info */}
                <div className="bg-gray-800/60 backdrop-blur rounded-2xl p-6 border border-gray-600/30">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-400">ALERT RAISED</p>
                      <p className="text-2xl font-bold text-white">
                        {getTimeSince(currentEmergency.alertTriggeredAt || currentEmergency.requestedAt || currentEmergency.createdAt)}
                      </p>
                    </div>
                    {currentEmergency.estimatedStartTime && (
                      <div>
                        <p className="text-sm text-gray-400">REQUIRED BY</p>
                        <p className="text-2xl font-bold text-yellow-400">
                          {getTimeUntil(currentEmergency.estimatedStartTime)}
                        </p>
                      </div>
                    )}
                    {currentEmergency.requiredByTime && (
                      <div>
                        <p className="text-sm text-gray-400">MUST START BY</p>
                        <p className="text-2xl font-bold text-yellow-400">
                          {getTimeUntil(currentEmergency.requiredByTime)}
                        </p>
                      </div>
                    )}
                    {currentEmergency.estimatedDuration && (
                      <div>
                        <p className="text-sm text-gray-400">EST. DURATION</p>
                        <p className="text-2xl font-bold text-white">
                          {currentEmergency.estimatedDuration} min
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Special Equipment / Requirements */}
                {(currentEmergency.specialEquipment || currentEmergency.specialRequirements) && (
                  <div className="bg-yellow-900/40 backdrop-blur rounded-2xl p-6 border border-yellow-500/30">
                    <p className="text-lg font-semibold text-yellow-300 mb-2">⚡ SPECIAL REQUIREMENTS</p>
                    {currentEmergency.specialEquipment && (
                      <p className="text-xl text-white">{currentEmergency.specialEquipment}</p>
                    )}
                    {currentEmergency.specialRequirements && (
                      <p className="text-xl text-white mt-2">{currentEmergency.specialRequirements}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Additional Notes */}
            {(currentEmergency.additionalNotes || currentEmergency.alertMessage) && (
              <div className="mt-6 bg-black/30 backdrop-blur rounded-2xl p-6 border border-gray-600/30">
                <p className={`text-lg font-semibold ${config.text} mb-2`}>📝 NOTES</p>
                <p className="text-2xl text-gray-200">
                  {currentEmergency.additionalNotes || currentEmergency.alertMessage}
                </p>
              </div>
            )}
          </div>

          {/* ===== SLIDE PROGRESS BAR ===== */}
          {emergencies.length > 1 && (
            <div className="fixed bottom-0 left-0 right-0">
              {/* Slide indicators */}
              <div className="flex items-center justify-center gap-3 py-3 bg-black/60 backdrop-blur">
                {emergencies.map((e, i) => (
                  <button
                    key={e.id}
                    onClick={() => { setCurrentIndex(i); }}
                    className={`transition-all duration-300 rounded-full ${
                      i === currentIndex
                        ? 'w-12 h-4 bg-white'
                        : `w-4 h-4 ${e.priority === 'CRITICAL' ? 'bg-red-500' : e.priority === 'HIGH' ? 'bg-orange-500' : 'bg-yellow-500'} opacity-60 hover:opacity-100`
                    }`}
                    title={`${e.patientName} — ${e.priority}`}
                  />
                ))}
              </div>
              {/* Auto-advance progress bar */}
              <div className="h-1 bg-gray-800">
                <div
                  className="h-full bg-white/50 transition-all"
                  style={{
                    width: '100%',
                    animation: 'slideProgress 8s linear infinite',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* ===== INLINE STYLES FOR ANIMATIONS ===== */}
      <style jsx global>{`
        @keyframes slideProgress {
          from { width: 0%; }
          to { width: 100%; }
        }
        html, body {
          overflow: hidden;
          margin: 0;
          padding: 0;
        }
        /* Hide cursor in fullscreen */
        :fullscreen { cursor: none; }
        /* Android kiosk styles */
        @media screen and (max-width: 1024px) {
          .text-6xl { font-size: 2.5rem; }
          .text-5xl { font-size: 2rem; }
          .text-4xl { font-size: 1.75rem; }
          .text-3xl { font-size: 1.5rem; }
        }
      `}</style>
    </div>
  );
}
