# OPERATIVE RESOURCE MANAGER (ORM)
## University of Nigeria Teaching Hospital, Ituku Ozalla
### Theatre Management System — Executive Presentation

---

## THE PROBLEM WE ARE SOLVING

Operating theatres are the **most resource-intensive and high-risk departments** in any hospital. At UNTH Ituku Ozalla, with **13 operating theatres** and hundreds of staff across multiple specialties, the theatre complex faces daily challenges:

- **No centralised visibility** — The Theatre Chairman and managers cannot see what is happening across all 13 theatres in real time
- **Paper-based tracking** — Surgery schedules, equipment logs, consumable usage, and patient movements are tracked on paper, making them easy to lose and impossible to analyse
- **Inventory blind spots** — Items go missing between the main store and theatre sub-stores; nobody knows what was used, where, or by whom until it is too late
- **Safety compliance gaps** — WHO Surgical Safety Checklists are completed inconsistently; there is no digital audit trail
- **No accountability trail** — When something goes wrong, it is difficult to trace who did what, when, and where
- **Delayed communication** — Equipment faults, emergency cases, and low-stock alerts travel by word of mouth or phone calls, causing dangerous delays

---

## WHAT ORM DOES — AT A GLANCE

ORM is a **web and mobile application** (works on any phone, tablet, or computer with a browser) that digitises the **entire perioperative workflow** — from the moment a patient is listed for surgery to the moment they are discharged from recovery.

Every action is **logged, timestamped, and tied to a named staff member**.

---

## THE COMPLETE PATIENT JOURNEY — DIGITISED

```
 ┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
 │  1. PATIENT  │───▶│ 2. PRE-OP    │───▶│ 3. HOLDING   │───▶│ 4. THEATRE   │
 │  REGISTRATION│    │  ASSESSMENT  │    │    AREA      │    │  (SURGERY)   │
 └─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                    │
 ┌─────────────┐    ┌──────────────┐    ┌──────────────┐            │
 │ 7. REPORTS  │◀───│ 6. PATIENT   │◀───│ 5. PACU      │◀───────────┘
 │ & ANALYTICS │    │  TRANSFER    │    │  (RECOVERY)  │
 └─────────────┘    └──────────────┘    └──────────────┘
```

### Step by Step:

| # | Stage | What ORM Does |
|---|-------|---------------|
| 1 | **Patient Registration** | Record patient details, folder number, ward, gender, age. Each patient has a unique digital record |
| 2 | **Pre-Operative Assessment** | DVT risk scoring, bleeding risk, pressure sore risk, medication review (anticoagulants, antiplatelets, ACE inhibitors), anaesthetic review, prescriptions, blood bank requests |
| 3 | **Holding Area Reception** | Full digital checklist: patient identity verification (wristband, folder, operation list, ward slip), consent form check, nil per oral status, operation site marking, jewellery removal, denture removal, vital signs, IV line documentation — all with timestamps |
| 4 | **Surgery** | WHO Surgical Safety Checklist (Sign In / Time Out / Sign Out), surgical team assignment, knife-on-skin time, consumable usage tracking, surgical count, Bill of Materials, anaesthesia monitoring |
| 5 | **PACU Recovery** | Consciousness level, airway status, pain scoring, vital signs monitoring, Aldrete scoring, discharge readiness assessment, red alerts for complications |
| 6 | **Patient Transfer** | Track patient movement from PACU to ward/ICU with handover documentation |
| 7 | **Reports & Analytics** | Surgery trends, cost analysis, theatre utilisation, cancellation analysis, staff effectiveness |

---

## THE 12 CORE MODULES

### 🏥 MODULE 1: SURGERY SCHEDULING & MANAGEMENT
**Who uses it:** Surgeons, Theatre Manager, Theatre Chairman

- Schedule elective and emergency surgeries across all 13 theatres
- Assign surgical team members (surgeon, assistant, anaesthetist, scrub nurse)
- Track surgery status in real time: Scheduled → In Holding Area → Ready for Theatre → In Progress → Completed
- Record knife-on-skin time and surgery end time for accurate turnaround metrics
- Flag special requirements: ICU bed, blood transfusion, diathermy, C-arm, microscope, suction, pneumatic tourniquet

**Value to Management:** Know exactly how many surgeries are scheduled today, which theatres are active, and which are idle. Identify bottlenecks in real time.

---

### 📋 MODULE 2: WHO SURGICAL SAFETY CHECKLIST
**Who uses it:** All theatre staff

- **Sign In** (before anaesthesia): Patient identity confirmed, procedure and site verified, consent obtained, anaesthesia safety check, oximeter attached
- **Time Out** (before incision): Team introductions, procedure confirmation, anticipated critical events review, antibiotic prophylaxis, imaging displayed
- **Sign Out** (before leaving theatre): Procedure recorded, instrument and sponge count correct, specimen labelled, equipment problems documented

**Value to Management:** Ensures 100% compliance with WHO patient safety standards. Every checklist is digitally signed with staff name and timestamp — creating an auditable safety record.

---

### 📦 MODULE 3: INVENTORY & SUB-STORE MANAGEMENT
**Who uses it:** Theatre Store Keeper, Theatre Manager, Scrub Nurses

**Main Store:**
- Track all consumables, machines, and devices with quantities, unit costs, batch numbers, expiry dates
- Automatic low-stock alerts when items fall below reorder level
- Full supply record history (supplier, date, cost)

**Theatre Sub-Stores (one per theatre):**
- Each of the 13 theatres has its own digital sub-store
- All sub-store stock **must come from the main store** — every transfer is recorded
- When items are used during surgery, they are **automatically deducted** from the theatre's sub-store
- If stock drops to LOW or CRITICAL, an **automatic restock request** is created
- Inter-substore transfers require **Theatre Manager approval**

**Value to Management:** Eliminates the "black hole" of theatre consumables. You can now answer: "How many sutures were used in Theatre 5 last month?" or "Where did 20 pairs of gloves go?" — with exact dates, staff names, and surgery references.

---

### 🔧 MODULE 4: EQUIPMENT MANAGEMENT & FAULT ALERTS
**Who uses it:** Biomedical Engineer, Theatre Manager, Technicians

- Register all theatre equipment with serial numbers, manufacturers, maintenance schedules
- **Daily equipment status logging** — each theatre reports equipment condition at start of shift
- **Equipment checkout system** — track which equipment was checked out, by whom, for which theatre and shift
- **Fault alert system** — report equipment faults with severity (LOW/MEDIUM/HIGH/CRITICAL), auto-notify manager
- **Maintenance scheduling** — track last service date, next service due, depreciation, half-life

**Value to Management:** No more surprises. Know which equipment needs servicing before it fails. Track equipment depreciation for budgeting. Hold staff accountable for equipment under their care.

---

### 🛏️ MODULE 5: HOLDING AREA & PATIENT RECEPTION
**Who uses it:** Holding Area Nurses

The holding area module digitises the **entire reception checklist** mandated by hospital policy:

**Phase 1 — Patient Identification:**
- Patient states name ✓
- Cross-check with wristband ✓
- Compare with folder name ✓
- Compare with operation list ✓
- Compare with ward slip ✓

**Phase 2 — Verification:**
- Consent form complete ✓
- Surgery fee paid and receipt sighted ✓
- Nil per oral maintained ✓
- Operation site marked and shaved ✓
- Patient dressed in gown, cap on ✓
- Jewellery, dentures, glasses, nail polish removed ✓
- Investigation results attached ✓
- Blood units available ✓
- All notes, drug charts, prescriptions attached ✓
- Vital signs checked and recorded ✓

**Red Alert System:** If any discrepancy is found (wrong patient, missing consent, missing blood), a **Red Alert** is triggered instantly — flagging the case for immediate senior attention.

**Value to Management:** This is where surgical errors begin — wrong patient, wrong site, missing consent. This module ensures every single check is completed and digitally signed before the patient enters the theatre.

---

### 💉 MODULE 6: ANAESTHESIA & MONITORING
**Who uses it:** Anaesthetists, Consultant Anaesthetists, Anaesthetic Technicians

- Pre-operative anaesthetic review with ASA classification
- Anaesthesia machine and equipment setup verification
- Intra-operative monitoring: heart rate, blood pressure, SpO2, temperature, EtCO2
- Medication administration records
- Fluid balance tracking
- Anaesthesia event log with timestamps

**Value to Management:** Complete anaesthesia documentation for medico-legal protection and clinical audit.

---

### 🔬 MODULE 7: CSSD (Central Sterile Services Department)
**Who uses it:** CSSD Staff, Theatre Manager

- Sterilisation cycle tracking (load number, cycle type, start/end time)
- Biological and chemical indicator results
- Instrument set inventory with packaging verification
- Readiness dashboard — shows what is sterilised and ready for use

**Value to Management:** Ensures sterilisation compliance. Trace any instrument set back to its sterilisation cycle.

---

### ⚡ MODULE 8: POWER HOUSE MANAGEMENT
**Who uses it:** Power Plant Operators, Theatre Manager

- Real-time power status monitoring across the theatre complex
- Generator maintenance scheduling
- Power readiness assessment before surgery lists
- Fault reporting for electrical issues

**Value to Management:** Theatres cannot operate without reliable power. This module ensures generators are maintained and power status is verified before each surgical list.

---

### 🩸 MODULE 9: BLOOD BANK & PRESCRIPTIONS
**Who uses it:** Blood Bank Staff, Pharmacists, Surgeons

- Blood request management (type, units, cross-match status)
- Prescription tracking (draft → pending approval → approved → dispensed)
- Integration with surgery records for traceability

**Value to Management:** Ensure blood and medications are available and properly authorised before surgery begins.

---

### 📊 MODULE 10: REPORTING & ANALYTICS
**Who uses it:** Theatre Chairman, Theatre Manager, Hospital Management

**Real-time dashboards showing:**
- Total surgeries (today, this week, this month)
- Theatre utilisation rate (% of available time used per theatre)
- Surgery trends over time (line charts)
- Cost breakdown (pie charts by category)
- Cancellation analysis (reasons, frequency, by theatre)
- Bill of Materials reports (total cost per surgery)
- Staff effectiveness scoring

**Value to Management:** Make decisions based on data, not guesswork. Justify budget requests with utilisation reports. Identify underperforming theatres. Track cost trends.

---

### 👥 MODULE 11: DUTY ROSTER & STAFF MANAGEMENT
**Who uses it:** Theatre Manager, All Staff

- Create and manage duty rosters across all 13 theatres
- Assign staff to shifts (Morning, Afternoon, Night, Call)
- Track staff effectiveness metrics
- 20+ distinct staff roles supported (see below)
- User approval workflow (new staff must be approved before access)

**Supported Staff Roles:**
| Role | Access Level |
|------|-------------|
| Theatre Chairman | Full oversight, all reports |
| Theatre Manager | Full management, approvals, transfers |
| Surgeon | Surgery scheduling, patient records |
| Anaesthetist | Anaesthesia records, pre-op reviews |
| Consultant Anaesthetist | Supervision, approvals |
| Scrub Nurse | Theatre setup, surgical counts, consumables |
| Recovery Room Nurse | PACU assessments, discharge |
| Theatre Store Keeper | Inventory management, sub-stores |
| Porter | Patient transfer tracking |
| Anaesthetic Technician | Equipment setup, monitoring |
| Biomedical Engineer | Equipment maintenance, fault management |
| CSSD Staff | Sterilisation management |
| Procurement Officer | Supply chain oversight |
| Blood Bank Staff | Blood request management |
| Pharmacist | Prescription management |
| Power Plant Operator | Power status, generator maintenance |
| Cleaner | Theatre cleaning verification |
| Laboratory Staff | Investigation results |
| Plumber | Facility maintenance |

**Value to Management:** Every staff member has a defined role with appropriate access. No one sees more than they should. Every action is attributed to a named individual.

---

### 🔔 MODULE 12: ALERTS & NOTIFICATIONS
**Who uses it:** All staff (role-appropriate)

- **Stock Alerts** — Low stock, critical stock, out of stock
- **Equipment Faults** — Reported and escalated by priority
- **Surgery Reminders** — Approaching surgery times
- **Maintenance Due** — Equipment service reminders
- **Red Alerts** — Patient safety concerns from holding area or PACU
- **Emergency Surgery Alerts** — Urgent case notifications
- **Transfer Approvals** — Pending inter-store transfers requiring authorisation
- **Timeline View** — All approaching deadlines in one place

Push notifications delivered to staff phones even when the app is not open.

**Value to Management:** Nothing falls through the cracks. Critical information reaches the right person at the right time.

---

## KEY BENEFITS FOR HOSPITAL MANAGEMENT

### 1. 📱 ACCESS FROM ANY DEVICE
- Works on **any phone, tablet, laptop, or desktop** — no special hardware needed
- Staff already carry smartphones; they can use the app immediately
- **Installable as a mobile app** (PWA) — appears as an icon on the home screen
- **Works offline** — data is saved locally and syncs automatically when internet returns

### 2. 💰 COST CONTROL & ACCOUNTABILITY
| Before ORM | With ORM |
|-----------|---------|
| "Where did the consumables go?" | Every item tracked from main store → sub-store → surgery with staff name and date |
| "Why did surgery cost so much?" | Bill of Materials report shows exact items used and their costs |
| "How much are we spending monthly?" | Cost trend analytics with breakdown by category, theatre, and procedure |

### 3. 🛡️ PATIENT SAFETY
| Before ORM | With ORM |
|-----------|---------|
| Paper checklists sometimes skipped | Digital WHO checklists with mandatory fields — nothing can be skipped |
| Near-misses discovered after the fact | Red Alerts trigger instantly when discrepancies are found in holding area |
| No audit trail for safety checks | Every check is digitally signed with staff name, role, and timestamp |

### 4. 📊 DATA-DRIVEN DECISIONS
| Question | ORM Provides The Answer |
|---------|----------------------|
| "Which theatre is most utilised?" | Theatre utilisation chart with % for each of the 13 theatres |
| "Why are surgeries being cancelled?" | Cancellation report with reasons, frequency, and trends |
| "Are we overstocking or understocking?" | Inventory levels, consumption patterns, and auto-restock triggers |
| "How effective is each staff member?" | Staff effectiveness scoring based on assigned duties and outcomes |
| "What is the average turnaround time?" | Knife-on-skin to surgery-end timing for each theatre |

### 5. 🔒 ROLE-BASED SECURITY
- Every staff member logs in with their own credentials
- Each role sees only what is relevant to their duties
- Sensitive operations (transfers, approvals, user management) restricted to authorised roles
- Complete audit trail — who did what, when, from which device

### 6. ⚡ REAL-TIME VISIBILITY
- The Theatre Chairman can see the status of **all 13 theatres** on one dashboard
- Live surgery count, upcoming surgeries, pending transfers, low stock items, active fault alerts
- No more phone calls to ask "what is happening in Theatre 7?"

---

## WHAT SETS ORM APART

| Feature | Traditional Paper | Generic Hospital Software | ORM |
|---------|------------------|--------------------------|-----|
| Designed for UNTH theatre workflow | ✗ | Partially | ✓ Fully customised |
| 13-theatre sub-store tracking | ✗ | ✗ | ✓ Each theatre has its own store |
| WHO checklist integration | ✗ | Sometimes | ✓ Full Sign In/Time Out/Sign Out |
| Holding area reception checklist | ✗ | ✗ | ✓ All 20+ verification steps |
| Works on staff phones | ✗ | Rarely | ✓ Any browser, installable |
| Works without internet | ✗ | ✗ | ✓ Full offline capability |
| Cost per surgery tracking | ✗ | Sometimes | ✓ Bill of Materials per case |
| Power house monitoring | ✗ | ✗ | ✓ Generator & power tracking |
| CSSD integration | ✗ | Sometimes | ✓ Sterilisation tracking |
| Staff accountability | Limited | Partial | ✓ Every action logged with name |
| Zero hardware cost | N/A | Expensive | ✓ Uses existing phones & computers |

---

## DEPLOYMENT STATUS

| Component | Status |
|-----------|--------|
| Application | ✅ Live at **https://unth-theatre-mai.vercel.app** |
| Database | ✅ Cloud-hosted on Supabase (PostgreSQL) |
| 13 Theatres | ✅ All configured and operational |
| 70 Staff Accounts | ✅ Pre-seeded with all theatre staff |
| Inventory Items | ✅ 17 items seeded; ready for full catalogue |
| Patient Records | ✅ System active and accepting registrations |
| Mobile Access | ✅ PWA installable on any smartphone |
| Offline Capability | ✅ Full offline-first with automatic sync |

---

## COST TO THE HOSPITAL

| Item | Cost |
|------|------|
| Software development | Already completed |
| Hardware required | **None** — uses existing staff phones and computers |
| Server hosting (Vercel) | Free tier (sufficient for current usage) |
| Database hosting (Supabase) | Free tier (500 MB, sufficient for years of data) |
| Staff training | In-house (application is intuitive with guided workflows) |
| **Total ongoing cost** | **₦0 / month** on current free tiers |

---

## IMMEDIATE NEXT STEPS

1. **Management Approval** — Endorse ORM for hospital-wide theatre use
2. **Staff Onboarding** — Brief department heads; distribute login credentials
3. **Inventory Setup** — Theatre Store Keeper loads complete inventory catalogue
4. **Go Live** — Begin scheduling surgeries and tracking operations through ORM
5. **Review & Feedback** — Monthly review of analytics dashboards with Theatre Chairman

---

## CLOSING STATEMENT

> **ORM transforms the UNTH theatre complex from a paper-based, reactive environment into a digitally managed, proactive operation where every patient is tracked, every item is accounted for, every checklist is completed, and every decision is backed by data.**
>
> The system is already built, already deployed, and already accessible from any staff member's phone. The only step remaining is the decision to begin using it.

---

*Prepared for the Office of the Chief Medical Director, UNTH Ituku Ozalla*
*Operative Resource Manager (ORM) — Theatre Management System*
*February 2026*
