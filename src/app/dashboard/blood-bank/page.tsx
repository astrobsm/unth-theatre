'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { 
  Droplet, 
  Calendar, 
  User, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Package,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';
import { SYNC_INTERVALS } from '@/lib/sync';
import dynamic from 'next/dynamic';
const SmartTextInput = dynamic(() => import('@/components/SmartTextInput'), { ssr: false });
interface BloodRequest {
  id: string;
  patientName: string;
  bloodType: string;
  bloodProducts: string;
  unitsRequired: number;
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  crossmatchRequired: boolean;
  specialRequirements?: string;
  clinicalIndication: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'ISSUED' | 'CANCELLED';
  estimatedTimeNeeded: string;
  requestedBy: { fullName: true };
  surgery: {
    procedureName: string;
    scheduledDate: string;
  };
  createdAt: string;
  updatedAt: string;
}

export default function BloodBankPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'today' | 'urgent' | 'all'>('today');
  const [selectedRequest, setSelectedRequest] = useState<BloodRequest | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<BloodRequest['status']>('PROCESSING');
  const [statusNotes, setStatusNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  const fetchRequests = useCallback(async () => {
    if (!isOnline) return;
    
    setIsSyncing(true);
    try {
      let url = '/api/blood-requests';
      
      if (filter === 'today') {
        const today = new Date().toISOString().split('T')[0];
        url += `?date=${today}`;
      } else if (filter === 'urgent') {
        url += '?urgency=EMERGENCY,URGENT';
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setRequests(data);
        setLastSyncTime(Date.now());
      }
    } catch (error) {
      console.error('Error fetching blood requests:', error);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [filter, isOnline]);

  useEffect(() => {
    fetchRequests();
    // Auto-refresh every 30 seconds for urgent blood requests
    const interval = setInterval(fetchRequests, SYNC_INTERVALS.BLOOD_BANK);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  // Refetch when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchRequests();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchRequests]);

  const handleUpdateStatus = async () => {
    if (!selectedRequest) return;

    setUpdating(true);
    try {
      const response = await fetch(`/api/blood-requests/${selectedRequest.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: newStatus,
          notes: statusNotes 
        }),
      });

      if (response.ok) {
        setShowStatusModal(false);
        setStatusNotes('');
        setSelectedRequest(null);
        fetchRequests();
      } else {
        alert('Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('An error occurred');
    } finally {
      setUpdating(false);
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'EMERGENCY':
        return 'bg-red-100 text-red-800 border-red-300 animate-pulse';
      case 'URGENT':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'READY':
        return 'bg-green-100 text-green-800';
      case 'PROCESSING':
        return 'bg-yellow-100 text-yellow-800';
      case 'ISSUED':
        return 'bg-blue-100 text-blue-800';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-orange-100 text-orange-800';
    }
  };

  const parseBloodProducts = (productsJson: string) => {
    try {
      return JSON.parse(productsJson);
    } catch {
      return [];
    }
  };

  const timeUntilSurgery = (date: string) => {
    const now = new Date();
    const surgery = new Date(date);
    const hours = Math.floor((surgery.getTime() - now.getTime()) / (1000 * 60 * 60));
    return hours;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Droplet className="h-8 w-8 text-red-600" />
          Blood Bank - Surgical Requests
        </h1>
        <p className="text-gray-600 mt-2">
          Manage blood product requests for upcoming surgeries
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setFilter('today')}
            className={`px-6 py-3 font-medium ${
              filter === 'today'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Today&apos;s Surgeries
              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                {requests.filter(r => {
                  const surgeryDate = new Date(r.surgery.scheduledDate).toDateString();
                  const today = new Date().toDateString();
                  return surgeryDate === today;
                }).length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setFilter('urgent')}
            className={`px-6 py-3 font-medium ${
              filter === 'urgent'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Urgent/Emergency
              <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">
                {requests.filter(r => ['EMERGENCY', 'URGENT'].includes(r.urgency)).length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-6 py-3 font-medium ${
              filter === 'all'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All Requests
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold">
                {requests.filter(r => r.status === 'PENDING').length}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-orange-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Processing</p>
              <p className="text-2xl font-bold">
                {requests.filter(r => r.status === 'PROCESSING').length}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ready</p>
              <p className="text-2xl font-bold">
                {requests.filter(r => r.status === 'READY').length}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Units</p>
              <p className="text-2xl font-bold">
                {requests.reduce((sum, r) => sum + r.unitsRequired, 0)}
              </p>
            </div>
            <Package className="h-8 w-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <Droplet className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No blood requests found</h3>
          <p className="text-gray-600">
            {filter === 'today' 
              ? 'No surgeries requiring blood products scheduled for today'
              : filter === 'urgent'
              ? 'No urgent or emergency blood requests at this time'
              : 'No blood requests available'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const products = parseBloodProducts(request.bloodProducts);
            const hoursUntilSurgery = timeUntilSurgery(request.surgery.scheduledDate);

            return (
              <div key={request.id} className="bg-white rounded-lg shadow-sm overflow-hidden border-l-4 border-l-red-500">
                <div className="p-6">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {request.patientName}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getUrgencyColor(request.urgency)}`}>
                          {request.urgency}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                          {request.status}
                        </span>
                        {request.crossmatchRequired && (
                          <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-medium">
                            Crossmatch Required
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>Surgery: {new Date(request.surgery.scheduledDate).toLocaleString()}</span>
                        </div>
                        {hoursUntilSurgery > 0 && hoursUntilSurgery < 24 && (
                          <div className={`flex items-center gap-1 font-medium ${
                            hoursUntilSurgery < 6 ? 'text-red-600' : 'text-orange-600'
                          }`}>
                            <Clock className="h-4 w-4" />
                            <span>In {hoursUntilSurgery}h</span>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {request.surgery.procedureName}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedRequest(request);
                        setNewStatus(request.status);
                        setShowStatusModal(true);
                      }}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                    >
                      Update Status
                    </button>
                  </div>

                  {/* Blood Type & Products */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-sm text-gray-600">Blood Type</p>
                      <p className="text-xl font-bold text-red-700">{request.bloodType}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-sm text-gray-600">Units Required</p>
                      <p className="text-xl font-bold text-blue-700">{request.unitsRequired} units</p>
                    </div>
                  </div>

                  {/* Blood Products */}
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-2">Blood Products Requested:</h4>
                    <div className="bg-gray-50 rounded-lg p-3">
                      {products.length > 0 ? (
                        <div className="space-y-1">
                          {products.map((product: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-sm">
                              <Droplet className="h-4 w-4 text-red-500" />
                              <span className="font-medium">{product.type}</span> - {product.units} units
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">No specific products listed</p>
                      )}
                    </div>
                  </div>

                  {/* Clinical Indication */}
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-1">Clinical Indication:</h4>
                    <p className="text-sm text-gray-700">{request.clinicalIndication}</p>
                  </div>

                  {/* Special Requirements */}
                  {request.specialRequirements && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-yellow-900">Special Requirements</p>
                          <p className="text-sm text-yellow-800">{request.specialRequirements}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      <span>Requested by: {request.requestedBy?.fullName || 'Not assigned'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>Needed in: {request.estimatedTimeNeeded}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Update Blood Request Status</h3>
            <p className="text-gray-600 mb-4">
              Update status for {selectedRequest.patientName}&apos;s blood request
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as BloodRequest['status'])}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="PENDING">Pending</option>
                <option value="PROCESSING">Processing</option>
                <option value="READY">Ready for Collection</option>
                <option value="ISSUED">Issued</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div className="mb-4">
              <SmartTextInput
                label="Status Notes"
                value={statusNotes}
                onChange={setStatusNotes}
                rows={3}
                placeholder="Add any notes about the status update... 🎤 Dictate"
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowStatusModal(false);
                  setStatusNotes('');
                  setSelectedRequest(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={updating}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateStatus}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                disabled={updating}
              >
                {updating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Updating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Update Status
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
