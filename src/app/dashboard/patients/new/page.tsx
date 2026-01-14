'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, AlertCircle, Activity, Heart, Shield, Scale, Calculator } from 'lucide-react';
import Link from 'next/link';
import { WARDS } from '@/lib/constants';
import SmartTextInput from '@/components/SmartTextInput';

// Comprehensive Risk Assessment Calculators

interface DVTRiskFactors {
  age: number;
  majorSurgery: boolean;
  immobilization: boolean;
  activeCancer: boolean;
  priorDVT: boolean;
  obesity: boolean;
  pregnancy: boolean;
  oralContraceptives: boolean;
  variceVeins: boolean;
}

interface BleedingRiskFactors {
  age: number;
  bleedingHistory: boolean;
  liverDisease: boolean;
  renalImpairment: boolean;
  thrombocytopenia: boolean;
  anticoagulants: boolean;
  nsaids: boolean;
  alcohol: boolean;
}

interface BradenScoreFactors {
  sensoryPerception: number; // 1-4
  moisture: number; // 1-4
  activity: number; // 1-4
  mobility: number; // 1-4
  nutrition: number; // 1-4
  frictionShear: number; // 1-3
}

interface NutritionalData {
  height: number; // cm
  weight: number; // kg
  albumin: number; // g/dL
  lymphocytes: number; // count
  weightLoss: boolean;
  poorIntake: boolean;
}

export default function NewPatientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Basic Info
  const [age, setAge] = useState(0);
  const [gender, setGender] = useState('');
  
  // SmartTextInput state for voice dictation
  const [comorbidities, setComorbidities] = useState('');
  const [metabolicStatus, setMetabolicStatus] = useState('');
  const [otherMedications, setOtherMedications] = useState('');
  const [assessmentNotes, setAssessmentNotes] = useState('');

  // DVT Risk Factors
  const [dvtFactors, setDvtFactors] = useState<DVTRiskFactors>({
    age: 0,
    majorSurgery: false,
    immobilization: false,
    activeCancer: false,
    priorDVT: false,
    obesity: false,
    pregnancy: false,
    oralContraceptives: false,
    variceVeins: false,
  });
  const [dvtScore, setDvtScore] = useState(0);
  const [dvtRisk, setDvtRisk] = useState('LOW');

  // Bleeding Risk Factors
  const [bleedingFactors, setBleedingFactors] = useState<BleedingRiskFactors>({
    age: 0,
    bleedingHistory: false,
    liverDisease: false,
    renalImpairment: false,
    thrombocytopenia: false,
    anticoagulants: false,
    nsaids: false,
    alcohol: false,
  });
  const [bleedingScore, setBleedingScore] = useState(0);
  const [bleedingRisk, setBleedingRisk] = useState('LOW');

  // Braden Score for Pressure Sores
  const [bradenFactors, setBradenFactors] = useState<BradenScoreFactors>({
    sensoryPerception: 4,
    moisture: 4,
    activity: 4,
    mobility: 4,
    nutrition: 4,
    frictionShear: 3,
  });
  const [bradenScore, setBradenScore] = useState(23);
  const [pressureSoreRisk, setPressureSoreRisk] = useState('NO RISK');

  // Nutritional Assessment
  const [nutritionalData, setNutritionalData] = useState<NutritionalData>({
    height: 0,
    weight: 0,
    albumin: 0,
    lymphocytes: 0,
    weightLoss: false,
    poorIntake: false,
  });
  const [bmi, setBmi] = useState(0);
  const [nutritionalRisk, setNutritionalRisk] = useState('WELL NOURISHED');

  // D-Dimer
  const [dDimerDone, setDDimerDone] = useState(false);
  const [dDimerResult, setDDimerResult] = useState('');
  const [dDimerValue, setDDimerValue] = useState(0);

  // WHO/ASA
  const [whoRiskClass, setWhoRiskClass] = useState('');
  const [asaScore, setAsaScore] = useState(1);

  // Calculate DVT Risk Score (Caprini Score)
  useEffect(() => {
    let score = 0;
    
    // Age points
    if (dvtFactors.age >= 75) score += 5;
    else if (dvtFactors.age >= 61) score += 3;
    else if (dvtFactors.age >= 41) score += 1;

    // 3 points each
    if (dvtFactors.majorSurgery) score += 3;
    if (dvtFactors.activeCancer) score += 3;
    if (dvtFactors.priorDVT) score += 3;

    // 2 points each
    if (dvtFactors.immobilization) score += 2;
    if (dvtFactors.pregnancy) score += 2;

    // 1 point each
    if (dvtFactors.obesity) score += 1;
    if (dvtFactors.oralContraceptives) score += 1;
    if (dvtFactors.variceVeins) score += 1;

    setDvtScore(score);

    // Determine risk level
    if (score >= 5) setDvtRisk('HIGH');
    else if (score >= 3) setDvtRisk('MODERATE');
    else setDvtRisk('LOW');
  }, [dvtFactors]);

  // Calculate Bleeding Risk Score (HAS-BLED)
  useEffect(() => {
    let score = 0;
    
    if (bleedingFactors.age >= 65) score += 1;
    if (bleedingFactors.bleedingHistory) score += 1;
    if (bleedingFactors.liverDisease) score += 1;
    if (bleedingFactors.renalImpairment) score += 1;
    if (bleedingFactors.thrombocytopenia) score += 1;
    if (bleedingFactors.anticoagulants) score += 1;
    if (bleedingFactors.nsaids) score += 1;
    if (bleedingFactors.alcohol) score += 1;

    setBleedingScore(score);

    // Determine risk level
    if (score >= 3) setBleedingRisk('HIGH');
    else if (score >= 1) setBleedingRisk('MODERATE');
    else setBleedingRisk('LOW');
  }, [bleedingFactors]);

  // Calculate Braden Score
  useEffect(() => {
    const total = bradenFactors.sensoryPerception + bradenFactors.moisture + 
                  bradenFactors.activity + bradenFactors.mobility + 
                  bradenFactors.nutrition + bradenFactors.frictionShear;
    setBradenScore(total);

    // Determine risk level
    if (total <= 9) setPressureSoreRisk('VERY HIGH RISK');
    else if (total <= 12) setPressureSoreRisk('HIGH RISK');
    else if (total <= 14) setPressureSoreRisk('MODERATE RISK');
    else if (total <= 18) setPressureSoreRisk('MILD RISK');
    else setPressureSoreRisk('NO RISK');
  }, [bradenFactors]);

  // Calculate BMI and Nutritional Risk
  useEffect(() => {
    if (nutritionalData.height > 0 && nutritionalData.weight > 0) {
      const heightM = nutritionalData.height / 100;
      const calculatedBMI = nutritionalData.weight / (heightM * heightM);
      setBmi(parseFloat(calculatedBMI.toFixed(1)));

      // Assess nutritional risk
      let riskFactors = 0;
      
      if (calculatedBMI < 18.5) riskFactors += 2; // Underweight
      else if (calculatedBMI >= 30) riskFactors += 1; // Obesity

      if (nutritionalData.albumin < 3.5) riskFactors += 2; // Low albumin
      if (nutritionalData.lymphocytes < 1500) riskFactors += 1; // Low lymphocytes
      if (nutritionalData.weightLoss) riskFactors += 1;
      if (nutritionalData.poorIntake) riskFactors += 1;

      if (riskFactors >= 4) setNutritionalRisk('SEVERE MALNUTRITION');
      else if (riskFactors >= 2) setNutritionalRisk('MODERATE MALNUTRITION');
      else if (riskFactors >= 1) setNutritionalRisk('AT RISK');
      else setNutritionalRisk('WELL NOURISHED');
    }
  }, [nutritionalData]);

  // Sync age across assessments
  useEffect(() => {
    setDvtFactors(prev => ({ ...prev, age }));
    setBleedingFactors(prev => ({ ...prev, age }));
  }, [age]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    
    const data = {
      // Basic Information
      name: formData.get('name'),
      folderNumber: formData.get('folderNumber'),
      ptNumber: formData.get('ptNumber'),
      age: parseInt(formData.get('age') as string),
      gender: formData.get('gender'),
      ward: formData.get('ward'),
      
      // DVT Risk Assessment
      dvtRiskScore: dvtScore,
      hasDVTHistory: dvtFactors.priorDVT,
      hasMobilityIssues: dvtFactors.immobilization,
      hasActiveCancer: dvtFactors.activeCancer,
      hasPriorDVT: dvtFactors.priorDVT,
      dDimerTestDone: dDimerDone,
      dDimerResult: dDimerDone ? dDimerResult : null,
      dDimerValue: dDimerDone ? dDimerValue : null,
      
      // Bleeding Risk Assessment
      bleedingRiskScore: bleedingScore,
      hasBleedingDisorder: bleedingFactors.bleedingHistory,
      hasLiverDisease: bleedingFactors.liverDisease,
      hasRenalImpairment: bleedingFactors.renalImpairment,
      recentBleeding: false,
      
      // Pressure Sore Risk
      pressureSoreRisk: pressureSoreRisk,
      hasPressureSores: false,
      mobilityStatus: bradenScore <= 12 ? 'IMMOBILE' : bradenScore <= 14 ? 'VERY_LIMITED' : 'FULLY_MOBILE',
      nutritionalStatus: nutritionalRisk,
      
      // Medications Affecting Surgery
      onAnticoagulants: bleedingFactors.anticoagulants,
      anticoagulantName: bleedingFactors.anticoagulants ? formData.get('anticoagulantName') || null : null,
      anticoagulantLastDose: bleedingFactors.anticoagulants ? formData.get('anticoagulantLastDose') || null : null,
      onAntiplatelets: bleedingFactors.nsaids,
      antiplateletName: bleedingFactors.nsaids ? formData.get('antiplateletName') || null : null,
      antiplateletLastDose: bleedingFactors.nsaids ? formData.get('antiplateletLastDose') || null : null,
      onACEInhibitors: false,
      aceInhibitorName: null,
      aceInhibitorLastDose: null,
      onARBs: false,
      arbName: null,
      arbLastDose: null,
      otherMedications: otherMedications || null,
      
      // WHO Operative Fitness Risk Assessment
      whoRiskClass: whoRiskClass || null,
      asaScore: asaScore,
      comorbidities: comorbidities || null,
      cardiovascularStatus: formData.get('cardiovascularStatus') || null,
      respiratoryStatus: formData.get('respiratoryStatus') || null,
      metabolicStatus: metabolicStatus || null,
      
      // Final Assessment
      finalRiskScore: (dvtScore + bleedingScore + (23 - bradenScore)) / 3,
      fitnessForSurgery: formData.get('fitnessForSurgery'),
      assessmentNotes: assessmentNotes || null,
      assessedBy: formData.get('assessedBy'),
      assessmentDate: formData.get('assessmentDate') ? new Date(formData.get('assessmentDate') as string) : new Date(),
    };

    try {
      const response = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        router.push('/dashboard/patients');
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to register patient');
      }
    } catch (error) {
      setError('An error occurred while registering the patient');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/patients"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Register Patient</h1>
          <p className="text-gray-600 mt-1">Comprehensive Pre-operative Assessment</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Patient Information */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <User className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Basic Information</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="label">Full Name *</label>
              <input
                type="text"
                name="name"
                required
                className="input-field"
                placeholder="e.g., John Doe"
              />
            </div>

            <div>
              <label className="label">Folder Number *</label>
              <input
                type="text"
                name="folderNumber"
                required
                className="input-field"
                placeholder="e.g., UNTH/2024/001"
              />
            </div>

            <div>
              <label className="label">PT Number</label>
              <input
                type="text"
                name="ptNumber"
                className="input-field"
                placeholder="e.g., PT001234"
              />
            </div>

            <div>
              <label className="label">Age *</label>
              <input
                type="number"
                name="age"
                required
                min="0"
                max="150"
                className="input-field"
                value={age || ''}
                onChange={(e) => setAge(parseInt(e.target.value) || 0)}
              />
            </div>

            <div>
              <label className="label">Gender *</label>
              <select 
                name="gender" 
                required 
                className="input-field"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="label">Ward *</label>
              <select name="ward" required className="input-field">
                <option value="">Select Ward</option>
                {WARDS.map((ward) => (
                  <option key={ward} value={ward}>{ward}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* DVT Risk Assessment (Caprini Score) */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Activity className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold">DVT Risk Assessment (Caprini Score)</h2>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">{dvtScore} points</div>
              <div className={`text-sm font-medium ${
                dvtRisk === 'HIGH' ? 'text-red-600' : 
                dvtRisk === 'MODERATE' ? 'text-yellow-600' : 'text-green-600'
              }`}>
                {dvtRisk} RISK
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={dvtFactors.majorSurgery}
                onChange={(e) => setDvtFactors({...dvtFactors, majorSurgery: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">Major Surgery (&gt;45 min)</div>
                <div className="text-xs text-gray-500">+3 points</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={dvtFactors.activeCancer}
                onChange={(e) => setDvtFactors({...dvtFactors, activeCancer: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">Active Cancer</div>
                <div className="text-xs text-gray-500">+3 points</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={dvtFactors.priorDVT}
                onChange={(e) => setDvtFactors({...dvtFactors, priorDVT: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">History of DVT/PE</div>
                <div className="text-xs text-gray-500">+3 points</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={dvtFactors.immobilization}
                onChange={(e) => setDvtFactors({...dvtFactors, immobilization: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">Immobilization (&gt;72h)</div>
                <div className="text-xs text-gray-500">+2 points</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={dvtFactors.pregnancy}
                onChange={(e) => setDvtFactors({...dvtFactors, pregnancy: e.target.checked})}
                className="w-5 h-5"
                disabled={gender !== 'Female'}
              />
              <div>
                <div className="font-medium">Pregnancy/Postpartum</div>
                <div className="text-xs text-gray-500">+2 points (Female only)</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={dvtFactors.obesity}
                onChange={(e) => setDvtFactors({...dvtFactors, obesity: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">Obesity (BMI &gt;25)</div>
                <div className="text-xs text-gray-500">+1 point</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={dvtFactors.oralContraceptives}
                onChange={(e) => setDvtFactors({...dvtFactors, oralContraceptives: e.target.checked})}
                className="w-5 h-5"
                disabled={gender !== 'Female'}
              />
              <div>
                <div className="font-medium">Oral Contraceptives/HRT</div>
                <div className="text-xs text-gray-500">+1 point (Female only)</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={dvtFactors.variceVeins}
                onChange={(e) => setDvtFactors({...dvtFactors, variceVeins: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">Varicose Veins</div>
                <div className="text-xs text-gray-500">+1 point</div>
              </div>
            </label>
          </div>

          {/* D-Dimer Test */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <label className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={dDimerDone}
                onChange={(e) => setDDimerDone(e.target.checked)}
                className="w-5 h-5"
              />
              <span className="font-medium">D-Dimer Test Performed</span>
            </label>

            {dDimerDone && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Result</label>
                  <select
                    className="input-field"
                    value={dDimerResult}
                    onChange={(e) => setDDimerResult(e.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="NEGATIVE">Negative</option>
                    <option value="POSITIVE">Positive</option>
                  </select>
                </div>
                <div>
                  <label className="label">Value (µg/mL FEU)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={dDimerValue || ''}
                    onChange={(e) => setDDimerValue(parseFloat(e.target.value) || 0)}
                    placeholder="Normal: <0.5"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bleeding Risk Assessment (HAS-BLED) */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Heart className="w-6 h-6 text-red-600" />
              <h2 className="text-xl font-semibold">Bleeding Risk Assessment (HAS-BLED)</h2>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-red-600">{bleedingScore} points</div>
              <div className={`text-sm font-medium ${
                bleedingRisk === 'HIGH' ? 'text-red-600' : 
                bleedingRisk === 'MODERATE' ? 'text-yellow-600' : 'text-green-600'
              }`}>
                {bleedingRisk} RISK
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={bleedingFactors.bleedingHistory}
                onChange={(e) => setBleedingFactors({...bleedingFactors, bleedingHistory: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">Prior Major Bleeding</div>
                <div className="text-xs text-gray-500">+1 point</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={bleedingFactors.liverDisease}
                onChange={(e) => setBleedingFactors({...bleedingFactors, liverDisease: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">Liver Disease (Cirrhosis)</div>
                <div className="text-xs text-gray-500">+1 point</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={bleedingFactors.renalImpairment}
                onChange={(e) => setBleedingFactors({...bleedingFactors, renalImpairment: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">Renal Impairment (Dialysis)</div>
                <div className="text-xs text-gray-500">+1 point</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={bleedingFactors.thrombocytopenia}
                onChange={(e) => setBleedingFactors({...bleedingFactors, thrombocytopenia: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">Thrombocytopenia</div>
                <div className="text-xs text-gray-500">Platelet &lt;100k | +1 point</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={bleedingFactors.anticoagulants}
                onChange={(e) => setBleedingFactors({...bleedingFactors, anticoagulants: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">On Anticoagulants</div>
                <div className="text-xs text-gray-500">Warfarin, DOACs | +1 point</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={bleedingFactors.nsaids}
                onChange={(e) => setBleedingFactors({...bleedingFactors, nsaids: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">NSAIDs/Antiplatelets</div>
                <div className="text-xs text-gray-500">Aspirin, Clopidogrel | +1 point</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={bleedingFactors.alcohol}
                onChange={(e) => setBleedingFactors({...bleedingFactors, alcohol: e.target.checked})}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">Alcohol Abuse</div>
                <div className="text-xs text-gray-500">&gt;8 drinks/week | +1 point</div>
              </div>
            </label>
          </div>

          {/* Medication Details */}
          {bleedingFactors.anticoagulants && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg">
              <h4 className="font-medium mb-3">Anticoagulant Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Medication Name</label>
                  <input type="text" name="anticoagulantName" className="input-field" placeholder="e.g., Warfarin" />
                </div>
                <div>
                  <label className="label">Last Dose</label>
                  <input type="datetime-local" name="anticoagulantLastDose" className="input-field" />
                </div>
              </div>
            </div>
          )}

          {bleedingFactors.nsaids && (
            <div className="mt-4 p-4 bg-orange-50 rounded-lg">
              <h4 className="font-medium mb-3">Antiplatelet Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Medication Name</label>
                  <input type="text" name="antiplateletName" className="input-field" placeholder="e.g., Aspirin" />
                </div>
                <div>
                  <label className="label">Last Dose</label>
                  <input type="datetime-local" name="antiplateletLastDose" className="input-field" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pressure Sore Risk (Braden Scale) */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-purple-600" />
              <h2 className="text-xl font-semibold">Pressure Sore Risk (Braden Scale)</h2>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-purple-600">{bradenScore} points</div>
              <div className={`text-sm font-medium ${
                bradenScore <= 9 ? 'text-red-600' : 
                bradenScore <= 12 ? 'text-orange-600' :
                bradenScore <= 14 ? 'text-yellow-600' :
                bradenScore <= 18 ? 'text-blue-600' : 'text-green-600'
              }`}>
                {pressureSoreRisk}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Sensory Perception */}
            <div>
              <label className="label">1. Sensory Perception - Ability to respond meaningfully to pressure</label>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2">
                {[
                  { value: 1, label: "Completely Limited", desc: "Unresponsive" },
                  { value: 2, label: "Very Limited", desc: "Responds to painful stimuli only" },
                  { value: 3, label: "Slightly Limited", desc: "Responds to verbal commands" },
                  { value: 4, label: "No Impairment", desc: "Responds to verbal commands fully" }
                ].map((option) => (
                  <label key={option.value} className={`p-3 border rounded-lg cursor-pointer ${
                    bradenFactors.sensoryPerception === option.value ? 'bg-purple-50 border-purple-500' : 'hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="sensoryPerception"
                      value={option.value}
                      checked={bradenFactors.sensoryPerception === option.value}
                      onChange={(e) => setBradenFactors({...bradenFactors, sensoryPerception: parseInt(e.target.value)})}
                      className="hidden"
                    />
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{option.desc}</div>
                    <div className="text-xs font-bold text-purple-600 mt-2">{option.value} point{option.value > 1 ? 's' : ''}</div>
                  </label>
                ))}
              </div>
            </div>

            {/* Moisture */}
            <div>
              <label className="label">2. Moisture - Degree to which skin is exposed to moisture</label>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2">
                {[
                  { value: 1, label: "Constantly Moist", desc: "Skin always damp" },
                  { value: 2, label: "Very Moist", desc: "Often but not always moist" },
                  { value: 3, label: "Occasionally Moist", desc: "Requires extra linen change once/day" },
                  { value: 4, label: "Rarely Moist", desc: "Skin usually dry" }
                ].map((option) => (
                  <label key={option.value} className={`p-3 border rounded-lg cursor-pointer ${
                    bradenFactors.moisture === option.value ? 'bg-purple-50 border-purple-500' : 'hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="moisture"
                      value={option.value}
                      checked={bradenFactors.moisture === option.value}
                      onChange={(e) => setBradenFactors({...bradenFactors, moisture: parseInt(e.target.value)})}
                      className="hidden"
                    />
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{option.desc}</div>
                    <div className="text-xs font-bold text-purple-600 mt-2">{option.value} point{option.value > 1 ? 's' : ''}</div>
                  </label>
                ))}
              </div>
            </div>

            {/* Activity */}
            <div>
              <label className="label">3. Activity - Degree of physical activity</label>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2">
                {[
                  { value: 1, label: "Bedfast", desc: "Confined to bed" },
                  { value: 2, label: "Chairfast", desc: "Ability to walk severely limited" },
                  { value: 3, label: "Walks Occasionally", desc: "Short distances with assistance" },
                  { value: 4, label: "Walks Frequently", desc: "Outside room at least 2x/day" }
                ].map((option) => (
                  <label key={option.value} className={`p-3 border rounded-lg cursor-pointer ${
                    bradenFactors.activity === option.value ? 'bg-purple-50 border-purple-500' : 'hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="activity"
                      value={option.value}
                      checked={bradenFactors.activity === option.value}
                      onChange={(e) => setBradenFactors({...bradenFactors, activity: parseInt(e.target.value)})}
                      className="hidden"
                    />
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{option.desc}</div>
                    <div className="text-xs font-bold text-purple-600 mt-2">{option.value} point{option.value > 1 ? 's' : ''}</div>
                  </label>
                ))}
              </div>
            </div>

            {/* Mobility */}
            <div>
              <label className="label">4. Mobility - Ability to change and control body position</label>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2">
                {[
                  { value: 1, label: "Completely Immobile", desc: "Cannot make any position changes" },
                  { value: 2, label: "Very Limited", desc: "Makes occasional slight changes" },
                  { value: 3, label: "Slightly Limited", desc: "Makes frequent slight changes" },
                  { value: 4, label: "No Limitation", desc: "Makes major frequent changes" }
                ].map((option) => (
                  <label key={option.value} className={`p-3 border rounded-lg cursor-pointer ${
                    bradenFactors.mobility === option.value ? 'bg-purple-50 border-purple-500' : 'hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="mobility"
                      value={option.value}
                      checked={bradenFactors.mobility === option.value}
                      onChange={(e) => setBradenFactors({...bradenFactors, mobility: parseInt(e.target.value)})}
                      className="hidden"
                    />
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{option.desc}</div>
                    <div className="text-xs font-bold text-purple-600 mt-2">{option.value} point{option.value > 1 ? 's' : ''}</div>
                  </label>
                ))}
              </div>
            </div>

            {/* Nutrition */}
            <div>
              <label className="label">5. Nutrition - Usual food intake pattern</label>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2">
                {[
                  { value: 1, label: "Very Poor", desc: "Never eats complete meal, rarely eats more than 1/3" },
                  { value: 2, label: "Probably Inadequate", desc: "Rarely eats complete meal, eats ~1/2" },
                  { value: 3, label: "Adequate", desc: "Eats over 1/2 of most meals" },
                  { value: 4, label: "Excellent", desc: "Eats most of every meal, never refuses" }
                ].map((option) => (
                  <label key={option.value} className={`p-3 border rounded-lg cursor-pointer ${
                    bradenFactors.nutrition === option.value ? 'bg-purple-50 border-purple-500' : 'hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="nutrition"
                      value={option.value}
                      checked={bradenFactors.nutrition === option.value}
                      onChange={(e) => setBradenFactors({...bradenFactors, nutrition: parseInt(e.target.value)})}
                      className="hidden"
                    />
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{option.desc}</div>
                    <div className="text-xs font-bold text-purple-600 mt-2">{option.value} point{option.value > 1 ? 's' : ''}</div>
                  </label>
                ))}
              </div>
            </div>

            {/* Friction & Shear */}
            <div>
              <label className="label">6. Friction & Shear</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                {[
                  { value: 1, label: "Problem", desc: "Requires moderate to maximum assistance, slides down" },
                  { value: 2, label: "Potential Problem", desc: "Moves feebly, requires minimum assistance" },
                  { value: 3, label: "No Apparent Problem", desc: "Moves independently, maintains good position" }
                ].map((option) => (
                  <label key={option.value} className={`p-3 border rounded-lg cursor-pointer ${
                    bradenFactors.frictionShear === option.value ? 'bg-purple-50 border-purple-500' : 'hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="frictionShear"
                      value={option.value}
                      checked={bradenFactors.frictionShear === option.value}
                      onChange={(e) => setBradenFactors({...bradenFactors, frictionShear: parseInt(e.target.value)})}
                      className="hidden"
                    />
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{option.desc}</div>
                    <div className="text-xs font-bold text-purple-600 mt-2">{option.value} point{option.value > 1 ? 's' : ''}</div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Nutritional Assessment with BMI */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Scale className="w-6 h-6 text-green-600" />
              <h2 className="text-xl font-semibold">Nutritional Assessment & BMI</h2>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">BMI: {bmi || '-'}</div>
              <div className={`text-sm font-medium ${
                nutritionalRisk.includes('SEVERE') ? 'text-red-600' :
                nutritionalRisk.includes('MODERATE') ? 'text-orange-600' :
                nutritionalRisk === 'AT RISK' ? 'text-yellow-600' : 'text-green-600'
              }`}>
                {nutritionalRisk}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Height (cm) *</label>
              <input
                type="number"
                step="0.1"
                className="input-field"
                value={nutritionalData.height || ''}
                onChange={(e) => setNutritionalData({...nutritionalData, height: parseFloat(e.target.value) || 0})}
                placeholder="e.g., 170"
              />
            </div>

            <div>
              <label className="label">Weight (kg) *</label>
              <input
                type="number"
                step="0.1"
                className="input-field"
                value={nutritionalData.weight || ''}
                onChange={(e) => setNutritionalData({...nutritionalData, weight: parseFloat(e.target.value) || 0})}
                placeholder="e.g., 70"
              />
            </div>

            <div>
              <label className="label">Serum Albumin (g/dL)</label>
              <input
                type="number"
                step="0.1"
                className="input-field"
                value={nutritionalData.albumin || ''}
                onChange={(e) => setNutritionalData({...nutritionalData, albumin: parseFloat(e.target.value) || 0})}
                placeholder="Normal: 3.5-5.5"
              />
            </div>

            <div>
              <label className="label">Lymphocyte Count (cells/µL)</label>
              <input
                type="number"
                className="input-field"
                value={nutritionalData.lymphocytes || ''}
                onChange={(e) => setNutritionalData({...nutritionalData, lymphocytes: parseFloat(e.target.value) || 0})}
                placeholder="Normal: 1000-4800"
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={nutritionalData.weightLoss}
                    onChange={(e) => setNutritionalData({...nutritionalData, weightLoss: e.target.checked})}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Significant Weight Loss (&gt;10% in 6 months)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={nutritionalData.poorIntake}
                    onChange={(e) => setNutritionalData({...nutritionalData, poorIntake: e.target.checked})}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Poor Oral Intake (&lt;50% meals)</span>
                </label>
              </div>
            </div>

            {bmi > 0 && (
              <div className="md:col-span-2 p-4 bg-green-50 rounded-lg">
                <h4 className="font-medium mb-2">BMI Interpretation</h4>
                <div className="text-sm">
                  {bmi < 18.5 && <p className="text-orange-600">Underweight - Risk of malnutrition</p>}
                  {bmi >= 18.5 && bmi < 25 && <p className="text-green-600">Normal weight - Healthy range</p>}
                  {bmi >= 25 && bmi < 30 && <p className="text-yellow-600">Overweight - Consider dietary counseling</p>}
                  {bmi >= 30 && <p className="text-red-600">Obese - Increased surgical risk</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* WHO/ASA Classification */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <Calculator className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-semibold">WHO/ASA Physical Status Classification</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">WHO Risk Class</label>
              <select
                className="input-field"
                value={whoRiskClass}
                onChange={(e) => setWhoRiskClass(e.target.value)}
              >
                <option value="">Select Class</option>
                <option value="I">Class I - Minor surgery, minimal stress</option>
                <option value="II">Class II - Moderate surgery, moderate stress</option>
                <option value="III">Class III - Major surgery, major stress</option>
                <option value="IV">Class IV - Major surgery, life-threatening</option>
              </select>
            </div>

            <div>
              <label className="label">ASA Physical Status</label>
              <select
                className="input-field"
                value={asaScore}
                onChange={(e) => setAsaScore(parseInt(e.target.value))}
              >
                <option value="1">ASA I - Normal healthy patient</option>
                <option value="2">ASA II - Mild systemic disease</option>
                <option value="3">ASA III - Severe systemic disease</option>
                <option value="4">ASA IV - Severe disease, constant threat to life</option>
                <option value="5">ASA V - Moribund, not expected to survive</option>
                <option value="6">ASA VI - Brain-dead organ donor</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <SmartTextInput
                label="Comorbidities"
                value={comorbidities}
                onChange={setComorbidities}
                rows={3}
                placeholder="List all existing medical conditions (diabetes, hypertension, etc.) 🎤 Dictate"
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />
            </div>

            <div>
              <label className="label">Cardiovascular Status</label>
              <select name="cardiovascularStatus" className="input-field">
                <option value="">Select Status</option>
                <option value="NORMAL">Normal</option>
                <option value="CONTROLLED_HTN">Controlled Hypertension</option>
                <option value="HEART_DISEASE">Heart Disease</option>
                <option value="HEART_FAILURE">Heart Failure</option>
              </select>
            </div>

            <div>
              <label className="label">Respiratory Status</label>
              <select name="respiratoryStatus" className="input-field">
                <option value="">Select Status</option>
                <option value="NORMAL">Normal</option>
                <option value="ASTHMA">Asthma</option>
                <option value="COPD">COPD</option>
                <option value="RESPIRATORY_FAILURE">Respiratory Failure</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <SmartTextInput
                label="Metabolic Status"
                value={metabolicStatus}
                onChange={setMetabolicStatus}
                rows={2}
                placeholder="Diabetes, thyroid disorders, renal/hepatic impairment, etc. 🎤 Dictate"
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />
            </div>
          </div>
        </div>

        {/* Other Medications */}
        <div className="card">
          <h3 className="font-semibold mb-4">Other Medications</h3>
          <SmartTextInput
            value={otherMedications}
            onChange={setOtherMedications}
            rows={3}
            placeholder="List any other medications not mentioned above... 🎤 Dictate"
            enableSpeech={true}
            enableOCR={true}
            medicalMode={true}
          />
          />
        </div>

        {/* Final Assessment */}
        <div className="card bg-gradient-to-br from-primary-50 to-secondary-50">
          <h2 className="text-xl font-semibold mb-6">Final Pre-operative Assessment</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Fitness for Surgery *</label>
              <select name="fitnessForSurgery" required className="input-field">
                <option value="">Select Fitness</option>
                <option value="FIT">Fit for Surgery</option>
                <option value="FIT_WITH_PRECAUTIONS">Fit with Precautions</option>
                <option value="HIGH_RISK">High Risk - Needs Optimization</option>
                <option value="UNFIT">Unfit for Surgery</option>
              </select>
            </div>

            <div>
              <label className="label">Overall Risk Score (Auto-calculated)</label>
              <input
                type="number"
                readOnly
                className="input-field bg-gray-100"
                value={((dvtScore + bleedingScore + (23 - bradenScore)) / 3).toFixed(1)}
              />
            </div>

            <div className="md:col-span-2">
              <SmartTextInput
                label="Assessment Notes"
                value={assessmentNotes}
                onChange={setAssessmentNotes}
                rows={4}
                placeholder="Additional notes regarding fitness for surgery, special precautions, recommendations... 🎤 Dictate"
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />
            </div>

            <div>
              <label className="label">Assessed By *</label>
              <input
                type="text"
                name="assessedBy"
                required
                className="input-field"
                placeholder="Name of assessing physician"
              />
            </div>

            <div>
              <label className="label">Assessment Date *</label>
              <input
                type="datetime-local"
                name="assessmentDate"
                required
                className="input-field"
                defaultValue={new Date().toISOString().slice(0, 16)}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end">
          <Link href="/dashboard/patients" className="btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Registering...' : 'Register Patient'}
          </button>
        </div>
      </form>
    </div>
  );
}
