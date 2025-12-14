'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Plus, Loader } from 'lucide-react';
import { THEATRES } from '@/lib/constants';

interface Theatre {
  id: string;
  name: string;
  location: string;
}

export default function ExtraRequestsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [theatres, setTheatres] = useState<Theatre[]>([]);

  const [formData, setFormData] = useState({
    theatreId: '',
    itemName: '',
    quantityRequested: 1,
    reason: '',
    urgency: 'MEDIUM',
  });

  useEffect(() => {
    fetchTheatres();
  }, []);

  const fetchTheatres = async () => {
    try {
      const response = await fetch('/api/theatres');
      if (response.ok) {
        const data = await response.json();
        setTheatres(data);
      }
    } catch (error) {
      console.error('Failed to fetch theatres:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/theatre-setup/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        alert('Extra request submitted successfully');
        router.push('/dashboard/theatre-setup');
      } else {
        const error = await response.json();
        alert(`Failed to submit request: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to submit:', error);
      alert('Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Request Extra Materials</h1>
        <p className="text-gray-600 mt-1">Submit request for additional supplies</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Request Details</h2>

          <div className="space-y-4">
            <div>
              <label className="label">Theatre *</label>
              <select
                required
                value={formData.theatreId}
                onChange={(e) => setFormData({ ...formData, theatreId: e.target.value })}
                className="input-field"
              >
                <option value="">Select theatre</option>
                {THEATRES.map((theatre) => (
                  <option key={theatre} value={theatre}>
                    {theatre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Item Name *</label>
              <input
                type="text"
                required
                placeholder="e.g., Spirit, Face Masks, Surgical Blades"
                value={formData.itemName}
                onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                className="input-field"
              />
            </div>

            <div>
              <label className="label">Quantity Requested *</label>
              <input
                type="number"
                required
                min="1"
                value={formData.quantityRequested}
                onChange={(e) =>
                  setFormData({ ...formData, quantityRequested: parseInt(e.target.value) || 1 })
                }
                className="input-field"
              />
            </div>

            <div>
              <label className="label">Urgency Level *</label>
              <select
                required
                value={formData.urgency}
                onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                className="input-field"
              >
                <option value="LOW">Low - Can wait</option>
                <option value="MEDIUM">Medium - Needed soon</option>
                <option value="HIGH">High - Needed urgently</option>
                <option value="CRITICAL">Critical - Emergency</option>
              </select>
            </div>

            <div>
              <label className="label">Reason for Request *</label>
              <textarea
                required
                rows={4}
                placeholder="Explain why these extra materials are needed..."
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold">Request Process</p>
            <p>
              Your request will be submitted for approval. You&apos;ll be notified once it&apos;s been
              reviewed.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={loading}>
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                Submit Request
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
