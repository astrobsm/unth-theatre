/* UNTH ORM — Training narration data
 * Single source of truth for downloads.html (MP3 + PDF) and optional future use.
 * Each role: { id, title, audience, slides: [{ title, bullets[], narration }] }
 */
window.TRAINING_DATA = [
  /* ============================ SURGEONS ============================ */
  {
    id: 'surgeons',
    title: 'Surgeons',
    audience: 'Consultants, Senior Registrars, Registrars, House Officers',
    accent: '#0b3b6f',
    slides: [
      {
        title: 'Welcome, Surgeons',
        bullets: ['UNTH Operative Resource Manager', 'Replaces paper, WhatsApp and verbal handovers', 'Every action signed by you and time-stamped'],
        narration: 'Welcome to the UNTH Operative Resource Manager training for surgeons. This system replaces paper books, WhatsApp messages and verbal handovers with one auditable real-time platform. Every action you take is signed by your account and time-stamped. Use it consistently and it becomes your strongest professional defence.'
      },
      {
        title: 'Logging in and starting duty',
        bullets: ['Open the app on phone, tablet or PC', 'Sign in with your username', 'Tap Start Duty at the beginning of each shift'],
        narration: 'Open the application on any device. Sign in with your username and password. Then tap Start Duty. Starting duty confirms you are on site and on call. Failure to start duty marks you as absent and may auto-page another consultant.'
      },
      {
        title: 'Booking a surgery',
        bullets: ['Surgeries, then New Surgery', 'Confirm patient, diagnosis, planned procedure', 'Specify special needs and blood units', 'Add full surgical team'],
        narration: 'To book a surgery, open Surgeries and tap New Surgery. Confirm patient identity, diagnosis and the planned procedure. Specify any special equipment needs such as diathermy, stirrups or a Montrell mattress. If you anticipate blood loss above five hundred millilitres, request blood units now. Add the full surgical team from consultants down to house officers.'
      },
      {
        title: 'Pre-operative review',
        bullets: ['Confirm consent and site marking', 'Review labs and imaging', 'Verify nil per oral status', 'Document fitness for surgery'],
        narration: 'Before any surgery you must complete the pre-operative review in the application. Confirm that consent is signed, the surgical site is marked, labs and imaging have been reviewed, and the patient is fasted. Document your assessment of fitness for surgery. Use the microphone button to dictate notes if your hands are busy.'
      },
      {
        title: 'WHO Surgical Safety Checklist',
        bullets: ['Sign-In before anaesthesia', 'Time-Out before incision', 'Sign-Out before patient leaves theatre', 'No checklist means no incision'],
        narration: 'The World Health Organisation Surgical Safety Checklist is non-negotiable. Complete Sign-In before anaesthesia, Time-Out before skin incision, and Sign-Out before the patient leaves the theatre. Skipping or back-dating any phase is grounds for immediate disciplinary query. Remember, no checklist means no incision.'
      },
      {
        title: 'Operation notes and post-op orders',
        bullets: ['Operation note within thirty minutes', 'Include findings, blood loss, complications', 'E-sign all prescriptions in Rx Approvals', 'Hand over to PACU in person and in app'],
        narration: 'Write your operation note within thirty minutes of skin closure. Include indication, findings, procedure, blood loss, specimens, complications and post-operative plan. All prescriptions must pass through the Rx Approvals module with your electronic signature. Hand the patient over to the PACU nurse both in person and within the application.'
      },
      {
        title: 'Cancellations and mortality',
        bullets: ['Cancel only via Cancellations module', 'Specify category and reason', 'Mortality logged within four hours', 'Audit form completed within seventy-two hours'],
        narration: 'Cancel surgeries only through the Cancellations module, never verbally. State the specific category and reason. Any intra-operative or twenty-four hour post-operative death must be entered in the Mortality Registry within four hours. The full audit form must be completed within seventy-two hours.'
      },
      {
        title: 'Disciplinary triggers to avoid',
        bullets: ['Skipping any WHO checklist phase', 'Late or missing operation note', 'Mortality not logged in time', 'Booking without anaesthetic review'],
        narration: 'The most common disciplinary triggers for surgeons are: skipping any phase of the WHO checklist, operation notes filed more than two hours late, mortality not logged within four hours, booking without anaesthetic review, and generic cancellation reasons such as see notes. Document at the point of care, not at end of shift. Memory is not evidence.'
      },
      {
        title: 'Benefits and closing',
        bullets: ['Auto-generated logbook for revalidation', 'Personal performance statistics', 'Evidence-based defence in disputes', 'No more lost paper notes'],
        narration: 'The benefits to you are real. The system auto-generates your case logbook for FMCS or FWACS revalidation. You see your personal cancellation, complication and turnaround statistics. You have evidence-based protection against unfair complaints. The application is your colleague, not your enemy. Thank you.'
      }
    ]
  },

  /* ============================ ANAESTHETISTS ============================ */
  {
    id: 'anaesthetists',
    title: 'Anaesthetists',
    audience: 'Consultants, Senior Registrars, Registrars, Anaesthetic Technicians',
    accent: '#1e6bb8',
    slides: [
      {
        title: 'Welcome, Anaesthetists',
        bullets: ['Auto-built anaesthetic chart', 'Real-time vitals monitoring', 'Documented controlled-drug reconciliation'],
        narration: 'Welcome to the UNTH Operative Resource Manager training for anaesthetists. This system gives you an auto-built anaesthetic chart, real-time vitals monitoring, and documented controlled-drug reconciliation. It protects you medico-legally and frees your hands during cases.'
      },
      {
        title: 'Daily workflow',
        bullets: ['Start Duty at shift beginning', 'Check Roster and Theatre Allocation', 'Complete Anaesthesia Setup', 'Run intra-operative charting'],
        narration: 'Begin every shift by tapping Start Duty. Check the Roster and Theatre Allocation modules to confirm your assignment. Complete the Anaesthesia Setup checklist for your theatre. During the case, run intra-operative charting in real time. End your shift with a clean PACU handover.'
      },
      {
        title: 'Pre-anaesthetic assessment',
        bullets: ['Document airway grade and ASA', 'Record allergies and comorbidities', 'Confirm fasting and consent', 'Braden Scale optional for under-fifteens'],
        narration: 'Open the patient record and complete the anaesthetic review tab. Document airway grade, ASA status, allergies, comorbidities and prior anaesthetic history. Confirm fasting status, consent and any premedication. For patients under fifteen years, the adult Braden Scale is now optional. Use the Braden Q paediatric scale where clinically indicated.'
      },
      {
        title: 'Anaesthesia Setup',
        bullets: ['Machine check: suction, oxygen, agents, circuits', 'Drug tray prepared and labelled', 'Emergency drugs accessible', 'Confirm oxygen readiness on dashboard'],
        narration: 'Use the Anaesthesia Setup module to record your machine check, including suction, oxygen, agents and circuits. Confirm the drug tray is prepared and labelled. Verify emergency drugs are accessible: atropine, ephedrine, adrenaline and suxamethonium. Always check the Power Status and Oxygen Readiness boards before starting any case.'
      },
      {
        title: 'Intra-operative charting',
        bullets: ['Vitals every five minutes', 'Drugs logged with dose, time, route', 'Fluids and blood recorded live', 'Use voice dictation when sterile'],
        narration: 'During the case, vitals are auto-prompted every five minutes. Each drug must be logged with dose, time and route. Fluids in, blood transfused and outputs are recorded live. Use the voice dictation feature when your hands are sterile, it works on every field.'
      },
      {
        title: 'Medication tracking',
        bullets: ['Med Tracking shows controlled drugs collected', 'Log usage immediately after administration', 'Reconcile at end of duty'],
        narration: 'The Medication Tracking module shows every controlled drug you have collected. Log each use immediately after administration. Log returns at the end of the case. Reconcile fully at end of duty. Unaccounted controlled drugs trigger an automatic disciplinary action and pharmacy audit.'
      },
      {
        title: 'PACU handover',
        bullets: ['Open PACU module, new entry', 'Provide technique, drugs, fluids, blood loss', 'Specify Aldrete discharge criteria', 'Stay until recovery nurse e-signs'],
        narration: 'Open the PACU module and create a new recovery entry. Provide your anaesthetic technique, drugs given, fluid balance and blood loss. Specify the Aldrete discharge criteria. Remain in PACU until the recovery nurse signs the handover. The application will alert you if your patient deteriorates after discharge.'
      },
      {
        title: 'Disciplinary triggers and benefits',
        bullets: ['No pre-anaesthetic review on record is major', 'Controlled-drug discrepancy is major', 'Vitals not charted is major', 'Auto-built chart is your defence'],
        narration: 'Major disciplinary triggers include: no pre-anaesthetic review on record, any controlled-drug discrepancy, and vitals not charted intra-operatively. Slow emergency response above fifteen minutes is moderate. The benefits to you are an auto-built anaesthetic chart, a personal case-mix logbook for FRCA, and an evidence trail that protects you in adverse events. Thank you.'
      }
    ]
  },

  /* ============================ NURSES ============================ */
  {
    id: 'nurses',
    title: 'Theatre Nurses',
    audience: 'Scrub, Circulating and Recovery Nurses',
    accent: '#1e8449',
    slides: [
      {
        title: 'Welcome, Theatre Nurses',
        bullets: ['No more endless paper checklists', 'Documented count protects you', 'Auto-handover so nothing is forgotten'],
        narration: 'Welcome to the UNTH Operative Resource Manager training for theatre nurses. This system removes endless paper checklists, gives you a documented swab and instrument count that protects you legally, and provides automatic handover so nothing is forgotten between shifts.'
      },
      {
        title: 'Daily workflow',
        bullets: ['Start Duty', 'Check Roster and Theatre Allocation', 'Theatre Setup and Readiness', 'Holding Area, WHO checklist, Counts', 'Nurse Handover at end of shift'],
        narration: 'Start each shift with the Start Duty button. Check the Roster and Theatre Allocation. Confirm Theatre Setup and Readiness for your theatre. Receive each patient through the Holding Area module, run the WHO checklist with the team, and complete swab and instrument counts. End your shift with a full Nurse Handover.'
      },
      {
        title: 'Theatre Setup and Readiness',
        bullets: ['Tick instruments and consumables as you lay out', 'Missing items raise a Setup Request', 'Mark Ready only when truly ready'],
        narration: 'The Setup module lists every instrument and consumable required for the case. Tick items off as you lay them out. Missing items automatically raise a Setup Request to stores. Only mark the theatre as Ready when sterilisation, suction, lights and monitors are all confirmed. Marking ready when not ready is a major disciplinary offence.'
      },
      {
        title: 'Holding Area',
        bullets: ['Scan patient ID into Holding Area', 'Verify identity, consent, site mark, fasting', 'Note allergies and premedication', 'Move only after surgeon and anaesthetist confirm'],
        narration: 'When the patient arrives, scan or enter the identifier into the Holding Area module. Verify identity, consent, site marking, fasting status, allergies and premedication. Note any concerns and escalate using the Holding Area Alert. Move the patient into theatre only after the surgeon and anaesthetist have confirmed.'
      },
      {
        title: 'Swab and instrument counts',
        bullets: ['Three counts: initial, before closure, final', 'Both scrub and circulator e-sign', 'Discrepancy locks closure phase'],
        narration: 'Use the Counts module for every case. Three counts are required: initial, before closure and final. Both the scrub nurse and circulating nurse must electronically sign each count. Any discrepancy automatically locks the closure phase until resolved. A retained item where the count was marked correct triggers a sentinel event investigation.'
      },
      {
        title: 'Consumables, equipment and PACU',
        bullets: ['Log every implant, suture, blade in Consumables', 'Bill of Materials auto-generated', 'PACU vitals every fifteen minutes', 'Aldrete must be at least nine for discharge'],
        narration: 'Log every implant, suture and blade into the Consumables module. The Bill of Materials is auto-generated and goes to billing. In recovery, vitals are auto-prompted every fifteen minutes. Discharge only when the Aldrete score is at least nine. Trigger an alert if vitals deteriorate.'
      },
      {
        title: 'Nurse Handover and cleaning',
        bullets: ['Handover for each active patient', 'Receiving nurse e-signs to accept', 'Start and end Cleaning to release theatre', 'Turnover times are tracked'],
        narration: 'At shift change, open Nurse Handover for each active patient. Document condition, drains, drugs due, alerts and family communications. The receiving nurse must electronically sign to accept. After each case, tap Cleaning Start, supervise the cleaner, then Cleaning End to release the theatre. Turnover times are tracked and the fastest theatres receive recognition.'
      },
      {
        title: 'Disciplinary triggers and benefits',
        bullets: ['Falsified count is major', 'Marked ready when not ready is major', 'Handover without e-sign is moderate', 'Personal case-load report supports promotion'],
        narration: 'Major disciplinary triggers for nurses include a falsified count and marking the theatre ready when it is not. Handing over patients without electronic signature is moderate, as is failing to log consumables. Your personal case-load report supports promotion review. Document at the point of care. Thank you.'
      }
    ]
  },

  /* ============================ PORTERS ============================ */
  {
    id: 'porters',
    title: 'Porters',
    audience: 'Patient Transport and Theatre Logistics Staff',
    accent: '#7d3c98',
    slides: [
      {
        title: 'Welcome, Porters',
        bullets: ['No more chasing nurses for instructions', 'Your transport record proves you were busy', 'Identity verification protects you'],
        narration: 'Welcome to the UNTH Operative Resource Manager training for porters. This system removes the need to chase nurses for instructions. Your transport record proves your work and identity verification protects you from blame. Top performers are recognised at the end of each month.'
      },
      {
        title: 'Daily workflow',
        bullets: ['Start Duty at shift beginning', 'Check Roster for theatre allocation', 'Watch Call for Patient board', 'Log every transport with Start and End'],
        narration: 'Start each shift by tapping Start Duty. Check the Roster for your theatre allocation. Watch the Call for Patient board on your phone throughout the shift. Log every transport with the Start and End buttons. End your shift with End Duty. If you do not start duty, the system marks you absent and may page a relief porter.'
      },
      {
        title: 'How patient transport works',
        bullets: ['Anaesthetist or nurse triggers Call for Patient', 'You receive an alert on your phone', 'Tap Accept to stop auto-paging', 'Verify ID, then Transport Start and End'],
        narration: 'When the anaesthetist or scrub nurse triggers a Call for Patient, you will receive an alert on your phone within five seconds. Tap Accept to stop the system from auto-paging another porter. Go to the ward, identify the patient and verify the identification band. Tap Transport Start when leaving the ward and Transport End on arrival in the holding area.'
      },
      {
        title: 'Patient identity check',
        bullets: ['Verify name and hospital number', 'Cross-check against the call entry', 'Confirm operation site marking', 'Ask ward nurse to e-sign release'],
        narration: 'Patient identity verification is your most important responsibility. Verify the name and hospital number on the identification band. Cross-check against the call entry on your phone. Confirm the operation site mark is present where applicable. Ask the ward nurse to electronically sign the release in the application. Bringing the wrong patient to theatre is a catastrophic event.'
      },
      {
        title: 'Theatre supplies and transfers',
        bullets: ['Theatre Meals module for food deliveries', 'Sub-Stores Transfers for stock movements', 'Patient Transfers between theatres or wards'],
        narration: 'Use the Theatre Meals module to log food deliveries to the lounge. Use Sub-Stores Transfers for stock movements such as linen, gases or scrubs. Never move equipment without an entry, security audits this regularly. For transfers between theatres or wards, use the Patient Transfers module and electronically sign on departure and arrival.'
      },
      {
        title: 'Reporting hazards and emergencies',
        bullets: ['Broken trolley or spill, use Fault Alerts', 'Power failure, use Power Status', 'Plumbing leak, use Plumbing and Water', 'Emergency calls take priority'],
        narration: 'Report hazards immediately. Use Fault Alerts for broken trolleys, faulty lifts or spills. Use Power Status for power failures on your route. Use Plumbing and Water for leaks. Emergency calls take priority over routine transport, accept and respond within three minutes. Reporting hazards protects patients and you, never punished for raising them.'
      },
      {
        title: 'Disciplinary triggers and benefits',
        bullets: ['Wrong patient transported is major', 'Ignored Call for Patient is major', 'Did not Start Duty is moderate', 'No identity check logged is moderate'],
        narration: 'Major disciplinary triggers for porters include transporting the wrong patient and ignoring a Call for Patient for more than ten minutes. Failing to start duty is moderate, as is not logging an identity check. The benefits to you include freedom from chasing instructions, a transport record that proves your effort, and monthly recognition for top performers. Thank you.'
      }
    ]
  },

  /* ============================ CLEANERS ============================ */
  {
    id: 'cleaners',
    title: 'Cleaners and Housekeeping',
    audience: 'Theatre Turnover and Infection Control Staff',
    accent: '#d35400',
    slides: [
      {
        title: 'Welcome, Cleaners',
        bullets: ['Your cleaning record demonstrates your contribution', 'Top cleaners are publicly recognised monthly', 'Documented turnover protects you'],
        narration: 'Welcome to the UNTH Operative Resource Manager training for cleaners and housekeeping staff. Your cleaning record now demonstrates your contribution clearly. Top cleaners are publicly recognised every month. Documented turnover protects you if a case becomes infected. No more arguments over who cleaned which theatre.'
      },
      {
        title: 'Daily workflow',
        bullets: ['Start Duty at shift beginning', 'Watch Cleaning Required alerts', 'Tap End Cleaning when done', 'Report biohazards immediately'],
        narration: 'Start every shift with Start Duty. Watch your phone for Cleaning Required alerts, one will arrive after each finished case. Complete the cleaning following the checklist and tap End Cleaning when done. Report any biohazard or spillage immediately. End your shift with End Duty.'
      },
      {
        title: 'The cleaning cycle',
        bullets: ['Surgeon signs out, you receive an alert', 'Enter theatre with PPE', 'Follow the on-screen checklist', 'Tap End Cleaning to release theatre'],
        narration: 'When the surgeon signs out, the application sends you a Cleaning Required alert. Tap Accept and enter the theatre with appropriate personal protective equipment. Follow the turnover checklist shown in the app: clear sharps, bag linen, wipe surfaces including the operating table, lights and machines, mop the floor, and change bin liners. Tap End Cleaning and the theatre is auto-marked available.'
      },
      {
        title: 'Why timing matters',
        bullets: ['Faster turnover means more patients treated', 'Target twenty minutes for clean cases', 'Thirty-five minutes for contaminated cases', 'Quality over speed always'],
        narration: 'Faster but thorough turnover means more patients are treated each day. The target is twenty minutes for a clean case and thirty-five minutes for a contaminated case. Times are visible to your supervisor and consistently fast cleaners are recognised. However, quality always wins over speed, skipped checklist items reset the timer.'
      },
      {
        title: 'Biohazards and spillages',
        bullets: ['Log via Incidents module', 'Use the spill kit immediately', 'Self-injury reported within one hour', 'Reporting is protected, not punished'],
        narration: 'Log every biohazard or spillage through the Incidents module, describing the exposure such as blood or body fluid. Use the spill kit immediately. If you sustain a needle-stick injury or splash to your skin or eyes, report it through Incidents Self-Injury within one hour. Hiding an exposure puts your health at risk. Reporting is protected, never punished.'
      },
      {
        title: 'Linen, supplies and faults',
        bullets: ['Log dirty linen pickups in Laundry', 'Confirm clean linen receipt', 'Broken bucket or empty soap, use Fault Alerts', 'Plumbing issues via Plumbing and Water'],
        narration: 'Log dirty linen pickups via the Laundry module and confirm receipt of clean linen. Discrepancies are queried by stores. Report broken mop buckets, leaking taps, faulty bins or empty soap dispensers via Fault Alerts. Use the Plumbing and Water module for any plumbing issues.'
      },
      {
        title: 'Infection control and disciplinary triggers',
        bullets: ['PPE always worn', 'Hand hygiene before and after', 'Marking End-of-Cleaning falsely is major', 'Ignored alerts above fifteen minutes is moderate'],
        narration: 'Always wear personal protective equipment, perform hand hygiene before and after each task, respect colour-coded mops, and dilute disinfectant correctly. Marking End-of-Cleaning when you have not done it is a major disciplinary offence. Failing to start duty or ignoring a cleaning alert for more than fifteen minutes is moderate. Unreported spillage is major. Thank you for the work you do.'
      }
    ]
  },

  /* ============================ CSSD / BIOMEDICAL / STORES ============================ */
  {
    id: 'support',
    title: 'CSSD, Biomedical and Stores',
    audience: 'Sterilisation, Equipment and Inventory Staff',
    accent: '#16a085',
    slides: [
      {
        title: 'Welcome, Support Services',
        bullets: ['CSSD, Biomedical and Stores share one workflow', 'Live inventory, no end-of-month surprises', 'Sterilisation logs protect you legally'],
        narration: 'Welcome to the training for Central Sterile Services Department, Biomedical Engineering and Stores staff. The application gives you live inventory, eliminating end-of-month surprises. Sterilisation logs protect you legally. Maintenance schedules are auto-generated. Fault resolution time is tracked, proving your impact.'
      },
      {
        title: 'CSSD workflow',
        bullets: ['Receive instruments via CSSD Inventory Return', 'Process via CSSD Sterilization', 'Log cycle, autoclave and indicator results', 'Mark sets Ready in CSSD Readiness'],
        narration: 'Begin your CSSD shift with Start Duty. Receive used instruments through CSSD Inventory Return. Process them through CSSD Sterilization, logging the cycle, autoclave used and indicator results. Mark sets as Ready in CSSD Readiness once verified. Issue them to theatre via CSSD Inventory Issue.'
      },
      {
        title: 'Sterilisation log integrity',
        bullets: ['Every cycle: load contents, temperature, time, indicator', 'Failed indicator quarantines the set', 'Audit logs retained for five years'],
        narration: 'For every sterilisation cycle, record the load contents, temperature, time and indicator outcome. A failed indicator automatically quarantines the set so it cannot be issued. Audit logs are retained for five years for ISO compliance. Issuing an unsterile set is a sentinel event, the cycle log is your defence.'
      },
      {
        title: 'Biomedical engineers',
        bullets: ['Watch Fault Alerts for your equipment', 'Acknowledge, diagnose and resolve', 'Schedule preventive maintenance', 'Decommission obsolete equipment'],
        narration: 'Biomedical engineers should watch the Fault Alerts module for equipment in their scope. Acknowledge each alert, log your diagnosis and log the resolution. Schedule preventive maintenance via the inventory item maintenance interval. Decommission obsolete equipment by editing the inventory item and setting status to retired.'
      },
      {
        title: 'Power, water and oxygen',
        bullets: ['Power Status logs generator runs and fuel', 'Power Maintenance schedules servicing', 'Plumbing and Water for supply faults', 'Oxygen Control alerts when levels dip'],
        narration: 'Use Power Status to log generator runs and fuel consumption. Use Power Maintenance to schedule and log servicing. Use Power Readiness for daily readiness checks. The Plumbing and Water module logs supply faults. The Oxygen Control system fires automatic alerts when oxygen levels drop below safe thresholds.'
      },
      {
        title: 'Inventory and stock transfers',
        bullets: ['Inventory is the central master list', 'Sub-Stores per theatre or department', 'Bulk uploads via Excel', 'Reorder levels trigger procurement alerts'],
        narration: 'The Inventory module holds the central master list of stock. Sub-Stores tracks per-theatre and per-department inventory. Bulk uploads are supported via Excel templates, refer to the bulk upload guide. Reorder levels trigger automatic alerts to procurement. Expiry dates flag yellow at ninety days and red at thirty days. Both sender and receiver must electronically sign every stock transfer.'
      },
      {
        title: 'Disciplinary triggers and benefits',
        bullets: ['Issued unsterile set is major', 'Falsified sterilisation log is major', 'Stock transfer without e-sign is moderate', 'Live inventory protects you'],
        narration: 'Major disciplinary triggers include issuing an unsterile set or falsifying a sterilisation log. Stock transfers without electronic signature, fault alerts ignored for more than two hours, and expired stock not removed are moderate. Your benefits include live inventory visibility, legal protection through sterilisation logs, auto-generated maintenance schedules, and tracked fault resolution times that prove your value. Thank you.'
      }
    ]
  },

  /* ============================ ADMINISTRATORS ============================ */
  {
    id: 'admin',
    title: 'Administrators',
    audience: 'Theatre Manager, HODs and System Administrators',
    accent: '#c0392b',
    slides: [
      {
        title: 'Welcome, Administrators',
        bullets: ['Live theatre status at a glance', 'Auto-generated reports for committees', 'Evidence-based disciplinary process'],
        narration: 'Welcome to the UNTH Operative Resource Manager training for administrators, theatre managers and heads of department. The application gives you live theatre status at a glance, auto-generated reports for committees, and an evidence-based disciplinary process that protects both staff and management.'
      },
      {
        title: 'Your overview tools',
        bullets: ['Dashboard: live theatre status', 'Reports and Analytics', 'Staff Effectiveness scoring', 'Mortality Registry for M and M', 'Disciplinary Queries module'],
        narration: 'Your key tools are: the Dashboard for live theatre status, Reports and Analytics for daily, weekly and monthly summaries, Staff Effectiveness for individual and team performance, the Mortality Registry which feeds the morbidity and mortality committee, and the Disciplinary Queries module for open and resolved cases.'
      },
      {
        title: 'User management',
        bullets: ['Review pending sign-ups in User Management', 'Approve, set role and staff code', 'Reject with reason if unauthorised', 'Reset passwords on request'],
        narration: 'Open User Management to review pending sign-ups. Approve each user, setting the correct role and staff code. Reject any unauthorised request with a reason. Reset passwords on staff request via the Authentication module. Approving a user with the wrong role is a security incident, always verify identity first.'
      },
      {
        title: 'Roster management',
        bullets: ['Upload weekly roster via Excel', 'Separate templates per group', 'Auto-allocates staff to theatres and shifts', 'Absence patterns flagged automatically'],
        narration: 'Upload the weekly roster via Excel using the templates provided for nurses, anaesthetists, porters, cleaners and technicians. The system auto-allocates staff to theatres and shifts. Last-minute swaps are logged with reason. Absence patterns are flagged automatically for review.'
      },
      {
        title: 'Handling disciplinary queries',
        bullets: ['Open Disciplinary Queries module', 'Review auto-evidence and timestamps', 'Read staff response, due in forty-eight hours', 'Decide outcome with full audit trail'],
        narration: 'Open the Disciplinary Queries module. Review the auto-evidence including timestamps and before-and-after states. Read the staff response, which is due within forty-eight hours. Decide the outcome: dismissed, verbal warning, written warning or HOD referral. Every decision is permanently auditable, protecting both staff and management from bias claims.'
      },
      {
        title: 'Anonymous tips and security',
        bullets: ['Anonymous Tips for confidential concerns', 'Security Reports for incidents and theft', 'Visible only to ADMIN role', 'Investigate within five working days'],
        narration: 'The Anonymous Tips module allows staff to report concerns confidentially. Security Reports captures incidents, breaches and theft. Both modules are visible only to the administrator role. You must investigate every entry within five working days and document the outcome.'
      },
      {
        title: 'Reports and weekly hygiene',
        bullets: ['Monthly turnover, cancellation, mortality reports', 'Inventory burn rate and expiries', 'Weekly: review pending users, ignored alerts, expiring stock', 'No disciplinary case open beyond fourteen days'],
        narration: 'Reports include monthly turnover by theatre, cancellation analysis, mortality and morbidity, inventory burn rate, power reliability and blood usage. All exportable as PDF for the Chief Medical Director. Each week perform system hygiene: approve or reject pending users, review ignored alerts, check expiring stock, and ensure no disciplinary case remains open beyond fourteen days. Verify Supabase backups. Thank you.'
      }
    ]
  }
];
