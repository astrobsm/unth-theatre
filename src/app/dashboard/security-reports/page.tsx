'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  Send,
  ArrowLeft,
  ShieldOff,
  MapPin,
  Calendar,
  Users,
  Siren,
  Camera,
  Video,
  X,
  Image,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'THEFT', label: '🔓 Theft / Stealing', description: 'Equipment, drugs, supplies, or personal items being stolen' },
  { value: 'SUSPICIOUS_ACTIVITY', label: '👁️ Suspicious Activity', description: 'Unusual or suspicious behavior by individuals' },
  { value: 'UNAUTHORIZED_ACCESS', label: '🚪 Unauthorized Access', description: 'People in restricted areas without authorization' },
  { value: 'VANDALISM', label: '💥 Vandalism', description: 'Deliberate destruction or damage to property' },
  { value: 'THREATENING_BEHAVIOR', label: '😡 Threatening Behavior', description: 'Threats, intimidation, or aggressive behavior' },
  { value: 'MISSING_EQUIPMENT', label: '🔍 Missing Equipment', description: 'Equipment that has gone missing or cannot be located' },
  { value: 'DRUG_DIVERSION', label: '💊 Drug Diversion', description: 'Suspected diversion or misuse of medications' },
  { value: 'TRESPASSING', label: '🚷 Trespassing', description: 'Unauthorized persons in theatre complex' },
  { value: 'OTHER', label: '📝 Other Security Concern', description: 'Any other security issue not listed above' },
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
  'Drug Store / Pharmacy', 'Equipment Room',
  'Corridor', 'Entrance/Exit', 'Parking Area',
  'Power House', 'General Theatre Complex',
  'Other (specify in description)',
];

export default function SecurityReportsPage() {
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaFileType, setMediaFileType] = useState<'image' | 'video' | null>(null);
  const [mediaError, setMediaError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    category: '',
    priority: 'HIGH',
    location: '',
    dateObserved: new Date().toISOString().slice(0, 16),
    description: '',
    suspectDescription: '',
    personsInvolved: '',
    evidenceDescription: '',
    isOngoing: false,
    immediateRiskToLife: false,
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
      setMediaFileType(isImage ? 'image' : 'video');
      setForm(prev => ({ ...prev, mediaUrl: dataUrl, mediaType: isImage ? 'image' : 'video' }));
    };
    reader.readAsDataURL(file);
  };

  const removeMedia = () => {
    setMediaPreview(null);
    setMediaFileType(null);
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
      const res = await fetch('/api/security-reports', {
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
          <h1 className="text-2xl font-bold text-gray-900">Security Report Submitted</h1>
          <p className="text-gray-600">
            Your anonymous security report has been received. Management and security will review and take appropriate action.
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
          {form.immediateRiskToLife && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700 font-semibold">
                ⚠️ You indicated immediate risk to life. If someone is in immediate danger, please also call security directly or dial emergency services.
              </p>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setSubmitted(false); setForm({ category: '', priority: 'HIGH', location: '', dateObserved: new Date().toISOString().slice(0, 16), description: '', suspectDescription: '', personsInvolved: '', evidenceDescription: '', isOngoing: false, immediateRiskToLife: false, mediaUrl: '', mediaType: '', mediaLocation: '' }); removeMedia(); }}
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
          <h1 className="text-2xl font-bold text-gray-900">Anonymous Security Report</h1>
          <p className="text-sm text-gray-500">Report theft, security threats, or suspicious activities</p>
        </div>
      </div>

      {/* Privacy Banner */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="bg-red-600 p-2 rounded-lg">
            <ShieldOff className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-red-800">🔒 100% Anonymous & Confidential</h3>
            <ul className="text-sm text-red-700 mt-2 space-y-1">
              <li>• No login required — your identity is never recorded</li>
              <li>• No IP address, device, or browser information is stored</li>
              <li>• Reports go directly to management & security for action</li>
              <li>• You are protected — speak up without fear</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Immediate Danger Warning */}
      {form.immediateRiskToLife && (
        <div className="bg-red-600 text-white rounded-xl p-5 animate-pulse">
          <div className="flex items-center gap-3">
            <Siren className="w-8 h-8" />
            <div>
              <h3 className="font-bold text-lg">⚠️ IMMEDIATE DANGER</h3>
              <p className="text-sm">If someone is in immediate danger, please also contact security directly or call emergency services NOW.</p>
            </div>
          </div>
        </div>
      )}

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
            <ShieldAlert className="w-4 h-4 inline mr-1" /> Type of Security Concern *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setForm({ ...form, category: cat.value })}
                className={`text-left p-3 rounded-lg border-2 transition-all ${
                  form.category === cat.value
                    ? 'border-red-500 bg-red-50 shadow-md'
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
            <AlertTriangle className="w-4 h-4 inline mr-1" /> Urgency Level
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

        {/* Urgent toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${form.isOngoing ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}>
            <input
              type="checkbox"
              checked={form.isOngoing}
              onChange={(e) => setForm({ ...form, isOngoing: e.target.checked })}
              className="w-5 h-5 rounded"
            />
            <div>
              <div className="font-medium text-sm">Is this ongoing right now?</div>
              <div className="text-xs text-gray-500">The security issue is currently happening</div>
            </div>
          </label>
          <label className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${form.immediateRiskToLife ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}>
            <input
              type="checkbox"
              checked={form.immediateRiskToLife}
              onChange={(e) => setForm({ ...form, immediateRiskToLife: e.target.checked })}
              className="w-5 h-5 rounded"
            />
            <div>
              <div className="font-medium text-sm">Immediate risk to life?</div>
              <div className="text-xs text-gray-500">Someone could be physically harmed</div>
            </div>
          </label>
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
            What Did You Observe? *
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="input-field w-full h-32"
            placeholder="Describe the security concern in detail. What happened? When? Be as specific as possible without revealing your own identity..."
            required
          />
        </div>

        {/* Suspect Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <Users className="w-4 h-4 inline mr-1" /> Description of Person(s) Involved (Optional)
          </label>
          <textarea
            value={form.suspectDescription}
            onChange={(e) => setForm({ ...form, suspectDescription: e.target.value })}
            className="input-field w-full h-20"
            placeholder="Physical description, clothing, approximate time seen, etc. (Optional — do not include if it might reveal your identity)"
          />
        </div>

        {/* Number of persons */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Number of Persons Involved (Optional)
          </label>
          <input
            type="text"
            value={form.personsInvolved}
            onChange={(e) => setForm({ ...form, personsInvolved: e.target.value })}
            className="input-field w-full"
            placeholder="e.g., 1 person, 2-3 people, a group"
          />
        </div>

        {/* Evidence */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Evidence or Additional Details (Optional)
          </label>
          <textarea
            value={form.evidenceDescription}
            onChange={(e) => setForm({ ...form, evidenceDescription: e.target.value })}
            className="input-field w-full h-20"
            placeholder="Describe any evidence you are aware of (e.g., CCTV cameras in the area, items left behind, etc.)"
          />
        </div>

        {/* Media Upload */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <Camera className="w-4 h-4 inline mr-1" /> Upload Photo or Short Video Evidence (Optional)
          </label>
          <p className="text-xs text-gray-500 mb-3">Attach a photo or short video as evidence. Max 5MB. Supported: JPG, PNG, MP4.</p>

          {!mediaPreview ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-red-400 hover:bg-red-50/30 transition-all"
            >
              <div className="flex items-center justify-center gap-4 mb-3">
                <div className="bg-red-100 p-3 rounded-full">
                  <Image className="w-6 h-6 text-red-600" />
                </div>
                <div className="bg-orange-100 p-3 rounded-full">
                  <Video className="w-6 h-6 text-orange-600" />
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
              {mediaFileType === 'image' ? (
                <img src={mediaPreview} alt="Uploaded evidence" className="w-full max-h-64 object-contain" />
              ) : (
                <video src={mediaPreview} controls className="w-full max-h-64" />
              )}
              <div className="p-2 bg-green-50 text-center">
                <span className="text-xs text-green-700 font-medium">
                  {mediaFileType === 'image' ? '📷 Photo attached' : '🎥 Video attached'}
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
                placeholder="e.g., Theatre store room, back entrance, drug cabinet area..."
              />
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg flex items-center gap-2 flex-1 justify-center disabled:opacity-50 transition-colors"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Submitting Anonymously...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Security Report Anonymously
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center">
          🔒 This form does not collect any identifying information. Your report is completely anonymous and confidential.
        </p>
      </form>
    </div>
  );
}
