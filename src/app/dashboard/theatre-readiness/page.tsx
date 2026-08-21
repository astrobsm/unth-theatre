'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { THEATRES } from '@/lib/constants';

interface StaffContact {
  name: string;
  phone: string | null;
}

interface StaffAssignments {
  scrubNurse: StaffContact | null;
  circulatingNurse: StaffContact | null;
  anaestheticTechnician: StaffContact | null;
  anaesthetistConsultant: StaffContact | null;
  anaesthetistSeniorRegistrar: StaffContact | null;
  anaesthetistRegistrar: StaffContact | null;
  cleaner: StaffContact | null;
  porter: StaffContact | null;
  shift: string | null;
  surgicalUnit: string | null;
  startTime: string | null;
  endTime: string | null;
}

interface TheatreStatus {
  theatreId: string;
  theatreName: string;
  theatreStatus: string;
  hasSetupLog: boolean;
  setupStatus: string;
  isReady: boolean;
  technicianName: string | null;
  technicianCode: string | null;
  setupStartTime: string | null;
  readyTime: string | null;
  locationName: string | null;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  distanceFromFacility: number | null;
  malfunctioningEquipment: number;
  blockingIssues: string | null;
  setupNotes: string | null;
  durationMinutes: number | null;
  staffAssignments: StaffAssignments | null;
  surgeons: StaffContact[];
  surgeryAnaesthetists: StaffContact[];
  surgeryTechnicians?: StaffContact[];
  /// Named explicitly by the nursing staff through the team assignment, in
  /// addition to the single pair carried on the allocation.
  teamScrubNurses?: StaffContact[];
  teamCirculatingNurses?: StaffContact[];
  totalAllocations: number;
}

interface Statistics {
  totalTheatres: number;
  readyTheatres: number;
  inProgressTheatres: number;
  notStartedTheatres: number;
  blockedTheatres: number;
  totalMalfunctions: number;
}

// Nurse-confirmed theatre readiness (from the Theatre Setup module).
interface NurseReadiness {
  id: string;
  setupDate: string;
  materialsConfirmed: boolean;
  radioOnChannel7: boolean;
  inTheatreReady: boolean;
  theatreReady: boolean;
  readyConfirmedAt: string | null;
  theatre: { name: string; location: string } | null;
  nurse: { fullName: string } | null;
}

// One staff line: role label, name, and a click-to-call phone link.
function StaffRow({ label, contact, color }: { label: string; contact: StaffContact | null; color: string }) {
  if (!contact) return null;
  return (
    <div className={`flex justify-between items-center gap-2 ${color} px-2 py-1 rounded`}>
      <span className="text-gray-600 whitespace-nowrap">{label}:</span>
      <span className="font-semibold text-gray-900 text-right">
        {contact.name}
        {contact.phone ? (
          <a
            href={`tel:${contact.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="ml-2 text-blue-700 hover:underline whitespace-nowrap"
          >
            📞 {contact.phone}
          </a>
        ) : (
          <span className="ml-2 text-gray-400 text-[11px]">no phone</span>
        )}
      </span>
    </div>
  );
}

export default function TheatreReadinessDashboard() {
  const [theatreStatus, setTheatreStatus] = useState<TheatreStatus[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [nurseReadiness, setNurseReadiness] = useState<NurseReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  /**
   * One theatre's detail is fetched when somebody opens it, and not before.
   *
   * The board carries fifteen theatres. Loading every one of them meant, per
   * theatre, an allocation with eight nested user relations, the day's
   * surgeries with three more, the assigned team and a phone lookup for
   * everybody named — before a single card could be painted. A closed card
   * shows a status dot, a name and a count.
   *
   * Cached by id, so opening a theatre a second time is instant and closing one
   * costs nothing. Cleared when the date changes, because the detail belongs to
   * the date it was fetched for — and a stale team under a new date is worse
   * than a spinner.
   */
  const [openId, setOpenId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, TheatreStatus>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const toggleTheatre = async (theatreId: string) => {
    if (openId === theatreId) { setOpenId(null); return; }
    setOpenId(theatreId);
    if (detailById[theatreId]) return; // already fetched for this date
    setLoadingId(theatreId);
    try {
      const res = await fetch(
        `/api/anesthesia-setup/theatre-status?date=${selectedDate}&theatreId=${theatreId}`,
      );
      if (res.ok) {
        const data = await res.json();
        const row = (data.theatreStatus || [])[0];
        if (row) setDetailById((prev) => ({ ...prev, [theatreId]: row }));
      }
    } catch {
      // Leave it unopened rather than showing an empty team as though it were
      // the truth. The card stays tappable and a second tap retries.
    } finally {
      setLoadingId(null);
    }
  };

  useEffect(() => {
    fetchTheatreStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchTheatreStatus, 30 * 60 * 1000);
    return () => clearInterval(interval);
    // Re-fetch when selectedDate changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const fetchTheatreStatus = async () => {
    try {
      // Detail belongs to the date it was fetched for.
      setDetailById({});
      setOpenId(null);
      const [statusRes, setupRes] = await Promise.all([
        fetch(`/api/anesthesia-setup/theatre-status?date=${selectedDate}&view=summary`),
        fetch(`/api/theatre-setup?date=${selectedDate}`),
      ]);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setTheatreStatus(data.theatreStatus || []);
        setStatistics(data.statistics || null);
      }
      if (setupRes.ok) {
        const setups = await setupRes.json();
        setNurseReadiness(Array.isArray(setups) ? setups : []);
      }
    } catch (error) {
      console.error('Error fetching theatre status:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'READY':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'BLOCKED':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'READY':
        return '✅';
      case 'IN_PROGRESS':
        return '⏳';
      case 'BLOCKED':
        return '🚫';
      default:
        return '⭕';
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading theatre status...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-gray-900">Theatre Readiness Status</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium ${selectedDate === new Date().toISOString().split('T')[0] ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Today
          </button>
          <button
            onClick={() => {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              setSelectedDate(tomorrow.toISOString().split('T')[0]);
            }}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium ${(() => { const t = new Date(); t.setDate(t.getDate() + 1); return selectedDate === t.toISOString().split('T')[0]; })() ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Tomorrow
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="input-field"
          />
          <button onClick={fetchTheatreStatus} className="btn-secondary">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="card text-center">
            <div className="text-3xl font-bold text-gray-900">{statistics.totalTheatres}</div>
            <div className="text-sm text-gray-600">Total Theatres</div>
          </div>
          <div className="card text-center bg-green-50">
            <div className="text-3xl font-bold text-green-700">{statistics.readyTheatres}</div>
            <div className="text-sm text-green-600">Ready</div>
          </div>
          <div className="card text-center bg-yellow-50">
            <div className="text-3xl font-bold text-yellow-700">{statistics.inProgressTheatres}</div>
            <div className="text-sm text-yellow-600">In Progress</div>
          </div>
          <div className="card text-center bg-gray-50">
            <div className="text-3xl font-bold text-gray-700">{statistics.notStartedTheatres}</div>
            <div className="text-sm text-gray-600">Not Started</div>
          </div>
          <div className="card text-center bg-red-50">
            <div className="text-3xl font-bold text-red-700">{statistics.blockedTheatres}</div>
            <div className="text-sm text-red-600">Blocked</div>
          </div>
          <div className="card text-center bg-orange-50">
            <div className="text-3xl font-bold text-orange-700">{statistics.totalMalfunctions}</div>
            <div className="text-sm text-orange-600">Malfunctions</div>
          </div>
        </div>
      )}

      {/* Nurse-Confirmed Theatre Readiness */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-xl font-bold text-gray-900">Nurse Theatre Readiness</h2>
          <span className="text-sm text-gray-500">
            {nurseReadiness.filter((n) => n.theatreReady).length} ready ·{' '}
            {nurseReadiness.length} reporting
          </span>
        </div>
        {nurseReadiness.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">
            No nurse readiness confirmations for this date yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {nurseReadiness.map((n) => (
              <div
                key={n.id}
                className={`border-2 rounded-lg p-3 ${n.theatreReady ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-bold text-gray-900">{n.theatre?.name || 'Unknown Theatre'}</div>
                    <div className="text-xs text-gray-500">{n.nurse?.fullName || 'Nurse'}</div>
                  </div>
                  {n.theatreReady ? (
                    <span className="bg-green-600 text-white px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap">
                      ✅ READY
                    </span>
                  ) : (
                    <span className="bg-gray-200 text-gray-700 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap">
                      ⏳ Pending
                    </span>
                  )}
                </div>
                <ul className="mt-2 space-y-1 text-xs">
                  <li className={n.materialsConfirmed ? 'text-green-700' : 'text-gray-400'}>
                    {n.materialsConfirmed ? '✓' : '○'} Materials collected
                  </li>
                  <li className={n.radioOnChannel7 ? 'text-green-700' : 'text-gray-400'}>
                    {n.radioOnChannel7 ? '✓' : '○'} Radio on channel 7
                  </li>
                  <li className={n.inTheatreReady ? 'text-green-700' : 'text-gray-400'}>
                    {n.inTheatreReady ? '✓' : '○'} In theatre &amp; ready
                  </li>
                </ul>
                {n.theatreReady && n.readyConfirmedAt && (
                  <div className="mt-2 text-[11px] text-green-700 font-medium">
                    Confirmed at{' '}
                    {new Date(n.readyConfirmedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Theatre Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {theatreStatus.map((summaryRow) => {
          const isOpen = openId === summaryRow.theatreId;
          const isLoading = loadingId === summaryRow.theatreId;
          // The fetched detail once it exists; the summary row until then. Every
          // field below reads from `theatre` exactly as it always did.
          const theatre = detailById[summaryRow.theatreId] ?? summaryRow;
          const caseCount = (summaryRow as TheatreStatus & { caseCount?: number }).caseCount ?? 0;
          return (
          <div
            key={summaryRow.theatreId}
            className={`card border-2 ${getStatusColor(summaryRow.setupStatus)}`}
          >
            <button
              type="button"
              onClick={() => void toggleTheatre(summaryRow.theatreId)}
              aria-expanded={isOpen}
              className="flex w-full justify-between items-start mb-3 text-left"
            >
              <div>
                <h3 className="font-bold text-lg">{summaryRow.theatreName}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl">{getStatusIcon(summaryRow.setupStatus)}</span>
                  <span className="text-sm font-semibold">{summaryRow.setupStatus.replace('_', ' ')}</span>
                </div>
                {/* What makes a closed card worth opening. */}
                <p className="mt-1 text-xs text-gray-500">
                  {isLoading
                    ? 'Loading…'
                    : [
                        caseCount ? `${caseCount} case${caseCount === 1 ? '' : 's'}` : null,
                        summaryRow.totalAllocations ? 'team allocated' : null,
                        summaryRow.hasSetupLog ? 'setup logged' : null,
                      ].filter(Boolean).join(' · ') || 'Nothing recorded for this date'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {summaryRow.isReady && (
                  <div className="bg-green-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                    READY
                  </div>
                )}
                <span aria-hidden className="text-gray-400 text-lg">{isOpen ? '−' : '+'}</span>
              </div>
            </button>

            {!isOpen ? null : isLoading ? (
              <div className="py-4 text-center text-sm text-gray-400">Loading theatre detail…</div>
            ) : (
            <>

            {theatre.hasSetupLog ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">👤 Technician:</span>
                  <span>{theatre.technicianName}</span>
                  {theatre.technicianCode && (
                    <span className="badge badge-secondary text-xs">{theatre.technicianCode}</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold">⏰ Started:</span>
                  <span>{theatre.setupStartTime ? new Date(theatre.setupStartTime).toLocaleTimeString() : 'N/A'}</span>
                </div>

                {theatre.readyTime && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">✅ Ready:</span>
                    <span>{new Date(theatre.readyTime).toLocaleTimeString()}</span>
                    {theatre.durationMinutes && (
                      <span className="text-xs text-gray-600">({theatre.durationMinutes} min)</span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="font-semibold">📍 Location:</span>
                  <span className="text-xs">{theatre.locationName || 'N/A'}</span>
                  {theatre.locationAccuracy && (
                    <span className="text-xs text-gray-500">(±{theatre.locationAccuracy}m)</span>
                  )}
                </div>

                {theatre.locationAddress && (
                  <div className="text-xs text-gray-600 italic">
                    {theatre.locationAddress}
                  </div>
                )}

                {theatre.distanceFromFacility != null && (
                  <div className={`text-xs font-medium mt-1 px-2 py-1 rounded ${
                    theatre.distanceFromFacility < 1
                      ? 'bg-green-100 text-green-800'
                      : theatre.distanceFromFacility < 5
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                  }`}>
                    📏 {theatre.distanceFromFacility < 1
                      ? `${Math.round(theatre.distanceFromFacility * 1000)}m from UNTH`
                      : `${theatre.distanceFromFacility}km from UNTH`}
                    {theatre.distanceFromFacility >= 5 && ' ⚠️ Far from facility'}
                  </div>
                )}

                {theatre.malfunctioningEquipment > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 mt-2">
                    <div className="flex items-center gap-2 text-red-700">
                      <span className="font-semibold">⚠️ Malfunctions:</span>
                      <span className="font-bold">{theatre.malfunctioningEquipment}</span>
                    </div>
                  </div>
                )}

                {theatre.blockingIssues && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
                    <div className="text-xs font-semibold text-yellow-800">Blocking Issues:</div>
                    <div className="text-xs text-yellow-700">{theatre.blockingIssues}</div>
                  </div>
                )}

                {theatre.setupNotes && (
                  <div className="text-xs text-gray-600 mt-2">
                    <span className="font-semibold">Notes:</span> {theatre.setupNotes}
                  </div>
                )}

                {theatre.latitude && theatre.longitude && (
                  <div className="mt-2">
                    <a
                      href={`https://www.google.com/maps?q=${theatre.latitude},${theatre.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      📌 View on Map
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <div className="text-3xl mb-2">⭕</div>
                <div className="text-sm">No setup logged yet</div>
              </div>
            )}

            {/* Staff Assignments for the Day */}
            {theatre.staffAssignments || (theatre.surgeons && theatre.surgeons.length > 0) ? (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <h4 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1">
                  👥 Theatre Team
                  {theatre.staffAssignments?.shift && (
                    <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {theatre.staffAssignments.shift}
                    </span>
                  )}
                </h4>
                {theatre.staffAssignments?.surgicalUnit && (
                  <div className="text-xs mb-2 text-purple-700 font-medium bg-purple-50 px-2 py-1 rounded">
                    🏥 {theatre.staffAssignments.surgicalUnit}
                  </div>
                )}
                {theatre.staffAssignments?.startTime && theatre.staffAssignments?.endTime && (
                  <div className="text-xs mb-2 text-gray-600">
                    🕐 {new Date(theatre.staffAssignments.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - {new Date(theatre.staffAssignments.endTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-1 text-xs">
                  {/* Surgeon(s) — from the day's scheduled surgeries for this theatre */}
                  {theatre.surgeons && theatre.surgeons.length > 0 && theatre.surgeons.map((s, i) => (
                    <StaffRow key={`surg-${i}`} label="Surgeon" contact={s} color="bg-rose-50" />
                  ))}
                  <StaffRow label="Scrub/Periop Nurse" contact={theatre.staffAssignments?.scrubNurse ?? null} color="bg-blue-50" />
                  <StaffRow label="Circulating Nurse" contact={theatre.staffAssignments?.circulatingNurse ?? null} color="bg-blue-50" />
                  <StaffRow label="Anaesthetic Technician" contact={theatre.staffAssignments?.anaestheticTechnician ?? null} color="bg-green-50" />
                  {/* Technician(s) assigned directly on the case, if any */}
                  {theatre.surgeryTechnicians && theatre.surgeryTechnicians.length > 0 && theatre.surgeryTechnicians.map((t, i) => (
                    <StaffRow key={`tech-${i}`} label="Technician (case)" contact={t} color="bg-green-50" />
                  ))}
                  <StaffRow label="Consultant Anaesthetist" contact={theatre.staffAssignments?.anaesthetistConsultant ?? null} color="bg-green-50" />
                  <StaffRow label="Senior Reg. Anaesthesia" contact={theatre.staffAssignments?.anaesthetistSeniorRegistrar ?? null} color="bg-green-50" />
                  <StaffRow label="Registrar Anaesthesia" contact={theatre.staffAssignments?.anaesthetistRegistrar ?? null} color="bg-green-50" />
                  {/* Anaesthetists and technicians, from the case record AND from
                      an explicit assignment by the anaesthetic service. Both feed
                      one list per role in the API, so this renders whatever was
                      named however it was named. */}
                  {theatre.surgeryAnaesthetists && theatre.surgeryAnaesthetists.length > 0 && theatre.surgeryAnaesthetists.map((s, i) => (
                    <StaffRow key={`anae-${i}`} label="Anaesthetist (case)" contact={s} color="bg-green-50" />
                  ))}
                  {theatre.surgeryTechnicians?.map((t, i) => (
                    <StaffRow key={`tech-${i}`} label="Anaesthetic Technician" contact={t} color="bg-green-50" />
                  ))}
                  {/* Extra nurses named through the team assignment. Shown as
                      well as the allocation's pair, never instead of them: a unit
                      may have named a second scrub nurse for a long list, and a
                      board that silently replaced one with the other would leave
                      somebody unaccounted for. */}
                  {theatre.teamScrubNurses?.map((n, i) => (
                    <StaffRow key={`ts-${i}`} label="Scrub Nurse (assigned)" contact={n} color="bg-blue-50" />
                  ))}
                  {theatre.teamCirculatingNurses?.map((n, i) => (
                    <StaffRow key={`tc-${i}`} label="Circulating Nurse (assigned)" contact={n} color="bg-blue-50" />
                  ))}
                  <StaffRow label="Cleaner" contact={theatre.staffAssignments?.cleaner ?? null} color="bg-gray-50" />
                  <StaffRow label="Porter" contact={theatre.staffAssignments?.porter ?? null} color="bg-gray-50" />
                </div>
              </div>
            ) : (
              <div className="mt-3 pt-3 border-t border-gray-200 text-center text-xs text-gray-400">
                No allocation for this date
              </div>
            )}
            </>
            )}
          </div>
          );
        })}
      </div>

      {theatreStatus.length === 0 && (
        <div className="card text-center py-8 text-gray-500">
          No theatres found
        </div>
      )}
    </div>
  );
}
