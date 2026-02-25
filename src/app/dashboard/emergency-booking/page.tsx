'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle, Plus, Clock, CheckCircle, XCircle, RefreshCw,
  User, Building2, Siren, Phone, Calendar, MapPin, Navigation,
  Stethoscope, Pill, ChevronDown, ChevronUp, Activity
} from 'lucide-react';

interface EmergencyBooking {
  id: string;
  patientName: string;
  folderNumber: string;
  age?: number;
  gender?: string;
  ward?: string;
  diagnosis: string;
  procedureName: string;
  surgicalUnit: string;
  indication: string;
  surgeonName: string;
  anesthetistName?: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  status: string;
  requestedAt: string;
  requiredByTime?: string;
  theatreName?: string;
  bloodRequired: boolean;
  bloodUnits?: number;
  surgeon?: { fullName: string; phoneNumber?: string };
  anesthetist?: { fullName: string; phoneNumber?: string };
}

interface TeamMember {
  id: string;
  userName: string;
  teamRole: string;
  status: string;
  latitude?: number;
  longitude?: number;
  estimatedArrivalMin?: number;
  distanceKm?: number;
  respondedAt: string;
  arrivedAt?: string;
  notes?: string;
  user: { fullName: string; phoneNumber?: string; role: string };
}

interface ReviewData {
  id: string;
  reviewerName: string;
  status: string;
  anaestheticPlan?: string;
  allergies?: string;
  asaClassification?: string;
  createdAt: string;
  prescriptions: PrescriptionData[];
}

interface PrescriptionData {
  id: string;
  medications: string;
  status: string;
  isEmergency: boolean;
  urgencyNote?: string;
  viewedByPharmacist: boolean;
  packedByName?: string;
  packedAt?: string;
}

const priorityColors = {
  CRITICAL: 'bg-red-100 text-red-800 border-red-300',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-300',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

const statusColors: Record<string, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  THEATRE_ASSIGNED: 'bg-purple-100 text-purple-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-gray-100 text-gray-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const availabilityStatusColors: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  EN_ROUTE: 'bg-blue-100 text-blue-800',
  ARRIVED: 'bg-emerald-200 text-emerald-900 font-bold',
  UNAVAILABLE: 'bg-red-100 text-red-800',
  ON_ANOTHER_CASE: 'bg-orange-100 text-orange-800',
};

const TEAM_ROLES = [
  'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE',
  'ANAESTHETIC_TECHNICIAN', 'PORTER', 'RECOVERY_ROOM_NURSE',
  'THEATRE_STORE_KEEPER', 'BIOMEDICAL_ENGINEER', 'CLEANER',
  'BLOODBANK_STAFF', 'PHARMACIST',
];

// Roles that can respond to emergency availability
const EMERGENCY_TEAM_USER_ROLES = [
  'SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'SCRUB_NURSE',
  'RECOVERY_ROOM_NURSE', 'THEATRE_STORE_KEEPER', 'ANAESTHETIC_TECHNICIAN',
  'PORTER', 'BIOMEDICAL_ENGINEER', 'CLEANER', 'BLOODBANK_STAFF', 'PHARMACIST',
  'ADMIN', 'THEATRE_MANAGER', 'SYSTEM_ADMINISTRATOR',
];

export default function EmergencyBookingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [bookings, setBookings] = useState<EmergencyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [teamData, setTeamData] = useState<Record<string, TeamMember[]>>({});
  const [reviewData, setReviewData] = useState<Record<string, ReviewData[]>>({});
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewBooking, setReviewBooking] = useState<EmergencyBooking | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Review form state
  const [reviewForm, setReviewForm] = useState({
    airwayAssessment: '', asaClassification: '', allergies: '',
    currentMedications: '', pastMedicalHistory: '', lastMealTime: '',
    bloodPressure: '', heartRate: '', oxygenSaturation: '', temperature: '',
    weight: '', height: '',
    estimatedBloodLoss: '', coagulationStatus: '', hemoglobinLevel: '',
    crossMatchStatus: '', ivAccess: '', patientNPOStatus: '',
    anaestheticPlan: '', specialConsiderations: '', riskAssessment: '',
    consentObtained: false, consentNotes: '',
    medications: '', fluids: '', emergencyDrugs: '', specialInstructions: '',
  });

  const fetchBookings = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      const res = await fetch(`/api/emergency-booking?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setBookings(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 30000);
    return () => clearInterval(interval);
  }, [fetchBookings]);

  // Fetch team availability when a booking is expanded
  const fetchTeamAvailability = useCallback(async (bookingId: string) => {
    try {
      const res = await fetch(`/api/emergency-team-availability?bookingId=${bookingId}`);
      if (res.ok) {
        const data = await res.json();
        setTeamData(prev => ({ ...prev, [bookingId]: data }));
      }
    } catch (e) {
      console.error('Error fetching team:', e);
    }
  }, []);

  // Fetch pre-anaesthetic reviews when expanded
  const fetchReviews = useCallback(async (bookingId: string) => {
    try {
      const res = await fetch(`/api/emergency-pre-anaesthetic?bookingId=${bookingId}`);
      if (res.ok) {
        const data = await res.json();
        setReviewData(prev => ({ ...prev, [bookingId]: data }));
      }
    } catch (e) {
      console.error('Error fetching reviews:', e);
    }
  }, []);

  const toggleExpand = (bookingId: string) => {
    if (expandedBooking === bookingId) {
      setExpandedBooking(null);
    } else {
      setExpandedBooking(bookingId);
      fetchTeamAvailability(bookingId);
      fetchReviews(bookingId);
    }
  };

  // Respond with availability + geo-location
  const handleRespond = async (bookingId: string, status: string) => {
    setRespondingTo(bookingId);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      let estimatedArrivalMin: number | undefined;

      // Request geo-location
      if (navigator.geolocation && status !== 'UNAVAILABLE') {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true, timeout: 10000, maximumAge: 60000,
            });
          });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;

          // Rough ETA: assume 40km/h average speed in Enugu
          const hospitalLat = 6.4025;
          const hospitalLng = 7.5103;
          const dist = haversineDistance(latitude, longitude, hospitalLat, hospitalLng);
          estimatedArrivalMin = Math.max(5, Math.round((dist / 40) * 60));
        } catch {
          // Geo-location denied — proceed without it
        }
      }

      const res = await fetch('/api/emergency-team-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyBookingId: bookingId,
          status,
          latitude,
          longitude,
          estimatedArrivalMin,
        }),
      });

      if (res.ok) {
        fetchTeamAvailability(bookingId);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to respond');
      }
    } catch (e) {
      console.error('Error responding:', e);
    } finally {
      setRespondingTo(null);
    }
  };

  // Submit pre-anaesthetic review
  const handleSubmitReview = async () => {
    if (!reviewBooking) return;
    setSubmittingReview(true);
    try {
      const payload: any = {
        emergencyBookingId: reviewBooking.id,
        patientName: reviewBooking.patientName,
        folderNumber: reviewBooking.folderNumber,
      };

      // Map form fields
      Object.entries(reviewForm).forEach(([key, val]) => {
        if (val === '' || val === false) return;
        if (['heartRate', 'oxygenSaturation', 'temperature', 'weight', 'height', 'hemoglobinLevel'].includes(key)) {
          payload[key] = parseFloat(val as string);
        } else {
          payload[key] = val;
        }
      });

      // If medications are provided, format as JSON
      if (reviewForm.medications) {
        try {
          JSON.parse(reviewForm.medications);
        } catch {
          // If not valid JSON, wrap as simple array
          payload.medications = JSON.stringify(
            reviewForm.medications.split('\n').filter(Boolean).map(line => {
              const parts = line.split(' - ');
              return { name: parts[0]?.trim(), dose: parts[1]?.trim() || '', route: parts[2]?.trim() || 'IV' };
            })
          );
        }
      }

      const res = await fetch('/api/emergency-pre-anaesthetic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowReviewModal(false);
        setReviewBooking(null);
        setReviewForm({
          airwayAssessment: '', asaClassification: '', allergies: '',
          currentMedications: '', pastMedicalHistory: '', lastMealTime: '',
          bloodPressure: '', heartRate: '', oxygenSaturation: '', temperature: '',
          weight: '', height: '',
          estimatedBloodLoss: '', coagulationStatus: '', hemoglobinLevel: '',
          crossMatchStatus: '', ivAccess: '', patientNPOStatus: '',
          anaestheticPlan: '', specialConsiderations: '', riskAssessment: '',
          consentObtained: false, consentNotes: '',
          medications: '', fluids: '', emergencyDrugs: '', specialInstructions: '',
        });
        if (expandedBooking) fetchReviews(expandedBooking);
        alert('Pre-anaesthetic review submitted. Emergency prescription sent to pharmacy.');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to submit review');
      }
    } catch (e) {
      console.error('Error submitting review:', e);
      alert('An error occurred');
    } finally {
      setSubmittingReview(false);
    }
  };

  const canCreateBooking = session?.user?.role && [
    'SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'THEATRE_MANAGER',
    'ADMIN', 'CMAC', 'DC_MAC', 'CHIEF_MEDICAL_DIRECTOR'
  ].includes(session.user.role);

  const canRespondToEmergency = session?.user?.role && EMERGENCY_TEAM_USER_ROLES.includes(session.user.role);

  const isAnaesthetist = session?.user?.role && ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'].includes(session.user.role);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading emergency bookings...</p>
        </div>
      </div>
    );
  }

  const activeBookings = bookings.filter(b => ['SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED', 'IN_PROGRESS'].includes(b.status));
  const pastBookings = bookings.filter(b => ['COMPLETED', 'CANCELLED'].includes(b.status));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Siren className="h-7 w-7 text-red-600" />
            Emergency Surgery Booking
          </h1>
          <p className="text-gray-600 mt-1">Book and track emergency surgical cases</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => fetchBookings()}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          {canCreateBooking && (
            <Link
              href="/dashboard/emergency-booking/new"
              className="btn-primary flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
            >
              <Plus className="h-4 w-4" /> New Emergency Booking
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => (
          <button
            key={s}
            onClick={() => { setFilter(s); setLoading(true); }}
            className={`px-3 py-1 rounded-full text-sm font-medium border ${
              filter === s ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Active Emergency Bookings */}
      {activeBookings.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-red-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Active Emergency Cases ({activeBookings.length})
          </h2>
          <div className="grid gap-4">
            {activeBookings.map((booking) => {
              const isExpanded = expandedBooking === booking.id;
              const team = teamData[booking.id] || [];
              const reviews = reviewData[booking.id] || [];
              const arrivedCount = team.filter(t => t.status === 'ARRIVED').length;
              const respondedCount = team.length;

              return (
                <div
                  key={booking.id}
                  className={`bg-white rounded-lg shadow-md border-l-4 overflow-hidden ${
                    booking.priority === 'CRITICAL' ? 'border-l-red-600' :
                    booking.priority === 'HIGH' ? 'border-l-orange-500' : 'border-l-yellow-400'
                  }`}
                >
                  <div className="p-5">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className={`px-2 py-1 rounded text-xs font-bold border ${priorityColors[booking.priority]}`}>
                            {booking.priority}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[booking.status] || ''}`}>
                            {booking.status.replace(/_/g, ' ')}
                          </span>
                          {booking.bloodRequired && (
                            <span className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-white">
                              BLOOD REQUIRED ({booking.bloodUnits} units)
                            </span>
                          )}
                          {respondedCount > 0 && (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                              {arrivedCount}/{respondedCount} team arrived
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">{booking.procedureName}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            <span><strong>{booking.patientName}</strong> ({booking.folderNumber})</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Building2 className="h-4 w-4" />
                            <span>{booking.surgicalUnit}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>{new Date(booking.requestedAt).toLocaleString()}</span>
                          </div>
                        </div>
                        <p className="mt-2 text-sm"><strong>Indication:</strong> {booking.indication}</p>
                        <p className="text-sm"><strong>Diagnosis:</strong> {booking.diagnosis}</p>
                      </div>
                      <div className="flex flex-col gap-1 text-sm min-w-[200px]">
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4 text-blue-600" />
                          <span>Surgeon: <strong>{booking.surgeonName}</strong></span>
                        </div>
                        {booking.anesthetistName && (
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4 text-green-600" />
                            <span>Anesthetist: <strong>{booking.anesthetistName}</strong></span>
                          </div>
                        )}
                        {booking.theatreName && (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-4 w-4 text-purple-600" />
                            <span>Theatre: <strong>{booking.theatreName}</strong></span>
                          </div>
                        )}
                        {booking.requiredByTime && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 text-red-600" />
                            <span>Required by: <strong>{new Date(booking.requiredByTime).toLocaleString()}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ACTION BUTTONS ROW */}
                    <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-200">
                      {/* Team Availability Response */}
                      {canRespondToEmergency && (
                        <>
                          <button
                            onClick={() => handleRespond(booking.id, 'AVAILABLE')}
                            disabled={respondingTo === booking.id}
                            className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                          >
                            <CheckCircle className="h-4 w-4" />
                            {respondingTo === booking.id ? 'Sending...' : "I'm Available"}
                          </button>
                          <button
                            onClick={() => handleRespond(booking.id, 'EN_ROUTE')}
                            disabled={respondingTo === booking.id}
                            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                          >
                            <Navigation className="h-4 w-4" />
                            En Route
                          </button>
                          <button
                            onClick={() => handleRespond(booking.id, 'ARRIVED')}
                            disabled={respondingTo === booking.id}
                            className="flex items-center gap-1 px-3 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <MapPin className="h-4 w-4" />
                            Arrived
                          </button>
                          <button
                            onClick={() => handleRespond(booking.id, 'UNAVAILABLE')}
                            disabled={respondingTo === booking.id}
                            className="flex items-center gap-1 px-3 py-2 bg-gray-500 text-white rounded-lg text-sm font-medium hover:bg-gray-600 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" />
                            Unavailable
                          </button>
                        </>
                      )}

                      {/* Pre-Anaesthetic Review (Anaesthetists only) */}
                      {(isAnaesthetist || session?.user?.role === 'ADMIN') && (
                        <button
                          onClick={() => { setReviewBooking(booking); setShowReviewModal(true); }}
                          className="flex items-center gap-1 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 ml-auto"
                        >
                          <Stethoscope className="h-4 w-4" />
                          Pre-Anaesthetic Review
                        </button>
                      )}

                      {/* Expand/Collapse Team Panel */}
                      <button
                        onClick={() => toggleExpand(booking.id)}
                        className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                      >
                        <Activity className="h-4 w-4" />
                        Team Status
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* EXPANDED: Team Availability + Reviews */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-t border-gray-200 p-5">
                      {/* Team Availability Grid */}
                      <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <User className="h-5 w-5 text-blue-600" />
                        Emergency Team Availability
                        <button
                          onClick={() => fetchTeamAvailability(booking.id)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </h4>

                      {team.length === 0 ? (
                        <p className="text-sm text-gray-500 mb-4">No team members have responded yet. Awaiting availability responses...</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                          {team.map((member) => (
                            <div
                              key={member.id}
                              className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm">{member.userName}</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${availabilityStatusColors[member.status] || 'bg-gray-100'}`}>
                                  {member.status.replace(/_/g, ' ')}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mb-1">{member.teamRole.replace(/_/g, ' ')}</p>
                              <div className="flex items-center gap-3 text-xs text-gray-600">
                                {member.distanceKm !== undefined && member.distanceKm !== null && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> {member.distanceKm} km
                                  </span>
                                )}
                                {member.estimatedArrivalMin !== undefined && member.estimatedArrivalMin !== null && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> ~{member.estimatedArrivalMin} min
                                  </span>
                                )}
                                {member.arrivedAt && (
                                  <span className="flex items-center gap-1 text-green-700 font-medium">
                                    <CheckCircle className="h-3 w-3" /> Arrived
                                  </span>
                                )}
                              </div>
                              {member.notes && (
                                <p className="text-xs text-gray-500 mt-1 italic">{member.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Role Summary */}
                      <div className="mb-4">
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Role Coverage:</h5>
                        <div className="flex flex-wrap gap-2">
                          {TEAM_ROLES.map(role => {
                            const members = team.filter(t => t.teamRole === role);
                            const hasArrived = members.some(m => m.status === 'ARRIVED');
                            const hasResponded = members.length > 0;
                            return (
                              <span
                                key={role}
                                className={`px-2 py-1 rounded text-xs border ${
                                  hasArrived ? 'bg-green-100 text-green-800 border-green-300' :
                                  hasResponded ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                  'bg-gray-100 text-gray-500 border-gray-200'
                                }`}
                              >
                                {role.replace(/_/g, ' ')}
                                {hasArrived && ' \u2713'}
                                {hasResponded && !hasArrived && ' \u2022'}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Pre-Anaesthetic Reviews */}
                      {reviews.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <Stethoscope className="h-5 w-5 text-purple-600" />
                            Pre-Anaesthetic Reviews
                          </h4>
                          {reviews.map((review) => (
                            <div key={review.id} className="bg-white rounded-lg p-4 border border-purple-200 mb-3">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-medium text-sm">Reviewed by: {review.reviewerName}</p>
                                  <p className="text-xs text-gray-500">{new Date(review.createdAt).toLocaleString()}</p>
                                </div>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  review.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                  review.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {review.status}
                                </span>
                              </div>
                              {review.anaestheticPlan && (
                                <p className="text-sm"><strong>Plan:</strong> {review.anaestheticPlan}</p>
                              )}
                              {review.asaClassification && (
                                <p className="text-sm"><strong>ASA:</strong> {review.asaClassification}</p>
                              )}
                              {review.allergies && (
                                <p className="text-sm text-red-700"><strong>Allergies:</strong> {review.allergies}</p>
                              )}

                              {/* Prescriptions */}
                              {review.prescriptions.length > 0 && (
                                <div className="mt-3 border-t pt-2">
                                  <h5 className="text-sm font-medium flex items-center gap-1 mb-2">
                                    <Pill className="h-4 w-4 text-orange-600" />
                                    Emergency Prescription
                                    <span className="text-xs text-red-600 font-bold ml-2 bg-red-50 px-2 py-0.5 rounded">
                                      EMERGENCY - PHARMACY
                                    </span>
                                  </h5>
                                  {review.prescriptions.map((rx) => {
                                    let meds: any[] = [];
                                    try { meds = JSON.parse(rx.medications); } catch {}
                                    return (
                                      <div key={rx.id} className="bg-orange-50 border border-orange-200 rounded p-3">
                                        <div className="flex justify-between items-center mb-2">
                                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            rx.status === 'PACKED' || rx.status === 'DISPENSED'
                                              ? 'bg-green-100 text-green-800'
                                              : rx.status === 'OUT_OF_STOCK_FLAGGED'
                                              ? 'bg-red-100 text-red-800'
                                              : 'bg-orange-100 text-orange-800'
                                          }`}>
                                            {rx.status.replace(/_/g, ' ')}
                                          </span>
                                          {rx.viewedByPharmacist && (
                                            <span className="text-xs text-blue-600">Viewed by Pharmacist</span>
                                          )}
                                          {rx.packedByName && (
                                            <span className="text-xs text-green-700">Packed by: {rx.packedByName}</span>
                                          )}
                                        </div>
                                        {meds.length > 0 ? (
                                          <ul className="text-sm space-y-1">
                                            {meds.map((m: any, i: number) => (
                                              <li key={i} className="flex items-center gap-2">
                                                <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />
                                                <strong>{m.name || m.drugName}</strong>
                                                {m.dose && <span>- {m.dose}</span>}
                                                {m.route && <span className="text-gray-500">({m.route})</span>}
                                              </li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <p className="text-sm text-gray-600">{rx.medications}</p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Past Bookings */}
      {pastBookings.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Past Emergency Cases ({pastBookings.length})</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg shadow">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Procedure</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Surgeon</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pastBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{booking.patientName}</div>
                      <div className="text-gray-500 text-xs">{booking.folderNumber}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{booking.procedureName}</td>
                    <td className="px-4 py-3 text-sm">{booking.surgeonName}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold border ${priorityColors[booking.priority]}`}>
                        {booking.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[booking.status] || ''}`}>
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(booking.requestedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bookings.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Siren className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No emergency bookings found</p>
          {canCreateBooking && (
            <Link
              href="/dashboard/emergency-booking/new"
              className="inline-flex items-center gap-2 mt-4 text-red-600 hover:text-red-700 font-medium"
            >
              <Plus className="h-4 w-4" /> Create Emergency Booking
            </Link>
          )}
        </div>
      )}

      {/* Pre-Anaesthetic Review Modal */}
      {showReviewModal && reviewBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 bg-purple-50 rounded-t-xl">
              <h3 className="text-xl font-bold text-purple-900 flex items-center gap-2">
                <Stethoscope className="h-6 w-6" />
                Emergency Pre-Anaesthetic Assessment
              </h3>
              <p className="text-purple-700 mt-1">
                Patient: <strong>{reviewBooking.patientName}</strong> ({reviewBooking.folderNumber}) &mdash; {reviewBooking.procedureName}
              </p>
              <p className="text-xs text-red-600 font-bold mt-1">
                Prescriptions from this review will be IMMEDIATELY visible to the Pharmacy as EMERGENCY
              </p>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Airway */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Airway Assessment</label>
                <select
                  value={reviewForm.airwayAssessment}
                  onChange={e => setReviewForm(f => ({ ...f, airwayAssessment: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm"
                >
                  <option value="">Select...</option>
                  <option>Mallampati I</option>
                  <option>Mallampati II</option>
                  <option>Mallampati III</option>
                  <option>Mallampati IV</option>
                  <option>Anticipated difficult airway</option>
                </select>
              </div>

              {/* ASA */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ASA Classification</label>
                <select
                  value={reviewForm.asaClassification}
                  onChange={e => setReviewForm(f => ({ ...f, asaClassification: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm"
                >
                  <option value="">Select...</option>
                  <option>ASA I - Normal healthy</option>
                  <option>ASA II - Mild systemic disease</option>
                  <option>ASA III - Severe systemic disease</option>
                  <option>ASA IV - Life-threatening</option>
                  <option>ASA V - Moribund</option>
                  <option>ASA VI - Brain dead organ donor</option>
                  <option>ASA E - Emergency modifier</option>
                </select>
              </div>

              {/* Vitals */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Blood Pressure</label>
                <input type="text" placeholder="e.g. 120/80" value={reviewForm.bloodPressure}
                  onChange={e => setReviewForm(f => ({ ...f, bloodPressure: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heart Rate (bpm)</label>
                <input type="number" placeholder="72" value={reviewForm.heartRate}
                  onChange={e => setReviewForm(f => ({ ...f, heartRate: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SpO2 (%)</label>
                <input type="number" placeholder="98" value={reviewForm.oxygenSaturation}
                  onChange={e => setReviewForm(f => ({ ...f, oxygenSaturation: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temperature (&deg;C)</label>
                <input type="number" step="0.1" placeholder="36.5" value={reviewForm.temperature}
                  onChange={e => setReviewForm(f => ({ ...f, temperature: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
                <input type="number" placeholder="70" value={reviewForm.weight}
                  onChange={e => setReviewForm(f => ({ ...f, weight: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Height (cm)</label>
                <input type="number" placeholder="170" value={reviewForm.height}
                  onChange={e => setReviewForm(f => ({ ...f, height: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>

              {/* Allergies */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-red-700 mb-1">Allergies (Critical)</label>
                <input type="text" placeholder="e.g. Penicillin, Latex" value={reviewForm.allergies}
                  onChange={e => setReviewForm(f => ({ ...f, allergies: e.target.value }))}
                  className="w-full border border-red-300 rounded-lg p-2 text-sm bg-red-50" />
              </div>

              {/* Emergency-specific fields */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NPO / Fasting Status</label>
                <select
                  value={reviewForm.patientNPOStatus}
                  onChange={e => setReviewForm(f => ({ ...f, patientNPOStatus: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm"
                >
                  <option value="">Select...</option>
                  <option>NPO &gt; 8 hours</option>
                  <option>NPO 6-8 hours</option>
                  <option>NPO 2-6 hours</option>
                  <option>NPO &lt; 2 hours</option>
                  <option>Not fasted - Full stomach</option>
                  <option>Unknown</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IV Access</label>
                <input type="text" placeholder="e.g. 18G right antecubital" value={reviewForm.ivAccess}
                  onChange={e => setReviewForm(f => ({ ...f, ivAccess: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hemoglobin (g/dL)</label>
                <input type="number" step="0.1" placeholder="12.0" value={reviewForm.hemoglobinLevel}
                  onChange={e => setReviewForm(f => ({ ...f, hemoglobinLevel: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cross-Match Status</label>
                <select
                  value={reviewForm.crossMatchStatus}
                  onChange={e => setReviewForm(f => ({ ...f, crossMatchStatus: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm"
                >
                  <option value="">Select...</option>
                  <option>Completed - Compatible</option>
                  <option>Pending</option>
                  <option>Type &amp; Screen done</option>
                  <option>Not required</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Blood Loss</label>
                <input type="text" placeholder="e.g. 500ml expected" value={reviewForm.estimatedBloodLoss}
                  onChange={e => setReviewForm(f => ({ ...f, estimatedBloodLoss: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Coagulation Status</label>
                <input type="text" placeholder="e.g. PT/INR normal" value={reviewForm.coagulationStatus}
                  onChange={e => setReviewForm(f => ({ ...f, coagulationStatus: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>

              {/* Plan */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Anaesthetic Plan</label>
                <select
                  value={reviewForm.anaestheticPlan}
                  onChange={e => setReviewForm(f => ({ ...f, anaestheticPlan: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm"
                >
                  <option value="">Select plan...</option>
                  <option>General Anaesthesia - ETT</option>
                  <option>General Anaesthesia - LMA</option>
                  <option>Regional - Spinal</option>
                  <option>Regional - Epidural</option>
                  <option>Regional - Combined Spinal-Epidural</option>
                  <option>Regional - Nerve Block</option>
                  <option>Combined General + Regional</option>
                  <option>Monitored Anaesthesia Care (MAC)</option>
                  <option>Local Anaesthesia + Sedation</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Risk Assessment / Special Considerations</label>
                <textarea rows={2} value={reviewForm.riskAssessment}
                  onChange={e => setReviewForm(f => ({ ...f, riskAssessment: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" placeholder="Document any risks..." />
              </div>

              {/* Consent */}
              <div className="md:col-span-2 flex items-center gap-2">
                <input type="checkbox" id="consent" checked={reviewForm.consentObtained}
                  onChange={e => setReviewForm(f => ({ ...f, consentObtained: e.target.checked }))}
                  className="h-4 w-4" />
                <label htmlFor="consent" className="text-sm font-medium text-gray-700">Consent obtained from patient/NOK</label>
              </div>

              {/* PRESCRIPTION SECTION */}
              <div className="md:col-span-2 border-t pt-4 mt-2">
                <h4 className="font-bold text-orange-800 flex items-center gap-2 mb-2">
                  <Pill className="h-5 w-5" />
                  Emergency Prescription (visible to Pharmacy immediately)
                </h4>
                <p className="text-xs text-gray-500 mb-3">
                  Enter medications one per line: Drug Name - Dose - Route (e.g., &quot;Atropine - 0.5mg - IV&quot;)
                </p>
                <textarea
                  rows={4}
                  value={reviewForm.medications}
                  onChange={e => setReviewForm(f => ({ ...f, medications: e.target.value }))}
                  className="w-full border border-orange-300 rounded-lg p-2 text-sm bg-orange-50"
                  placeholder="Atropine - 0.5mg - IV&#10;Propofol - 200mg - IV&#10;Succinylcholine - 100mg - IV&#10;Morphine - 10mg - IV"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IV Fluids</label>
                <input type="text" placeholder="e.g. Normal Saline 1L, Ringer's Lactate 1L" value={reviewForm.fluids}
                  onChange={e => setReviewForm(f => ({ ...f, fluids: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Drugs</label>
                <input type="text" placeholder="e.g. Adrenaline 1mg, Atropine 0.6mg" value={reviewForm.emergencyDrugs}
                  onChange={e => setReviewForm(f => ({ ...f, emergencyDrugs: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Special Pharmacy Instructions</label>
                <input type="text" placeholder="e.g. Prepare immediately, draw up in syringes" value={reviewForm.specialInstructions}
                  onChange={e => setReviewForm(f => ({ ...f, specialInstructions: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => { setShowReviewModal(false); setReviewBooking(null); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
                disabled={submittingReview}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={submittingReview}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {submittingReview ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Submit Review &amp; Send Prescription to Pharmacy
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

// Haversine distance helper
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}
