'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface SurgicalTiming {
  id: string;
  surgeryId: string;
  patientEnteredRoomTime?: string;
  anesthesiaStartTime?: string;
  anesthesiaReadyTime?: string;
  timeoutStartTime?: string;
  timeoutCompletedTime?: string;
  timeoutPerformedBy?: string;
  incisionTime?: string;
  procedureStartTime?: string;
  procedureEndTime?: string;
  closureStartTime?: string;
  closureEndTime?: string;
  dressingAppliedTime?: string;
  patientExtubatedTime?: string;
  patientLeftRoomTime?: string;
  signOutTime?: string;
  signOutPerformedBy?: string;
  anesthesiaDuration?: number;
  surgicalDuration?: number;
  totalORTime?: number;
  closureDuration?: number;
  delayOccurred: boolean;
  delayReason?: string;
  delayDuration?: number;
  interruptionOccurred: boolean;
  interruptionReason?: string;
  interruptionDuration?: number;
  timingNotes?: string;
  surgery: {
    id: string;
    procedureName: string;
    patient: {
      name: string;
      folderNumber: string;
    };
  };
  events: SurgicalEvent[];
}

interface SurgicalEvent {
  id: string;
  eventType: string;
  eventTime: string;
  recordedBy: string;
  notes?: string;
  minutesFromStart?: number;
}

export default function SurgicalTimingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [timing, setTiming] = useState<SurgicalTiming | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    fetchTiming();
  }, [params.id]);

  const fetchTiming = async () => {
    try {
      const response = await fetch(`/api/surgeries/${params.id}/timing`);
      if (response.ok) {
        const data = await response.json();
        setTiming(data);
        setInitialized(true);
      } else if (response.status === 404) {
        setInitialized(false);
      }
    } catch (error) {
      console.error('Error fetching timing:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeTiming = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/surgeries/${params.id}/timing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientEnteredRoomTime: new Date().toISOString()
        })
      });

      if (response.ok) {
        await fetchTiming();
        alert('Surgical timing initialized successfully!');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to initialize timing');
      }
    } catch (error) {
      console.error('Error initializing timing:', error);
      alert('Failed to initialize timing');
    } finally {
      setSaving(false);
    }
  };

  const recordTime = async (field: string) => {
    if (!timing) return;

    const currentTime = new Date().toISOString();
    setSaving(true);

    try {
      const response = await fetch(`/api/surgeries/${params.id}/timing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...timing,
          [field]: currentTime
        })
      });

      if (response.ok) {
        await fetchTiming();
      } else {
        alert('Failed to record time');
      }
    } catch (error) {
      console.error('Error recording time:', error);
      alert('Failed to record time');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return '-';
    return new Date(timeString).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  if (!initialized) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <h2 className="text-2xl font-bold mb-4">Surgical Timing Not Initialized</h2>
          <p className="text-gray-600 mb-6">
            Start recording surgical timing for this procedure
          </p>
          <button
            onClick={initializeTiming}
            disabled={saving}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300"
          >
            {saving ? 'Initializing...' : 'Start Timing (Patient Entered Room)'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="text-blue-600 hover:text-blue-800 mb-4"
        >
          ← Back to Surgery
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Surgical Timing</h1>
        <p className="text-gray-600 mt-2">
          {timing?.surgery.patient.name} ({timing?.surgery.patient.folderNumber}) - {timing?.surgery.procedureName}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Total OR Time</p>
          <p className="text-2xl font-bold text-primary-600">{formatDuration(timing?.totalORTime)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Surgical Duration</p>
          <p className="text-2xl font-bold text-green-600">{formatDuration(timing?.surgicalDuration)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Anesthesia Duration</p>
          <p className="text-2xl font-bold text-blue-600">{formatDuration(timing?.anesthesiaDuration)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Closure Duration</p>
          <p className="text-2xl font-bold text-purple-600">{formatDuration(timing?.closureDuration)}</p>
        </div>
      </div>

      {/* Pre-Operative Phase */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Pre-Operative Phase</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded">
            <div>
              <p className="font-medium">Patient Entered Room</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.patientEnteredRoomTime)}</p>
            </div>
            <button
              onClick={() => recordTime('patientEnteredRoomTime')}
              disabled={saving || !!timing?.patientEnteredRoomTime}
              className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded">
            <div>
              <p className="font-medium">Anesthesia Start</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.anesthesiaStartTime)}</p>
            </div>
            <button
              onClick={() => recordTime('anesthesiaStartTime')}
              disabled={saving || !!timing?.anesthesiaStartTime}
              className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded">
            <div>
              <p className="font-medium">Anesthesia Ready</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.anesthesiaReadyTime)}</p>
            </div>
            <button
              onClick={() => recordTime('anesthesiaReadyTime')}
              disabled={saving || !!timing?.anesthesiaReadyTime}
              className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>
        </div>
      </div>

      {/* Timeout */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">WHO Surgical Safety Timeout</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 bg-yellow-50 rounded">
            <div>
              <p className="font-medium">Timeout Started</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.timeoutStartTime)}</p>
            </div>
            <button
              onClick={() => recordTime('timeoutStartTime')}
              disabled={saving || !!timing?.timeoutStartTime}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-yellow-50 rounded">
            <div>
              <p className="font-medium">Timeout Completed</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.timeoutCompletedTime)}</p>
            </div>
            <button
              onClick={() => recordTime('timeoutCompletedTime')}
              disabled={saving || !!timing?.timeoutCompletedTime}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>
        </div>
      </div>

      {/* Surgical Phase */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Surgical Phase</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 bg-green-50 rounded">
            <div>
              <p className="font-medium">Incision (Knife to Skin)</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.incisionTime)}</p>
            </div>
            <button
              onClick={() => recordTime('incisionTime')}
              disabled={saving || !!timing?.incisionTime}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-green-50 rounded">
            <div>
              <p className="font-medium">Procedure Start</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.procedureStartTime)}</p>
            </div>
            <button
              onClick={() => recordTime('procedureStartTime')}
              disabled={saving || !!timing?.procedureStartTime}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-green-50 rounded">
            <div>
              <p className="font-medium">Procedure End</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.procedureEndTime)}</p>
            </div>
            <button
              onClick={() => recordTime('procedureEndTime')}
              disabled={saving || !!timing?.procedureEndTime}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-green-50 rounded">
            <div>
              <p className="font-medium">Closure Start</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.closureStartTime)}</p>
            </div>
            <button
              onClick={() => recordTime('closureStartTime')}
              disabled={saving || !!timing?.closureStartTime}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-green-50 rounded">
            <div>
              <p className="font-medium">Closure End</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.closureEndTime)}</p>
            </div>
            <button
              onClick={() => recordTime('closureEndTime')}
              disabled={saving || !!timing?.closureEndTime}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-green-50 rounded">
            <div>
              <p className="font-medium">Dressing Applied</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.dressingAppliedTime)}</p>
            </div>
            <button
              onClick={() => recordTime('dressingAppliedTime')}
              disabled={saving || !!timing?.dressingAppliedTime}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>
        </div>
      </div>

      {/* Post-Operative Phase */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Post-Operative Phase</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 bg-purple-50 rounded">
            <div>
              <p className="font-medium">Patient Extubated</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.patientExtubatedTime)}</p>
            </div>
            <button
              onClick={() => recordTime('patientExtubatedTime')}
              disabled={saving || !!timing?.patientExtubatedTime}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-purple-50 rounded">
            <div>
              <p className="font-medium">Sign Out Completed</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.signOutTime)}</p>
            </div>
            <button
              onClick={() => recordTime('signOutTime')}
              disabled={saving || !!timing?.signOutTime}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-purple-50 rounded">
            <div>
              <p className="font-medium">Patient Left Room</p>
              <p className="text-sm text-gray-600">{formatTime(timing?.patientLeftRoomTime)}</p>
            </div>
            <button
              onClick={() => recordTime('patientLeftRoomTime')}
              disabled={saving || !!timing?.patientLeftRoomTime}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300"
            >
              Record
            </button>
          </div>
        </div>
      </div>

      {/* Delays and Interruptions */}
      {(timing?.delayOccurred || timing?.interruptionOccurred) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">Delays & Interruptions</h2>
          {timing.delayOccurred && (
            <div className="mb-4 p-4 bg-red-50 rounded">
              <p className="font-medium text-red-900">Delay Occurred</p>
              <p className="text-sm text-gray-700">Duration: {timing.delayDuration} minutes</p>
              <p className="text-sm text-gray-700">Reason: {timing.delayReason}</p>
            </div>
          )}
          {timing.interruptionOccurred && (
            <div className="p-4 bg-orange-50 rounded">
              <p className="font-medium text-orange-900">Interruption Occurred</p>
              <p className="text-sm text-gray-700">Duration: {timing.interruptionDuration} minutes</p>
              <p className="text-sm text-gray-700">Reason: {timing.interruptionReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
