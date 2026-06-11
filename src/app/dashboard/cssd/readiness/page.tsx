'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { SURGICAL_SUBSPECIALTIES } from '@/lib/surgical-instruments-catalog';
const SmartTextInput = dynamic(() => import('@/components/SmartTextInput'), { ssr: false });

const SURGICAL_MATERIAL_OPTIONS = [
  'MAJOR BUNDLE',
  'MINOR BUNDLES',
  'GAUZE ONLY',
  'MOBS ONLY',
  'COTTON WOOL MEDIUM DRUM',
  'GOWNS',
  'MACHINTOSH DRUM',
] as const;

const STERILIZATION_STATUS_OPTIONS = [
  { value: 'STERILE', label: 'Sterile / Ready' },
  { value: 'BEING_STERILIZED', label: 'Being Sterilized' },
  { value: 'AWAITING_STERILIZATION', label: 'Awaiting Sterilization' },
  { value: 'NOT_STERILE', label: 'Not Sterile' },
  { value: 'DAMAGED', label: 'Damaged / Faulty' },
] as const;

interface InstrumentPackRow {
  subspecialty: string;
  packName: string;
  sterilizationStatus: string;
  notes: string;
}

interface SurgicalMaterialRow {
  material: string;
  quantity: number;
  sterilizationStatus: string;
  notes: string;
}

const SHIFT_OPTIONS = ['MORNING', 'AFTERNOON', 'NIGHT'] as const;

export default function CssdReadinessPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [reports, setReports] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    shiftType: 'MORNING',
    readinessStatus: 'READY',
    machineFaults: '',
    blockingReason: '',
    issues: '',
    recommendedActions: '',
    notes: '',
  });
  const [instrumentPacks, setInstrumentPacks] = useState<InstrumentPackRow[]>([]);
  const [surgicalMaterials, setSurgicalMaterials] = useState<SurgicalMaterialRow[]>([]);

  const addInstrumentPack = () =>
    setInstrumentPacks((rows) => [
      ...rows,
      { subspecialty: SURGICAL_SUBSPECIALTIES[0], packName: '', sterilizationStatus: 'STERILE', notes: '' },
    ]);
  const updateInstrumentPack = (index: number, field: keyof InstrumentPackRow, value: string) =>
    setInstrumentPacks((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  const removeInstrumentPack = (index: number) =>
    setInstrumentPacks((rows) => rows.filter((_, i) => i !== index));

  const addSurgicalMaterial = () =>
    setSurgicalMaterials((rows) => [
      ...rows,
      { material: SURGICAL_MATERIAL_OPTIONS[0], quantity: 0, sterilizationStatus: 'STERILE', notes: '' },
    ]);
  const updateSurgicalMaterial = (index: number, field: keyof SurgicalMaterialRow, value: string | number) =>
    setSurgicalMaterials((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  const removeSurgicalMaterial = (index: number) =>
    setSurgicalMaterials((rows) => rows.filter((_, i) => i !== index));

  const willTriggerRedAlert = Boolean(formData.machineFaults.trim() || formData.blockingReason.trim());

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchData();
    }
  }, [status, router]);

  const fetchData = async () => {
    try {
      const [reportsRes, inventoryRes] = await Promise.all([
        fetch('/api/cssd-readiness'),
        fetch('/api/cssd-inventory'),
      ]);

      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setReports(data.reports);
      }

      if (inventoryRes.ok) {
        const data = await inventoryRes.json();
        const inventory = data.inventory;
        
        const sterile = inventory.filter((i: any) => i.status === 'STERILE').length;
        const inSterilization = inventory.filter((i: any) => i.status === 'IN_STERILIZATION').length;
        const lowStock = inventory.filter((i: any) => i.status === 'LOW_STOCK').length;
        const outOfStock = inventory.filter((i: any) => i.status === 'OUT_OF_STOCK').length;
        
        const expiringSoon = inventory.filter((i: any) => {
          if (!i.expiryDate) return false;
          const daysUntilExpiry = (new Date(i.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          return daysUntilExpiry > 0 && daysUntilExpiry <= 7;
        }).length;

        setStats({
          totalSterileItems: sterile,
          itemsInSterilization: inSterilization,
          itemsExpiringSoon: expiringSoon,
          lowStockItems: lowStock,
          outOfStockItems: outOfStock,
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        shiftType: formData.shiftType,
        readinessStatus: formData.readinessStatus,
        instrumentPacks,
        surgicalMaterials,
        machineFaults: formData.machineFaults,
        blockingReason: formData.blockingReason,
        criticalShortages: formData.issues,
        actionTaken: formData.recommendedActions,
        notes: formData.notes,
      };
      const response = await fetch('/api/cssd-readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.redAlertTriggered) {
          alert('🔴 RED ALERT dispatched to all admins and maintenance staff.');
        }
        setShowAddModal(false);
        setFormData({
          shiftType: 'MORNING',
          readinessStatus: 'READY',
          machineFaults: '',
          blockingReason: '',
          issues: '',
          recommendedActions: '',
          notes: '',
        });
        setInstrumentPacks([]);
        setSurgicalMaterials([]);
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create readiness report');
      }
    } catch (error) {
      console.error('Error creating readiness report:', error);
      alert('Failed to create readiness report');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="text-xl">Loading...</div></div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">CSSD Readiness Dashboard</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
        >
          Create Report
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-green-100 rounded-lg p-4">
            <div className="text-sm text-green-600 font-medium">Sterile Items</div>
            <div className="text-3xl font-bold text-green-800">{stats.totalSterileItems}</div>
          </div>
          <div className="bg-yellow-100 rounded-lg p-4">
            <div className="text-sm text-yellow-600 font-medium">In Sterilization</div>
            <div className="text-3xl font-bold text-yellow-800">{stats.itemsInSterilization}</div>
          </div>
          <div className="bg-orange-100 rounded-lg p-4">
            <div className="text-sm text-orange-600 font-medium">Expiring Soon</div>
            <div className="text-3xl font-bold text-orange-800">{stats.itemsExpiringSoon}</div>
          </div>
          <div className="bg-red-100 rounded-lg p-4">
            <div className="text-sm text-red-600 font-medium">Low Stock</div>
            <div className="text-3xl font-bold text-red-800">{stats.lowStockItems}</div>
          </div>
          <div className="bg-red-100 rounded-lg p-4">
            <div className="text-sm text-red-600 font-medium">Out of Stock</div>
            <div className="text-3xl font-bold text-red-800">{stats.outOfStockItems}</div>
          </div>
        </div>
      )}

      {/* Reports Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shift</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Readiness</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Major</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Minor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gowns</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Alert</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reported By</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reports.map((report) => (
              <tr key={report.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(report.reportDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.shiftType}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.readinessPercentage}%</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.majorBundlesAvailable}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.minorBundlesAvailable}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.gownsAvailable}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    report.overallStatus === 'READY' ? 'bg-green-100 text-green-800' :
                    report.overallStatus === 'PARTIALLY_READY' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {report.overallStatus}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {report.redAlertTriggered ? (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-600 text-white">
                      🔴 RED
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.reportedBy?.fullName || 'Unknown'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Create Readiness Report</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Shift *</label>
                  <select
                    required
                    aria-label="Shift"
                    value={formData.shiftType}
                    onChange={(e) => setFormData({ ...formData, shiftType: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    {SHIFT_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Overall Readiness Status *</label>
                  <select
                    required
                    aria-label="Overall readiness status"
                    value={formData.readinessStatus}
                    onChange={(e) => setFormData({ ...formData, readinessStatus: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="READY">Ready</option>
                    <option value="LIMITED">Limited</option>
                    <option value="NOT_READY">Not Ready</option>
                  </select>
                </div>
              </div>

              {/* Subspecialty Instrument Packs */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-semibold">Subspecialty Instrument Packs</label>
                  <button
                    type="button"
                    onClick={addInstrumentPack}
                    className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg"
                  >
                    + Add Pack
                  </button>
                </div>
                {instrumentPacks.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No instrument packs added yet.</p>
                )}
                <div className="space-y-3">
                  {instrumentPacks.map((row, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border rounded-lg p-3 bg-gray-50">
                      <div className="md:col-span-3">
                        <label className="block text-xs text-gray-500 mb-1">Subspecialty</label>
                        <select
                          aria-label="Subspecialty"
                          value={row.subspecialty}
                          onChange={(e) => updateInstrumentPack(index, 'subspecialty', e.target.value)}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        >
                          {SURGICAL_SUBSPECIALTIES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-xs text-gray-500 mb-1">Pack Name</label>
                        <input
                          type="text"
                          value={row.packName}
                          onChange={(e) => updateInstrumentPack(index, 'packName', e.target.value)}
                          placeholder="e.g. Laparotomy Set"
                          className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-xs text-gray-500 mb-1">Sterilization Status</label>
                        <select
                          aria-label="Pack sterilization status"
                          value={row.sterilizationStatus}
                          onChange={(e) => updateInstrumentPack(index, 'sterilizationStatus', e.target.value)}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        >
                          {STERILIZATION_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                        <input
                          type="text"
                          aria-label="Pack notes"
                          placeholder="Optional"
                          value={row.notes}
                          onChange={(e) => updateInstrumentPack(index, 'notes', e.target.value)}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <button
                          type="button"
                          onClick={() => removeInstrumentPack(index)}
                          className="w-full text-red-600 hover:text-red-800 text-sm py-1.5"
                          aria-label="Remove pack"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Surgical Materials */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-semibold">Surgical Materials</label>
                  <button
                    type="button"
                    onClick={addSurgicalMaterial}
                    className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg"
                  >
                    + Add Material
                  </button>
                </div>
                {surgicalMaterials.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No surgical materials added yet.</p>
                )}
                <div className="space-y-3">
                  {surgicalMaterials.map((row, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border rounded-lg p-3 bg-gray-50">
                      <div className="md:col-span-4">
                        <label className="block text-xs text-gray-500 mb-1">Material</label>
                        <select
                          aria-label="Surgical material"
                          value={row.material}
                          onChange={(e) => updateSurgicalMaterial(index, 'material', e.target.value)}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        >
                          {SURGICAL_MATERIAL_OPTIONS.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Quantity</label>
                        <input
                          type="number"
                          min={0}
                          aria-label="Material quantity"
                          placeholder="0"
                          value={row.quantity}
                          onChange={(e) => updateSurgicalMaterial(index, 'quantity', parseInt(e.target.value) || 0)}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-xs text-gray-500 mb-1">Sterilization Status</label>
                        <select
                          aria-label="Material sterilization status"
                          value={row.sterilizationStatus}
                          onChange={(e) => updateSurgicalMaterial(index, 'sterilizationStatus', e.target.value)}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        >
                          {STERILIZATION_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                        <input
                          type="text"
                          aria-label="Material notes"
                          placeholder="Optional"
                          value={row.notes}
                          onChange={(e) => updateSurgicalMaterial(index, 'notes', e.target.value)}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <button
                          type="button"
                          onClick={() => removeSurgicalMaterial(index)}
                          className="w-full text-red-600 hover:text-red-800 text-sm py-1.5"
                          aria-label="Remove material"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Faults / First-knife-at-risk escalation */}
              <div className="mt-6 border-2 border-red-200 rounded-lg p-4 bg-red-50">
                <h3 className="text-sm font-bold text-red-700 mb-1">⚠️ Faults &amp; First-Knife-at-Risk</h3>
                <p className="text-xs text-red-600 mb-3">
                  Any entry below triggers an immediate <strong>RED ALERT</strong> to all admins and maintenance staff.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Faults / Malfunctioning Machines</label>
                    <textarea
                      value={formData.machineFaults}
                      onChange={(e) => setFormData({ ...formData, machineFaults: e.target.value })}
                      rows={2}
                      placeholder="Describe any faulty or malfunctioning autoclave/machine..."
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Any reason that will stop first knife on skin by 9AM daily
                    </label>
                    <textarea
                      value={formData.blockingReason}
                      onChange={(e) => setFormData({ ...formData, blockingReason: e.target.value })}
                      rows={2}
                      placeholder="Describe any blocking issue that could delay first knife by 9AM..."
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                  {willTriggerRedAlert && (
                    <div className="bg-red-600 text-white text-sm font-semibold rounded-lg px-3 py-2">
                      🔴 This report will trigger a RED ALERT to all admins and maintenance on submission.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <SmartTextInput
                  label="Critical Shortages / Issues"
                  value={formData.issues}
                  onChange={(val) => setFormData({ ...formData, issues: val })}
                  rows={2}
                  placeholder="Document any issues... 🎤 Dictate"
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                />
              </div>
              <div className="mt-4">
                <SmartTextInput
                  label="Recommended Actions"
                  value={formData.recommendedActions}
                  onChange={(val) => setFormData({ ...formData, recommendedActions: val })}
                  rows={2}
                  placeholder="Recommended actions... 🎤 Dictate"
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                />
              </div>
              <div className="mt-4">
                <SmartTextInput
                  label="Notes"
                  value={formData.notes}
                  onChange={(val) => setFormData({ ...formData, notes: val })}
                  rows={2}
                  placeholder="Additional notes... 🎤 Dictate"
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                />
              </div>
              <div className="flex justify-end gap-4 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Create Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
