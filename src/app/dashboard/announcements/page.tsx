'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import {
  Volume2,
  Plus,
  Calendar,
  Clock,
  Repeat,
  Trash2,
  Play,
  Pause,
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  FileAudio,
  Radio,
  StopCircle,
} from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  description: string | null;
  audioFileName: string;
  audioData: string;
  audioMimeType: string;
  audioDurationSec: number | null;
  scheduledDate: string;
  endDate: string | null;
  frequency: 'ONE_TIME' | 'DAILY' | 'WEEKLY' | 'CUSTOM_INTERVAL';
  repeatDays: string | null;
  customIntervalMin: number | null;
  lastPlayedAt: string | null;
  playCount: number;
  status: string;
  createdByName: string;
  createdAt: string;
  _count?: { playbackLogs: number };
}

const FREQUENCY_LABELS: Record<string, string> = {
  ONE_TIME: 'One Time',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  CUSTOM_INTERVAL: 'Custom Interval',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700',
  PLAYED: 'bg-purple-100 text-purple-700',
  EXPIRED: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AnnouncementsPage() {
  const { data: session } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'played' | 'expired'>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Create form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [frequency, setFrequency] = useState<string>('ONE_TIME');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [customIntervalMin, setCustomIntervalMin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch('/api/announcements');
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/m4a', 'audio/x-m4a'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|aac|m4a)$/i)) {
      alert('Please upload an audio file (MP3, WAV, OGG, AAC, M4A)');
      return;
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      alert('Audio file must be under 10MB');
      return;
    }

    setAudioFile(file);
    const url = URL.createObjectURL(file);
    setAudioPreviewUrl(url);
  };

  const toggleDay = (day: number) => {
    setRepeatDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const handleCreate = async () => {
    if (!title.trim() || !audioFile || !scheduledDate || !scheduledTime) {
      alert('Please fill in title, upload audio, and set schedule date/time');
      return;
    }

    setSubmitting(true);
    try {
      // Convert file to base64
      const reader = new FileReader();
      const audioData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(audioFile);
      });

      // Get audio duration
      let audioDurationSec: number | null = null;
      if (audioPreviewUrl) {
        const tempAudio = new Audio(audioPreviewUrl);
        audioDurationSec = await new Promise<number>((resolve) => {
          tempAudio.addEventListener('loadedmetadata', () => {
            resolve(Math.round(tempAudio.duration));
          });
          tempAudio.addEventListener('error', () => resolve(0));
          // Timeout fallback
          setTimeout(() => resolve(0), 3000);
        });
      }

      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);

      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          audioFileName: audioFile.name,
          audioData,
          audioMimeType: audioFile.type || 'audio/mpeg',
          audioDurationSec,
          scheduledDate: scheduledDateTime.toISOString(),
          endDate: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : null,
          frequency,
          repeatDays: frequency === 'WEEKLY' ? repeatDays : null,
          customIntervalMin: frequency === 'CUSTOM_INTERVAL' ? customIntervalMin : null,
        }),
      });

      if (res.ok) {
        resetForm();
        setShowCreateModal(false);
        fetchAnnouncements();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create announcement');
      }
    } catch (error) {
      console.error('Error creating announcement:', error);
      alert('An error occurred while creating the announcement');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setAudioFile(null);
    setAudioPreviewUrl(null);
    setScheduledDate('');
    setScheduledTime('');
    setEndDate('');
    setFrequency('ONE_TIME');
    setRepeatDays([]);
    setCustomIntervalMin('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePlayPreview = (announcement: Announcement) => {
    if (playingId === announcement.id) {
      // Stop
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingId(null);
      return;
    }

    // Play
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(announcement.audioData);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      setPlayingId(null);
      alert('Failed to play audio');
    };
    audioRef.current = audio;
    audio.play();
    setPlayingId(announcement.id);
  };

  const handlePlayNow = async (announcement: Announcement) => {
    // Play the audio
    handlePlayPreview(announcement);

    // Log playback
    try {
      await fetch('/api/announcements/playback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          announcementId: announcement.id,
          playedBySystem: false,
          triggeredByName: session?.user?.name,
        }),
      });
      fetchAnnouncements();
    } catch (error) {
      console.error('Error logging playback:', error);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/announcements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        fetchAnnouncements();
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    try {
      const res = await fetch(`/api/announcements?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAnnouncements();
      }
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  const filteredAnnouncements = announcements.filter(a => {
    if (filter === 'scheduled') return ['SCHEDULED', 'ACTIVE'].includes(a.status);
    if (filter === 'played') return a.status === 'PLAYED' || a.playCount > 0;
    if (filter === 'expired') return ['EXPIRED', 'CANCELLED'].includes(a.status);
    return true;
  });

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--';
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Volume2 className="h-8 w-8" />
            Announcements
          </h1>
          <p className="text-gray-600 mt-2">
            Schedule and manage audio announcements for the theatre complex
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchAnnouncements}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
            title="Refresh announcements"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            title="Create new announcement"
          >
            <Plus className="h-4 w-4" /> New Announcement
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-2xl font-bold">{announcements.length}</p>
            </div>
            <Volume2 className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Scheduled</p>
              <p className="text-2xl font-bold">
                {announcements.filter(a => ['SCHEDULED', 'ACTIVE'].includes(a.status)).length}
              </p>
            </div>
            <Calendar className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Played</p>
              <p className="text-2xl font-bold">
                {announcements.filter(a => a.playCount > 0).length}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-purple-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Repeating</p>
              <p className="text-2xl font-bold">
                {announcements.filter(a => a.frequency !== 'ONE_TIME').length}
              </p>
            </div>
            <Repeat className="h-8 w-8 text-orange-600" />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="flex border-b border-gray-200">
          {[
            { key: 'all', label: 'All' },
            { key: 'scheduled', label: 'Scheduled / Active' },
            { key: 'played', label: 'Played' },
            { key: 'expired', label: 'Expired / Cancelled' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={`px-6 py-3 font-medium ${
                filter === tab.key
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title={`Filter: ${tab.label}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Announcements List */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <Volume2 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No announcements found</h3>
          <p className="text-gray-600">Click &quot;New Announcement&quot; to create one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAnnouncements.map((a) => (
            <div
              key={a.id}
              className={`bg-white rounded-lg shadow-sm p-6 border-l-4 ${
                a.status === 'SCHEDULED' || a.status === 'ACTIVE'
                  ? 'border-green-500'
                  : a.status === 'EXPIRED' || a.status === 'CANCELLED'
                  ? 'border-gray-300'
                  : 'border-blue-500'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{a.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[a.status] || 'bg-gray-100 text-gray-700'}`}>
                      {a.status}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                      {FREQUENCY_LABELS[a.frequency] || a.frequency}
                    </span>
                  </div>

                  {a.description && (
                    <p className="text-gray-600 text-sm mb-2">{a.description}</p>
                  )}

                  <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <FileAudio className="h-4 w-4" />
                      {a.audioFileName} ({formatDuration(a.audioDurationSec)})
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Scheduled: {formatDateTime(a.scheduledDate)}
                    </span>
                    {a.endDate && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        Until: {formatDateTime(a.endDate)}
                      </span>
                    )}
                    {a.frequency === 'WEEKLY' && a.repeatDays && (
                      <span className="flex items-center gap-1">
                        <Repeat className="h-4 w-4" />
                        {(() => {
                          try {
                            const days = JSON.parse(a.repeatDays);
                            return days.map((d: number) => DAY_NAMES[d]).join(', ');
                          } catch {
                            return a.repeatDays;
                          }
                        })()}
                      </span>
                    )}
                    {a.frequency === 'CUSTOM_INTERVAL' && a.customIntervalMin && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        Every {a.customIntervalMin} min
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Radio className="h-4 w-4" />
                      Played {a.playCount}x
                    </span>
                    {a.lastPlayedAt && (
                      <span>Last: {formatDateTime(a.lastPlayedAt)}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handlePlayPreview(a)}
                    className={`p-2 rounded-lg ${
                      playingId === a.id
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                    title={playingId === a.id ? 'Stop preview' : 'Preview audio'}
                  >
                    {playingId === a.id ? <StopCircle className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </button>
                  {['SCHEDULED', 'ACTIVE'].includes(a.status) && (
                    <button
                      onClick={() => handlePlayNow(a)}
                      className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                      title="Play now (manual trigger)"
                    >
                      <Volume2 className="h-5 w-5" />
                    </button>
                  )}
                  {a.status === 'SCHEDULED' && (
                    <button
                      onClick={() => handleUpdateStatus(a.id, 'CANCELLED')}
                      className="p-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200"
                      title="Cancel this announcement"
                    >
                      <Pause className="h-5 w-5" />
                    </button>
                  )}
                  {a.status === 'CANCELLED' && (
                    <button
                      onClick={() => handleUpdateStatus(a.id, 'SCHEDULED')}
                      className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                      title="Re-schedule this announcement"
                    >
                      <RefreshCw className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                    title="Delete announcement"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Volume2 className="h-6 w-6" />
                New Announcement
              </h2>
              <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-lg" title="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Morning Briefing, Fire Drill Notice"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  title="Announcement title"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Admin notes about this announcement"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  title="Announcement description"
                />
              </div>

              {/* Audio Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Audio File <span className="text-red-500">*</span>
                </label>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {audioFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileAudio className="h-8 w-8 text-blue-600" />
                      <div>
                        <p className="font-medium text-gray-900">{audioFile.name}</p>
                        <p className="text-sm text-gray-500">
                          {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setAudioFile(null); setAudioPreviewUrl(null); }}
                        className="p-1 hover:bg-red-100 rounded"
                        title="Remove file"
                      >
                        <X className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600">Click to upload audio file</p>
                      <p className="text-xs text-gray-400 mt-1">MP3, WAV, OGG, AAC, M4A — Max 10MB</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.aac,.m4a"
                  onChange={handleFileSelect}
                  className="hidden"
                  title="Upload audio file"
                />
                {audioPreviewUrl && (
                  <audio controls src={audioPreviewUrl} className="w-full mt-3" />
                )}
              </div>

              {/* Schedule Date & Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Schedule Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    title="Scheduled date"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Schedule Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    title="Scheduled time"
                  />
                </div>
              </div>

              {/* Frequency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setFrequency(key)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        frequency === key
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                      title={`Set frequency to ${label}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Weekly Day Picker */}
              {frequency === 'WEEKLY' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Repeat On</label>
                  <div className="flex gap-2">
                    {DAY_NAMES.map((day, idx) => (
                      <button
                        key={idx}
                        onClick={() => toggleDay(idx)}
                        className={`w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                          repeatDays.includes(idx)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        title={`Toggle ${day}`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Interval */}
              {frequency === 'CUSTOM_INTERVAL' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Repeat Every (minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={customIntervalMin}
                    onChange={(e) => setCustomIntervalMin(e.target.value)}
                    placeholder="e.g. 60 for every hour"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    title="Custom interval in minutes"
                  />
                </div>
              )}

              {/* End Date (for repeating) */}
              {frequency !== 'ONE_TIME' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date (optional — leave blank for indefinite)
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    title="End date for repeating announcements"
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                title="Cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting || !title.trim() || !audioFile || !scheduledDate || !scheduledTime}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                title="Schedule announcement"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4" />
                    Schedule Announcement
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
