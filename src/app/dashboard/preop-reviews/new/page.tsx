'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, Syringe, Activity, Mic, Camera, Plus, Trash2, Pill } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const SmartTextInput = dynamic(() => import('@/components/SmartTextInput'), { ssr: false });

// Comprehensive Anesthetic Medications Database
const ANESTHETIC_MEDICATIONS = {
  'Induction Agents': [
    { name: 'Propofol', unit: 'mg', commonDoses: ['50', '100', '150', '200'] },
    { name: 'Thiopentone', unit: 'mg', commonDoses: ['250', '375', '500'] },
    { name: 'Etomidate', unit: 'mg', commonDoses: ['10', '20', '30'] },
    { name: 'Ketamine', unit: 'mg', commonDoses: ['25', '50', '75', '100', '150'] },
    { name: 'Midazolam', unit: 'mg', commonDoses: ['1', '2', '3', '5'] },
  ],
  'Inhalational Agents': [
    { name: 'Sevoflurane', unit: '%', commonDoses: ['1', '2', '3', '4'] },
    { name: 'Isoflurane', unit: '%', commonDoses: ['0.5', '1', '1.5', '2'] },
    { name: 'Desflurane', unit: '%', commonDoses: ['3', '6', '9', '12'] },
    { name: 'Nitrous Oxide', unit: '%', commonDoses: ['50', '60', '70'] },
    { name: 'Halothane', unit: '%', commonDoses: ['0.5', '1', '1.5', '2'] },
  ],
  'Opioid Analgesics': [
    { name: 'Fentanyl', unit: 'mcg', commonDoses: ['25', '50', '100', '150', '200'] },
    { name: 'Morphine', unit: 'mg', commonDoses: ['2', '5', '10', '15'] },
    { name: 'Pethidine (Meperidine)', unit: 'mg', commonDoses: ['25', '50', '75', '100'] },
    { name: 'Tramadol', unit: 'mg', commonDoses: ['50', '100'] },
    { name: 'Remifentanil', unit: 'mcg/kg/min', commonDoses: ['0.1', '0.2', '0.5'] },
    { name: 'Sufentanil', unit: 'mcg', commonDoses: ['5', '10', '25', '50'] },
    { name: 'Alfentanil', unit: 'mcg', commonDoses: ['250', '500', '1000'] },
    { name: 'Pentazocine', unit: 'mg', commonDoses: ['15', '30', '45'] },
  ],
  'Muscle Relaxants - Depolarizing': [
    { name: 'Succinylcholine (Suxamethonium)', unit: 'mg', commonDoses: ['50', '100', '150'] },
  ],
  'Muscle Relaxants - Non-Depolarizing': [
    { name: 'Rocuronium', unit: 'mg', commonDoses: ['20', '30', '50', '100'] },
    { name: 'Vecuronium', unit: 'mg', commonDoses: ['4', '6', '8', '10'] },
    { name: 'Atracurium', unit: 'mg', commonDoses: ['25', '30', '50'] },
    { name: 'Cisatracurium', unit: 'mg', commonDoses: ['10', '15', '20'] },
    { name: 'Pancuronium', unit: 'mg', commonDoses: ['4', '6', '8'] },
  ],
  'Reversal Agents': [
    { name: 'Neostigmine', unit: 'mg', commonDoses: ['1.5', '2.5', '5'] },
    { name: 'Sugammadex', unit: 'mg', commonDoses: ['100', '200', '400'] },
    { name: 'Atropine', unit: 'mg', commonDoses: ['0.3', '0.6', '1.2'] },
    { name: 'Glycopyrrolate', unit: 'mg', commonDoses: ['0.2', '0.4', '0.6'] },
    { name: 'Flumazenil', unit: 'mg', commonDoses: ['0.1', '0.2', '0.5'] },
    { name: 'Naloxone', unit: 'mg', commonDoses: ['0.1', '0.2', '0.4'] },
  ],
  'Local Anesthetics': [
    { name: 'Lidocaine (Lignocaine)', unit: 'mg', commonDoses: ['40', '80', '100', '200', '400'] },
    { name: 'Bupivacaine', unit: 'mg', commonDoses: ['10', '15', '25', '50', '75'] },
    { name: 'Ropivacaine', unit: 'mg', commonDoses: ['50', '75', '100', '150'] },
    { name: 'Levobupivacaine', unit: 'mg', commonDoses: ['25', '50', '75'] },
    { name: 'Prilocaine', unit: 'mg', commonDoses: ['100', '200', '400'] },
    { name: 'Chloroprocaine', unit: 'mg', commonDoses: ['300', '400', '600'] },
  ],
  'Spinal/Epidural Adjuvants': [
    { name: 'Heavy Bupivacaine 0.5%', unit: 'ml', commonDoses: ['2', '2.5', '3', '3.5'] },
    { name: 'Fentanyl (intrathecal)', unit: 'mcg', commonDoses: ['10', '15', '25'] },
    { name: 'Morphine (intrathecal)', unit: 'mcg', commonDoses: ['100', '150', '200', '250'] },
    { name: 'Clonidine (intrathecal)', unit: 'mcg', commonDoses: ['15', '30', '50'] },
    { name: 'Dexmedetomidine (intrathecal)', unit: 'mcg', commonDoses: ['3', '5', '10'] },
  ],
  'Antiemetics': [
    { name: 'Ondansetron', unit: 'mg', commonDoses: ['4', '8'] },
    { name: 'Metoclopramide', unit: 'mg', commonDoses: ['10'] },
    { name: 'Dexamethasone', unit: 'mg', commonDoses: ['4', '8'] },
    { name: 'Granisetron', unit: 'mg', commonDoses: ['1'] },
    { name: 'Droperidol', unit: 'mg', commonDoses: ['0.625', '1.25', '2.5'] },
    { name: 'Promethazine', unit: 'mg', commonDoses: ['12.5', '25'] },
    { name: 'Cyclizine', unit: 'mg', commonDoses: ['50'] },
  ],
  'Cardiovascular Drugs': [
    { name: 'Ephedrine', unit: 'mg', commonDoses: ['3', '6', '9', '12'] },
    { name: 'Phenylephrine', unit: 'mcg', commonDoses: ['50', '100', '200'] },
    { name: 'Adrenaline (Epinephrine)', unit: 'mcg', commonDoses: ['10', '50', '100', '1000'] },
    { name: 'Noradrenaline (Norepinephrine)', unit: 'mcg', commonDoses: ['4', '8', '16'] },
    { name: 'Dobutamine', unit: 'mcg/kg/min', commonDoses: ['2.5', '5', '10'] },
    { name: 'Dopamine', unit: 'mcg/kg/min', commonDoses: ['2', '5', '10', '15'] },
    { name: 'Esmolol', unit: 'mg', commonDoses: ['10', '20', '50'] },
    { name: 'Labetalol', unit: 'mg', commonDoses: ['5', '10', '20'] },
    { name: 'Metoprolol', unit: 'mg', commonDoses: ['1', '2.5', '5'] },
    { name: 'Hydralazine', unit: 'mg', commonDoses: ['5', '10', '20'] },
    { name: 'Nitroglycerin', unit: 'mcg/min', commonDoses: ['10', '25', '50', '100'] },
    { name: 'Sodium Nitroprusside', unit: 'mcg/kg/min', commonDoses: ['0.5', '1', '2'] },
    { name: 'Calcium Chloride', unit: 'mg', commonDoses: ['500', '1000'] },
    { name: 'Calcium Gluconate', unit: 'mg', commonDoses: ['500', '1000', '2000'] },
    { name: 'Magnesium Sulphate', unit: 'g', commonDoses: ['1', '2', '4'] },
    { name: 'Amiodarone', unit: 'mg', commonDoses: ['150', '300'] },
    { name: 'Lidocaine (antiarrhythmic)', unit: 'mg', commonDoses: ['50', '100'] },
    { name: 'Adenosine', unit: 'mg', commonDoses: ['6', '12'] },
  ],
  'Sedatives & Anxiolytics': [
    { name: 'Midazolam', unit: 'mg', commonDoses: ['1', '2', '3', '5'] },
    { name: 'Diazepam', unit: 'mg', commonDoses: ['2.5', '5', '10'] },
    { name: 'Lorazepam', unit: 'mg', commonDoses: ['0.5', '1', '2'] },
    { name: 'Dexmedetomidine', unit: 'mcg', commonDoses: ['25', '50', '100'] },
    { name: 'Clonidine', unit: 'mcg', commonDoses: ['75', '150'] },
  ],
  'Analgesics & Anti-inflammatory': [
    { name: 'Paracetamol (IV)', unit: 'mg', commonDoses: ['500', '1000'] },
    { name: 'Ketorolac', unit: 'mg', commonDoses: ['15', '30'] },
    { name: 'Diclofenac', unit: 'mg', commonDoses: ['50', '75'] },
    { name: 'Parecoxib', unit: 'mg', commonDoses: ['40'] },
    { name: 'Ibuprofen', unit: 'mg', commonDoses: ['200', '400', '600'] },
  ],
  'Corticosteroids': [
    { name: 'Dexamethasone', unit: 'mg', commonDoses: ['4', '8', '12'] },
    { name: 'Hydrocortisone', unit: 'mg', commonDoses: ['50', '100', '200'] },
    { name: 'Methylprednisolone', unit: 'mg', commonDoses: ['40', '125', '500'] },
  ],
  'Antihistamines': [
    { name: 'Diphenhydramine', unit: 'mg', commonDoses: ['25', '50'] },
    { name: 'Chlorpheniramine', unit: 'mg', commonDoses: ['10', '20'] },
    { name: 'Ranitidine', unit: 'mg', commonDoses: ['50'] },
    { name: 'Famotidine', unit: 'mg', commonDoses: ['20'] },
  ],
  'Bronchodilators': [
    { name: 'Salbutamol (nebulized)', unit: 'mg', commonDoses: ['2.5', '5'] },
    { name: 'Ipratropium (nebulized)', unit: 'mcg', commonDoses: ['250', '500'] },
    { name: 'Aminophylline', unit: 'mg', commonDoses: ['250', '500'] },
  ],
  'Antibiotics (Prophylactic)': [
    { name: 'Cefazolin', unit: 'g', commonDoses: ['1', '2'] },
    { name: 'Ceftriaxone', unit: 'g', commonDoses: ['1', '2'] },
    { name: 'Metronidazole', unit: 'mg', commonDoses: ['500'] },
    { name: 'Gentamicin', unit: 'mg', commonDoses: ['80', '160', '240'] },
    { name: 'Vancomycin', unit: 'mg', commonDoses: ['500', '1000'] },
    { name: 'Ampicillin/Sulbactam', unit: 'g', commonDoses: ['1.5', '3'] },
    { name: 'Ciprofloxacin', unit: 'mg', commonDoses: ['200', '400'] },
  ],
  'Anticoagulants': [
    { name: 'Heparin', unit: 'units', commonDoses: ['2500', '5000', '10000'] },
    { name: 'Enoxaparin', unit: 'mg', commonDoses: ['20', '40', '60', '80'] },
    { name: 'Protamine', unit: 'mg', commonDoses: ['10', '25', '50'] },
    { name: 'Tranexamic Acid', unit: 'mg', commonDoses: ['500', '1000'] },
  ],
  'IV Fluids': [
    { name: 'Normal Saline 0.9%', unit: 'ml', commonDoses: ['500', '1000'] },
    { name: 'Ringers Lactate', unit: 'ml', commonDoses: ['500', '1000'] },
    { name: 'Dextrose 5%', unit: 'ml', commonDoses: ['500', '1000'] },
    { name: 'Dextrose 10%', unit: 'ml', commonDoses: ['500'] },
    { name: 'Dextrose 50%', unit: 'ml', commonDoses: ['50'] },
    { name: 'Colloid (Gelofusine)', unit: 'ml', commonDoses: ['500', '1000'] },
    { name: 'Albumin 5%', unit: 'ml', commonDoses: ['250', '500'] },
    { name: 'Mannitol 20%', unit: 'ml', commonDoses: ['100', '250', '500'] },
    { name: 'Sodium Bicarbonate 8.4%', unit: 'ml', commonDoses: ['50', '100'] },
  ],
  'Emergency Drugs': [
    { name: 'Adrenaline 1:1000', unit: 'ml', commonDoses: ['0.5', '1'] },
    { name: 'Adrenaline 1:10000', unit: 'ml', commonDoses: ['1', '5', '10'] },
    { name: 'Atropine', unit: 'mg', commonDoses: ['0.5', '1'] },
    { name: 'Dantrolene', unit: 'mg', commonDoses: ['20', '40'] },
    { name: 'Lipid Emulsion 20%', unit: 'ml', commonDoses: ['100', '250', '500'] },
    { name: 'Sodium Bicarbonate 8.4%', unit: 'mEq', commonDoses: ['50', '100'] },
    { name: 'Aminophylline', unit: 'mg', commonDoses: ['250', '500'] },
  ],
  'Miscellaneous': [
    { name: 'Oxytocin', unit: 'units', commonDoses: ['5', '10', '20'] },
    { name: 'Carboprost (Hemabate)', unit: 'mcg', commonDoses: ['250'] },
    { name: 'Misoprostol', unit: 'mcg', commonDoses: ['400', '600', '800'] },
    { name: 'Insulin Regular', unit: 'units', commonDoses: ['5', '10', '20'] },
    { name: 'Furosemide', unit: 'mg', commonDoses: ['20', '40', '80'] },
    { name: 'Phenytoin', unit: 'mg', commonDoses: ['100', '250', '500'] },
    { name: 'Levetiracetam', unit: 'mg', commonDoses: ['500', '1000'] },
  ],
};

const ROUTES = [
  'IV Push',
  'IV Infusion',
  'IM',
  'SC',
  'Intrathecal',
  'Epidural',
  'Nebulized',
  'Topical',
  'Inhalation',
  'Per Rectum',
  'Sublingual',
];

const TIMING = [
  'Pre-induction',
  'At induction',
  'Intraoperative',
  'As needed (PRN)',
  'Post-operative',
  'Before incision',
  'After intubation',
  'Before extubation',
  'Continuous infusion',
  'Loading dose',
  'Maintenance',
];

interface PrescribedMedication {
  id: string;
  category: string;
  name: string;
  dose: string;
  unit: string;
  route: string;
  timing: string;
  notes?: string;
}

interface Surgery {
  id: string;
  procedureName: string;
  scheduledDate: string;
  patient: {
    id: string;
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
  };
  surgeon: {
    fullName: string;
  };
}

export default function NewPreOpReviewPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [selectedSurgeryId, setSelectedSurgeryId] = useState('');
  const [selectedSurgery, setSelectedSurgery] = useState<Surgery | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Smart text input states for dictation/OCR fields
  const [currentMedications, setCurrentMedications] = useState('');
  const [comorbidities, setComorbidities] = useState('');
  const [previousAnesthesia, setPreviousAnesthesia] = useState('');
  const [otherLabResults, setOtherLabResults] = useState('');
  const [anestheticPlan, setAnestheticPlan] = useState('');
  const [specialConsiderations, setSpecialConsiderations] = useState('');
  const [riskFactors, setRiskFactors] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [recommendations, setRecommendations] = useState('');

  // Physical examination states for BMI auto-calculation
  const [weight, setWeight] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');
  const [bmi, setBmi] = useState<number | ''>('');

  // Anesthetic Prescription states
  const [prescribedMedications, setPrescribedMedications] = useState<PrescribedMedication[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMedication, setSelectedMedication] = useState('');
  const [selectedDose, setSelectedDose] = useState('');
  const [customDose, setCustomDose] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedTiming, setSelectedTiming] = useState('');
  const [medicationNotes, setMedicationNotes] = useState('');
  const [prescriptionUrgency, setPrescriptionUrgency] = useState<'ROUTINE' | 'URGENT' | 'EMERGENCY'>('ROUTINE');
  const [prescriptionSpecialInstructions, setPrescriptionSpecialInstructions] = useState('');

  // Get medication details from selected category and name
  const getMedicationDetails = () => {
    if (!selectedCategory || !selectedMedication) return null;
    const category = ANESTHETIC_MEDICATIONS[selectedCategory as keyof typeof ANESTHETIC_MEDICATIONS];
    return category?.find(med => med.name === selectedMedication);
  };

  // Add medication to prescription list
  const addMedication = () => {
    const medDetails = getMedicationDetails();
    if (!selectedMedication || !selectedRoute || !selectedTiming) {
      return;
    }
    
    const finalDose = customDose || selectedDose;
    if (!finalDose) return;

    const newMedication: PrescribedMedication = {
      id: Date.now().toString(),
      category: selectedCategory,
      name: selectedMedication,
      dose: finalDose,
      unit: medDetails?.unit || '',
      route: selectedRoute,
      timing: selectedTiming,
      notes: medicationNotes,
    };

    setPrescribedMedications([...prescribedMedications, newMedication]);
    
    // Reset selection
    setSelectedMedication('');
    setSelectedDose('');
    setCustomDose('');
    setSelectedRoute('');
    setSelectedTiming('');
    setMedicationNotes('');
  };

  // Remove medication from list
  const removeMedication = (id: string) => {
    setPrescribedMedications(prescribedMedications.filter(med => med.id !== id));
  };

  // Auto-calculate BMI when weight or height changes
  useEffect(() => {
    if (weight && height && height > 0) {
      const heightInMeters = Number(height) / 100;
      const calculatedBmi = Number(weight) / (heightInMeters * heightInMeters);
      setBmi(Math.round(calculatedBmi * 10) / 10); // Round to 1 decimal place
    } else {
      setBmi('');
    }
  }, [weight, height]);

  useEffect(() => {
    fetchScheduledSurgeries();
  }, []);

  useEffect(() => {
    if (selectedSurgeryId) {
      const surgery = surgeries.find(s => s.id === selectedSurgeryId);
      setSelectedSurgery(surgery || null);
    } else {
      setSelectedSurgery(null);
    }
  }, [selectedSurgeryId, surgeries]);

  const fetchScheduledSurgeries = async () => {
    try {
      const response = await fetch('/api/surgeries?status=SCHEDULED');
      if (response.ok) {
        const data = await response.json();
        setSurgeries(data);
      }
    } catch (error) {
      console.error('Error fetching surgeries:', error);
      setError('Failed to load scheduled surgeries');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!selectedSurgeryId || !selectedSurgery) {
      setError('Please select a surgery');
      return;
    }

    setSubmitting(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    
    const payload = {
      surgeryId: selectedSurgeryId,
      patientId: selectedSurgery.patient.id,
      patientName: selectedSurgery.patient.name,
      folderNumber: selectedSurgery.patient.folderNumber,
      scheduledSurgeryDate: selectedSurgery.scheduledDate,
      currentMedications: formData.get('currentMedications'),
      allergies: formData.get('allergies'),
      comorbidities: formData.get('comorbidities'),
      previousAnesthesia: formData.get('previousAnesthesia'),
      lastOralIntake: formData.get('lastOralIntake'),
      fastingStatus: formData.get('fastingStatus'),
      weight: formData.get('weight') ? parseFloat(formData.get('weight') as string) : undefined,
      height: formData.get('height') ? parseFloat(formData.get('height') as string) : undefined,
      bmi: formData.get('bmi') ? parseFloat(formData.get('bmi') as string) : undefined,
      bloodPressure: formData.get('bloodPressure'),
      heartRate: formData.get('heartRate') ? parseInt(formData.get('heartRate') as string) : undefined,
      respiratoryRate: formData.get('respiratoryRate') ? parseInt(formData.get('respiratoryRate') as string) : undefined,
      temperature: formData.get('temperature') ? parseFloat(formData.get('temperature') as string) : undefined,
      airwayClass: formData.get('airwayClass'),
      neckMovement: formData.get('neckMovement'),
      dentition: formData.get('dentition'),
      hemoglobin: formData.get('hemoglobin') ? parseFloat(formData.get('hemoglobin') as string) : undefined,
      plateletCount: formData.get('plateletCount') ? parseFloat(formData.get('plateletCount') as string) : undefined,
      ptInr: formData.get('ptInr') ? parseFloat(formData.get('ptInr') as string) : undefined,
      creatinine: formData.get('creatinine') ? parseFloat(formData.get('creatinine') as string) : undefined,
      sodium: formData.get('sodium') ? parseFloat(formData.get('sodium') as string) : undefined,
      potassium: formData.get('potassium') ? parseFloat(formData.get('potassium') as string) : undefined,
      bloodGlucose: formData.get('bloodGlucose') ? parseFloat(formData.get('bloodGlucose') as string) : undefined,
      otherLabResults: formData.get('otherLabResults'),
      asaClass: formData.get('asaClass'),
      proposedAnesthesiaType: formData.get('proposedAnesthesiaType'),
      anestheticPlan: formData.get('anestheticPlan'),
      specialConsiderations: formData.get('specialConsiderations'),
      riskLevel: formData.get('riskLevel'),
      riskFactors: formData.get('riskFactors'),
      reviewNotes: formData.get('reviewNotes'),
      recommendations: formData.get('recommendations'),
      // Anesthetic Prescription data
      prescription: prescribedMedications.length > 0 ? {
        medications: prescribedMedications,
        urgency: prescriptionUrgency,
        specialInstructions: prescriptionSpecialInstructions,
        allergyAlerts: formData.get('allergies'),
      } : undefined,
    };

    try {
      const response = await fetch('/api/preop-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push('/dashboard/preop-reviews');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create pre-operative review');
      }
    } catch (error) {
      console.error('Error creating review:', error);
      setError('Failed to create pre-operative review');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/dashboard/preop-reviews"
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Pre-Operative Review</h1>
          <p className="text-gray-600 mt-2">
            Conduct pre-operative anesthetic assessment for scheduled surgery
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Surgery Selection */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-semibold">Select Surgery</h2>
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Scheduled Surgery *
            </label>
            <select
              value={selectedSurgeryId}
              onChange={(e) => setSelectedSurgeryId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            >
              <option value="">-- Select a surgery --</option>
              {surgeries.map((surgery) => (
                <option key={surgery.id} value={surgery.id}>
                  {surgery.patient.name} ({surgery.patient.folderNumber}) - {surgery.procedureName} -{' '}
                  {new Date(surgery.scheduledDate).toLocaleDateString()}
                </option>
              ))}
            </select>
            {surgeries.length === 0 && (
              <p className="mt-2 text-sm text-gray-500">
                No scheduled surgeries available. Please schedule a surgery first.
              </p>
            )}
          </div>

          {selectedSurgery && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Patient:</span> {selectedSurgery.patient.name}
                </div>
                <div>
                  <span className="font-medium">Folder:</span> {selectedSurgery.patient.folderNumber}
                </div>
                <div>
                  <span className="font-medium">Age/Gender:</span> {selectedSurgery.patient.age}y, {selectedSurgery.patient.gender}
                </div>
                <div>
                  <span className="font-medium">Surgeon:</span> {selectedSurgery.surgeon?.fullName || 'Not assigned'}
                </div>
                <div className="col-span-2">
                  <span className="font-medium">Procedure:</span> {selectedSurgery.procedureName}
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedSurgeryId && (
          <>
            {/* Medical History */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Medical History</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Mic className="w-4 h-4" />
                  <span>Voice & OCR enabled</span>
                  <Camera className="w-4 h-4" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <SmartTextInput
                  label="Current Medications"
                  value={currentMedications}
                  onChange={setCurrentMedications}
                  placeholder="List all current medications with dosages (use voice or camera)"
                  rows={3}
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                  helpText="Say medication names and dosages, or photograph prescription"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Allergies
                  </label>
                  <input
                    type="text"
                    name="allergies"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="Drug allergies, food allergies, etc."
                  />
                </div>
                <SmartTextInput
                  label="Comorbidities"
                  value={comorbidities}
                  onChange={setComorbidities}
                  placeholder="Diabetes, Hypertension, Cardiac disease, etc."
                  rows={3}
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                  helpText="Dictate or scan patient's medical history"
                />
                <SmartTextInput
                  label="Previous Anesthesia History"
                  value={previousAnesthesia}
                  onChange={setPreviousAnesthesia}
                  placeholder="Any complications or issues with previous anesthesia"
                  rows={2}
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                />
              </div>
            </div>

            {/* Fasting Status */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Fasting Status</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Oral Intake
                  </label>
                  <input
                    type="datetime-local"
                    name="lastOralIntake"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fasting Status
                  </label>
                  <select
                    name="fastingStatus"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select status</option>
                    <option value="ADEQUATE">Adequate (6+ hours)</option>
                    <option value="BORDERLINE">Borderline (4-6 hours)</option>
                    <option value="INADEQUATE">Inadequate (&lt;4 hours)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Physical Examination */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Physical Examination</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="weight"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value ? parseFloat(e.target.value) : '')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Height (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="height"
                    value={height}
                    onChange={(e) => setHeight(e.target.value ? parseFloat(e.target.value) : '')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    BMI <span className="text-xs text-green-600 font-normal">(auto-calculated)</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="bmi"
                    value={bmi}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Blood Pressure
                  </label>
                  <input
                    type="text"
                    name="bloodPressure"
                    placeholder="e.g., 120/80"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Heart Rate (bpm)
                  </label>
                  <input
                    type="number"
                    name="heartRate"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Respiratory Rate
                  </label>
                  <input
                    type="number"
                    name="respiratoryRate"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temperature (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="temperature"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Airway Assessment */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Airway Assessment</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Airway Class (Mallampati)
                  </label>
                  <select
                    name="airwayClass"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select class</option>
                    <option value="CLASS_I">Class I</option>
                    <option value="CLASS_II">Class II</option>
                    <option value="CLASS_III">Class III</option>
                    <option value="CLASS_IV">Class IV</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Neck Movement
                  </label>
                  <select
                    name="neckMovement"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select status</option>
                    <option value="NORMAL">Normal</option>
                    <option value="LIMITED">Limited</option>
                    <option value="SEVERELY_LIMITED">Severely Limited</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dentition
                  </label>
                  <input
                    type="text"
                    name="dentition"
                    placeholder="e.g., Good, Missing teeth, Dentures"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Laboratory Results */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Laboratory Results</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hemoglobin (g/dL)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="hemoglobin"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Platelet Count (×10⁹/L)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="plateletCount"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PT/INR
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="ptInr"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Creatinine (mg/dL)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="creatinine"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sodium (mmol/L)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="sodium"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Potassium (mmol/L)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="potassium"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Blood Glucose (mg/dL)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="bloodGlucose"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="mt-4">
                <SmartTextInput
                  label="Other Lab Results"
                  value={otherLabResults}
                  onChange={setOtherLabResults}
                  placeholder="Additional laboratory findings"
                  rows={2}
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                  helpText="Dictate lab values or photograph lab results"
                />
              </div>
            </div>

            {/* Anesthetic Plan */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center gap-3 mb-4">
                <Syringe className="w-6 h-6 text-indigo-600" />
                <h2 className="text-xl font-semibold">Anesthetic Plan</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ASA Classification
                  </label>
                  <select
                    name="asaClass"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select ASA class</option>
                    <option value="ASA_I">ASA I - Normal healthy patient</option>
                    <option value="ASA_II">ASA II - Mild systemic disease</option>
                    <option value="ASA_III">ASA III - Severe systemic disease</option>
                    <option value="ASA_IV">ASA IV - Severe disease, constant threat to life</option>
                    <option value="ASA_V">ASA V - Moribund patient</option>
                    <option value="ASA_VI">ASA VI - Brain-dead organ donor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Proposed Anesthesia Type
                  </label>
                  <select
                    name="proposedAnesthesiaType"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select type</option>
                    <option value="GENERAL">General Anesthesia</option>
                    <option value="SPINAL">Spinal Anesthesia</option>
                    <option value="LOCAL">Local Anesthesia</option>
                    <option value="REGIONAL">Regional Anesthesia</option>
                    <option value="SEDATION">Sedation</option>
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <SmartTextInput
                  label="Anesthetic Plan Details"
                  value={anestheticPlan}
                  onChange={setAnestheticPlan}
                  placeholder="Detailed anesthetic plan, drug choices, monitoring requirements, etc."
                  rows={4}
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                  helpText="Dictate your anesthetic plan with drug choices and monitoring"
                />
              </div>
              <div className="mt-4">
                <SmartTextInput
                  label="Special Considerations"
                  value={specialConsiderations}
                  onChange={setSpecialConsiderations}
                  placeholder="Difficult airway, risk of aspiration, special positioning, etc."
                  rows={3}
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                />
              </div>
            </div>

            {/* Anesthetic Prescription Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center gap-3 mb-4">
                <Pill className="w-6 h-6 text-purple-600" />
                <div>
                  <h2 className="text-xl font-semibold">Anesthetic Prescription</h2>
                  <p className="text-sm text-gray-500">Add medications for pharmacy to prepare</p>
                </div>
              </div>

              {/* Urgency Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Urgency Level</label>
                <div className="flex gap-3">
                  {(['ROUTINE', 'URGENT', 'EMERGENCY'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setPrescriptionUrgency(level)}
                      className={`px-4 py-2 rounded-lg border-2 font-medium transition ${
                        prescriptionUrgency === level
                          ? level === 'EMERGENCY'
                            ? 'border-red-500 bg-red-50 text-red-700'
                            : level === 'URGENT'
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Medication Selection */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h3 className="font-medium mb-3">Add Medication</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Category Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => {
                        setSelectedCategory(e.target.value);
                        setSelectedMedication('');
                        setSelectedDose('');
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select category</option>
                      {Object.keys(ANESTHETIC_MEDICATIONS).map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* Medication Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Medication</label>
                    <select
                      value={selectedMedication}
                      onChange={(e) => {
                        setSelectedMedication(e.target.value);
                        setSelectedDose('');
                        setCustomDose('');
                      }}
                      disabled={!selectedCategory}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
                    >
                      <option value="">Select medication</option>
                      {selectedCategory && ANESTHETIC_MEDICATIONS[selectedCategory as keyof typeof ANESTHETIC_MEDICATIONS]?.map((med) => (
                        <option key={med.name} value={med.name}>{med.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Dose Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dose {getMedicationDetails()?.unit && `(${getMedicationDetails()?.unit})`}
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={selectedDose}
                        onChange={(e) => {
                          setSelectedDose(e.target.value);
                          setCustomDose('');
                        }}
                        disabled={!selectedMedication}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
                      >
                        <option value="">Select dose</option>
                        {getMedicationDetails()?.commonDoses.map((dose) => (
                          <option key={dose} value={dose}>{dose} {getMedicationDetails()?.unit}</option>
                        ))}
                        <option value="custom">Custom...</option>
                      </select>
                      {selectedDose === 'custom' && (
                        <input
                          type="text"
                          value={customDose}
                          onChange={(e) => setCustomDose(e.target.value)}
                          placeholder="Enter dose"
                          className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        />
                      )}
                    </div>
                  </div>

                  {/* Route Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
                    <select
                      value={selectedRoute}
                      onChange={(e) => setSelectedRoute(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select route</option>
                      {ROUTES.map((route) => (
                        <option key={route} value={route}>{route}</option>
                      ))}
                    </select>
                  </div>

                  {/* Timing Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Timing</label>
                    <select
                      value={selectedTiming}
                      onChange={(e) => setSelectedTiming(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select timing</option>
                      {TIMING.map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                    <input
                      type="text"
                      value={medicationNotes}
                      onChange={(e) => setMedicationNotes(e.target.value)}
                      placeholder="Special instructions..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                {/* Add Button */}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={addMedication}
                    disabled={!selectedMedication || !selectedRoute || !selectedTiming || (!selectedDose && !customDose)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                  >
                    <Plus className="w-4 h-4" />
                    Add Medication
                  </button>
                </div>
              </div>

              {/* Prescribed Medications List */}
              {prescribedMedications.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-purple-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Medication</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Dose</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Route</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Timing</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Notes</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {prescribedMedications.map((med) => (
                        <tr key={med.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <div className="font-medium">{med.name}</div>
                            <div className="text-xs text-gray-500">{med.category}</div>
                          </td>
                          <td className="px-4 py-2">{med.dose} {med.unit}</td>
                          <td className="px-4 py-2">{med.route}</td>
                          <td className="px-4 py-2">{med.timing}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{med.notes || '-'}</td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => removeMedication(med.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {prescribedMedications.length === 0 && (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                  <Pill className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No medications added yet</p>
                  <p className="text-sm">Use the form above to add anesthetic medications</p>
                </div>
              )}

              {/* Special Instructions */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Special Instructions for Pharmacy
                </label>
                <textarea
                  value={prescriptionSpecialInstructions}
                  onChange={(e) => setPrescriptionSpecialInstructions(e.target.value)}
                  placeholder="Any special preparation instructions, storage requirements, or notes for the pharmacist..."
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {prescribedMedications.length > 0 && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700">
                    <strong>✓ {prescribedMedications.length} medication(s)</strong> will be sent to pharmacy for preparation when this review is submitted.
                  </p>
                </div>
              )}
            </div>

            {/* Risk Assessment */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Risk Assessment</h2>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Risk Level
                </label>
                <select
                  name="riskLevel"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select risk level</option>
                  <option value="LOW">Low Risk</option>
                  <option value="MODERATE">Moderate Risk</option>
                  <option value="HIGH">High Risk</option>
                  <option value="VERY_HIGH">Very High Risk</option>
                </select>
              </div>
              <SmartTextInput
                label="Risk Factors"
                value={riskFactors}
                onChange={setRiskFactors}
                placeholder="Specific risk factors identified"
                rows={3}
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />
            </div>

            {/* Recommendations */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Review Notes & Recommendations</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Mic className="w-4 h-4" />
                  <span>Dictation enabled</span>
                </div>
              </div>
              <div className="space-y-4">
                <SmartTextInput
                  label="Review Notes"
                  value={reviewNotes}
                  onChange={setReviewNotes}
                  placeholder="Overall assessment notes - dictate your findings"
                  rows={4}
                  enableSpeech={true}
                  enableOCR={true}
                  enableReadBack={true}
                  medicalMode={true}
                  helpText="Speak your assessment notes or photograph written notes"
                />
                <SmartTextInput
                  label="Recommendations"
                  value={recommendations}
                  onChange={setRecommendations}
                  placeholder="Recommendations for optimization, further investigations, or precautions"
                  rows={4}
                  enableSpeech={true}
                  enableOCR={true}
                  enableReadBack={true}
                  medicalMode={true}
                  helpText="Dictate recommendations - use read back to verify"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-indigo-600 text-white py-3 px-6 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {submitting ? 'Creating Review...' : 'Create Pre-Operative Review'}
              </button>
              <Link
                href="/dashboard/preop-reviews"
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
              >
                Cancel
              </Link>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
