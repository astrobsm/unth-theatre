# Perioperative Workflow Module

## Overview
Comprehensive workflow system covering the entire surgical patient journey from pre-operative holding area through intra-operative care to post-operative recovery (PACU).

## Module Components

### 1. Pre-Operative Holding Area Module

**Purpose**: Standardized safety verification before theatre entry

**Key Features**:
- **Patient Identity Verification**
  - ID band check
  - Photo ID validation
  - Verbal confirmation
  - Family confirmation

- **Surgical Site Verification**
  - Site marking confirmation
  - Procedure confirmation
  - Laterality verification (left/right)

- **Consent Validation**
  - Consent form presence
  - Signature verification
  - Patient understanding confirmation

- **Allergy Status**
  - Allergy history check
  - Allergy band verification
  - Detailed allergy documentation

- **Fasting Status**
  - Fasting compliance check
  - Last oral intake time and type
  - NPO (nil per os) adherence

- **Vital Signs Monitoring**
  - Temperature
  - Heart rate
  - Blood pressure (systolic/diastolic)
  - Respiratory rate
  - Oxygen saturation
  - Blood glucose

- **Documentation Completeness**
  - Pre-operative assessment
  - Lab results
  - Imaging studies
  - ECG
  - Cross-match results
  - Anesthesia assessment
  - Medication chart

- **Pre-medications & IV Access**
  - Pre-medication administration
  - IV line establishment
  - Site documentation

**Red Alert Triggers**:
- Identity discrepancy
- Wrong site/procedure
- Missing consent
- Critical allergy not documented
- Fasting violation
- Abnormal vital signs
- Missing critical documentation
- Lab result abnormalities

**Workflow States**:
1. `ARRIVED` - Patient received in holding area
2. `VERIFICATION_IN_PROGRESS` - Safety checks ongoing
3. `DISCREPANCY_FOUND` - Issue detected
4. `RED_ALERT_ACTIVE` - Critical issue escalated
5. `CLEARED_FOR_THEATRE` - All checks passed
6. `TRANSFERRED_TO_THEATRE` - Patient transferred

**Notifications**:
- Surgeon notified on red alerts
- Anesthetist notified on red alerts
- Theatre coordinator notified on all alerts
- Automated alerts sent immediately upon discrepancy detection

---

### 2. Intra-Operative Documentation Module

**Purpose**: Comprehensive surgical event documentation

**Key Features**:

- **Theatre Entry**
  - Entry time logging
  - Patient positioning documentation
  - Surgical timeout confirmation

- **Anesthesia Documentation**
  - Anesthesia start time
  - Anesthesia type
  - Anesthetist and nurse anesthetist tracking
  - Anesthesia notes

- **Surgical Team Documentation**
  - Primary surgeon
  - Assistant surgeons (multiple)
  - Scrub nurse
  - Circulating nurse

- **Surgical Timing**
  - Knife-to-skin time (incision)
  - Procedure start/end times
  - Closure start/end times

- **Intraoperative Events Log**
  - Timestamped event logging
  - Complication documentation
  - Critical event recording

- **Specimens & Pathology**
  - Specimen collection tracking
  - Pathology details

- **Medications & Fluids**
  - Medications administered (JSON array)
  - Fluids administered with volumes
  - Blood products given
  - Blood product details

- **Surgical Count Verification**
  - Instrument count
  - Swab count
  - Needle count
  - Discrepancy documentation

- **Drains & Devices**
  - Drains inserted (types and locations)
  - Catheter insertion
  - Catheter type documentation

- **Blood Loss & Output**
  - Estimated blood loss (mL)
  - Urine output (mL)

- **PACU Transfer**
  - Transfer time to PACU
  - Handover to recovery nurse

**Role-Specific Access**:
- Surgeon: Full procedure documentation
- Anesthetist: Anesthesia management
- Nurse Anesthetist: Anesthetic support documentation
- Scrub Nurse: Instrument/swab counts, specimens
- Circulating Nurse: Event logging, medication administration

---

### 3. Post-Operative Recovery (PACU) Module

**Purpose**: Recovery monitoring until discharge criteria met

**Key Features**:

- **PACU Entry Assessment**
  - Admission time
  - Receiving nurse documentation
  - Handover from theatre/anesthetist

- **Consciousness Monitoring**
  - Levels: FULLY_AWAKE, DROWSY_BUT_ROUSABLE, SEDATED, UNCONSCIOUS, UNRESPONSIVE
  - Continuous assessment
  - Alertness tracking

- **Airway Management**
  - Status: PATENT, MAINTAINED, COMPROMISED, INTUBATED, OXYGEN_THERAPY
  - Breathing pattern documentation
  - Oxygen therapy tracking
  - Oxygen flow rate

- **Cardiovascular Assessment**
  - Heart rate
  - Blood pressure
  - Peripheral perfusion
  - Capillary refill time

- **Pain Management**
  - Pain score (0-10 scale)
  - Pain location
  - Pain control adequacy
  - Analgesic administration

- **Surgical Site Assessment**
  - Surgical site condition
  - Dressing integrity
  - Drain presence and output
  - Bleeding monitoring

- **Fluid Balance**
  - IV fluids running
  - Fluid type and rate
  - Urine output
  - Catheter status

- **Temperature Monitoring**
  - Temperature on admission
  - Normothermia status
  - Warming measures if needed

- **Nausea & Vomiting**
  - Nausea presence
  - Vomiting occurrence
  - Antiemetic administration

- **Vital Signs Tracking**
  - Continuous monitoring with timestamps
  - Multiple recordings per patient
  - Recorded by nurse with ID
  - Intervention documentation

**Discharge Criteria**:
1. `NOT_READY` - Patient requires continued monitoring
2. `READY_WITH_CONCERNS` - Stable but needs close observation
3. `READY_FOR_WARD` - Meets all discharge criteria
4. `DISCHARGED_TO_WARD` - Patient transferred to ward

**Discharge Checklist**:
- ✓ Vitals stable
- ✓ Pain controlled
- ✓ Fully conscious
- ✓ Nausea-free
- ✓ Warning signs explained to ward nurse

**Red Alert Triggers in PACU**:
- Unresponsive consciousness level
- Compromised airway
- Severe pain (score > 8)
- Heavy bleeding from surgical site
- Abnormal vital signs (HR, BP, SpO2, Temperature)
- Severe nausea/vomiting
- Catheter issues
- Unexpected complications

**Notifications**:
- Surgeon notified on red alerts
- Anesthetist notified on critical vitals
- Ward notified before discharge
- Family notified as per protocol

---

## Red Alert System

### Alert Types
1. `IDENTITY_MISMATCH` - Patient identity discrepancy
2. `WRONG_SITE` - Surgical site marking error
3. `CONSENT_ISSUE` - Missing or invalid consent
4. `ALLERGY_CONCERN` - Critical allergy not documented
5. `FASTING_VIOLATION` - Inadequate fasting period
6. `ABNORMAL_VITALS` - Critical vital sign abnormality
7. `MISSING_RESULTS` - Critical lab/imaging missing
8. `MEDICATION_ERROR` - Drug administration error
9. `COUNT_DISCREPANCY` - Surgical count mismatch
10. `POSTOP_COMPLICATION` - Post-operative emergency

### Alert Severity Levels
- **LOW**: Minor discrepancy, easily resolved
- **MEDIUM**: Requires attention, non-urgent
- **HIGH**: Urgent attention needed
- **CRITICAL**: Immediate intervention required

### Alert Workflow
1. **Detection**: System or nurse identifies discrepancy
2. **Trigger**: Red alert automatically created
3. **Notification**: Relevant team members notified immediately
4. **Acknowledgment**: Receiving staff acknowledge alert
5. **Resolution**: Issue addressed and documented
6. **Closure**: Alert marked resolved with action details

### Notification Recipients
- **Holding Area Alerts**: Surgeon, Anesthetist, Theatre Coordinator
- **PACU Alerts**: Surgeon, Anesthetist, Ward Nurse, Theatre Coordinator

---

## User Roles & Permissions

### New Roles Added
1. **NURSE_ANAESTHETIST**
   - Anesthetic support documentation
   - Medication administration logging
   - Vital signs monitoring

2. **HOLDING_AREA_NURSE**
   - Pre-operative assessment
   - Safety verification
   - Red alert triggering
   - Theatre clearance

3. **RECOVERY_ROOM_NURSE**
   - PACU admission assessment
   - Continuous monitoring
   - Vital signs recording
   - Discharge criteria evaluation
   - Red alert triggering

4. **THEATRE_COORDINATOR**
   - Workflow oversight
   - Red alert monitoring
   - Resource coordination
   - Schedule management

---

## Database Models

### HoldingAreaAssessment
- Patient verification checklist
- 40+ verification fields
- Red alert management
- Transfer authorization
- Full audit trail

### HoldingAreaRedAlert
- Alert type and severity
- Notification tracking
- Acknowledgment workflow
- Resolution documentation

### IntraOperativeRecord
- Complete surgical event log
- Team documentation
- Timing metrics
- Medication/fluid tracking
- Surgical count verification
- Specimen tracking

### PACUAssessment
- Comprehensive recovery assessment
- Consciousness and airway monitoring
- Pain and vital signs tracking
- Discharge readiness evaluation
- 50+ assessment fields

### PACUVitalSigns
- Timestamped vital recordings
- Multiple entries per patient
- Nurse accountability
- Intervention documentation

### PACURedAlert
- Recovery room alerts
- Multi-recipient notification
- Resolution tracking

---

## Implementation Phases

### Phase 1: Holding Area Module (Week 1-2)
- [ ] Create holding area assessment form UI
- [ ] Implement safety verification checklist
- [ ] Build red alert triggering logic
- [ ] Create notification system
- [ ] Develop API endpoints

### Phase 2: Intra-Operative Module (Week 3-4)
- [ ] Create surgical event logging UI
- [ ] Implement team documentation
- [ ] Build medication/fluid tracking
- [ ] Develop surgical count verification
- [ ] Create API endpoints

### Phase 3: PACU Module (Week 5-6)
- [ ] Create PACU admission form
- [ ] Implement vital signs tracking interface
- [ ] Build continuous monitoring dashboard
- [ ] Develop discharge criteria checklist
- [ ] Create API endpoints

### Phase 4: Red Alert System (Week 7)
- [ ] Implement real-time notification service
- [ ] Build alert acknowledgment workflow
- [ ] Create alert dashboard
- [ ] Develop escalation logic

### Phase 5: Integration & Testing (Week 8)
- [ ] End-to-end workflow testing
- [ ] Role-based access verification
- [ ] Performance optimization
- [ ] User acceptance testing

---

## API Endpoints

### Holding Area
- `POST /api/holding-area` - Create assessment
- `GET /api/holding-area/:id` - Get assessment
- `PUT /api/holding-area/:id` - Update assessment
- `POST /api/holding-area/:id/clear` - Clear for theatre
- `POST /api/holding-area/:id/alert` - Trigger red alert
- `GET /api/holding-area/active` - Get active patients

### Intra-Operative
- `POST /api/intraoperative` - Create record
- `GET /api/intraoperative/:id` - Get record
- `PUT /api/intraoperative/:id` - Update record
- `POST /api/intraoperative/:id/event` - Log event
- `POST /api/intraoperative/:id/medication` - Log medication
- `GET /api/intraoperative/active` - Active surgeries

### PACU
- `POST /api/pacu` - Create assessment
- `GET /api/pacu/:id` - Get assessment
- `PUT /api/pacu/:id` - Update assessment
- `POST /api/pacu/:id/vitals` - Record vital signs
- `POST /api/pacu/:id/alert` - Trigger red alert
- `POST /api/pacu/:id/discharge` - Discharge patient
- `GET /api/pacu/active` - Active patients

### Red Alerts
- `GET /api/alerts/active` - All active alerts
- `POST /api/alerts/:id/acknowledge` - Acknowledge alert
- `POST /api/alerts/:id/resolve` - Resolve alert
- `GET /api/alerts/history` - Alert history

---

## Safety Features

### Verification Checkpoints
1. **Pre-operative**: 15+ verification items before theatre entry
2. **Intra-operative**: Surgical timeout and count verification
3. **Post-operative**: Discharge criteria checklist

### Automated Red Alerts
- Instant notification on discrepancies
- Multi-recipient distribution
- Acknowledgment tracking
- Resolution documentation

### Audit Trails
- All assessments timestamped
- User accountability for all entries
- Complete change history
- Medico-legal compliance

### Data Integrity
- Required field validation
- Enum-based data consistency
- Relational integrity constraints
- Unique patient assessments per surgery

---

## Reporting & Analytics

### Available Reports
1. **Holding Area Performance**
   - Average verification time
   - Red alert frequency
   - Common discrepancies
   - Clearance rate

2. **Intra-Operative Metrics**
   - Knife-to-skin times
   - Surgical duration analysis
   - Complication rates
   - Team efficiency

3. **PACU Analytics**
   - Average recovery time
   - Discharge readiness trends
   - Red alert patterns
   - Pain management effectiveness

4. **Red Alert Dashboard**
   - Alert frequency by type
   - Response times
   - Resolution rates
   - Trend analysis

---

## Next Steps

1. **Immediate Actions**
   - ✅ Database schema updated
   - ✅ Prisma client generated
   - ✅ Models documented
   - [ ] Create UI components
   - [ ] Build API endpoints
   - [ ] Implement notification service

2. **Development Priorities**
   - Holding area module (highest priority - patient safety)
   - Red alert notification system
   - PACU monitoring interface
   - Intra-operative documentation

3. **Testing Requirements**
   - Unit tests for all API endpoints
   - Integration tests for workflow
   - User acceptance testing with clinical staff
   - Security and access control validation

4. **Training Materials**
   - User guides for each role
   - Video tutorials
   - Quick reference cards
   - Safety protocol documentation

---

## Technical Specifications

### Database Schema
- **4 new models**: HoldingAreaAssessment, IntraOperativeRecord, PACUAssessment, PACUVitalSigns
- **2 red alert models**: HoldingAreaRedAlert, PACURedAlert
- **5 new enums**: HoldingAreaStatus, PACUDischargeReadiness, ConsciousnessLevel, AirwayStatus, RedAlertType
- **4 new user roles**: NURSE_ANAESTHETIST, HOLDING_AREA_NURSE, RECOVERY_ROOM_NURSE, THEATRE_COORDINATOR

### Relations
- Surgery → HoldingAreaAssessment (one-to-one)
- Surgery → IntraOperativeRecord (one-to-one)
- Surgery → PACUAssessment (one-to-one)
- Patient → HoldingAreaAssessment (one-to-many)
- Patient → PACUAssessment (one-to-many)
- PACUAssessment → PACUVitalSigns (one-to-many)
- PACUAssessment → PACURedAlert (one-to-many)
- HoldingAreaAssessment → HoldingAreaRedAlert (one-to-many)

### Performance Considerations
- Index on surgeryId for quick lookups
- Index on status fields for filtering
- Pagination for vital signs history
- Caching for active patients lists
- Real-time updates via WebSocket (future)

---

## Compliance & Standards

### WHO Surgical Safety Checklist Integration
- Pre-operative holding area checks align with WHO Sign In
- Intra-operative timeout aligns with WHO Time Out
- PACU checks align with WHO Sign Out

### Data Protection
- HIPAA compliance considerations
- Patient data encryption
- Audit trail for all access
- Role-based data access

### Clinical Standards
- Vital signs normal ranges defined
- Pain assessment using validated scale (0-10)
- Consciousness levels using standard terminology
- Airway status using clinical classifications

---

## Support & Maintenance

### Monitoring
- Red alert response times
- System availability
- API performance metrics
- User adoption rates

### Maintenance Tasks
- Regular data backups
- Performance optimization
- User feedback integration
- Feature enhancements based on clinical needs

### Support Channels
- Technical support for IT issues
- Clinical support for workflow questions
- Training sessions for new staff
- Documentation updates

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Status**: Schema Implemented ✅ | UI Pending ⏳ | API Pending ⏳
