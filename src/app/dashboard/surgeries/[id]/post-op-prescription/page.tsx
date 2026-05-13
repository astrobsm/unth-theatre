"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash2, Send } from "lucide-react";

interface Med { drugName: string; dosage: string; route: string; frequency: string; duration: string; quantity: number; isControlled: boolean; notes?: string }

export default function PostOpPrescriptionPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const [surgery, setSurgery] = useState<any>(null);
  const [meds, setMeds] = useState<Med[]>([
    { drugName: "", dosage: "", route: "PO", frequency: "", duration: "", quantity: 1, isControlled: false },
  ]);
  const [notes, setNotes] = useState("");
  const [totalCost, setTotalCost] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/surgeries/${params.id}`).then(async (r) => { if (r.ok) setSurgery(await r.json()); });
  }, [params.id]);

  const update = (i: number, k: keyof Med, v: any) =>
    setMeds((s) => s.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)));

  async function submit() {
    setSubmitting(true); setError("");
    try {
      const cleaned = meds.filter((m) => m.drugName.trim());
      if (!cleaned.length) throw new Error("Add at least one medication.");
      const r = await fetch("/api/post-op-prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surgeryId: params.id,
          medications: cleaned,
          notes: notes || undefined,
          totalCost: totalCost ? Number(totalCost) : undefined,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      alert("Prescription sent to pharmacy.");
      router.push(`/dashboard/surgeries/${params.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Post-Op Prescription</h1>
      {surgery && (
        <p className="text-sm text-gray-600">
          {surgery.patient?.name} — {surgery.procedureName} ({surgery.status})
        </p>
      )}

      <div className="space-y-3">
        {meds.map((m, i) => (
          <div key={i} className="border rounded p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <input className="border rounded px-2 py-1 col-span-2" placeholder="Drug name" aria-label="Drug name" value={m.drugName} onChange={(e) => update(i, "drugName", e.target.value)} />
            <input className="border rounded px-2 py-1" placeholder="Dosage (e.g. 500mg)" aria-label="Dosage" value={m.dosage} onChange={(e) => update(i, "dosage", e.target.value)} />
            <select className="border rounded px-2 py-1" aria-label="Route" value={m.route} onChange={(e) => update(i, "route", e.target.value)}>
              {["PO", "IV", "IM", "SC", "PR", "TOPICAL"].map((r) => <option key={r}>{r}</option>)}
            </select>
            <input className="border rounded px-2 py-1" placeholder="Frequency (e.g. BD)" aria-label="Frequency" value={m.frequency} onChange={(e) => update(i, "frequency", e.target.value)} />
            <input className="border rounded px-2 py-1" placeholder="Duration (e.g. 5 days)" aria-label="Duration" value={m.duration} onChange={(e) => update(i, "duration", e.target.value)} />
            <input type="number" min={1} className="border rounded px-2 py-1" placeholder="Qty" aria-label="Quantity" value={m.quantity} onChange={(e) => update(i, "quantity", Number(e.target.value))} />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={m.isControlled} onChange={(e) => update(i, "isControlled", e.target.checked)} /> Controlled
            </label>
            <button type="button" onClick={() => setMeds((s) => s.filter((_, idx) => idx !== i))} className="text-red-600 col-span-2 sm:col-span-1 text-xs inline-flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setMeds((s) => [...s, { drugName: "", dosage: "", route: "PO", frequency: "", duration: "", quantity: 1, isControlled: false }])} className="text-sm inline-flex items-center gap-1 text-blue-600">
          <Plus className="w-4 h-4" /> Add medication
        </button>
      </div>

      <textarea className="w-full border rounded px-2 py-1 text-sm" rows={3} placeholder="Additional notes for pharmacy" aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <input type="number" className="w-full border rounded px-2 py-1 text-sm" placeholder="Total cost (₦, optional — pharmacy can edit)" aria-label="Total cost" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} />

      {error && <div className="text-red-600 text-sm">{error}</div>}
      <button onClick={submit} disabled={submitting} className="btn-primary inline-flex items-center gap-2">
        <Send className="w-4 h-4" /> Send to Pharmacy
      </button>
    </div>
  );
}
