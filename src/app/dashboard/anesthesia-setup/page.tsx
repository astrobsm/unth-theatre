'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Theatre {
  id: string;
  name: string;
}

interface SetupLog {
  id: string;
  status: string;
  isReady: boolean;
  theatreName: string;
  setupStartTime: string;
  readyTime: string | null;
  gasSupplyChecked: boolean;
  suctionChecked: boolean;
  monitorsChecked: boolean;
  ventilatorChecked: boolean;
  anesthesiaMachineChecked: boolean;
  emergencyDrugsChecked: boolean;
  airwayEquipmentChecked: boolean;
  ivEquipmentChecked: boolean;
}

export default function AnesthesiaSetupPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [selectedTheatre, setSelectedTheatre] = useState('');
  const [currentSetupLog, setCurrentSetupLog] = useState<SetupLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showEquipmentCheck, setShowEquipmentCheck] = useState(false);

  // Checklist states
  const [checklist, setChecklist] = useState({
    gasSupplyChecked: false,
    suctionChecked: false,
    monitorsChecked: false,
    ventilatorChecked: false,
    anesthesiaMachineChecked: false,
    emergencyDrugsChecked: false,
    airwayEquipmentChecked: false,
    ivEquipmentChecked: false,
  });

  const [setupNotes, setSetupNotes] = useState('');
  const [blockingIssues, setBlockingIssues] = useState('');

  // Equipment check states
  const [equipmentCheck, setEquipmentCheck] = useState({
    equipmentName: '',
    equipmentType: '',
    serialNumber: '',
    condition: 'OPERATIONAL',
    isFunctional: true,
    malfunctionDescription: '',
    malfunctionSeverity: 'LOW',
    requiresImmediateAttention: false,
    notes: '',
  });

  useEffect(() => {
    fetchTheatres();
  }, []);

  const fetchTheatres = async () => {
    try {
      const response = await fetch('/api/theatres');
      if (response.ok) {
        const data = await response.json();
        setTheatres(data.theatres || []);
      }
    } catch (error) {
      console.error('Error fetching theatres:', error);
    }
  };

  const requestLocation = (): Promise<{ latitude: number; longitude: number; locationName: string; locationAddress: string }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;

          // Reverse geocode to get place name
          try {
            const geocodeResponse = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
            );
            
            if (geocodeResponse.ok) {
              const geocodeData = await geocodeResponse.json();
              const locationName = geocodeData.display_name.split(',')[0] || geocodeData.address.building || geocodeData.address.hospital || 'Unknown Location';
              const locationAddress = geocodeData.display_name;

              resolve({ latitude, longitude, locationName, locationAddress });
            } else {
              reject(new Error('Failed to get location name'));
            }
          } catch (error) {
            reject(error);
          }
        },
        (error) => {
          reject(new Error('Location permission denied. Location is required to log setup.'));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  };

  const startSetup = async () => {
    if (!selectedTheatre) {
      setMessage('Please select a theatre');
      return;
    }

    setLoading(true);
    setMessage('Requesting location...');

    try {
      const location = await requestLocation();
      setMessage('Location captured. Starting setup...');

      const response = await fetch('/api/anesthesia-setup/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theatreId: selectedTheatre,
          latitude: location.latitude,
          longitude: location.longitude,
          locationName: location.locationName,
          locationAddress: location.locationAddress,
          setupDate: new Date().toISOString().split('T')[0],
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✓ ${data.message}`);
        setCurrentSetupLog(data.setupLog);
      } else {
        setMessage(`✗ ${data.error}`);
      }
    } catch (error: any) {
      setMessage(`✗ ${error.message || 'Failed to start setup. Please allow location access.'}`);
    } finally {
      setLoading(false);
    }
  };

  const updateChecklist = async (markAsReady = false) => {
    if (!currentSetupLog) return;

    setLoading(true);
    try {
      const response = await fetch('/api/anesthesia-setup/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupLogId: currentSetupLog.id,
          ...checklist,
          setupNotes,
          blockingIssues,
          markAsReady,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✓ ${data.message}`);
        setCurrentSetupLog(data.setupLog);
      } else {
        setMessage(`✗ ${data.error}`);
      }
    } catch (error) {
      setMessage('✗ Failed to update setup');
    } finally {
      setLoading(false);
    }
  };

  const logEquipmentCheck = async () => {
    if (!currentSetupLog) return;

    setLoading(true);
    try {
      const response = await fetch('/api/anesthesia-setup/equipment-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupLogId: currentSetupLog.id,
          ...equipmentCheck,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✓ Equipment check logged${data.alertSent ? ' (Alert sent for malfunction)' : ''}`);
        setShowEquipmentCheck(false);
        // Reset form
        setEquipmentCheck({
          equipmentName: '',
          equipmentType: '',
          serialNumber: '',
          condition: 'OPERATIONAL',
          isFunctional: true,
          malfunctionDescription: '',
          malfunctionSeverity: 'LOW',
          requiresImmediateAttention: false,
          notes: '',
        });
      } else {
        setMessage(`✗ ${data.error}`);
      }
    } catch (error) {
      setMessage('✗ Failed to log equipment check');
    } finally {
      setLoading(false);
    }
  };

  const endOfDay = async () => {
    if (!currentSetupLog) return;

    const notes = prompt('End of day notes (optional):');
    
    setLoading(true);
    try {
      const response = await fetch('/api/anesthesia-setup/end-of-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupLogId: currentSetupLog.id,
          endOfDayNotes: notes,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✓ ${data.message}`);
        setCurrentSetupLog(null);
      } else {
        setMessage(`✗ ${data.error}`);
      }
    } catch (error) {
      setMessage('✗ Failed to log end of day');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Anesthesia Setup & Equipment Check</h1>

      {message && (
        <div className={`p-4 rounded ${message.includes('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message}
        </div>
      )}

      {!currentSetupLog ? (
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Start Daily Setup</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Select Theatre</label>
              <select
                className="input-field"
                value={selectedTheatre}
                onChange={(e) => setSelectedTheatre(e.target.value)}
              >
                <option value="">-- Select Theatre --</option>
                {theatres.map((theatre) => (
                  <option key={theatre.id} value={theatre.id}>
                    {theatre.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={startSetup}
              disabled={loading || !selectedTheatre}
              className="btn-primary disabled:opacity-50"
            >
              {loading ? 'Starting...' : '📍 Start Setup (Location Required)'}
            </button>

            <p className="text-sm text-gray-600">
              ⚠️ You must allow location access to log setup. The system will capture your exact location name.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Setup Info */}
          <div className="card bg-blue-50">
            <h2 className="text-xl font-bold mb-2">{currentSetupLog.theatreName}</h2>
            <p className="text-sm text-gray-600">Started: {new Date(currentSetupLog.setupStartTime).toLocaleString()}</p>
            <p className="text-sm">
              Status: <span className={`badge ${currentSetupLog.isReady ? 'badge-success' : 'badge-warning'}`}>
                {currentSetupLog.status}
              </span>
            </p>
          </div>

          {/* Equipment Checklist */}
          <div className="card">
            <h3 className="text-lg font-bold mb-4">Equipment Readiness Checklist</h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(checklist).map(([key, value]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setChecklist({ ...checklist, [key]: e.target.checked })}
                    className="w-5 h-5"
                  />
                  <span className="text-sm">{key.replace('Checked', '').replace(/([A-Z])/g, ' $1').trim()}</span>
                </label>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="label text-sm">Setup Notes</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={setupNotes}
                  onChange={(e) => setSetupNotes(e.target.value)}
                  placeholder="Any notes about the setup..."
                />
              </div>

              <div>
                <label className="label text-sm">Blocking Issues</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={blockingIssues}
                  onChange={(e) => setBlockingIssues(e.target.value)}
                  placeholder="Issues preventing readiness..."
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => updateChecklist(false)} className="btn-secondary" disabled={loading}>
                Save Progress
              </button>
              <button onClick={() => updateChecklist(true)} className="btn-primary" disabled={loading}>
                ✓ Mark as Ready
              </button>
            </div>
          </div>

          {/* Equipment Check */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Equipment Checks</h3>
              <button onClick={() => setShowEquipmentCheck(!showEquipmentCheck)} className="btn-secondary">
                {showEquipmentCheck ? 'Hide' : '+ Add Equipment Check'}
              </button>
            </div>

            {showEquipmentCheck && (
              <div className="border-t pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-sm">Equipment Name*</label>
                    <input
                      type="text"
                      className="input-field"
                      value={equipmentCheck.equipmentName}
                      onChange={(e) => setEquipmentCheck({ ...equipmentCheck, equipmentName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label text-sm">Type*</label>
                    <select
                      className="input-field"
                      value={equipmentCheck.equipmentType}
                      onChange={(e) => setEquipmentCheck({ ...equipmentCheck, equipmentType: e.target.value })}
                    >
                      <option value="">Select type</option>
                      <option value="Ventilator">Ventilator</option>
                      <option value="Monitor">Monitor</option>
                      <option value="Suction">Suction</option>
                      <option value="Anesthesia Machine">Anesthesia Machine</option>
                      <option value="Defibrillator">Defibrillator</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-sm">Serial Number</label>
                    <input
                      type="text"
                      className="input-field"
                      value={equipmentCheck.serialNumber}
                      onChange={(e) => setEquipmentCheck({ ...equipmentCheck, serialNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label text-sm">Condition*</label>
                    <select
                      className="input-field"
                      value={equipmentCheck.condition}
                      onChange={(e) => setEquipmentCheck({ ...equipmentCheck, condition: e.target.value as any })}
                    >
                      <option value="OPERATIONAL">Operational</option>
                      <option value="NEEDS_ATTENTION">Needs Attention</option>
                      <option value="FAULTY">Faulty</option>
                      <option value="NOT_AVAILABLE">Not Available</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={equipmentCheck.isFunctional}
                      onChange={(e) => setEquipmentCheck({ ...equipmentCheck, isFunctional: e.target.checked })}
                      className="w-5 h-5"
                    />
                    <span>Equipment is Functional</span>
                  </label>
                </div>

                {!equipmentCheck.isFunctional && (
                  <>
                    <div>
                      <label className="label text-sm">Malfunction Description</label>
                      <textarea
                        className="input-field"
                        rows={2}
                        value={equipmentCheck.malfunctionDescription}
                        onChange={(e) => setEquipmentCheck({ ...equipmentCheck, malfunctionDescription: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label text-sm">Severity</label>
                        <select
                          className="input-field"
                          value={equipmentCheck.malfunctionSeverity}
                          onChange={(e) => setEquipmentCheck({ ...equipmentCheck, malfunctionSeverity: e.target.value })}
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="CRITICAL">Critical</option>
                        </select>
                      </div>
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer mt-6">
                          <input
                            type="checkbox"
                            checked={equipmentCheck.requiresImmediateAttention}
                            onChange={(e) => setEquipmentCheck({ ...equipmentCheck, requiresImmediateAttention: e.target.checked })}
                            className="w-5 h-5"
                          />
                          <span className="text-sm">Requires Immediate Attention (Send Alert)</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                <button onClick={logEquipmentCheck} className="btn-primary" disabled={loading}>
                  Log Equipment Check
                </button>
              </div>
            )}
          </div>

          {/* End of Day */}
          <div className="card bg-gray-50">
            <button onClick={endOfDay} className="btn-outline" disabled={loading}>
              📋 Log End of Day
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
