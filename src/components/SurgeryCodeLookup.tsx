"use client";
import { useState } from "react";
import { Search, Loader2, AlertTriangle, User, ClipboardList, Copy, Check } from "lucide-react";
import { looksLikeSurgeryCode } from "@/lib/surgeryCodes";

type CodeType = "CONSUMABLE" | "PHARMACY" | "ANAESTHESIA";

interface LookupResult {
  found: boolean;
  codeType?: CodeType;
  code?: string;
  isEmergency?: boolean;
  patient?: {
    name: string | null;
    folderNumber: string | null;
    phoneNumber: string | null;
    caregiverName: string | null;
    caregiverPhone: string | null;
  };
  surgery?: {
    id: string;
    procedureName: string;
    scheduledDate: string;
    scheduledTime?: string | null;
    surgeonName?: string | null;
    surgeryType?: string | null;
    subspecialty?: string | null;
    location?: string | null;
  } | null;
  /**
   * All three codes for this case, whichever way it was found.
   *
   * The desk is asked "what is my code?" by the patient standing in front of
   * it, and a lookup by PT number used to read these out of the database and
   * throw them away before the screen saw them.
   */
  codes?: {
    consumable: string | null;
    pharmacy: string | null;
    anaesthesia: string | null;
  };
  items?: any[];
  error?: string;
}

const CODE_LABEL: Array<{ key: "pharmacy" | "consumable" | "anaesthesia"; label: string }> = [
  { key: "pharmacy", label: "Pharmacy" },
  { key: "consumable", label: "Consumables" },
  { key: "anaesthesia", label: "Anaesthesia" },
];

const TITLES: Record<CodeType, string> = {
  CONSUMABLE: "Requested Consumables",
  PHARMACY: "Requested Drugs / Dressings",
  ANAESTHESIA: "Anaesthesia Prescription",
};

/**
 * A code-entry box for providers. The patient presents a code (CP-/PH-/AN-) and
 * the provider keys it in to see exactly what was requested for that patient.
 * `expect` optionally restricts the box to one code type for clearer messaging.
 */
export default function SurgeryCodeLookup({
  expect,
  title = "Enter patient code",
  lookupBy = "code",
}: {
  expect?: CodeType;
  title?: string;
  /**
   * "either" takes whatever the person at the counter types.
   *
   * They are handed both. One patient arrives holding a slip with PH-7K9QF2
   * on it; the next lost the slip and gives their PT number. Making the
   * counter work out which box to use produces "no surgery found" for a
   * patient standing right there with a perfectly good code.
   */
  lookupBy?: "code" | "patient" | "either";
}) {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const params = new URLSearchParams();
      // In "either" mode the shape of what was typed decides. looksLikeSurgeryCode
      // only matches the three prefixes this system issues, so a folder number
      // that happens to contain a dash is still looked up as a patient.
      const asCode = lookupBy === "code"
        || (lookupBy === "either" && looksLikeSurgeryCode(trimmed));
      if (asCode) {
        params.set("code", trimmed);
      } else {
        params.set("patientIdentifier", trimmed);
        if (expect) params.set("type", expect);
      }

      const r = await fetch(`/api/surgery-codes/lookup?${params.toString()}`, {
        cache: "no-store",
      });
      const data: LookupResult = await r.json();
      if (!r.ok || !data.found) {
        setError(data.error || "No surgery found for that code.");
        return;
      }
      if (expect && data.codeType !== expect) {
        setError(
          `That is a ${data.codeType} code. Please enter the ${expect} code for this desk.`
        );
        return;
      }
      setResult(data);
    } catch (err: any) {
      setError(err?.message || "Lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-4 space-y-3">
      <form onSubmit={lookup} className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">{title}</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={(() => {
              const sample = expect === "PHARMACY" ? "PH-7K9QF2"
                : expect === "ANAESTHESIA" ? "AN-7K9QF2"
                : "CP-7K9QF2";
              if (lookupBy === "patient") return "e.g. PT-12345 or folder number";
              if (lookupBy === "either") return `${sample} or PT-12345`;
              return `e.g. ${sample}`;
            })()}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono tracking-wider uppercase"
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="btn-primary inline-flex items-center justify-center gap-2 text-sm self-end h-[38px]"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Look up
        </button>
      </form>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && result.found && (
        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <User className="w-4 h-4 text-primary-600" />
              {result.patient?.name || "Unknown patient"}
              {result.patient?.folderNumber && (
                <span className="text-gray-500 font-normal">
                  • Folder {result.patient.folderNumber}
                </span>
              )}
              {result.isEmergency && (
                <span className="ml-auto text-xs font-bold text-red-600">EMERGENCY</span>
              )}
            </div>
            {result.surgery && (
              <div className="mt-1 text-xs text-gray-600">
                {result.surgery.procedureName}
                {result.surgery.surgeonName && <> • Surgeon: {result.surgery.surgeonName}</>}
                {result.surgery.scheduledDate && (
                  <> • {new Date(result.surgery.scheduledDate).toLocaleDateString()}</>
                )}
              </div>
            )}
            {(result.patient?.phoneNumber || result.patient?.caregiverPhone) && (
              <div className="mt-1 text-xs text-gray-500">
                {result.patient?.phoneNumber && <>Patient: {result.patient.phoneNumber} </>}
                {result.patient?.caregiverName && (
                  <>• {result.patient.caregiverName}: {result.patient.caregiverPhone}</>
                )}
              </div>
            )}

            {/* The patient's codes, whichever way this case was found.
                "What is my code?" is the question actually asked at the
                counter, and a lookup by PT number used to read these out of
                the database and drop them before the screen saw them.
                A code that was never issued says so, rather than showing a
                blank that reads as a display fault. */}
            {result.codes && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
                {CODE_LABEL.map(({ key, label }) => {
                  const value = result.codes?.[key] ?? null;
                  if (!value) {
                    return (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-400"
                      >
                        {label}: not issued
                      </span>
                    );
                  }
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(value);
                        setCopied(key);
                      }}
                      title={`Copy the ${label.toLowerCase()} code`}
                      className="inline-flex items-center gap-1 rounded border border-primary-200 bg-white px-2 py-1 text-[11px] font-mono font-semibold tracking-wider text-primary-800 hover:bg-primary-50"
                    >
                      <span className="font-sans font-normal text-gray-500">{label}:</span>
                      {value}
                      {copied === key
                        ? <Check className="h-3 w-3 text-green-600" />
                        : <Copy className="h-3 w-3 text-gray-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1">
              <ClipboardList className="w-4 h-4" />
              {result.codeType ? TITLES[result.codeType] : "Requested items"}
            </div>
            {(!result.items || result.items.length === 0) && (
              <div className="text-sm text-gray-500 italic">
                Nothing was requested for this patient.
              </div>
            )}
            {result.items && result.items.length > 0 && result.codeType !== "ANAESTHESIA" && (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="py-1 pr-2">Item</th>
                    <th className="py-1 pr-2">Details</th>
                    <th className="py-1 pr-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((it, i) => (
                    <tr key={it.id || i} className="border-b last:border-0">
                      <td className="py-1.5 pr-2 font-medium">{it.name}</td>
                      <td className="py-1.5 pr-2 text-gray-600">
                        {[it.category || it.type, it.size, it.dosage, it.route]
                          .filter(Boolean)
                          .join(" • ")}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        {it.quantity} {it.unit || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {result.items && result.items.length > 0 && result.codeType === "ANAESTHESIA" && (
              <div className="space-y-2">
                {result.items.map((rx, i) => (
                  <AnaesthesiaRx key={rx.id || i} rx={rx} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function parseJsonList(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [{ drugName: value }];
    }
  }
  return [];
}

function AnaesthesiaRx({ rx }: { rx: any }) {
  const meds = parseJsonList(rx.medications);
  const fluids = parseJsonList(rx.fluids);
  const emergency = parseJsonList(rx.emergencyDrugs);
  const Section = ({ label, list }: { label: string; list: any[] }) =>
    list.length === 0 ? null : (
      <div>
        <div className="text-xs font-semibold text-gray-500">{label}</div>
        <ul className="list-disc ml-5 text-sm text-gray-700">
          {list.map((m, i) => (
            <li key={i}>
              {m.drugName || m.name || m.fluid || JSON.stringify(m)}
              {(m.dosage || m.dose) && <> — {m.dosage || m.dose}</>}
              {m.route && <> ({m.route})</>}
              {m.quantity && <> ×{m.quantity}</>}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="rounded border border-gray-200 bg-white p-3 space-y-2">
      <Section label="Medications" list={meds} />
      <Section label="Fluids" list={fluids} />
      <Section label="Emergency drugs" list={emergency} />
      {rx.specialInstructions && (
        <div className="text-xs text-gray-600">Note: {rx.specialInstructions}</div>
      )}
    </div>
  );
}
