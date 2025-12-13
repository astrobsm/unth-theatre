# Patient Preoperative Assessment Implementation

## Overview
Comprehensive preoperative assessment system integrated into patient registration to ensure thorough evaluation before surgical procedures.

## Features Implemented

### 1. DVT (Deep Vein Thrombosis) Risk Assessment
- **Risk Score Calculation**: Numerical scoring system
- **Risk Factors**:
  - History of DVT
  - Mobility issues
  - Active cancer
  - Prior DVT episodes
- **D-Dimer Test** (Optional):
  - Test result (Positive/Negative)
  - Numerical value (mg/L)
  - Conditional display when test is performed

### 2. Bleeding Risk Assessment
- **Risk Score Calculation**: Numerical scoring system
- **Risk Factors**:
  - Bleeding disorders
  - Liver disease
  - Renal impairment
  - Recent bleeding episodes

### 3. Pressure Sore Risk Assessment
- **Risk Score Calculation**: Numerical scoring system
- **Assessment Parameters**:
  - Existing pressure sores (Yes/No)
  - Mobility status (Fully Mobile, Slightly Limited, Very Limited, Immobile)
  - Nutritional status (Well Nourished, Adequate, Poor, Very Poor)

### 4. Medications Affecting Surgery
Comprehensive tracking of critical medications with conditional fields:

#### Anticoagulants
- Medication name (e.g., Warfarin, Rivaroxaban)
- Last dose date and time

#### Antiplatelets
- Medication name (e.g., Aspirin, Clopidogrel)
- Last dose date and time

#### ACE Inhibitors
- Medication name (e.g., Lisinopril, Enalapril)
- Last dose date and time

#### ARBs (Angiotensin Receptor Blockers)
- Medication name (e.g., Losartan, Valsartan)
- Last dose date and time

#### Other Medications
- Free-text field for additional medications

### 5. WHO Operative Fitness Risk Assessment
- **WHO Risk Class**: 1-5 scale (Minimal to Very High Risk)
- **ASA Score**: I-VI classification
  - ASA I: Healthy patient
  - ASA II: Mild systemic disease
  - ASA III: Severe systemic disease
  - ASA IV: Life-threatening disease
  - ASA V: Moribund patient
  - ASA VI: Brain dead
- **Comorbidities**: Comprehensive list of conditions
- **System-Specific Status**:
  - Cardiovascular (Normal, Controlled, Unstable, Critical)
  - Respiratory (Normal, Controlled, Unstable, Critical)
  - Metabolic (Free-text for diabetes, thyroid, etc.)

### 6. Final Assessment
- **Final Risk Score**: Calculated overall risk
- **Fitness for Surgery**:
  - Fit for Surgery
  - Fit with Optimization
  - Unfit for Surgery
  - Requires Further Assessment
- **Assessment Notes**: Detailed observations
- **Assessed By**: Name of evaluating physician
- **Assessment Date**: Date and time of assessment

## Database Schema

### New Patient Model Fields (60+ fields added)

```prisma
model Patient {
  // ... existing fields ...
  
  // DVT Risk Assessment
  dvtRiskScore          Float?
  hasDVTHistory         Boolean?
  hasMobilityIssues     Boolean?
  hasActiveCancer       Boolean?
  hasPriorDVT           Boolean?
  dDimerTestDone        Boolean?
  dDimerResult          String?
  dDimerValue           Float?
  
  // Bleeding Risk Assessment
  bleedingRiskScore     Float?
  hasBleedingDisorder   Boolean?
  hasLiverDisease       Boolean?
  hasRenalImpairment    Boolean?
  recentBleeding        Boolean?
  
  // Pressure Sore Risk
  pressureSoreRisk      Float?
  hasPressureSores      Boolean?
  mobilityStatus        String?
  nutritionalStatus     String?
  
  // Medications
  onAnticoagulants      Boolean?
  anticoagulantName     String?
  anticoagulantLastDose DateTime?
  onAntiplatelets       Boolean?
  antiplateletName      String?
  antiplateletLastDose  DateTime?
  onACEInhibitors       Boolean?
  aceInhibitorName      String?
  aceInhibitorLastDose  DateTime?
  onARBs                Boolean?
  arbName               String?
  arbLastDose           DateTime?
  otherMedications      String?
  
  // WHO Risk Assessment
  whoRiskClass          Int?
  asaScore              Int?
  comorbidities         String?
  cardiovascularStatus  String?
  respiratoryStatus     String?
  metabolicStatus       String?
  
  // Final Assessment
  finalRiskScore        Float?
  fitnessForSurgery     String?
  assessmentNotes       String?
  assessedBy            String?
  assessmentDate        DateTime?
}
```

## User Interface

### Form Organization
The patient registration form is organized into clear sections:

1. **Basic Patient Information** - Name, folder number, age, gender, ward
2. **DVT Risk Assessment** - Risk scoring with optional D-dimer test
3. **Bleeding Risk Assessment** - Risk factors and scoring
4. **Pressure Sore Risk** - Mobility and nutritional assessment
5. **Medications Affecting Surgery** - Expandable sections for each medication class
6. **WHO Operative Fitness** - Comprehensive fitness evaluation
7. **Final Assessment** - Overall risk determination and clearance

### UI Features
- **Color-coded section headers** with icons for easy navigation
- **Conditional fields** that appear only when relevant (e.g., D-dimer test details)
- **Checkboxes for boolean values** for quick data entry
- **Dropdown menus** for standardized values
- **Text areas** for detailed notes
- **Date-time pickers** for medication last dose tracking
- **Responsive grid layout** adapting to screen size

## API Integration

### Endpoint: POST /api/patients
Enhanced to accept all preoperative assessment fields with Zod validation.

### Validation
- Required fields: Basic patient info, risk scores, WHO class, ASA score, fitness determination
- Optional fields: Most assessment details allow for flexibility
- Conditional validation: Medication details required only when checkbox is selected

## Migration
- **Migration Name**: `20251213101253_add_patient_preoperative_assessment_fields`
- **Status**: Successfully applied
- **Location**: `prisma/migrations/20251213101253_add_patient_preoperative_assessment_fields/`

## Benefits

1. **Comprehensive Assessment**: All critical preoperative factors evaluated in one place
2. **Risk Stratification**: Multiple scoring systems for accurate risk determination
3. **Medication Safety**: Detailed tracking of drugs affecting surgery
4. **Standardized Evaluation**: WHO and ASA classifications ensure consistency
5. **Audit Trail**: All assessments timestamped with evaluator information
6. **Clinical Decision Support**: Clear fitness determination guides surgical planning

## Future Enhancements

- Auto-calculation of risk scores based on selected factors
- Integration with electronic health records (EHR)
- Alerts for high-risk patients
- Pre-operative optimization protocols based on assessment
- PDF export of assessment for patient records
- Historical assessment tracking for repeat surgeries

## Related Files

- **Frontend**: `src/app/dashboard/patients/new/page.tsx`
- **Backend**: `src/app/api/patients/route.ts`
- **Schema**: `prisma/schema.prisma`
- **Migration**: `prisma/migrations/20251213101253_add_patient_preoperative_assessment_fields/`

## Testing Checklist

- [ ] Register patient with all assessment fields
- [ ] Test conditional D-dimer fields
- [ ] Test medication tracking with all four classes
- [ ] Verify risk score calculations
- [ ] Test fitness determination workflow
- [ ] Validate required vs optional fields
- [ ] Check assessment date defaults to current time
- [ ] Verify database persistence of all fields
- [ ] Test form responsiveness on mobile devices
- [ ] Validate API error handling

---

**Implementation Date**: December 13, 2024  
**Database**: PostgreSQL (theatre_db)  
**Framework**: Next.js 14 with TypeScript
