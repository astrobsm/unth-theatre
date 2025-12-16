# UI Implementation Guide - Enhanced Features

## Quick Reference for Frontend Developers

This guide provides the essential information needed to build the UI components for the new enhanced features.

---

## 🎨 Pages to Implement

### 1. Anesthetist Pre-Op Review Dashboard
**Path:** `/src/app/dashboard/preop-reviews/page.tsx`

**Purpose:** Manage pre-operative anesthetic reviews

**API Endpoints to Use:**
```typescript
// List reviews
GET /api/preop-reviews
GET /api/preop-reviews?status=IN_PROGRESS
GET /api/preop-reviews?date=2025-12-15

// Create review
POST /api/preop-reviews
Body: {
  surgeryId, patientId, patientName, folderNumber,
  scheduledSurgeryDate, currentMedications, allergies,
  comorbidities, weight, height, bmi, bloodPressure,
  heartRate, asaClass, proposedAnesthesiaType,
  anestheticPlan, riskLevel, reviewNotes
}

// Update review
PATCH /api/preop-reviews/[id]

// Approve review (Consultant only)
POST /api/preop-reviews/[id]/approve
Body: { approved: true, approvalNotes: "..." }
```

**Key Components Needed:**
- Table listing patients needing reviews
- Create/Edit form with sections:
  - Patient Information (read-only)
  - Medical History
  - Physical Examination
  - Laboratory Results
  - ASA Classification
  - Anesthetic Plan
  - Risk Assessment
- Status badges (PENDING, IN_PROGRESS, COMPLETED, APPROVED)
- Approval modal (for consultants)

**Sample Data Structure:**
```typescript
interface PreOpReview {
  id: string;
  surgeryId: string;
  patientName: string;
  folderNumber: string;
  weight?: number;
  height?: number;
  bmi?: number;
  bloodPressure?: string;
  heartRate?: number;
  asaClass?: string;
  proposedAnesthesiaType?: 'GENERAL' | 'SPINAL' | 'LOCAL' | 'REGIONAL' | 'SEDATION';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED';
  anesthetist: { fullName: string };
  consultantAnesthetist?: { fullName: string };
  createdAt: string;
}
```

---

### 2. Pharmacist Prescription Dashboard
**Path:** `/src/app/dashboard/prescriptions/page.tsx`

**Purpose:** View and pack approved prescriptions

**API Endpoints to Use:**
```typescript
// List prescriptions
GET /api/prescriptions
GET /api/prescriptions?status=APPROVED
GET /api/prescriptions?needsPacking=true
GET /api/prescriptions?date=2025-12-15

// Pack prescription
POST /api/prescriptions/[id]/pack
Body: { packingNotes: "All medications prepared and labeled" }
```

**Key Components Needed:**
- Filterable list of prescriptions
  - Filter by status
  - Filter by date
  - Filter by urgency
- Prescription detail view showing:
  - Patient information
  - Surgery details
  - Medications list (parse JSON)
  - Fluids and emergency drugs
  - Allergy alerts (highlighted)
  - Special instructions
- Packing modal with:
  - Medication checklist
  - Packing notes field
  - Confirm button
- Status badges

**Sample Data Structure:**
```typescript
interface Prescription {
  id: string;
  patientName: string;
  scheduledSurgeryDate: string;
  medications: string; // JSON array
  fluids?: string;
  emergencyDrugs?: string;
  allergyAlerts?: string;
  specialInstructions?: string;
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PACKED';
  prescribedBy: { fullName: string };
  approvedBy?: { fullName: string };
  packedBy?: { fullName: string };
  packedAt?: string;
}

// Medications JSON structure
interface Medication {
  name: string;
  dose: string;
  route: string; // IV, IM, PO, etc.
  frequency: string;
  timing: string; // Pre-op, Induction, Maintenance, etc.
}
```

---

### 3. Blood Bank Dashboard
**Path:** `/src/app/dashboard/blood-bank/page.tsx`

**Purpose:** Manage blood requests and view daily requirements

**API Endpoints to Use:**
```typescript
// Daily summary
GET /api/blood-requests/daily-summary?date=2025-12-15

// List requests
GET /api/blood-requests
GET /api/blood-requests?status=REQUESTED
GET /api/blood-requests?isEmergency=true

// Acknowledge request
POST /api/blood-requests/[id]/acknowledge
Body: { bloodBankNotes: "Processing request" }

// Update status
PATCH /api/blood-requests/[id]/status
Body: {
  status: 'IN_PREPARATION' | 'READY' | 'DELIVERED',
  crossMatchCompleted: true,
  bloodBankNotes: "Cross-match complete, 2 units ready"
}
```

**Key Components Needed:**
- Daily summary card showing:
  - Total requests and units
  - Emergency requests count
  - Status breakdown (pie chart)
  - Blood type distribution
- Request list with:
  - Emergency requests highlighted (RED)
  - Patient info
  - Blood type, Rh factor, units
  - Surgery time
  - Current status
  - Actions (Acknowledge, Update Status)
- Status update modal
- Cross-match checklist

**Sample Data Structure:**
```typescript
interface BloodRequest {
  id: string;
  patientName: string;
  folderNumber: string;
  bloodType: string; // A, B, AB, O
  rhFactor: string; // Positive, Negative
  unitsRequested: number;
  bloodProducts: string; // JSON array
  scheduledSurgeryDate: string;
  surgeryType: 'ELECTIVE' | 'URGENT' | 'EMERGENCY';
  isEmergency: boolean;
  procedureName: string;
  status: 'REQUESTED' | 'ACKNOWLEDGED' | 'IN_PREPARATION' | 'READY' | 'DELIVERED';
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  crossMatchRequired: boolean;
  crossMatchCompleted: boolean;
  requestedBy: { fullName: string };
  acknowledgedBy?: { fullName: string };
}

interface DailySummary {
  date: string;
  summary: {
    totalRequests: number;
    totalUnitsRequested: number;
    emergencyRequests: number;
    byStatus: {
      requested: number;
      acknowledged: number;
      inPreparation: number;
      ready: number;
      delivered: number;
    };
    byBloodType: Record<string, number>; // "A+": 4, "O-": 2
    byUrgency: {
      routine: number;
      urgent: number;
      emergency: number;
    };
  };
  requests: BloodRequest[];
}
```

---

### 4. Emergency Alert TV Display
**Path:** `/src/app/dashboard/emergency-alerts/display/page.tsx`

**Purpose:** Full-screen display for smart TVs showing active emergency alerts

**API Endpoints to Use:**
```typescript
// Get active alerts for TV display
GET /api/emergency-alerts?activeOnly=true&displayOnTv=true

// Auto-refresh every 10 seconds
```

**Key Features:**
- Full-screen layout (no header/sidebar)
- Auto-refresh every 10 seconds
- Large, bold typography
- Color-coded by priority:
  - CRITICAL: Red background
  - HIGH: Orange background
  - MEDIUM: Yellow background
- Show multiple alerts if more than one
- Display:
  - "🚨 EMERGENCY SURGERY" header
  - Patient name and folder number
  - Procedure name
  - Indication
  - Surgeon name
  - Theatre assigned
  - Blood requirements (if any)
  - Special equipment needed
  - Time alert was triggered
  - Acknowledgment status

**Design Considerations:**
- Readable from 10+ feet away
- High contrast colors
- Minimal information, maximum clarity
- Flashing/pulsing animation for CRITICAL
- Sound alert on new emergency (optional)

**Sample Data Structure:**
```typescript
interface EmergencyAlert {
  id: string;
  patientName: string;
  folderNumber: string;
  age?: number;
  gender?: string;
  procedureName: string;
  surgicalUnit: string;
  indication: string;
  surgeonName: string;
  theatreName?: string;
  bloodRequired: boolean;
  bloodUnits?: number;
  specialEquipment?: string; // JSON array
  alertTriggeredAt: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  managerAcknowledged: boolean;
  anesthetistAcknowledged: boolean;
  nurseAcknowledged: boolean;
}
```

**Example Layout:**
```tsx
// Large, full-screen display
<div className="min-h-screen bg-red-600 text-white p-8">
  <div className="text-center">
    <h1 className="text-9xl font-bold mb-8 animate-pulse">
      🚨 EMERGENCY SURGERY
    </h1>
    <div className="text-6xl space-y-4">
      <p>Patient: {alert.patientName}</p>
      <p>Procedure: {alert.procedureName}</p>
      <p>Surgeon: {alert.surgeonName}</p>
      {alert.bloodRequired && (
        <p className="text-yellow-300">
          BLOOD REQUIRED: {alert.bloodUnits} units
        </p>
      )}
    </div>
  </div>
</div>
```

---

### 5. Enhanced Surgery Booking Form
**Path:** `/src/app/dashboard/surgeries/new/page.tsx` (Update existing)

**Additions Needed:**
- Emergency surgery checkbox
  - When checked, show alert that emergency alert will be triggered
- Blood transfusion section:
  - If needBloodTransfusion is true, show:
    - Blood type selector
    - Rh factor selector
    - Units requested input
    - Create blood request checkbox
- After surgery creation:
  - If emergency, auto-create emergency alert
  - If blood request checked, redirect to blood request form

---

## 🎨 UI Component Patterns

### Status Badge Component
```tsx
// Reusable status badge
function StatusBadge({ status }: { status: string }) {
  const colors = {
    PENDING: 'bg-gray-200 text-gray-800',
    IN_PROGRESS: 'bg-blue-200 text-blue-800',
    APPROVED: 'bg-green-200 text-green-800',
    REJECTED: 'bg-red-200 text-red-800',
    REQUESTED: 'bg-yellow-200 text-yellow-800',
    READY: 'bg-green-200 text-green-800',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
```

### Emergency Badge Component
```tsx
function EmergencyBadge() {
  return (
    <span className="px-3 py-1 rounded-full text-sm font-bold bg-red-600 text-white animate-pulse">
      🚨 EMERGENCY
    </span>
  );
}
```

### Urgency Badge Component
```tsx
function UrgencyBadge({ urgency }: { urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY' }) {
  const colors = {
    ROUTINE: 'bg-gray-200 text-gray-800',
    URGENT: 'bg-orange-200 text-orange-800',
    EMERGENCY: 'bg-red-600 text-white font-bold',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm ${colors[urgency]}`}>
      {urgency}
    </span>
  );
}
```

---

## 🔔 Real-Time Updates

### Using SWR for Auto-Refresh
```typescript
import useSWR from 'swr';

// For TV display - refresh every 10 seconds
const { data: alerts } = useSWR(
  '/api/emergency-alerts?activeOnly=true',
  fetcher,
  { refreshInterval: 10000 }
);

// For dashboards - refresh every 30 seconds
const { data: prescriptions } = useSWR(
  '/api/prescriptions?needsPacking=true',
  fetcher,
  { refreshInterval: 30000 }
);
```

---

## 📱 Responsive Design

- **Desktop:** Full tables, multiple columns
- **Tablet:** Condensed tables, cards
- **Mobile:** Card-based layouts, stacked information
- **TV Display:** Full-screen, no scrolling

---

## 🎯 Key User Flows

### Anesthetist Creating Pre-Op Review
1. Navigate to pre-op reviews
2. Click "Create Review"
3. Select patient/surgery
4. Fill comprehensive form
5. Save as draft or submit
6. Wait for consultant approval
7. Once approved, create prescription

### Pharmacist Packing Prescriptions
1. View approved prescriptions list
2. Filter by today's surgeries
3. Click prescription to view details
4. Check medications against prescription
5. Click "Mark as Packed"
6. Add packing notes
7. Confirm - prescription marked PACKED

### Blood Bank Staff Managing Requests
1. View daily summary dashboard
2. See emergency requests highlighted
3. Acknowledge new requests
4. Update status as preparation progresses
5. Mark cross-match complete
6. Mark as READY when prepared
7. Mark DELIVERED when collected

---

## 🛠️ Helper Functions

### Parse Medications JSON
```typescript
function parseMedications(medicationsJson: string) {
  try {
    return JSON.parse(medicationsJson) as Medication[];
  } catch {
    return [];
  }
}
```

### Format Blood Type
```typescript
function formatBloodType(type: string, rhFactor: string) {
  return `${type}${rhFactor === 'Positive' ? '+' : '-'}`;
}
```

### Calculate Time Until Surgery
```typescript
function timeUntilSurgery(surgeryDate: string) {
  const now = new Date();
  const surgery = new Date(surgeryDate);
  const hours = Math.floor((surgery.getTime() - now.getTime()) / (1000 * 60 * 60));
  return hours;
}
```

---

## ✅ Testing Checklist

### Per Page
- [ ] Data loads correctly
- [ ] Filters work
- [ ] Forms validate properly
- [ ] Submit actions work
- [ ] Error handling displays
- [ ] Loading states show
- [ ] Empty states handled
- [ ] Responsive on all devices
- [ ] Accessibility (keyboard navigation, screen readers)

---

## 📚 Resources

- **API Documentation:** See inline comments in route files
- **Database Schema:** `prisma/schema.prisma`
- **Existing Patterns:** Reference `/dashboard/surgeries` or `/dashboard/inventory`
- **Complete Guide:** `ENHANCED_FEATURES_GUIDE.md`

---

## 🚀 Implementation Priority

1. **High Priority:**
   - Blood Bank Dashboard (patient safety)
   - Emergency Alert Display (critical)

2. **Medium Priority:**
   - Pharmacist Dashboard
   - Pre-Op Review Dashboard

3. **Low Priority (Can use existing forms initially):**
   - Enhanced surgery booking

---

**Note:** All API endpoints are fully functional and tested. Focus on creating intuitive, user-friendly interfaces that match the existing application design patterns.
