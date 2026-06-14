'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const SmartTextInput = dynamic(() => import('@/components/SmartTextInput'), { ssr: false });

interface NoteItem {
  id: string;
  createdAt: string;
  changes: string | null;
  user?: { fullName?: string; username?: string };
}

export default function PostOperativeNotesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [surgery, setSurgery] = useState<any>(null);
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sRes, nRes] = await Promise.all([
        fetch(`/api/surgeries/${params.id}`),
        fetch(`/api/surgeries/${params.id}/post-op-notes`),
      ]);
      if (sRes.ok) setSurgery(await sRes.json());
      if (nRes.ok) setNotes(await nRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const submit = async () => {
    if (note.trim().length < 5) {
      alert('Please enter a meaningful post-operative note (minimum 5 characters).');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/surgeries/${params.id}/post-op-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to save post-operative note');
        return;
      }

      setNote('');
      await fetchData();
      alert('Post-operative note saved successfully.');
    } catch (error) {
      alert('Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <button
        onClick={() => router.back()}
        className="text-blue-600 hover:text-blue-800"
      >
        ← Back
      </button>

      <div>
        <h1 className="text-2xl font-bold">Post-Operative Notes</h1>
        {surgery && (
          <p className="text-sm text-gray-600 mt-1">
            {surgery.patient?.name || 'Unknown patient'} ({surgery.patient?.folderNumber || 'N/A'}) — {surgery.procedureName}
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <label className="block text-sm font-semibold text-gray-700">Add New Post-Operative Note</label>
        <SmartTextInput
          value={note}
          onChange={setNote}
          rows={6}
          placeholder="Enter surgeon post-operative notes, findings, instructions, and plan... (tap the mic to dictate)"
          enableSpeech
          enableReadBack
          medicalMode
          className="w-full"
        />
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={saving || note.trim().length < 5}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Post-Op Note'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-bold mb-3">Saved Notes</h2>
        {notes.length === 0 ? (
          <p className="text-gray-500 text-sm">No post-operative notes yet.</p>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => {
              let parsed: any = {};
              try {
                parsed = n.changes ? JSON.parse(n.changes) : {};
              } catch {}
              return (
                <div key={n.id} className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs text-gray-500 mb-1">
                    {new Date(n.createdAt).toLocaleString('en-GB')} • {n.user?.fullName || n.user?.username || 'Unknown'}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{parsed.note || '-'}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
