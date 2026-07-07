"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Package, RefreshCw, CheckCircle2, AlertTriangle, Megaphone, MessageCircle } from "lucide-react";
import { whatsappChatLink } from "@/lib/whatsapp";
import SurgeryCodeLookup from "@/components/SurgeryCodeLookup";

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
  requestedByName?: string | null;
  requestedBy?: { id: string; fullName: string; phoneNumber?: string | null } | null;
  surgery: {
    id: string;
    procedureName: string;
    scheduledDate: string;
    scheduledTime: string;
    subspecialty: string;
    surgeryType: string;
    surgeonName: string;
    location?: string | null;
    surgeon?: { id: string; fullName: string; phoneNumber?: string | null } | null;
    scrubNurse?: { fullName: string; phoneNumber?: string | null } | null;
    circulatingNurse?: { fullName: string; phoneNumber?: string | null } | null;
    patient: {
      id?: string;
      name: string;
      folderNumber?: string | null;
      phoneNumber?: string | null;
      caregiverName?: string | null;
      caregiverPhone?: string | null;
    };
  };
}

export default function ConsumablePackProviderPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("ALL");
  // Search by patient PT / folder number (also matches patient name).
  const [search, setSearch] = useState("");
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
    const q = search.trim().toLowerCase();
    const g: Record<string, { surgery: Item["surgery"]; items: Item[] }> = {};
    for (const it of items) {
      if (filter !== "ALL" && it.status !== filter) continue;
      // Search by PT / folder number (primary) or patient name.
      if (q) {
        const folder = (it.surgery.patient.folderNumber || "").toLowerCase();
        const name = (it.surgery.patient.name || "").toLowerCase();
        if (!folder.includes(q) && !name.includes(q)) continue;
      }
      const key = it.surgeryId;
      if (!g[key]) g[key] = { surgery: it.surgery, items: [] };
      g[key].items.push(it);
    }
    return Object.values(g).sort((a, b) => {
      // Emergency first, then by patient PT / folder number (ascending).
      if (a.surgery.surgeryType === "EMERGENCY" && b.surgery.surgeryType !== "EMERGENCY") return -1;
      if (b.surgery.surgeryType === "EMERGENCY" && a.surgery.surgeryType !== "EMERGENCY") return 1;
      const fa = a.surgery.patient.folderNumber || "";
      const fb = b.surgery.patient.folderNumber || "";
      const byFolder = fa.localeCompare(fb, undefined, { numeric: true, sensitivity: "base" });
      if (byFolder !== 0) return byFolder;
      return new Date(a.surgery.scheduledDate).getTime() - new Date(b.surgery.scheduledDate).getTime();
    });
  }, [items, filter, search]);

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

      {/* Hand-over policy notice */}
      <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-bold text-red-900 mb-1">Do NOT hand consumable packs to patients or relatives.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Patients go to theatre with their <span className="font-semibold">evidence of payment only</span>.</li>
              <li>Hand the consumable pack directly to the <span className="font-semibold">scrub nurse assigned to that patient&apos;s theatre</span>.</li>
              <li>Use the scrub nurse&apos;s phone number shown on each case to confirm hand-over.</li>
            </ul>
          </div>
        </div>
      </div>

      <SurgeryCodeLookup
        expect="CONSUMABLE"
        title="Enter the patient's consumable pack code"
      />

      {/* Search / sort by patient PT (folder) number */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by PT / folder number or patient name…"
          className="input-field flex-1"
          aria-label="Search by patient PT number"
        />
        {search && (
          <button onClick={() => setSearch("")} className="btn-secondary text-sm whitespace-nowrap">
            Clear
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500">Cases are sorted by patient PT number (emergencies pinned to the top).</p>

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
        const requesterItem = g.items.find((i) => i.requestedBy || i.requestedByName);
        // Prefer the actual user who created the request; for older requests with
        // no creator on file, fall back to the booking surgeon so the pack
        // provider always has someone to contact.
        const requesterName =
          requesterItem?.requestedBy?.fullName ||
          requesterItem?.requestedByName ||
          g.surgery.surgeon?.fullName ||
          g.surgery.surgeonName ||
          null;
        const requesterPhone =
          requesterItem?.requestedBy?.phoneNumber ||
          g.surgery.surgeon?.phoneNumber ||
          null;
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

                {/* Hand the pack to the scrub nurse assigned to this theatre */}
                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
                  <span className="font-semibold text-blue-900">Hand pack to scrub nurse: </span>
                  {g.surgery.scrubNurse?.fullName ? (
                    <>
                      <span className="text-gray-800">{g.surgery.scrubNurse.fullName}</span>
                      {g.surgery.scrubNurse.phoneNumber ? (
                        <a
                          href={whatsappChatLink(g.surgery.scrubNurse.phoneNumber) || `tel:${g.surgery.scrubNurse.phoneNumber.replace(/\s+/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Chat / call the scrub nurse"
                          className="ml-2 inline-flex items-center gap-1 text-green-700 hover:underline font-medium"
                        >
                          <MessageCircle className="w-3 h-3" /> {g.surgery.scrubNurse.phoneNumber}
                        </a>
                      ) : (
                        <span className="ml-1 text-gray-400">(no phone on file)</span>
                      )}
                      {g.surgery.circulatingNurse?.fullName && (
                        <span className="ml-3 text-gray-600">
                          Circulating: {g.surgery.circulatingNurse.fullName}
                          {g.surgery.circulatingNurse.phoneNumber ? (
                            <a
                              href={whatsappChatLink(g.surgery.circulatingNurse.phoneNumber) || `tel:${g.surgery.circulatingNurse.phoneNumber.replace(/\s+/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 inline-flex items-center gap-1 text-green-700 hover:underline"
                            >
                              <MessageCircle className="w-3 h-3" /> {g.surgery.circulatingNurse.phoneNumber}
                            </a>
                          ) : null}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-500">
                      Not yet assigned{g.surgery.location ? ` for ${g.surgery.location}` : ""}. Confirm the theatre allocation / duty roster.
                    </span>
                  )}
                </div>

                {/* Contacts: requester (who created the request) + patient phones */}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span className="text-gray-600">
                    <span className="font-medium text-gray-700">Requested by:</span>{" "}
                    {requesterName || "—"}
                    {requesterPhone ? (
                      <a
                        href={whatsappChatLink(requesterPhone) || `tel:${requesterPhone.replace(/\s+/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Chat on WhatsApp"
                        className="ml-1 inline-flex items-center gap-1 text-green-700 hover:underline"
                      >
                        <MessageCircle className="w-3 h-3" /> {requesterPhone}
                      </a>
                    ) : (
                      <span className="ml-1 text-gray-400">(no phone)</span>
                    )}
                  </span>

                  <span className="text-gray-600">
                    <span className="font-medium text-gray-700">Patient:</span>{" "}
                    {g.surgery.patient.phoneNumber ? (
                      <a
                        href={whatsappChatLink(g.surgery.patient.phoneNumber) || `tel:${g.surgery.patient.phoneNumber.replace(/\s+/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Chat on WhatsApp"
                        className="inline-flex items-center gap-1 text-green-700 hover:underline"
                      >
                        <MessageCircle className="w-3 h-3" /> {g.surgery.patient.phoneNumber}
                      </a>
                    ) : (
                      <span className="text-gray-400">(no phone)</span>
                    )}
                  </span>

                  {g.surgery.patient.caregiverPhone && (
                    <span className="text-gray-600">
                      <span className="font-medium text-gray-700">
                        Caregiver{g.surgery.patient.caregiverName ? ` (${g.surgery.patient.caregiverName})` : ""}:
                      </span>{" "}
                      <a
                        href={whatsappChatLink(g.surgery.patient.caregiverPhone) || `tel:${g.surgery.patient.caregiverPhone.replace(/\s+/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Chat on WhatsApp"
                        className="inline-flex items-center gap-1 text-green-700 hover:underline"
                      >
                        <MessageCircle className="w-3 h-3" /> {g.surgery.patient.caregiverPhone}
                      </a>
                    </span>
                  )}
                </div>
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
