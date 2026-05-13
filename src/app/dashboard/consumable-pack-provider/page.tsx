"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Package, RefreshCw, CheckCircle2, AlertTriangle, Megaphone } from "lucide-react";

interface Item {
  id: string;
  surgeryId: string;
  name: string;
  category: string;
  size?: string | null;
  unit: string;
  quantity: number;
  status: string;
  notes?: string | null;
  packedByName?: string | null;
  packedAt?: string | null;
  surgery: {
    id: string;
    procedureName: string;
    scheduledDate: string;
    scheduledTime: string;
    subspecialty: string;
    surgeryType: string;
    surgeonName: string;
    location?: string | null;
    patient: { name: string; folderNumber?: string | null };
  };
}

export default function ConsumablePackProviderPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("ALL");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/consumable-requests", { cache: "no-store" });
      if (r.ok) setItems(await r.json());
      else setError((await r.json()).error || "Failed to load");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const g: Record<string, { surgery: Item["surgery"]; items: Item[] }> = {};
    for (const it of items) {
      if (filter !== "ALL" && it.status !== filter) continue;
      const key = it.surgeryId;
      if (!g[key]) g[key] = { surgery: it.surgery, items: [] };
      g[key].items.push(it);
    }
    return Object.values(g).sort((a, b) => {
      // Emergency first, then earliest date
      if (a.surgery.surgeryType === "EMERGENCY" && b.surgery.surgeryType !== "EMERGENCY") return -1;
      if (b.surgery.surgeryType === "EMERGENCY" && a.surgery.surgeryType !== "EMERGENCY") return 1;
      return new Date(a.surgery.scheduledDate).getTime() - new Date(b.surgery.scheduledDate).getTime();
    });
  }, [items, filter]);

  async function patch(id: string, action: "PACKED" | "DELIVERED" | "START_PACKING" | "CANCEL") {
    const r = await fetch("/api/consumable-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    if (r.ok) load();
    else alert((await r.json()).error || "Failed");
  }

  async function broadcast(surgeryId: string) {
    const r = await fetch("/api/consumable-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surgeryId }),
    });
    if (r.ok) alert("📻 Theatre Radio announcement broadcast.");
    else alert((await r.json()).error || "Broadcast failed");
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Package className="w-7 h-7 text-primary-600" />
        <h1 className="text-2xl font-bold">Consumable Pack Provider</h1>
        <button onClick={load} className="ml-auto btn-secondary inline-flex items-center gap-2 text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <p className="text-sm text-gray-600">
        Pre-pack the consumables required for each booked surgery. Emergency cases are pinned to the top.
      </p>

      <div className="flex gap-2 text-xs">
        {["ALL", "REQUESTED", "PACKING", "PACKED", "DELIVERED"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded ${filter === s ? "bg-primary-600 text-white" : "bg-gray-100"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {grouped.length === 0 && !loading && (
        <div className="text-sm text-gray-500 italic">No matching requests.</div>
      )}

      {grouped.map((g) => {
        const pendingCount = g.items.filter((i) => i.status === "REQUESTED" || i.status === "PACKING").length;
        const allPacked = pendingCount === 0;
        return (
          <div key={g.surgery.id} className={`card border ${g.surgery.surgeryType === "EMERGENCY" ? "border-red-300 bg-red-50/40" : "border-gray-200"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-gray-500">
                  {new Date(g.surgery.scheduledDate).toLocaleDateString()} · {g.surgery.scheduledTime}
                  {g.surgery.location ? ` · ${g.surgery.location}` : ""}
                  {" · "}{g.surgery.subspecialty}
                  {g.surgery.surgeryType === "EMERGENCY" && (
                    <span className="ml-2 inline-flex items-center gap-1 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded">
                      <AlertTriangle className="w-3 h-3" /> EMERGENCY
                    </span>
                  )}
                </div>
                <div className="font-semibold text-lg">{g.surgery.patient.name}{g.surgery.patient.folderNumber ? ` (${g.surgery.patient.folderNumber})` : ""}</div>
                <div className="text-sm text-gray-700">{g.surgery.procedureName} — {g.surgery.surgeonName}</div>
              </div>
              {allPacked && (
                <button onClick={() => broadcast(g.surgery.id)} className="btn-primary text-xs inline-flex items-center gap-1">
                  <Megaphone className="w-4 h-4" /> Broadcast Ready
                </button>
              )}
            </div>

            <div className="mt-3 grid sm:grid-cols-2 gap-2">
              {g.items.map((it) => (
                <div key={it.id} className={`border rounded p-2 text-sm ${it.status === "PACKED" || it.status === "DELIVERED" ? "bg-green-50 border-green-200" : "bg-white"}`}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="font-medium">{it.name}{it.size ? ` — ${it.size}` : ""}</div>
                      <div className="text-xs text-gray-500">
                        {it.quantity} {it.unit} · {it.category.replaceAll("_", " ")} · <span className="font-medium">{it.status}</span>
                      </div>
                      {it.packedByName && (
                        <div className="text-[10px] text-gray-400">packed by {it.packedByName}{it.packedAt ? ` · ${new Date(it.packedAt).toLocaleString()}` : ""}</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {it.status === "REQUESTED" && (
                        <button onClick={() => patch(it.id, "PACKED")} className="text-xs btn-primary inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Mark Packed
                        </button>
                      )}
                      {it.status === "PACKED" && (
                        <button onClick={() => patch(it.id, "DELIVERED")} className="text-xs btn-secondary">Mark Delivered</button>
                      )}
                      {(it.status === "REQUESTED" || it.status === "PACKING") && (
                        <button onClick={() => patch(it.id, "CANCEL")} className="text-xs text-red-600 underline">Cancel</button>
                      )}
                    </div>
                  </div>
                  {it.notes && <div className="text-xs text-gray-500 mt-1">📝 {it.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
