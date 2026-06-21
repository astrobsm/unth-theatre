'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  MessageCircle,
  Send,
  Loader2,
  Star,
  Building2,
  MonitorSmartphone,
  Share2,
  Copy,
  Check,
  Download,
  QrCode,
} from 'lucide-react';
import PatientFeedbackShare from '@/components/PatientFeedbackShare';

type Category = 'THEATRE_MANAGEMENT' | 'APPLICATION';

interface StaffFeedbackItem {
  id: string;
  category: Category;
  title: string | null;
  message: string;
  rating: number | null;
  authorName: string | null;
  authorRole: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
  THEATRE_MANAGEMENT: 'Theatre Management',
  APPLICATION: 'The Application',
};

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_REVIEW: 'bg-amber-100 text-amber-700',
  ACTIONED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-200 text-gray-600',
};

function StarPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-0.5"
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          <Star
            className={`w-6 h-6 ${
              value != null && n <= value
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-300'
            }`}
          />
        </button>
      ))}
      {value != null && (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="ml-2 text-xs text-gray-400 hover:text-gray-600"
        >
          clear
        </button>
      )}
    </div>
  );
}

export default function StaffFeedbackPage() {
  const { data: session } = useSession();

  const [category, setCategory] = useState<Category>('THEATRE_MANAGEMENT');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [items, setItems] = useState<StaffFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Public patient-feedback link + QR
  const [publicUrl, setPublicUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/feedback/staff');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/feedback`;
    setPublicUrl(url);
    QRCode.toDataURL(url, { width: 320, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    if (message.trim().length < 3) {
      setError('Please describe what you would like improved.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          title: title.trim() || undefined,
          message: message.trim(),
          rating: rating && rating > 0 ? rating : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not submit feedback.');
        return;
      }
      setOkMsg('Thank you — your feedback has been recorded.');
      setTitle('');
      setMessage('');
      setRating(null);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this public patient feedback link:', publicUrl);
    }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = 'patient-feedback-qr.png';
    a.click();
  };

  const sharePoster = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'UNTH Theatre — Patient Feedback',
          text: 'Share your experience during your surgical journey.',
          url: publicUrl,
        });
        return;
      } catch {
        // fall through to copy
      }
    }
    copyLink();
  };

  const myCount = items.length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1 flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-blue-600" /> Feedback
        </h1>
        <p className="text-gray-500 text-sm">
          Tell us what to improve in theatre management and in the application. Share the
          patient feedback link &amp; QR code with patients and their relatives.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Staff suggestion form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Staff Suggestion</h2>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                What is this about?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCategory('THEATRE_MANAGEMENT')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${
                    category === 'THEATRE_MANAGEMENT'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Building2 className="w-4 h-4" /> Theatre Management
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('APPLICATION')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${
                    category === 'APPLICATION'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <MonitorSmartphone className="w-4 h-4" /> The Application
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Short summary"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                What would you like improved?
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={5000}
                placeholder={
                  category === 'THEATRE_MANAGEMENT'
                    ? 'e.g. Scheduling, equipment availability, communication between units…'
                    : 'e.g. A feature you need, something confusing, a bug…'
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Overall rating <span className="text-gray-400">(optional)</span>
              </label>
              <StarPicker value={rating} onChange={(v) => setRating(v === 0 ? null : v)} />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {okMsg && <p className="text-sm text-green-600">{okMsg}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Submit feedback
            </button>
          </form>
        </div>

        {/* Patient feedback link + QR */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-green-600" /> Patient Feedback Link
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Patients and relatives can scan this code or open the link to share their
            experience — no login required.
          </p>

          <div className="flex flex-col items-center gap-4">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="Patient feedback QR code"
                className="w-44 h-44 border border-gray-200 rounded-lg"
              />
            ) : (
              <div className="w-44 h-44 flex items-center justify-center border border-gray-200 rounded-lg">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            )}

            <div className="w-full">
              <div className="flex items-stretch gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicUrl}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-700"
                  aria-label="Public patient feedback link"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={downloadQr}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                >
                  <Download className="w-4 h-4" /> Download QR
                </button>
                <button
                  type="button"
                  onClick={sharePoster}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Share2 className="w-4 h-4" /> Share
                </button>
              </div>
              <div className="mt-3">
                <PatientFeedbackShare />
                <p className="text-xs text-gray-400 mt-1">
                  Select patients to send each one a personalised feedback link by WhatsApp.
                </p>
              </div>
              <Link
                href="/feedback"
                target="_blank"
                className="block text-center text-sm text-blue-600 hover:underline mt-3"
              >
                Open patient feedback form →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* My submissions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-3">
          Submissions {myCount > 0 && <span className="text-gray-400">({myCount})</span>}
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No feedback submitted yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((it) => (
              <li key={it.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {CATEGORY_LABELS[it.category]}
                      </span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          STATUS_STYLES[it.status] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {it.status.replace('_', ' ')}
                      </span>
                      {it.rating != null && (
                        <span className="inline-flex items-center text-xs text-yellow-600">
                          <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 mr-0.5" />
                          {it.rating}
                        </span>
                      )}
                    </div>
                    {it.title && (
                      <p className="text-sm font-medium text-gray-900 mt-1">{it.title}</p>
                    )}
                    <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">
                      {it.message}
                    </p>
                    {it.adminNotes && (
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="font-medium">Admin note:</span> {it.adminNotes}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(it.createdAt).toLocaleDateString('en-GB')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
