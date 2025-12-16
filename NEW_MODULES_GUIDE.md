# New Roles and Modules Implementation Guide

## Overview
This document provides a comprehensive guide to the newly implemented roles, modules, and features in the Operative Resource Manager system.

## New User Roles

### 1. Blood Bank Staff (`BLOODBANK_STAFF`)
**Responsibilities:**
- Receive and process blood product requests for surgeries
- Monitor daily blood requirements
- Update blood request statuses
- Prepare blood products for collection
- Handle emergency blood requests

**Dashboard Access:** `/dashboard/blood-bank`

**Permissions:**
- View all blood requests
- Update blood request statuses
- Filter by urgency and date
- View patient blood types and requirements

### 2. Pharmacist (`PHARMACIST`)
**Responsibilities:**
- Review approved anesthetic prescriptions
- Pack medications for upcoming surgeries
- Verify medication preparation
- Track medication status
- Manage emergency drug requirements

**Dashboard Access:** `/dashboard/prescriptions`

**Permissions:**
- View approved prescriptions
- Mark prescriptions as packed
- Add packing notes
- Filter by status and date
- View medication details and special instructions

### 3. Consultant Anaesthetist (`CONSULTANT_ANAESTHETIST`)
**Responsibilities:**
- Review and approve pre-operative anesthetic assessments
- Approve anesthetic prescriptions created by resident anesthetists
- Supervise anesthetic care protocols
- Provide senior oversight for complex cases

**Dashboard Access:** Same as regular anesthetist with additional approval permissions

**Permissions:**
- All permissions of regular ANAESTHETIST role
- Approve pre-operative reviews
- Approve anesthetic prescriptions
- Distinguished identity for approval workflows

## New Modules

### 1. Pre-Operative Anesthetic Reviews

**Purpose:** Enable anesthetists to conduct comprehensive pre-operative assessments

**Features:**
- Patient vital signs documentation (BP, HR, Temperature, SpO2, RR)
- Airway assessment (Mallampati score, neck mobility, mouth opening, dentition)
- Cardiovascular and respiratory system evaluation
- ASA classification
- Anesthetic plan formulation
- Risk assessment
- Consultant approval workflow

**User Flow:**
1. Anesthetist creates pre-op review for scheduled surgery
2. Documents all patient assessments and vital signs
3. Formulates anesthetic plan
4. Consultant anesthetist reviews and approves
5. Review becomes part of surgical record

**API Endpoints:**
- `GET /api/preop-reviews` - List all reviews
- `POST /api/preop-reviews` - Create new review
- `GET /api/preop-reviews/[id]` - Get specific review
- `PUT /api/preop-reviews/[id]` - Update review
- `POST /api/preop-reviews/[id]/approve` - Approve review (consultant only)
- `DELETE /api/preop-reviews/[id]` - Delete review

**Dashboard:** `/dashboard/preop-reviews`

### 2. Anesthetic Prescriptions

**Purpose:** Structured prescription system for anesthetic medications

**Features:**
- Medication list with dosing, route, frequency, and timing
- IV fluids prescription
- Emergency drugs preparation list
- Allergy alerts
- Special instructions
- Urgency levels (ROUTINE, URGENT, EMERGENCY)
- Consultant approval workflow
- Pharmacist packing status

**User Flow:**
1. Anesthetist creates prescription for scheduled surgery
2. Adds medications, fluids, and emergency drugs
3. Marks allergy alerts and special requirements
4. Consultant anesthetist approves
5. Pharmacist packs medications
6. Ready for surgery

**API Endpoints:**
- `GET /api/prescriptions` - List all prescriptions
- `POST /api/prescriptions` - Create new prescription
- `GET /api/prescriptions/[id]` - Get specific prescription
- `PUT /api/prescriptions/[id]` - Update prescription
- `POST /api/prescriptions/[id]/approve` - Approve prescription (consultant only)
- `POST /api/prescriptions/[id]/pack` - Mark as packed (pharmacist only)
- `DELETE /api/prescriptions/[id]` - Delete prescription

**Dashboards:**
- `/dashboard/preop-reviews` - Anesthetist view
- `/dashboard/prescriptions` - Pharmacist view

### 3. Blood Bank Alert System

**Purpose:** Automated blood product request and preparation system

**Features:**
- Blood type and product specification
- Units required tracking
- Crossmatch requirements
- Clinical indication documentation
- Urgency levels (ROUTINE, URGENT, EMERGENCY)
- Special requirements notation
- Estimated time needed
- Status tracking (PENDING, PROCESSING, READY, ISSUED, CANCELLED)
- Daily surgery schedule view

**User Flow:**
1. Surgeon/Anesthetist creates blood request for surgery
2. Specifies blood type, products, units, and urgency
3. Blood bank staff receives alert
4. Blood bank processes request
5. Updates status as products are prepared
6. Marks as READY when available for collection
7. Issues blood products to theatre

**API Endpoints:**
- `GET /api/blood-requests` - List all blood requests
- `POST /api/blood-requests` - Create new request
- `GET /api/blood-requests/[id]` - Get specific request
- `PUT /api/blood-requests/[id]` - Update request
- `POST /api/blood-requests/[id]/status` - Update status (blood bank staff only)
- `DELETE /api/blood-requests/[id]` - Delete request

**Dashboard:** `/dashboard/blood-bank`

**Query Parameters:**
- `?date=YYYY-MM-DD` - Filter by surgery date
- `?urgency=EMERGENCY,URGENT` - Filter by urgency
- `?status=PENDING,PROCESSING` - Filter by status

### 4. Emergency Surgery Alert System

**Purpose:** Robust alert system for emergency surgical cases with TV display

**Features:**
- High-priority alert creation
- Priority levels (CRITICAL, URGENT, EMERGENCY)
- Patient demographics and medical information
- Procedure and surgeon details
- Blood type display
- Allergy alerts
- Special requirements
- Status tracking (ACTIVE, ACKNOWLEDGED, IN_THEATRE, RESOLVED)
- Smart TV display with auto-refresh
- Large, high-contrast display
- Priority-based color coding

**User Flow:**
1. Theatre staff creates emergency alert for urgent case
2. Enters all critical patient and procedure information
3. Alert displays on management dashboard
4. Alert broadcasts to TV display in theatre
5. Staff acknowledges alert
6. Updates status as patient moves through system
7. Marks as resolved when complete

**API Endpoints:**
- `GET /api/emergency-alerts` - List all alerts
- `POST /api/emergency-alerts` - Create new alert
- `GET /api/emergency-alerts/[id]` - Get specific alert
- `PUT /api/emergency-alerts/[id]` - Update alert
- `POST /api/emergency-alerts/[id]/status` - Update status
- `POST /api/emergency-alerts/[id]/acknowledge` - Acknowledge alert
- `DELETE /api/emergency-alerts/[id]` - Delete alert

**Dashboards:**
- `/dashboard/emergency-alerts` - Management view with status controls
- `/dashboard/emergency-alerts/display` - Full-screen TV display

**TV Display Features:**
- Auto-refresh every 10 seconds
- Full-screen layout optimized for smart TVs
- Extra-large typography for visibility
- Color-coded by priority (red, orange, yellow)
- Animated status indicators
- Prominent allergy alerts
- Real-time clock display
- Active alert count

## Database Schema

### New Tables

#### 1. `preoperative_anesthetic_reviews`
```sql
- id (String, PK)
- surgeryId (String, FK)
- patientName (String)
- age (Int)
- gender (String)
- vitalSigns (JSON)
- airwayAssessment (JSON)
- cardiovascularAssessment (String)
- respiratoryAssessment (String)
- otherSystemsAssessment (String)
- asaClassification (Enum)
- anestheticPlan (String)
- specialConsiderations (String)
- riskLevel (Enum)
- status (Enum: PENDING, APPROVED, REJECTED)
- reviewedById (String, FK to User)
- approvedById (String?, FK to User)
- approvedAt (DateTime?)
- reviewNotes (String?)
- createdAt (DateTime)
- updatedAt (DateTime)
```

#### 2. `anesthetic_prescriptions`
```sql
- id (String, PK)
- surgeryId (String, FK)
- patientName (String)
- scheduledSurgeryDate (DateTime)
- medications (JSON)
- fluids (String?)
- emergencyDrugs (String?)
- allergyAlerts (String?)
- specialInstructions (String?)
- urgency (Enum: ROUTINE, URGENT, EMERGENCY)
- status (Enum: PENDING, APPROVED, REJECTED, PACKED)
- prescribedById (String, FK to User)
- approvedById (String?, FK to User)
- approvedAt (DateTime?)
- packedById (String?, FK to User)
- packedAt (DateTime?)
- prescriptionNotes (String?)
- createdAt (DateTime)
- updatedAt (DateTime)
```

#### 3. `blood_requests`
```sql
- id (String, PK)
- surgeryId (String, FK)
- patientName (String)
- bloodType (String)
- bloodProducts (JSON)
- unitsRequired (Int)
- urgency (Enum: ROUTINE, URGENT, EMERGENCY)
- crossmatchRequired (Boolean)
- specialRequirements (String?)
- clinicalIndication (String)
- status (Enum: PENDING, PROCESSING, READY, ISSUED, CANCELLED)
- estimatedTimeNeeded (String)
- requestedById (String, FK to User)
- createdAt (DateTime)
- updatedAt (DateTime)
```

#### 4. `emergency_surgery_alerts`
```sql
- id (String, PK)
- surgeryId (String?, FK)
- patientName (String)
- age (Int)
- gender (String)
- procedureName (String)
- surgeonName (String)
- diagnosis (String)
- priority (Enum: CRITICAL, URGENT, EMERGENCY)
- estimatedDuration (String)
- bloodType (String?)
- specialRequirements (String?)
- allergies (String?)
- status (Enum: ACTIVE, ACKNOWLEDGED, IN_THEATRE, RESOLVED, CANCELLED)
- createdById (String, FK to User)
- acknowledgedById (String?, FK to User)
- acknowledgedAt (DateTime?)
- createdAt (DateTime)
- updatedAt (DateTime)
```

#### 5. `tv_alert_display_logs`
```sql
- id (String, PK)
- alertId (String, FK)
- displayedAt (DateTime)
- displayDuration (Int)
- viewedBy (String?)
```

## Role-Based Access Control

### Permission Matrix

| Feature | Anesthetist | Consultant Anesthetist | Pharmacist | Blood Bank Staff | Theatre Manager | Admin |
|---------|------------|----------------------|------------|-----------------|----------------|-------|
| Create Pre-op Review | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |
| Approve Pre-op Review | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| Create Prescription | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |
| Approve Prescription | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| Pack Prescription | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ |
| Create Blood Request | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| Update Blood Status | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Create Emergency Alert | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |
| Update Emergency Status | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |
| View TV Display | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Installation & Setup

### 1. Database Migration
```bash
npx prisma generate
npx prisma db push
```

### 2. Create New Role Users

**Blood Bank Staff:**
```sql
INSERT INTO users (id, email, full_name, role, password_hash)
VALUES (gen_random_uuid(), 'bloodbank@unth.edu.ng', 'Blood Bank Staff', 'BLOODBANK_STAFF', '<hashed_password>');
```

**Pharmacist:**
```sql
INSERT INTO users (id, email, full_name, role, password_hash)
VALUES (gen_random_uuid(), 'pharmacy@unth.edu.ng', 'Theatre Pharmacist', 'PHARMACIST', '<hashed_password>');
```

**Consultant Anaesthetist:**
```sql
INSERT INTO users (id, email, full_name, role, password_hash)
VALUES (gen_random_uuid(), 'consultant.anaesth@unth.edu.ng', 'Dr. Consultant Anaesthetist', 'CONSULTANT_ANAESTHETIST', '<hashed_password>');
```

### 3. Navigation Menu Updates

The following dashboard links are automatically added based on user roles:

**Anesthetists & Consultant Anesthetists:**
- Pre-Operative Reviews (`/dashboard/preop-reviews`)

**Pharmacists:**
- Anesthetic Prescriptions (`/dashboard/prescriptions`)

**Blood Bank Staff:**
- Blood Requests (`/dashboard/blood-bank`)

**All Theatre Staff:**
- Emergency Alerts (`/dashboard/emergency-alerts`)
- Emergency TV Display (`/dashboard/emergency-alerts/display`)

## Usage Guidelines

### For Anesthetists

1. **Pre-Operative Assessment:**
   - Review patient scheduled for surgery
   - Navigate to Pre-Op Reviews
   - Click "New Review"
   - Complete all assessment sections
   - Document vital signs and airway assessment
   - Formulate anesthetic plan
   - Submit for consultant approval

2. **Creating Prescriptions:**
   - Access patient's surgical record
   - Create new prescription
   - Add all required medications with dosing
   - Specify IV fluids and emergency drugs
   - Mark any allergy alerts
   - Set urgency level
   - Submit for consultant approval

3. **Blood Requests:**
   - Assess need for blood products
   - Create blood request
   - Specify blood type and products
   - Set urgency and crossmatch requirements
   - Document clinical indication
   - Submit to blood bank

### For Consultant Anesthetists

1. **Reviewing Assessments:**
   - Access Pre-Op Reviews dashboard
   - Filter by "Pending Approval"
   - Review resident's assessment
   - Approve or request modifications
   - Add consultant notes if needed

2. **Approving Prescriptions:**
   - Review prescription details
   - Verify medication appropriateness
   - Check for drug interactions
   - Approve prescription
   - Pharmacist can then pack medications

### For Pharmacists

1. **Packing Medications:**
   - Access Prescriptions dashboard
   - View "Needs Packing" tab
   - Review approved prescriptions
   - Prepare all medications
   - Click "Mark as Packed"
   - Add packing notes if needed
   - Status updates to PACKED

2. **Priority Management:**
   - Emergency cases show first
   - Color-coded by urgency
   - Time until surgery displayed
   - Allergy alerts prominently shown

### For Blood Bank Staff

1. **Processing Requests:**
   - Access Blood Bank dashboard
   - View Today's Surgeries or Urgent requests
   - Review blood product requirements
   - Update status to PROCESSING
   - Prepare blood products
   - Perform crossmatch if required
   - Mark as READY when complete

2. **Emergency Handling:**
   - Emergency requests animate and highlighted
   - Auto-sorted by urgency
   - Time until surgery countdown
   - Special requirements clearly displayed

### For Theatre Management

1. **Emergency Alerts:**
   - Create alert for emergency case
   - Enter all patient details
   - Set priority level (CRITICAL/URGENT/EMERGENCY)
   - Include allergy and special requirements
   - Alert displays on TV and dashboard
   - Update status as case progresses

2. **TV Display Setup:**
   - Open `/dashboard/emergency-alerts/display` on smart TV
   - Set browser to full-screen (F11)
   - Display auto-refreshes every 10 seconds
   - Shows all active emergency cases
   - Priority-based color coding
   - Large text for easy reading

## Testing Checklist

### Pre-Operative Reviews
- [ ] Create new review as anesthetist
- [ ] All fields save correctly
- [ ] Consultant can see pending reviews
- [ ] Approval workflow functions
- [ ] Status updates correctly
- [ ] Review appears in surgery record

### Prescriptions
- [ ] Create prescription as anesthetist
- [ ] Medications JSON structure correct
- [ ] Consultant approval works
- [ ] Pharmacist can view approved prescriptions
- [ ] Pack function works correctly
- [ ] Status transitions properly

### Blood Requests
- [ ] Create blood request
- [ ] Blood bank staff sees alert
- [ ] Filter by date works
- [ ] Filter by urgency works
- [ ] Status updates save
- [ ] Emergency requests highlighted

### Emergency Alerts
- [ ] Create emergency alert
- [ ] Alert shows on dashboard
- [ ] Alert displays on TV view
- [ ] Auto-refresh works (10s)
- [ ] Priority color coding correct
- [ ] Status updates work
- [ ] Acknowledgment functions
- [ ] Time display accurate

## Troubleshooting

### Issue: Permissions Denied
**Solution:** Verify user role in database matches required permission level

### Issue: TV Display Not Updating
**Solution:** Check browser console for errors, ensure `/api/emergency-alerts` endpoint accessible

### Issue: Prescription Medications Not Saving
**Solution:** Ensure medications array follows JSON structure: `[{name, dose, route, frequency, timing}]`

### Issue: Blood Request Filters Not Working
**Solution:** Verify query parameters format matches API expectations

## Future Enhancements

1. **Mobile App Integration** - Push notifications for emergency alerts
2. **Barcode Scanning** - Medication verification during packing
3. **Inventory Integration** - Auto-check medication availability
4. **Blood Bank Inventory** - Real-time blood product stock levels
5. **Analytics Dashboard** - Usage statistics and trends
6. **Automated Reporting** - Daily summaries for blood bank and pharmacy
7. **Voice Alerts** - Audio notifications for critical emergencies
8. **Multi-Language Support** - Interface localization

## Support

For technical support or questions:
- Email: tech.support@unth.edu.ng
- Extension: 2345
- IT Department: Main Hospital Block, 2nd Floor

## Changelog

### Version 2.0.0 (Current)
- Added Blood Bank Staff role
- Added Pharmacist role
- Added Consultant Anaesthetist role
- Implemented Pre-Operative Anesthetic Reviews module
- Implemented Anesthetic Prescriptions module
- Implemented Blood Bank Alert System
- Implemented Emergency Surgery Alert System with TV Display
- Added role-based permission controls
- Created dedicated dashboards for each role
- Implemented approval workflows

---

**Document Version:** 2.0.0  
**Last Updated:** December 2024  
**Maintained By:** ORM Development Team
