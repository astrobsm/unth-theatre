'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { 
  ClipboardList, 
  CheckCircle, 
  Download, 
  AlertCircle, 
  FileText,
  User,
  Calendar,
  Mic,
  Camera
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import SmartTextInput from '@/components/SmartTextInput';

interface Surgery {
  id: string;
  procedureName: string;
  scheduledDate: string;
  status: string;
  patient: {
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
  };
  surgeon: {
    fullName: string;
  };
  unit: string;
}

interface ChecklistData {
  signIn: {
    patientConfirmed: boolean;
    siteMarked: boolean;
    anesthesiaChecked: boolean;
    pulseOximeterOn: boolean;
    allergyChecked: boolean;
    signInNotes: string;
  };
  timeOut: {
    teamIntroduced: boolean;
    procedureConfirmed: boolean;
    criticalStepsReviewed: boolean;
    equipmentConcerns: boolean;
    antibioticGiven: boolean;
    imagingDisplayed: boolean;
    timeOutNotes: string;
  };
  signOut: {
    procedureRecorded: boolean;
    instrumentCountCorrect: boolean;
    specimenLabeled: boolean;
    equipmentProblems: boolean;
    recoveryPlan: boolean;
    signOutNotes: string;
  };
}

export default function NewChecklistPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [selectedSurgery, setSelectedSurgery] = useState<Surgery | null>(null);
  const [activePhase, setActivePhase] = useState<'signIn' | 'timeOut' | 'signOut'>('signIn');
  const [searchTerm, setSearchTerm] = useState('');

  const [checklistData, setChecklistData] = useState<ChecklistData>({
    signIn: {
      patientConfirmed: false,
      siteMarked: false,
      anesthesiaChecked: false,
      pulseOximeterOn: false,
      allergyChecked: false,
      signInNotes: '',
    },
    timeOut: {
      teamIntroduced: false,
      procedureConfirmed: false,
      criticalStepsReviewed: false,
      equipmentConcerns: false,
      antibioticGiven: false,
      imagingDisplayed: false,
      timeOutNotes: '',
    },
    signOut: {
      procedureRecorded: false,
      instrumentCountCorrect: false,
      specimenLabeled: false,
      equipmentProblems: false,
      recoveryPlan: false,
      signOutNotes: '',
    },
  });

  useEffect(() => {
    fetchSurgeries();
  }, []);

  const fetchSurgeries = async () => {
    try {
      const response = await fetch('/api/surgeries');
      if (response.ok) {
        const data = await response.json();
        // Filter for scheduled or in-progress surgeries
        const activeSurgeries = data.filter(
          (s: Surgery) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS'
        );
        setSurgeries(activeSurgeries);
      }
    } catch (error) {
      console.error('Failed to fetch surgeries:', error);
    }
  };

  const filteredSurgeries = surgeries.filter(
    (s) =>
      s.patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.patient.folderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.procedureName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCheckboxChange = (phase: keyof ChecklistData, field: string, value: boolean) => {
    setChecklistData((prev) => ({
      ...prev,
      [phase]: {
        ...prev[phase],
        [field]: value,
      },
    }));
  };

  const handleNotesChange = (phase: keyof ChecklistData, field: string, value: string) => {
    setChecklistData((prev) => ({
      ...prev,
      [phase]: {
        ...prev[phase],
        [field]: value,
      },
    }));
  };

  const getPhaseProgress = (phase: keyof ChecklistData) => {
    const data = checklistData[phase];
    const checkboxFields = Object.entries(data).filter(([key]) => !key.includes('Notes'));
    const completed = checkboxFields.filter(([, value]) => value === true).length;
    return { completed, total: checkboxFields.length };
  };

  const handleSubmit = async () => {
    if (!selectedSurgery) {
      alert('Please select a surgery');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: selectedSurgery.id,
          ...checklistData,
        }),
      });

      if (response.ok) {
        alert('WHO Checklist saved successfully');
        router.push('/dashboard/checklists');
      } else {
        const error = await response.json();
        alert(`Failed to save checklist: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to save checklist:', error);
      alert('Failed to save checklist');
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = () => {
    if (!selectedSurgery) {
      alert('Please select a surgery first');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let yPos = 20;

    // Header
    doc.setFillColor(46, 187, 112);
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('WHO SURGICAL SAFETY CHECKLIST', pageWidth / 2, 15, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('University of Nigeria Teaching Hospital Ituku Ozalla', pageWidth / 2, 25, { align: 'center' });

    // Patient Information
    yPos = 45;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PATIENT INFORMATION', 14, yPos);
    
    yPos += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const patientInfo = [
      ['Patient Name:', selectedSurgery.patient.name],
      ['Folder Number:', selectedSurgery.patient.folderNumber],
      ['Age/Gender:', `${selectedSurgery.patient.age} years / ${selectedSurgery.patient.gender}`],
      ['Procedure:', selectedSurgery.procedureName],
      ['Surgeon:', selectedSurgery.surgeon?.fullName || 'Not assigned'],
      ['Unit:', selectedSurgery.unit],
      ['Date:', new Date(selectedSurgery.scheduledDate).toLocaleDateString('en-GB')],
      ['Completed By:', session?.user?.name || 'N/A'],
      ['Date Completed:', new Date().toLocaleDateString('en-GB')],
    ];

    patientInfo.forEach(([label, value]) => {
      doc.text(label, 14, yPos);
      doc.text(value, 80, yPos);
      yPos += 6;
    });

    // Sign In Phase
    yPos += 5;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(46, 147, 255);
    doc.rect(14, yPos - 5, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('SIGN IN (Before Induction of Anesthesia)', 18, yPos);
    
    yPos += 10;
    const signInProgress = getPhaseProgress('signIn');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const signInItems = [
      ['Patient has confirmed identity, site, procedure, and consent', checklistData.signIn.patientConfirmed],
      ['Site marked/not applicable', checklistData.signIn.siteMarked],
      ['Anesthesia safety check completed', checklistData.signIn.anesthesiaChecked],
      ['Pulse oximeter on patient and functioning', checklistData.signIn.pulseOximeterOn],
      ['Does patient have known allergy?', checklistData.signIn.allergyChecked],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Checklist Item', 'Status']],
      body: signInItems.map(([item, checked]) => [item, checked ? '✓ Yes' : '✗ No']),
      theme: 'striped',
      headStyles: { fillColor: [46, 147, 255] },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 5;
    if (checklistData.signIn.signInNotes) {
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 14, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      const splitNotes = doc.splitTextToSize(checklistData.signIn.signInNotes, pageWidth - 28);
      doc.text(splitNotes, 14, yPos);
      yPos += splitNotes.length * 5 + 5;
    }

    // Time Out Phase
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(255, 199, 0);
    doc.rect(14, yPos - 5, pageWidth - 28, 8, 'F');
    doc.setTextColor(0, 0, 0);
    doc.text('TIME OUT (Before Skin Incision)', 18, yPos);
    
    yPos += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const timeOutItems = [
      ['All team members have introduced themselves by name and role', checklistData.timeOut.teamIntroduced],
      ['Surgeon, anesthetist, and nurse verbally confirm patient, site, and procedure', checklistData.timeOut.procedureConfirmed],
      ['Anticipated critical events reviewed', checklistData.timeOut.criticalStepsReviewed],
      ['Has sterility been confirmed? Any equipment issues?', checklistData.timeOut.equipmentConcerns],
      ['Has antibiotic prophylaxis been given within last 60 minutes?', checklistData.timeOut.antibioticGiven],
      ['Is essential imaging displayed?', checklistData.timeOut.imagingDisplayed],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Checklist Item', 'Status']],
      body: timeOutItems.map(([item, checked]) => [item, checked ? '✓ Yes' : '✗ No']),
      theme: 'striped',
      headStyles: { fillColor: [255, 199, 0] },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 5;
    if (checklistData.timeOut.timeOutNotes) {
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 14, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      const splitNotes = doc.splitTextToSize(checklistData.timeOut.timeOutNotes, pageWidth - 28);
      doc.text(splitNotes, 14, yPos);
      yPos += splitNotes.length * 5 + 5;
    }

    // Sign Out Phase
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(46, 187, 112);
    doc.rect(14, yPos - 5, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('SIGN OUT (Before Patient Leaves Operating Room)', 18, yPos);
    
    yPos += 10;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const signOutItems = [
      ['Nurse verbally confirms with the team: procedure recorded', checklistData.signOut.procedureRecorded],
      ['Instrument, sponge, and needle counts are correct', checklistData.signOut.instrumentCountCorrect],
      ['Specimen is labeled (if applicable)', checklistData.signOut.specimenLabeled],
      ['Whether there are any equipment problems to be addressed', checklistData.signOut.equipmentProblems],
      ['Surgeon, anesthetist, and nurse review key concerns for recovery', checklistData.signOut.recoveryPlan],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Checklist Item', 'Status']],
      body: signOutItems.map(([item, checked]) => [item, checked ? '✓ Yes' : '✗ No']),
      theme: 'striped',
      headStyles: { fillColor: [46, 187, 112] },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 5;
    if (checklistData.signOut.signOutNotes) {
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 14, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      const splitNotes = doc.splitTextToSize(checklistData.signOut.signOutNotes, pageWidth - 28);
      doc.text(splitNotes, 14, yPos);
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `WHO Surgical Safety Checklist - Page ${i} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    // Save PDF
    const fileName = `WHO_Checklist_${selectedSurgery.patient.folderNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  };

  const signInProgress = getPhaseProgress('signIn');
  const timeOutProgress = getPhaseProgress('timeOut');
  const signOutProgress = getPhaseProgress('signOut');

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">WHO Surgical Safety Checklist</h1>
          <p className="text-gray-600 mt-1">Complete the three-phase surgical safety checklist</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportToPDF}
            disabled={!selectedSurgery}
            className="btn-secondary flex items-center gap-2"
          >
            <Download className="w-5 h-5" />
            Export PDF
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedSurgery}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Save Checklist
              </>
            )}
          </button>
        </div>
      </div>

      {/* Surgery Selection */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Select Surgery</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Search Surgery</label>
            <input
              type="text"
              placeholder="Search by patient name, folder number, or procedure..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            {filteredSurgeries.length === 0 ? (
              <div className="col-span-2 text-center py-8 text-gray-500">
                <ClipboardList className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No active surgeries found</p>
              </div>
            ) : (
              filteredSurgeries.map((surgery) => (
                <div
                  key={surgery.id}
                  onClick={() => setSelectedSurgery(surgery)}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    selectedSurgery?.id === surgery.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{surgery.patient.name}</h3>
                      <p className="text-sm text-gray-600">{surgery.patient.folderNumber}</p>
                      <p className="text-sm text-gray-700 mt-1">{surgery.procedureName}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                        <User className="w-3 h-3" />
                        <span>{surgery.surgeon?.fullName || 'Not assigned'}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(surgery.scheduledDate).toLocaleDateString('en-GB')}</span>
                      </div>
                    </div>
                    {selectedSurgery?.id === surgery.id && (
                      <CheckCircle className="w-6 h-6 text-primary-600" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedSurgery && (
        <>
          {/* Phase Navigation */}
          <div className="card">
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => setActivePhase('signIn')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  activePhase === 'signIn'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">Phase 1</div>
                  <div className="text-sm font-semibold text-gray-900 mt-1">SIGN IN</div>
                  <div className="text-xs text-gray-600 mt-1">Before Induction</div>
                  <div className="mt-2 text-sm text-gray-700">
                    {signInProgress.completed}/{signInProgress.total} completed
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${(signInProgress.completed / signInProgress.total) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setActivePhase('timeOut')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  activePhase === 'timeOut'
                    ? 'border-yellow-500 bg-yellow-50'
                    : 'border-gray-200 hover:border-yellow-300'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">Phase 2</div>
                  <div className="text-sm font-semibold text-gray-900 mt-1">TIME OUT</div>
                  <div className="text-xs text-gray-600 mt-1">Before Skin Incision</div>
                  <div className="mt-2 text-sm text-gray-700">
                    {timeOutProgress.completed}/{timeOutProgress.total} completed
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-yellow-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${(timeOutProgress.completed / timeOutProgress.total) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setActivePhase('signOut')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  activePhase === 'signOut'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">Phase 3</div>
                  <div className="text-sm font-semibold text-gray-900 mt-1">SIGN OUT</div>
                  <div className="text-xs text-gray-600 mt-1">Before Leaving OR</div>
                  <div className="mt-2 text-sm text-gray-700">
                    {signOutProgress.completed}/{signOutProgress.total} completed
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${(signOutProgress.completed / signOutProgress.total) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Sign In Phase */}
          {activePhase === 'signIn' && (
            <div className="card border-l-4 border-blue-500">
              <div className="bg-blue-50 -m-6 p-6 mb-6">
                <h2 className="text-2xl font-bold text-blue-900">SIGN IN</h2>
                <p className="text-blue-700 mt-1">Before Induction of Anesthesia</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.signIn.patientConfirmed}
                    onChange={(e) =>
                      handleCheckboxChange('signIn', 'patientConfirmed', e.target.checked)
                    }
                    className="w-5 h-5 text-blue-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Patient has confirmed identity, site, procedure, and consent
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Verbal confirmation from patient required
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.signIn.siteMarked}
                    onChange={(e) => handleCheckboxChange('signIn', 'siteMarked', e.target.checked)}
                    className="w-5 h-5 text-blue-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">Site marked / Not applicable</label>
                    <p className="text-sm text-gray-600 mt-1">
                      Surgical site marked by operating surgeon
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.signIn.anesthesiaChecked}
                    onChange={(e) =>
                      handleCheckboxChange('signIn', 'anesthesiaChecked', e.target.checked)
                    }
                    className="w-5 h-5 text-blue-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Anesthesia safety check completed
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Equipment, medications, and patient assessment verified
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.signIn.pulseOximeterOn}
                    onChange={(e) =>
                      handleCheckboxChange('signIn', 'pulseOximeterOn', e.target.checked)
                    }
                    className="w-5 h-5 text-blue-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Pulse oximeter on patient and functioning
                    </label>
                    <p className="text-sm text-gray-600 mt-1">Monitoring equipment operational</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.signIn.allergyChecked}
                    onChange={(e) =>
                      handleCheckboxChange('signIn', 'allergyChecked', e.target.checked)
                    }
                    className="w-5 h-5 text-blue-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Does patient have known allergy?
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Allergies confirmed and documented
                    </p>
                  </div>
                </div>

                <div>
                  <SmartTextInput
                    label="Additional Notes"
                    value={checklistData.signIn.signInNotes}
                    onChange={(value) => handleNotesChange('signIn', 'signInNotes', value)}
                    placeholder="Any additional observations or concerns... (use voice or camera)"
                    rows={3}
                    enableSpeech={true}
                    enableOCR={true}
                    medicalMode={true}
                    helpText="Dictate your observations or photograph notes"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Time Out Phase */}
          {activePhase === 'timeOut' && (
            <div className="card border-l-4 border-yellow-500">
              <div className="bg-yellow-50 -m-6 p-6 mb-6">
                <h2 className="text-2xl font-bold text-yellow-900">TIME OUT</h2>
                <p className="text-yellow-700 mt-1">Before Skin Incision</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.timeOut.teamIntroduced}
                    onChange={(e) =>
                      handleCheckboxChange('timeOut', 'teamIntroduced', e.target.checked)
                    }
                    className="w-5 h-5 text-yellow-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      All team members have introduced themselves by name and role
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Surgeon, anesthetist, nurses, and support staff
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.timeOut.procedureConfirmed}
                    onChange={(e) =>
                      handleCheckboxChange('timeOut', 'procedureConfirmed', e.target.checked)
                    }
                    className="w-5 h-5 text-yellow-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Surgeon, anesthetist, and nurse verbally confirm patient, site, and procedure
                    </label>
                    <p className="text-sm text-gray-600 mt-1">Team verbal confirmation required</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.timeOut.criticalStepsReviewed}
                    onChange={(e) =>
                      handleCheckboxChange('timeOut', 'criticalStepsReviewed', e.target.checked)
                    }
                    className="w-5 h-5 text-yellow-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Anticipated critical events reviewed
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Surgeon, anesthetist, and nursing concerns discussed
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.timeOut.equipmentConcerns}
                    onChange={(e) =>
                      handleCheckboxChange('timeOut', 'equipmentConcerns', e.target.checked)
                    }
                    className="w-5 h-5 text-yellow-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Has sterility been confirmed? Any equipment issues?
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Sterilization indicators checked, equipment functional
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.timeOut.antibioticGiven}
                    onChange={(e) =>
                      handleCheckboxChange('timeOut', 'antibioticGiven', e.target.checked)
                    }
                    className="w-5 h-5 text-yellow-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Has antibiotic prophylaxis been given within last 60 minutes?
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Timing and type of prophylactic antibiotics confirmed
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.timeOut.imagingDisplayed}
                    onChange={(e) =>
                      handleCheckboxChange('timeOut', 'imagingDisplayed', e.target.checked)
                    }
                    className="w-5 h-5 text-yellow-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Is essential imaging displayed?
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      X-rays, CT scans, MRI available as needed
                    </p>
                  </div>
                </div>

                <div>
                  <SmartTextInput
                    label="Additional Notes"
                    value={checklistData.timeOut.timeOutNotes}
                    onChange={(value) => handleNotesChange('timeOut', 'timeOutNotes', value)}
                    placeholder="Any additional observations or concerns... (use voice or camera)"
                    rows={3}
                    enableSpeech={true}
                    enableOCR={true}
                    medicalMode={true}
                    helpText="Dictate your observations or photograph notes"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Sign Out Phase */}
          {activePhase === 'signOut' && (
            <div className="card border-l-4 border-green-500">
              <div className="bg-green-50 -m-6 p-6 mb-6">
                <h2 className="text-2xl font-bold text-green-900">SIGN OUT</h2>
                <p className="text-green-700 mt-1">Before Patient Leaves Operating Room</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.signOut.procedureRecorded}
                    onChange={(e) =>
                      handleCheckboxChange('signOut', 'procedureRecorded', e.target.checked)
                    }
                    className="w-5 h-5 text-green-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Nurse verbally confirms with the team: procedure recorded
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Name of procedure as performed documented
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.signOut.instrumentCountCorrect}
                    onChange={(e) =>
                      handleCheckboxChange('signOut', 'instrumentCountCorrect', e.target.checked)
                    }
                    className="w-5 h-5 text-green-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Instrument, sponge, and needle counts are correct
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Final count matches initial count
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.signOut.specimenLabeled}
                    onChange={(e) =>
                      handleCheckboxChange('signOut', 'specimenLabeled', e.target.checked)
                    }
                    className="w-5 h-5 text-green-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Specimen is labeled (if applicable)
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Patient name and specimen type on label
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.signOut.equipmentProblems}
                    onChange={(e) =>
                      handleCheckboxChange('signOut', 'equipmentProblems', e.target.checked)
                    }
                    className="w-5 h-5 text-green-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Whether there are any equipment problems to be addressed
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Any equipment failures or concerns noted
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={checklistData.signOut.recoveryPlan}
                    onChange={(e) =>
                      handleCheckboxChange('signOut', 'recoveryPlan', e.target.checked)
                    }
                    className="w-5 h-5 text-green-600 mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-medium text-gray-900">
                      Surgeon, anesthetist, and nurse review key concerns for recovery
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Post-operative management plan discussed
                    </p>
                  </div>
                </div>

                <div>
                  <SmartTextInput
                    label="Additional Notes"
                    value={checklistData.signOut.signOutNotes}
                    onChange={(value) => handleNotesChange('signOut', 'signOutNotes', value)}
                    placeholder="Any additional observations or concerns... (use voice or camera)"
                    rows={3}
                    enableSpeech={true}
                    enableOCR={true}
                    medicalMode={true}
                    helpText="Dictate post-operative notes"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Overall Progress */}
          <div className="card bg-gradient-to-br from-primary-50 to-primary-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Overall Progress</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-3xl font-bold text-blue-600">
                  {Math.round((signInProgress.completed / signInProgress.total) * 100)}%
                </div>
                <div className="text-sm text-gray-600 mt-1">Sign In</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-yellow-600">
                  {Math.round((timeOutProgress.completed / timeOutProgress.total) * 100)}%
                </div>
                <div className="text-sm text-gray-600 mt-1">Time Out</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-green-600">
                  {Math.round((signOutProgress.completed / signOutProgress.total) * 100)}%
                </div>
                <div className="text-sm text-gray-600 mt-1">Sign Out</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
