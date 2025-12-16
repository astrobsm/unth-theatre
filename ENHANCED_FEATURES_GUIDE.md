# Enhanced Theatre Manager Features - Implementation Guide

## Overview
This document outlines the new enhanced features added to the Theatre Manager system for the University of Nigeria Teaching Hospital Ituku Ozalla.

## New User Roles

### 1. Blood Bank Staff
**Role:** `BLOODBANK_STAFF`

**Responsibilities:**
- Receive and acknowledge blood requests from surgeons/anesthetists
- Prepare blood products for scheduled surgeries
- Manage cross-matching procedures
- Track blood inventory for daily surgical requirements
- Respond to emergency blood requests with priority alerts

**Dashboard:** `/dashboard/blood-bank`

**Key Features:**
- View daily blood requirements summary
- Acknowledge blood requests
- Update blood preparation status
- Mark blood as ready for collection
- Track emergency blood requests

### 2. Pharmacist
**Role:** `PHARMACIST`

**Responsibilities:**
- Review approved anesthetic prescriptions
- Pack medications ahead of surgery time
- Manage medication inventory
- Ensure medications are ready for anesthetists
- Track prescription fulfillment

**Dashboard:** `/dashboard/prescriptions`

**Key Features:**
- View approved prescriptions needing packing
- Mark prescriptions as packed
- Add packing notes
- Track medication inventory
- View upcoming surgery schedules

---

## New Modules

### 1. Pre-Operative Anesthetic Review Module

#### Purpose
Allows anesthetists to conduct comprehensive pre-operative reviews of patients scheduled for surgery, creating detailed anesthetic assessments and plans.

#### Workflow

1. **Review Creation (Anesthetist - Resident/Registrar)**
   - Access patient scheduled for surgery
   - Create pre-operative anesthetic review
   - Document patient history:
     - Current medications
     - Allergies
     - Comorbidities
     - Previous anesthesia experience
   - Conduct physical examination:
     - Vital signs (BP, HR, RR, Temperature)
     - Weight, Height, BMI
     - Airway assessment (Mallampati class)
   - Review laboratory results:
     - Hemoglobin, Platelet count
     - PT/INR, Creatinine
     - Electrolytes, Blood glucose
   - ASA classification
   - Propose anesthetic plan
   - Risk assessment

2. **Review Approval (Consultant Anesthetist)**
   - Review assessment completed by resident
   - Approve or request revisions
   - Add consultant notes
   - Final sign-off

#### API Endpoints

```
GET    /api/preop-reviews              - List all pre-op reviews
POST   /api/preop-reviews              - Create new review
GET    /api/preop-reviews/[id]         - Get specific review
PATCH  /api/preop-reviews/[id]         - Update review
DELETE /api/preop-reviews/[id]         - Delete review
POST   /api/preop-reviews/[id]/approve - Approve/reject review
```

#### Database Schema

**Table:** `preoperative_anesthetic_reviews`

**Key Fields:**
- Surgery and patient information
- Anesthetist (creator) and consultant (approver) details
- Clinical assessment data
- Physical examination findings
- Laboratory results
- ASA classification
- Anesthetic plan
- Risk assessment
- Approval status and timestamps

---

### 2. Anesthetic Prescription Module

#### Purpose
Enables anesthetists to create detailed medication prescriptions for surgeries, which are approved by consultants and packed by pharmacists.

#### Workflow

1. **Prescription Creation (Anesthetist)**
   - Linked to pre-operative review
   - Specify medications with doses, routes, timing
   - List IV fluids
   - Include emergency drugs
   - Add special instructions
   - Highlight allergy alerts

2. **Prescription Approval (Consultant Anesthetist)**
   - Review medication list
   - Approve or reject prescription
   - Add approval notes
   - System automatically notifies pharmacists upon approval

3. **Medication Packing (Pharmacist)**
   - View approved prescriptions
   - Prepare medications ahead of surgery
   - Pack medications systematically
   - Add packing notes
   - Mark as ready
   - System notifies anesthetist when ready

#### API Endpoints

```
GET    /api/prescriptions              - List all prescriptions
POST   /api/prescriptions              - Create new prescription
POST   /api/prescriptions/[id]/approve - Approve/reject prescription
POST   /api/prescriptions/[id]/pack    - Mark as packed
```

#### Database Schema

**Table:** `anesthetic_prescriptions`

**Key Fields:**
- Link to pre-op review and surgery
- Prescriber and approver information
- Medications (JSON array with detailed info)
- Fluids and emergency drugs
- Urgency level
- Status (DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, DISPENSED, PACKED)
- Pharmacist who packed
- Packing notes and timestamps

---

### 3. Blood Request and Alert Module

#### Purpose
Streamlines blood product requests for surgeries with automated alerts to blood bank staff, especially for emergency cases.

#### Workflow

1. **Blood Request (Surgeon/Anesthetist)**
   - Request blood for scheduled surgery
   - Specify:
     - Blood type and Rh factor
     - Number of units
     - Blood products needed
     - Cross-match requirements
     - Urgency level
   - System automatically alerts blood bank staff
   - Emergency requests trigger RED ALERTS

2. **Blood Bank Response**
   - Staff receive notification (urgent for emergencies)
   - Acknowledge request
   - Begin preparation
   - Update cross-match status
   - Mark as ready when prepared
   - Track delivery

3. **Daily Blood Requirements**
   - View summary of all blood requests for the day
   - Organized by urgency and surgery time
   - Statistics by blood type
   - Status tracking for each request

#### API Endpoints

```
GET    /api/blood-requests                    - List all requests
POST   /api/blood-requests                    - Create new request
GET    /api/blood-requests/daily-summary      - Get daily summary
POST   /api/blood-requests/[id]/acknowledge   - Acknowledge request
PATCH  /api/blood-requests/[id]/status        - Update status
```

#### Database Schema

**Table:** `blood_requests`

**Key Fields:**
- Surgery and patient information
- Blood type, Rh factor, units requested
- Blood products (JSON array)
- Requesting physician
- Blood bank staff acknowledgment
- Preparation status and timestamps
- Cross-match information
- Urgency and priority levels
- Delivery tracking

#### Daily Summary Features

- Total requests and units
- Emergency requests count
- Status breakdown
- Blood type distribution
- Urgency classification
- Sorted by priority and surgery time

---

### 4. Emergency Surgery Alert Module

#### Purpose
Provides robust, high-visibility alerts when emergency surgeries are booked, ensuring all theatre staff are immediately aware and prepared.

#### Key Features

1. **Automatic Alert Triggering**
   - Triggered when surgery is marked as EMERGENCY
   - Creates RED ALERT notifications
   - Notifies ALL relevant theatre staff:
     - Theatre Manager & Chairman
     - Anesthetists
     - Scrub Nurses
     - Recovery Nurses
     - Store Keeper
     - Anaesthetic Technicians
     - Porters
     - Blood Bank Staff (if blood required)
     - Pharmacists

2. **Smart TV Display**
   - Full-screen alert on theatre TVs
   - Critical priority display
   - Shows:
     - Patient information
     - Procedure name
     - Indication
     - Surgeon name
     - Blood requirements
     - Special equipment needed
     - Estimated start time
   - Auto-hide after configurable time
   - Manual dismissal option

3. **Staff Acknowledgment Tracking**
   - Manager acknowledgment
   - Anesthetist acknowledgment
   - Nurse acknowledgment
   - Tracks all staff who acknowledged
   - Shows readiness status

4. **Automatic Blood Request**
   - If blood required, automatically creates blood request
   - Emergency priority
   - Immediate notification to blood bank

#### API Endpoints

```
GET    /api/emergency-alerts                  - List all alerts
POST   /api/emergency-alerts                  - Create new alert
POST   /api/emergency-alerts/[id]/acknowledge - Acknowledge alert
POST   /api/emergency-alerts/[id]/resolve     - Resolve alert
```

#### Database Schema

**Table:** `emergency_surgery_alerts`

**Key Fields:**
- Surgery and patient information
- Procedure details
- Surgeon information
- Alert status and priority
- Acknowledgment tracking by role
- Theatre assignment
- Blood requirements
- Special equipment needs
- TV display settings
- Resolution tracking

**Table:** `tv_alert_display_logs`

**Purpose:** Track what alerts were displayed on TV screens

**Key Fields:**
- Alert ID and type
- Display and dismissal timestamps
- Duration
- TV location
- Who dismissed the alert

---

## Integration Points

### 1. Surgery Booking Flow
When a surgery is booked:
- If marked as EMERGENCY → Trigger emergency alert automatically
- If blood transfusion needed → Option to create blood request immediately
- Anesthetist can create pre-op review
- Pre-op review can generate prescription

### 2. Notification System
Enhanced notification types:
- `RED_ALERT` - Emergency surgeries, critical blood requests
- `SYSTEM_ALERT` - Standard notifications
- Priority levels: CRITICAL, HIGH, MEDIUM, LOW

### 3. Role-Based Permissions

#### Anesthetist
- Create pre-op reviews
- Create prescriptions
- Approve reviews (if consultant)
- Approve prescriptions (if consultant)
- Request blood
- Trigger emergency alerts

#### Pharmacist
- View approved prescriptions
- Pack medications
- Update packing status
- View surgery schedules

#### Blood Bank Staff
- View all blood requests
- Acknowledge requests
- Update preparation status
- Track daily requirements
- Receive emergency alerts

---

## Migration and Setup

### 1. Database Migration

```bash
# Generate Prisma client with new schema
npx prisma generate

# Push schema changes to database
npx prisma db push

# Or create migration
npx prisma migrate dev --name add_enhanced_features
```

### 2. Create New User Accounts

```sql
-- Sample Blood Bank Staff
INSERT INTO users (username, email, password, "fullName", role, status)
VALUES ('bloodbank1', 'bloodbank@hospital.com', '$2b$10$...', 'Blood Bank Officer', 'BLOODBANK_STAFF', 'APPROVED');

-- Sample Pharmacist
INSERT INTO users (username, email, password, "fullName", role, status)
VALUES ('pharmacist1', 'pharmacy@hospital.com', '$2b$10$...', 'Chief Pharmacist', 'PHARMACIST', 'APPROVED');
```

### 3. Update Environment Variables

No new environment variables required. Uses existing database connection.

---

## User Interface Components (To Be Implemented)

### 1. Anesthetist Dashboard
- `/dashboard/preop-reviews`
- List of patients needing pre-op review
- Create/edit review forms
- View prescription status
- Surgery schedule

### 2. Pharmacist Dashboard
- `/dashboard/prescriptions`
- Approved prescriptions needing packing
- Packed prescriptions
- Medication inventory
- Daily packing schedule

### 3. Blood Bank Dashboard
- `/dashboard/blood-bank`
- Daily requirements summary
- Active requests
- Emergency requests (highlighted)
- Status tracking
- Cross-match management

### 4. Emergency Alert TV Display
- `/dashboard/emergency-alerts/display`
- Full-screen alert view
- Auto-refresh
- Priority-based display
- Large, clear typography
- Color-coded urgency

---

## Testing Checklist

### Pre-Op Review Module
- [ ] Anesthetist can create review
- [ ] All fields save correctly
- [ ] Consultant can approve/reject
- [ ] Notifications sent on approval/rejection
- [ ] Review links to surgery correctly

### Prescription Module
- [ ] Prescription creation works
- [ ] Approval workflow functions
- [ ] Pharmacist can mark as packed
- [ ] Notifications sent at each stage
- [ ] Status updates correctly

### Blood Request Module
- [ ] Blood request creation
- [ ] Blood bank receives alerts
- [ ] Emergency requests show RED ALERT
- [ ] Status updates work
- [ ] Daily summary calculates correctly

### Emergency Alert Module
- [ ] Alert triggers on emergency surgery
- [ ] All staff receive notifications
- [ ] TV display shows alert
- [ ] Acknowledgments track correctly
- [ ] Blood request auto-created if needed

---

## Best Practices

### 1. Pre-Operative Reviews
- Complete reviews at least 24 hours before surgery
- Get consultant approval before surgery day
- Update if patient condition changes

### 2. Prescriptions
- Create after pre-op review approval
- Allow 24-48 hours for pharmacist packing
- Include allergy information prominently
- Specify dosages clearly

### 3. Blood Requests
- Request blood as soon as surgery is scheduled
- For elective surgeries, request 2-3 days in advance
- Emergency requests: include detailed clinical indication
- Confirm cross-match requirements

### 4. Emergency Alerts
- Use only for true emergencies
- Provide complete information
- Update theatre assignment quickly
- Acknowledge alerts promptly
- Resolve when surgery starts

---

## Troubleshooting

### Issue: Pre-op review won't save
**Solution:** Check that all required fields are filled, especially surgery ID and patient information.

### Issue: Prescription not appearing for pharmacist
**Solution:** Ensure prescription status is "APPROVED". Pharmacists only see approved prescriptions.

### Issue: Blood bank staff not receiving alerts
**Solution:** 
1. Check user role is set to BLOODBANK_STAFF
2. Verify user status is APPROVED
3. Check notification settings

### Issue: Emergency alert not displaying
**Solution:**
1. Confirm surgery type is set to EMERGENCY
2. Check displayOnTv flag is true
3. Verify alert status is ACTIVE

---

## Future Enhancements

1. **Mobile App for Alerts**
   - Push notifications
   - Quick acknowledgment
   - Real-time updates

2. **Medication Barcode Scanning**
   - Scan medications during packing
   - Verify against prescription
   - Reduce errors

3. **Blood Inventory Integration**
   - Auto-check blood availability
   - Reserve units for surgeries
   - Expiry tracking

4. **Analytics Dashboard**
   - Pre-op review completion rates
   - Prescription turnaround time
   - Blood usage patterns
   - Emergency surgery statistics

---

## Support and Contact

For technical issues or questions about these features:
- **Theatre Manager:** Contact system administrator
- **Database Issues:** Check connection and Prisma logs
- **API Errors:** Review server logs and error messages
- **UI Issues:** Check browser console for errors

---

**Document Version:** 1.0  
**Last Updated:** December 15, 2025  
**System:** Theatre Manager - UNTH Ituku Ozalla
