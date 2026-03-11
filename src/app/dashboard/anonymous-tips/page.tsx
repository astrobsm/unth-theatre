'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  Send,
  ArrowLeft,
  ShieldOff,
  Lightbulb,
  MapPin,
  Calendar,
  FileText,
  Camera,
  Video,
  X,
  Image,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'MISCONDUCT', label: '🚫 Staff Misconduct', description: 'Unprofessional behavior, violation of conduct' },
  { value: 'DAMAGE', label: '🔨 Damage to Property', description: 'Broken equipment, damaged facilities, vandalism' },
  { value: 'LIGHTS_AC_LEFT_ON', label: '💡 Lights/AC Left On', description: 'Offices or rooms with lights or AC on after hours' },
  { value: 'WASTE_OF_RESOURCES', label: '♻️ Waste of Resources', description: 'Unnecessary use of supplies, water, electricity' },
  { value: 'POLICY_VIOLATION', label: '📋 Policy Violation', description: 'Breach of hospital or theatre policies' },
  { value: 'UNSAFE_PRACTICE', label: '⚠️ Unsafe Practice', description: 'Practices that endanger patients or staff' },
  { value: 'HARASSMENT', label: '🛑 Harassment', description: 'Bullying, intimidation, or harassment' },
  { value: 'NEGLIGENCE', label: '😤 Negligence', description: 'Failure to perform duties properly' },
  { value: 'OTHER', label: '📝 Other', description: 'Any other abnormality not listed above' },
];

const PRIORITIES = [
  { value: 'LOW', label: 'Low', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'MEDIUM', label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'HIGH', label: 'High', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'CRITICAL', label: 'Critical', color: 'bg-red-100 text-red-700 border-red-300' },
];

const LOCATIONS = [
  'Theatre 1', 'Theatre 2', 'Theatre 3', 'Theatre 4',
  'Recovery Room', 'Holding Area', 'Scrub Area',
  'Theatre Store', 'CSSD', 'Laundry Room',
  'Theatre Office', 'Consultants Office', 'Nurses Station',
  'Corridor', 'Restroom', 'Kitchen/Cafeteria',
  'Power House', 'Water Supply Room', 'General Theatre Complex',
  'Other (specify in description)',
];

export default function AnonymousTipsPage() {
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [mediaError, setMediaError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    category: '',
    priority: 'MEDIUM',
    location: '',
    dateObserved: new Date().toISOString().slice(0, 16),
    description: '',
    frequencyOfOccurrence: '',
    suggestedAction: '',
    mediaUrl: '',
    mediaType: '',
    mediaLocation: '',
  });

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setMediaError('');
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setMediaError('File too large. Maximum size is 5MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      setMediaError('Please upload an image (JPG, PNG) or a short video (MP4).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setMediaPreview(dataUrl);
      setMediaType(isImage ? 'image' : 'video');
      setForm(prev => ({ ...prev, mediaUrl: dataUrl, mediaType: isImage ? 'image' : 'video' }));
    };
    reader.readAsDataURL(file);
  };

  const removeMedia = () => {
    setMediaPreview(null);
    setMediaType(null);
    setForm(prev => ({ ...prev, mediaUrl: '', mediaType: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.category || !form.location || !form.description) {
      setError('Please fill in all required fields (category, location, and description).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/anonymous-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error || 'Failed to submit report');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="bg-green-100 p-6 rounded-full w-24 h-24 mx-auto flex items-center justify-center">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Report Submitted Successfully</h1>
          <p className="text-gray-600">
            Your anonymous report has been received. No identifying information has been stored.
            Management will review and take appropriate action.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-700 mb-1">
              <EyeOff className="w-4 h-4" />
              <span className="font-semibold text-sm">Your identity is protected</span>
            </div>
            <p className="text-xs text-blue-600">
              This report cannot be traced back to you. No login credentials, IP addresses, or personal data were recorded.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setSubmitted(false); setForm({ category: '', priority: 'MEDIUM', location: '', dateObserved: new Date().toISOString().slice(0, 16), description: '', frequencyOfOccurrence: '', suggestedAction: '', mediaUrl: '', mediaType: '', mediaLocation: '' }); removeMedia(); }}
              className="btn-primary"
            >
              Submit Another Report
            </button>
            <button onClick={() => router.push('/dashboard')} className="btn-secondary">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Anonymous Incident Report</h1>
          <p className="text-sm text-gray-500">Report misconduct, damages, or abnormalities</p>
        </div>
      </div>

      {/* Privacy Banner */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="bg-green-600 p-2 rounded-lg">
            <ShieldOff className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-green-800">🔒 100% Anonymous Reporting</h3>
            <ul className="text-sm text-green-700 mt-2 space-y-1">
              <li>• No login required to submit this report</li>
              <li>• No IP address, device info, or personal data is collected</li>
              <li>• Your identity cannot and will not be traced</li>
              <li>• Reports go directly to management for review</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Category */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <FileText className="w-4 h-4 inline mr-1" /> Type of Report *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setForm({ ...form, category: cat.value })}
                className={`text-left p-3 rounded-lg border-2 transition-all ${
                  form.category === cat.value
                    ? 'border-primary-500 bg-primary-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium text-sm">{cat.label}</div>
                <div className="text-xs text-gray-500">{cat.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <AlertTriangle className="w-4 h-4 inline mr-1" /> Priority Level
          </label>
          <div className="flex gap-2">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setForm({ ...form, priority: p.value })}
                className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                  form.priority === p.value
                    ? `${p.color} border-current shadow-md`
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <MapPin className="w-4 h-4 inline mr-1" /> Location *
          </label>
          <select
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="input-field w-full"
            required
          >
            <option value="">Select location...</option>
            {LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>

        {/* Date Observed */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <Calendar className="w-4 h-4 inline mr-1" /> Date & Time Observed
          </label>
          <input
            type="datetime-local"
            value={form.dateObserved}
            onChange={(e) => setForm({ ...form, dateObserved: e.target.value })}
            className="input-field w-full"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <Eye className="w-4 h-4 inline mr-1" /> What Did You Observe? *
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="input-field w-full h-32"
            placeholder="Describe what you observed in detail. Be specific about what happened, who/what was involved (no need to give names), and any other relevant details..."
            required
          />
        </div>

        {/* Media Upload */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <Camera className="w-4 h-4 inline mr-1" /> Upload Photo or Short Video (Optional)
          </label>
          <p className="text-xs text-gray-500 mb-3">Attach a photo or short video as evidence. Max 5MB. Supported: JPG, PNG, MP4.</p>

          {!mediaPreview ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-all"
            >
              <div className="flex items-center justify-center gap-4 mb-3">
                <div className="bg-blue-100 p-3 rounded-full">
                  <Image className="w-6 h-6 text-blue-600" />
                </div>
                <div className="bg-purple-100 p-3 rounded-full">
                  <Video className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <p className="text-sm font-medium text-gray-700">Tap to upload a photo or video</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, or MP4 — Max 5MB</p>
            </div>
          ) : (
            <div className="relative border-2 border-green-300 rounded-xl overflow-hidden bg-gray-50">
              <button
                type="button"
                onClick={removeMedia}
                className="absolute top-2 right-2 z-10 bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>
              {mediaType === 'image' ? (
                <img src={mediaPreview} alt="Uploaded evidence" className="w-full max-h-64 object-contain" />
              ) : (
                <video src={mediaPreview} controls className="w-full max-h-64" />
              )}
              <div className="p-2 bg-green-50 text-center">
                <span className="text-xs text-green-700 font-medium">
                  {mediaType === 'image' ? '📷 Photo attached' : '🎥 Video attached'}
                </span>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
            onChange={handleFileChange}
            className="hidden"
          />

          {mediaError && (
            <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> {mediaError}
            </p>
          )}

          {/* Media Location */}
          {mediaPreview && (
            <div className="mt-3">
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                <MapPin className="w-3 h-3 inline mr-1" /> Where was this photo/video taken?
              </label>
              <input
                type="text"
                value={form.mediaLocation}
                onChange={(e) => setForm({ ...form, mediaLocation: e.target.value })}
                className="input-field w-full"
                placeholder="e.g., Theatre 2 corridor, near the main entrance, store room..."
              />
            </div>
          )}
        </div>

        {/* Frequency */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            How Often Does This Happen?
          </label>
          <select
            value={form.frequencyOfOccurrence}
            onChange={(e) => setForm({ ...form, frequencyOfOccurrence: e.target.value })}
            className="input-field w-full"
          >
            <option value="">Select (optional)...</option>
            <option value="One-time incident">One-time incident</option>
            <option value="Happens occasionally">Happens occasionally</option>
            <option value="Happens frequently">Happens frequently</option>
            <option value="Happens daily">Happens daily</option>
            <option value="Happens every shift">Happens every shift</option>
            <option value="Ongoing issue">Ongoing issue</option>
          </select>
        </div>

        {/* Suggested Action */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <Lightbulb className="w-4 h-4 inline mr-1" /> Suggested Action (Optional)
          </label>
          <textarea
            value={form.suggestedAction}
            onChange={(e) => setForm({ ...form, suggestedAction: e.target.value })}
            className="input-field w-full h-20"
            placeholder="What do you think should be done about this? (Optional)"
          />
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary flex items-center gap-2 flex-1"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Submitting Anonymously...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Anonymous Report
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center">
          🔒 This form does not collect any identifying information. Your report is completely anonymous.
        </p>
      </form>
    </div>
  );
}
