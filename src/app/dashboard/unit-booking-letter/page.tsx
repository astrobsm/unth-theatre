'use client';

/**
 * Theatre Official Letters — generator
 * ----------------------------------------------------------------
 * Select a LETTER TYPE and a RECIPIENT (surgical unit or department), then
 * generate that recipient's own official letter and export it as PDF.
 *
 * Letter types:
 *  1. ORM Mandatory Booking — to each surgical unit head: effective Monday
 *     15 June 2026 the theatre will no longer recognise paper bookings; all
 *     bookings must go through the ORM platform. Links to the booking guide.
 *  2. Weekly Roster Upload — to each Head of Department: as directed by Hospital
 *     Management through the CMD, the unit's weekly duty roster must be uploaded
 *     on the Theatre Management Application every Saturday before 5:00 PM.
 *     Includes a step-by-step upload guide.
 *
 * Every letter is copied to the CMD, C-MAC and DA.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Printer, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface SurgicalUnit {
  id: string;
  name: string;
  subspecialty: string;
  location: string;
  active: boolean;
}

type LetterType = 'ORM_BOOKING' | 'ROSTER_UPLOAD' | 'TRAINING_INVITE';

interface RosterDepartment {
  id: string;
  name: string; // e.g. "Theatre Nursing"
  group: string; // staff group covered, e.g. "Theatre Nurses"
}

// Departments/units that must upload a weekly duty roster (mirrors the
// Weekly Roster Forms groups in /dashboard/roster/weekly).
const ROSTER_DEPARTMENTS: RosterDepartment[] = [
  { id: 'nurses', name: 'Theatre Nursing', group: 'Theatre Nurses (scrub, circulating, holding area, supervising)' },
  { id: 'anaesthetists', name: 'Anaesthesia', group: 'Anaesthetists' },
  { id: 'anaesthetic-technicians', name: 'Anaesthetic Technicians', group: 'Anaesthetic Technicians' },
  { id: 'recovery-nurses', name: 'Recovery / PACU Nursing', group: 'Nurse Anaesthetists (Recovery)' },
  { id: 'pharmacists', name: 'Theatre Pharmacy', group: 'Pharmacists' },
  { id: 'porters', name: 'Porters', group: 'Porters' },
  { id: 'cleaners', name: 'Theatre Cleaning Services', group: 'Cleaners' },
];

const REF_PREFIX = 'UNTH/THTR/ORM';
const ROSTER_REF_PREFIX = 'UNTH/THTR/ROSTER';
const TRAINING_REF_PREFIX = 'UNTH/THTR/ORM-TRAINING';
const EFFECTIVE_DATE = 'Monday, 15th June 2026';
// User-facing weekly roster upload deadline (see /dashboard/roster/weekly).
const ROSTER_DEADLINE = 'every Saturday before 5:00 PM';
const TODAY = new Date().toLocaleDateString('en-GB', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const CC_LIST = [
  'The Chief Medical Director (CMD)',
  'The Chairman, Medical Advisory Committee (C-MAC)',
  'The Director of Administration (DA)',
];

const ROSTER_UPLOAD_STEPS = [
  'Log in to the Theatre Management Application with your staff credentials.',
  'On the dashboard, open Duty Roster, then tap "Weekly Roster Forms".',
  'Select your unit/department card (e.g. Nurses, Anaesthetists, Pharmacists).',
  'Add a row for each staff member and assign the shift (morning/night) and theatre/area for the upcoming week.',
  `Tap "Submit weekly roster" to upload — do this ${ROSTER_DEADLINE} for the week ahead.`,
  'Confirm the entries appear on the published roster (Dashboard → Roster).',
];

// Departments whose Heads are invited to the ORM physical guide & training.
const TRAINING_DEPARTMENTS: RosterDepartment[] = [
  { id: 'surgery', name: 'Department of Surgery', group: 'Surgeons and Resident Doctors' },
  { id: 'anaesthesia', name: 'Department of Anaesthesia', group: 'Anaesthetists and Anaesthetic Technicians' },
  { id: 'theatre-nursing', name: 'Theatre Nursing', group: 'Theatre Nurses (scrub, circulating, holding area, supervising)' },
  { id: 'recovery-nursing', name: 'Recovery / PACU Nursing', group: 'Recovery Room Nurses' },
  { id: 'theatre-pharmacy', name: 'Theatre Pharmacy', group: 'Pharmacists' },
  { id: 'theatre-store', name: 'Theatre Store', group: 'Theatre Store Keepers and Pack Providers' },
  { id: 'cssd', name: 'Central Sterile Supply Department (CSSD)', group: 'CSSD Staff' },
  { id: 'blood-bank', name: 'Blood Bank', group: 'Blood Bank Staff' },
  { id: 'laboratory', name: 'Laboratory Services', group: 'Laboratory Staff' },
  { id: 'porters', name: 'Porters Unit', group: 'Porters' },
  { id: 'cleaning', name: 'Theatre Cleaning Services', group: 'Cleaners' },
  { id: 'biomedical', name: 'Biomedical Engineering', group: 'Biomedical Engineers and Technicians' },
  { id: 'power-house', name: 'Power House / Facilities', group: 'Power House and Facilities Staff' },
  { id: 'oxygen', name: 'Oxygen / Medical Gas Unit', group: 'Medical Gas / Oxygen Staff' },
];

const TRAINING_AGENDA = [
  'Logging in, profile setup and password recovery on the ORM platform.',
  'Patient registration and booking of surgical cases (elective and emergency).',
  'Role-specific workflows for your department (holding area, theatre, pharmacy, store, CSSD, blood bank, etc.).',
  'Real-time alerts, the Theatre Radio and cross-device synchronisation.',
  'Uploading weekly duty rosters and reading the published roster.',
  'Hands-on practice, questions and answers.',
];


function guideUrl() {
  if (typeof window !== 'undefined') return `${window.location.origin}/booking-guide`;
  return 'https://unth-theatre-mai.vercel.app/booking-guide';
}

function refSlug(name: string) {
  return name.replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 8) || 'UNIT';
}

// Format a YYYY-MM-DD string into e.g. "Monday, 22nd June 2026".
function formatDateLabel(dateStr: string) {
  if (!dateStr) return '';
  const [yy, mm, dd] = dateStr.split('-').map((n) => parseInt(n, 10));
  if (!yy || !mm || !dd) return dateStr;
  const d = new Date(yy, mm - 1, dd);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = d.toLocaleDateString('en-GB', { month: 'long' });
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
      ? 'nd'
      : day % 10 === 3 && day !== 13
      ? 'rd'
      : 'th';
  return `${weekday}, ${day}${suffix} ${month} ${yy}`;
}

// Format a HH:MM (24h) string into e.g. "10:00 AM".
function formatTimeLabel(timeStr: string) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

async function buildOrmPdf(unit: SurgicalUnit) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56;
  let y = M;

  const ensure = (needed: number) => {
    if (y + needed > H - M - 40) {
      doc.addPage();
      y = M;
    }
  };

  const para = (text: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(opts?.size ?? 10.5);
    const lines = doc.splitTextToSize(text, W - M * 2);
    ensure(lines.length * 13 + (opts?.gap ?? 8));
    doc.text(lines, M, y);
    y += lines.length * 13 + (opts?.gap ?? 8);
  };

  const numbered = (n: number, text: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(text, W - M * 2 - 16);
    ensure(lines.length * 13 + 4);
    doc.text(`${n}.`, M, y);
    doc.text(lines, M + 16, y);
    y += lines.length * 13 + 4;
  };

  // Letterhead
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('UNIVERSITY OF NIGERIA TEACHING HOSPITAL (UNTH), ITUKU-OZALLA', W / 2, y, { align: 'center' });
  y += 16;
  doc.setFontSize(11);
  doc.text('THEATRE COMPLEX', W / 2, y, { align: 'center' });
  y += 18;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1);
  doc.line(M, y, W - M, y);
  y += 18;

  // Ref + date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const ref = `Ref: ${REF_PREFIX}/2026/${unit.name.replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 8) || 'UNIT'}`;
  doc.text(ref, M, y);
  doc.text(`Date: ${TODAY}`, W - M, y, { align: 'right' });
  y += 22;

  // Addressee
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('The Head of Unit,', M, y);
  y += 14;
  doc.text(unit.name, M, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.text(`${unit.subspecialty} — ${unit.location}`, M, y);
  y += 14;
  doc.text('University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu.', M, y);
  y += 22;

  // Subject
  doc.setFont('helvetica', 'bold');
  const subject =
    'SUBJECT: MANDATORY USE OF THE ORM PLATFORM FOR ALL SURGICAL BOOKINGS — DISCONTINUATION OF PAPER BOOKINGS';
  const subjLines = doc.splitTextToSize(subject, W - M * 2);
  ensure(subjLines.length * 13 + 12);
  doc.text(subjLines, M, y);
  y += subjLines.length * 13 + 12;

  // Body
  para(`Dear Head, ${unit.name},`);
  para(
    `This is to formally notify your unit that, with effect from ${EFFECTIVE_DATE}, the Theatre Complex will no longer recognise or accept any surgery or case booked on paper. All surgical bookings — elective and emergency — must be made through the Operative Resource Manager (ORM) platform.`,
  );
  para(
    'Accordingly, kindly inform all your departmental and unit staff that they should no longer receive or type any cases for distribution. Hand-written and typed booking lists circulated for distribution will not be honoured by the theatre, the anaesthesia team or the pharmacy. Every case must instead be entered directly on the ORM platform by the requesting surgical team.',
  );

  para('What this means for your unit:', { bold: true, gap: 4 });
  numbered(1, `From ${EFFECTIVE_DATE}, only cases booked on ORM will be scheduled, staffed and packed.`);
  numbered(2, 'Departmental staff must stop receiving and typing cases for distribution; paper lists are discontinued.');
  numbered(3, 'On booking, ORM automatically assigns the on-duty anaesthetist, notifies the theatre nurse-in-charge and the Pack Provider, and wires the anaesthetic prescription to Pharmacy.');
  numbered(4, 'Please ensure every member of your unit who books cases has an active ORM login.');

  para(
    `A step-by-step guide on how to register your patients and book their cases on the ORM platform is available here: ${guideUrl()}`,
    { gap: 10 },
  );

  para(
    'We count on your unit\u2019s full cooperation to make this transition smooth and to ensure safer, faster and better-coordinated surgical care at UNTH.',
  );

  para('Thank you.', { gap: 14 });

  // Sign-off
  ensure(60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Signed,', M, y);
  y += 26;
  doc.text('CHAIRMAN THEATRE COMMERCIALIZED UNIT', M, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.text('University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu.', M, y);
  y += 24;

  // CC
  ensure(20 + CC_LIST.length * 13);
  doc.setFont('helvetica', 'bold');
  doc.text('cc:', M, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  CC_LIST.forEach((c) => {
    doc.text(`\u2022 ${c}`, M + 14, y);
    y += 13;
  });

  // Footer
  const pageCount = (doc as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Page ${i} of ${pageCount}  \u2022  UNTH Theatre Complex  \u2022  ORM Booking Notice`, W / 2, H - 24, {
      align: 'center',
    });
    doc.setTextColor(0);
  }

  const blob = doc.output('blob');
  const safe = unit.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `UNTH-ORM-Booking-Letter-${safe || 'Unit'}.pdf`;
  return { doc, blob, filename };
}

async function buildRosterPdf(dept: RosterDepartment) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56;
  let y = M;

  const ensure = (needed: number) => {
    if (y + needed > H - M - 40) {
      doc.addPage();
      y = M;
    }
  };

  const para = (text: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(opts?.size ?? 10.5);
    const lines = doc.splitTextToSize(text, W - M * 2);
    ensure(lines.length * 13 + (opts?.gap ?? 8));
    doc.text(lines, M, y);
    y += lines.length * 13 + (opts?.gap ?? 8);
  };

  const numbered = (n: number, text: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(text, W - M * 2 - 16);
    ensure(lines.length * 13 + 4);
    doc.text(`${n}.`, M, y);
    doc.text(lines, M + 16, y);
    y += lines.length * 13 + 4;
  };

  // Letterhead
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('UNIVERSITY OF NIGERIA TEACHING HOSPITAL (UNTH), ITUKU-OZALLA', W / 2, y, { align: 'center' });
  y += 16;
  doc.setFontSize(11);
  doc.text('THEATRE COMPLEX', W / 2, y, { align: 'center' });
  y += 18;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1);
  doc.line(M, y, W - M, y);
  y += 18;

  // Ref + date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Ref: ${ROSTER_REF_PREFIX}/2026/${refSlug(dept.name)}`, M, y);
  doc.text(`Date: ${TODAY}`, W - M, y, { align: 'right' });
  y += 22;

  // Addressee
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('The Head of Department,', M, y);
  y += 14;
  doc.text(`${dept.name} Unit`, M, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.text('Theatre Complex,', M, y);
  y += 14;
  doc.text('University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu.', M, y);
  y += 22;

  // Subject
  doc.setFont('helvetica', 'bold');
  const subject =
    'SUBJECT: MANDATORY WEEKLY UPLOAD OF UNIT DUTY ROSTER ON THE THEATRE MANAGEMENT APPLICATION';
  const subjLines = doc.splitTextToSize(subject, W - M * 2);
  ensure(subjLines.length * 13 + 12);
  doc.text(subjLines, M, y);
  y += subjLines.length * 13 + 12;

  // Body
  para(`Dear Head of Department, ${dept.name},`);
  para(
    `Hospital Management, through the office of the Chief Medical Director (CMD), has directed that every unit\u2019s weekly duty roster must henceforth be created and uploaded on the Theatre Management Application. This is to formally bring this directive to the attention of your department, which is responsible for the ${dept.group} roster.`,
  );
  para(
    `Accordingly, the duty roster for the upcoming week must be uploaded on the Application ${ROSTER_DEADLINE}. All departments are required to comply strictly with this directive. Failure to upload the weekly roster by the stipulated deadline is regarded as an anti-progress action and a queriable offence; the system automatically flags non-compliance and escalates it to Management.`,
  );

  para('How to upload your weekly roster:', { bold: true, gap: 4 });
  ROSTER_UPLOAD_STEPS.forEach((s, i) => numbered(i + 1, s));

  para(
    'Please ensure that the responsible officer in your department has an active login on the Application and uploads the roster on time, every week, without exception.',
    { gap: 10 },
  );

  para(
    'We count on your full cooperation in complying with this management directive to ensure proper coordination of activities in the Theatre Complex.',
  );

  para('Thank you.', { gap: 14 });

  // Sign-off
  ensure(60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Signed,', M, y);
  y += 26;
  doc.text('CHAIRMAN THEATRE COMMERCIALIZED UNIT', M, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.text('University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu.', M, y);
  y += 24;

  // CC
  ensure(20 + CC_LIST.length * 13);
  doc.setFont('helvetica', 'bold');
  doc.text('cc:', M, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  CC_LIST.forEach((c) => {
    doc.text(`\u2022 ${c}`, M + 14, y);
    y += 13;
  });

  // Footer
  const pageCount = (doc as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Page ${i} of ${pageCount}  \u2022  UNTH Theatre Complex  \u2022  Weekly Roster Directive`, W / 2, H - 24, {
      align: 'center',
    });
    doc.setTextColor(0);
  }

  const blob = doc.output('blob');
  const safe = dept.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `UNTH-Weekly-Roster-Letter-${safe || 'Dept'}.pdf`;
  return { doc, blob, filename };
}

interface TrainingDetails {
  dateLabel: string; // formatted human-readable date
  timeLabel: string; // formatted human-readable time
  venue: string;
}

async function buildTrainingPdf(dept: RosterDepartment, details: TrainingDetails) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56;
  let y = M;

  const ensure = (needed: number) => {
    if (y + needed > H - M - 40) {
      doc.addPage();
      y = M;
    }
  };

  const para = (text: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(opts?.size ?? 10.5);
    const lines = doc.splitTextToSize(text, W - M * 2);
    ensure(lines.length * 13 + (opts?.gap ?? 8));
    doc.text(lines, M, y);
    y += lines.length * 13 + (opts?.gap ?? 8);
  };

  const numbered = (n: number, text: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(text, W - M * 2 - 16);
    ensure(lines.length * 13 + 4);
    doc.text(`${n}.`, M, y);
    doc.text(lines, M + 16, y);
    y += lines.length * 13 + 4;
  };

  // Letterhead
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('UNIVERSITY OF NIGERIA TEACHING HOSPITAL (UNTH), ITUKU-OZALLA', W / 2, y, { align: 'center' });
  y += 16;
  doc.setFontSize(11);
  doc.text('THEATRE COMPLEX', W / 2, y, { align: 'center' });
  y += 18;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1);
  doc.line(M, y, W - M, y);
  y += 18;

  // Ref + date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Ref: ${TRAINING_REF_PREFIX}/2026/${refSlug(dept.name)}`, M, y);
  doc.text(`Date: ${TODAY}`, W - M, y, { align: 'right' });
  y += 22;

  // Addressee
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('The Head of Department,', M, y);
  y += 14;
  doc.text(dept.name, M, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.text('Theatre Complex,', M, y);
  y += 14;
  doc.text('University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu.', M, y);
  y += 22;

  // Subject
  doc.setFont('helvetica', 'bold');
  const subject =
    'SUBJECT: INVITATION TO A PHYSICAL GUIDE AND TRAINING ON THE USE OF THE OPERATIVE RESOURCE MANAGER (ORM) APPLICATION';
  const subjLines = doc.splitTextToSize(subject, W - M * 2);
  ensure(subjLines.length * 13 + 12);
  doc.text(subjLines, M, y);
  y += subjLines.length * 13 + 12;

  // Body
  para(`Dear Head of Department, ${dept.name},`);
  para(
    'As part of the ongoing roll-out of the Operative Resource Manager (ORM) — the Theatre Management Application — a physical guide and hands-on training session has been scheduled to familiarise your staff with the platform and its day-to-day use.',
  );
  para('Accordingly, you and the relevant officers of your department are kindly invited as follows:', { gap: 6 });

  // Details block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  ensure(60);
  doc.text(`Date:  `, M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(details.dateLabel, M + 70, y);
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.text(`Time:  `, M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(details.timeLabel, M + 70, y);
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.text(`Venue: `, M, y);
  doc.setFont('helvetica', 'normal');
  const venueLines = doc.splitTextToSize(details.venue, W - M * 2 - 70);
  doc.text(venueLines, M + 70, y);
  y += venueLines.length * 14 + 8;

  para(`This session is specifically relevant to the ${dept.group} in your department.`, { gap: 6 });

  para('The training will cover:', { bold: true, gap: 4 });
  TRAINING_AGENDA.forEach((s, i) => numbered(i + 1, s));

  para(
    'Kindly ensure that all the officers in your department who use the platform attend, and that they come along with a smartphone or laptop for the hands-on practice.',
    { gap: 10 },
  );
  para(
    'We count on your full cooperation and attendance to ensure a smooth adoption of the ORM platform across the Theatre Complex.',
  );
  para('Thank you.', { gap: 14 });

  // Sign-off
  ensure(60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Signed,', M, y);
  y += 26;
  doc.text('CHAIRMAN THEATRE COMMERCIALIZED UNIT', M, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.text('University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu.', M, y);
  y += 24;

  // CC
  ensure(20 + CC_LIST.length * 13);
  doc.setFont('helvetica', 'bold');
  doc.text('cc:', M, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  CC_LIST.forEach((c) => {
    doc.text(`\u2022 ${c}`, M + 14, y);
    y += 13;
  });

  // Footer
  const pageCount = (doc as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Page ${i} of ${pageCount}  \u2022  UNTH Theatre Complex  \u2022  ORM Training Invitation`, W / 2, H - 24, {
      align: 'center',
    });
    doc.setTextColor(0);
  }

  const blob = doc.output('blob');
  const safe = dept.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `UNTH-ORM-Training-Invite-${safe || 'Dept'}.pdf`;
  return { doc, blob, filename };
}

export default function TheatreLettersPage() {
  const [letterType, setLetterType] = useState<LetterType>('ORM_BOOKING');
  const [units, setUnits] = useState<SurgicalUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [trainingDate, setTrainingDate] = useState('');
  const [trainingTime, setTrainingTime] = useState('');
  const [trainingVenue, setTrainingVenue] = useState('Theatre Complex Conference Room, UNTH Ituku-Ozalla');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/surgical-units?activeOnly=true');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setUnits(data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Reset the selected recipient whenever the letter type changes.
  useEffect(() => {
    setSelectedId('');
  }, [letterType]);

  const selectedUnit = useMemo(() => units.find((u) => u.id === selectedId), [units, selectedId]);
  const selectedDept = useMemo(
    () => ROSTER_DEPARTMENTS.find((d) => d.id === selectedId),
    [selectedId],
  );
  const selectedTrainingDept = useMemo(
    () => TRAINING_DEPARTMENTS.find((d) => d.id === selectedId),
    [selectedId],
  );

  const trainingDateLabel = useMemo(() => formatDateLabel(trainingDate), [trainingDate]);
  const trainingTimeLabel = useMemo(() => formatTimeLabel(trainingTime), [trainingTime]);
  const trainingReady =
    !!selectedTrainingDept && !!trainingDate && !!trainingTime && !!trainingVenue.trim();

  const hasSelection =
    letterType === 'ORM_BOOKING'
      ? !!selectedUnit
      : letterType === 'ROSTER_UPLOAD'
      ? !!selectedDept
      : trainingReady;

  const generate = async (mode: 'download' | 'open') => {
    setBusy(true);
    try {
      const built =
        letterType === 'ORM_BOOKING'
          ? selectedUnit && (await buildOrmPdf(selectedUnit))
          : letterType === 'ROSTER_UPLOAD'
          ? selectedDept && (await buildRosterPdf(selectedDept))
          : selectedTrainingDept &&
            (await buildTrainingPdf(selectedTrainingDept, {
              dateLabel: trainingDateLabel,
              timeLabel: trainingTimeLabel,
              venue: trainingVenue.trim(),
            }));
      if (!built) return;
      if (mode === 'download') {
        built.doc.save(built.filename);
        toast.success('Letter PDF downloaded');
      } else {
        const url = URL.createObjectURL(built.blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e: any) {
      toast.error('PDF failed: ' + (e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Theatre Official Letters</h1>
          <p className="text-gray-600 mt-1 text-sm">
            Choose a letter type and a recipient, then generate and export the letter as a PDF. Every letter is copied
            to the CMD, C-MAC and DA.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
        <div>
          <label htmlFor="letter-type" className="block text-sm font-medium text-gray-700 mb-1">
            Letter type
          </label>
          <select
            id="letter-type"
            value={letterType}
            onChange={(e) => setLetterType(e.target.value as LetterType)}
            className="input-field"
          >
            <option value="ORM_BOOKING">ORM Mandatory Booking (to surgical units)</option>
            <option value="ROSTER_UPLOAD">Weekly Roster Upload Directive (to departments)</option>
            <option value="TRAINING_INVITE">ORM Physical Guide &amp; Training Invitation (to departments)</option>
          </select>
        </div>

        <div>
          <label htmlFor="recipient-select" className="block text-sm font-medium text-gray-700 mb-1">
            {letterType === 'ORM_BOOKING' ? 'Select surgical unit' : 'Select department'}
          </label>
          {letterType === 'ORM_BOOKING' ? (
            loading ? (
              <div className="text-gray-500 text-sm inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading units…
              </div>
            ) : units.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No surgical units found. Admins can add them at{' '}
                <Link href="/dashboard/admin/surgical-units" className="text-blue-600 hover:underline">
                  /dashboard/admin/surgical-units
                </Link>
                .
              </p>
            ) : (
              <select
                id="recipient-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="input-field"
              >
                <option value="">— Choose a unit —</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.subspecialty})
                  </option>
                ))}
              </select>
            )
          ) : (
            <select
              id="recipient-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="input-field"
            >
              <option value="">— Choose a department —</option>
              {(letterType === 'TRAINING_INVITE' ? TRAINING_DEPARTMENTS : ROSTER_DEPARTMENTS).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.group})
                </option>
              ))}
            </select>
          )}
        </div>

        {letterType === 'TRAINING_INVITE' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="training-date" className="block text-sm font-medium text-gray-700 mb-1">
                Training date
              </label>
              <input
                id="training-date"
                type="date"
                value={trainingDate}
                onChange={(e) => setTrainingDate(e.target.value)}
                className="input-field"
              />
              {trainingDateLabel && <p className="text-xs text-gray-500 mt-1">{trainingDateLabel}</p>}
            </div>
            <div>
              <label htmlFor="training-time" className="block text-sm font-medium text-gray-700 mb-1">
                Training time
              </label>
              <input
                id="training-time"
                type="time"
                value={trainingTime}
                onChange={(e) => setTrainingTime(e.target.value)}
                className="input-field"
              />
              {trainingTimeLabel && <p className="text-xs text-gray-500 mt-1">{trainingTimeLabel}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="training-venue" className="block text-sm font-medium text-gray-700 mb-1">
                Venue
              </label>
              <input
                id="training-venue"
                type="text"
                value={trainingVenue}
                onChange={(e) => setTrainingVenue(e.target.value)}
                placeholder="e.g. Theatre Complex Conference Room, UNTH Ituku-Ozalla"
                className="input-field"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => generate('download')}
            disabled={!hasSelection || busy}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center text-sm disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Generate Letter (PDF)
          </button>
          <button
            onClick={() => generate('open')}
            disabled={!hasSelection || busy}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center text-sm disabled:opacity-50"
          >
            <Printer className="w-4 h-4 mr-2" /> Open / Print
          </button>
        </div>
      </div>

      {/* Live preview — ORM booking letter */}
      {letterType === 'ORM_BOOKING' && selectedUnit && (
        <article className="bg-white shadow-sm border rounded-lg p-10 leading-relaxed text-gray-900 text-sm">
          <header className="text-center border-b pb-4 mb-6">
            <h2 className="text-base font-bold tracking-wide">
              UNIVERSITY OF NIGERIA TEACHING HOSPITAL (UNTH), ITUKU-OZALLA
            </h2>
            <p className="text-sm font-semibold mt-1">THEATRE COMPLEX</p>
          </header>

          <div className="flex justify-between mb-6">
            <span>
              <strong>Ref:</strong> {REF_PREFIX}/2026/{refSlug(selectedUnit.name)}
            </span>
            <span>
              <strong>Date:</strong> {TODAY}
            </span>
          </div>

          <p className="mb-1 font-semibold">The Head of Unit,</p>
          <p className="mb-1 font-semibold">{selectedUnit.name}</p>
          <p className="mb-1">
            {selectedUnit.subspecialty} — {selectedUnit.location}
          </p>
          <p className="mb-5">University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu.</p>

          <h3 className="font-bold uppercase border-y py-2 mb-4">
            Subject: Mandatory use of the ORM platform for all surgical bookings — discontinuation of paper bookings
          </h3>

          <p className="mb-3">Dear Head, {selectedUnit.name},</p>
          <p className="mb-3">
            This is to formally notify your unit that, with effect from <strong>{EFFECTIVE_DATE}</strong>, the Theatre
            Complex will no longer recognise or accept any surgery or case booked on paper. All surgical bookings —
            elective and emergency — must be made through the Operative Resource Manager (ORM) platform.
          </p>
          <p className="mb-3">
            Accordingly, kindly inform all your departmental and unit staff that they should no longer receive or type
            any cases for distribution. Hand-written and typed booking lists circulated for distribution will not be
            honoured by the theatre, the anaesthesia team or the pharmacy. Every case must instead be entered directly
            on the ORM platform by the requesting surgical team.
          </p>

          <p className="font-semibold mb-1">What this means for your unit:</p>
          <ol className="list-decimal list-inside space-y-1 mb-3">
            <li>From {EFFECTIVE_DATE}, only cases booked on ORM will be scheduled, staffed and packed.</li>
            <li>Departmental staff must stop receiving and typing cases for distribution; paper lists are discontinued.</li>
            <li>
              On booking, ORM automatically assigns the on-duty anaesthetist, notifies the theatre nurse-in-charge and
              the Pack Provider, and wires the anaesthetic prescription to Pharmacy.
            </li>
            <li>Please ensure every member of your unit who books cases has an active ORM login.</li>
          </ol>

          <p className="mb-3">
            A step-by-step guide on how to register your patients and book their cases on the ORM platform is available
            here:{' '}
            <a href="/booking-guide" target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
              {guideUrl()}
            </a>
          </p>

          <p className="mb-3">
            We count on your unit&rsquo;s full cooperation to make this transition smooth and to ensure safer, faster and
            better-coordinated surgical care at UNTH.
          </p>
          <p className="mb-6">Thank you.</p>

          <p className="font-semibold">Signed,</p>
          <p className="mt-4 font-semibold">CHAIRMAN THEATRE COMMERCIALIZED UNIT</p>
          <p>University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu.</p>

          <div className="mt-6">
            <p className="font-semibold">cc:</p>
            <ul className="list-disc list-inside">
              {CC_LIST.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </article>
      )}

      {/* Live preview — weekly roster directive */}
      {letterType === 'ROSTER_UPLOAD' && selectedDept && (
        <article className="bg-white shadow-sm border rounded-lg p-10 leading-relaxed text-gray-900 text-sm">
          <header className="text-center border-b pb-4 mb-6">
            <h2 className="text-base font-bold tracking-wide">
              UNIVERSITY OF NIGERIA TEACHING HOSPITAL (UNTH), ITUKU-OZALLA
            </h2>
            <p className="text-sm font-semibold mt-1">THEATRE COMPLEX</p>
          </header>

          <div className="flex justify-between mb-6">
            <span>
              <strong>Ref:</strong> {ROSTER_REF_PREFIX}/2026/{refSlug(selectedDept.name)}
            </span>
            <span>
              <strong>Date:</strong> {TODAY}
            </span>
          </div>

          <p className="mb-1 font-semibold">The Head of Department,</p>
          <p className="mb-1 font-semibold">{selectedDept.name} Unit</p>
          <p className="mb-1">Theatre Complex,</p>
          <p className="mb-5">University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu.</p>

          <h3 className="font-bold uppercase border-y py-2 mb-4">
            Subject: Mandatory weekly upload of unit duty roster on the Theatre Management Application
          </h3>

          <p className="mb-3">Dear Head of Department, {selectedDept.name},</p>
          <p className="mb-3">
            Hospital Management, through the office of the Chief Medical Director (CMD), has directed that every
            unit&rsquo;s weekly duty roster must henceforth be created and uploaded on the Theatre Management
            Application. This is to formally bring this directive to the attention of your department, which is
            responsible for the <strong>{selectedDept.group}</strong> roster.
          </p>
          <p className="mb-3">
            Accordingly, the duty roster for the upcoming week must be uploaded on the Application{' '}
            <strong>{ROSTER_DEADLINE}</strong>. All departments are required to comply strictly with this directive.
            Failure to upload the weekly roster by the stipulated deadline is regarded as an anti-progress action and a
            queriable offence; the system automatically flags non-compliance and escalates it to Management.
          </p>

          <p className="font-semibold mb-1">How to upload your weekly roster:</p>
          <ol className="list-decimal list-inside space-y-1 mb-3">
            {ROSTER_UPLOAD_STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>

          <p className="mb-3">
            Please ensure that the responsible officer in your department has an active login on the Application and
            uploads the roster on time, every week, without exception.
          </p>

          <p className="mb-3">
            We count on your full cooperation in complying with this management directive to ensure proper coordination
            of activities in the Theatre Complex.
          </p>
          <p className="mb-6">Thank you.</p>

          <p className="font-semibold">Signed,</p>
          <p className="mt-4 font-semibold">CHAIRMAN THEATRE COMMERCIALIZED UNIT</p>
          <p>University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu.</p>

          <div className="mt-6">
            <p className="font-semibold">cc:</p>
            <ul className="list-disc list-inside">
              {CC_LIST.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </article>
      )}

      {/* Live preview — ORM training invitation */}
      {letterType === 'TRAINING_INVITE' && selectedTrainingDept && (
        <article className="bg-white shadow-sm border rounded-lg p-10 leading-relaxed text-gray-900 text-sm">
          <header className="text-center border-b pb-4 mb-6">
            <h2 className="text-base font-bold tracking-wide">
              UNIVERSITY OF NIGERIA TEACHING HOSPITAL (UNTH), ITUKU-OZALLA
            </h2>
            <p className="text-sm font-semibold mt-1">THEATRE COMPLEX</p>
          </header>

          <div className="flex justify-between mb-6">
            <span>
              <strong>Ref:</strong> {TRAINING_REF_PREFIX}/2026/{refSlug(selectedTrainingDept.name)}
            </span>
            <span>
              <strong>Date:</strong> {TODAY}
            </span>
          </div>

          <p className="mb-1 font-semibold">The Head of Department,</p>
          <p className="mb-1 font-semibold">{selectedTrainingDept.name}</p>
          <p className="mb-1">Theatre Complex,</p>
          <p className="mb-5">University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu.</p>

          <h3 className="font-bold uppercase border-y py-2 mb-4">
            Subject: Invitation to a physical guide and training on the use of the Operative Resource Manager (ORM)
            application
          </h3>

          <p className="mb-3">Dear Head of Department, {selectedTrainingDept.name},</p>
          <p className="mb-3">
            As part of the ongoing roll-out of the Operative Resource Manager (ORM) — the Theatre Management Application
            — a physical guide and hands-on training session has been scheduled to familiarise your staff with the
            platform and its day-to-day use.
          </p>
          <p className="mb-3">
            Accordingly, you and the relevant officers of your department are kindly invited as follows:
          </p>

          <div className="mb-3 pl-1">
            <p>
              <strong>Date:</strong> {trainingDateLabel || '—'}
            </p>
            <p>
              <strong>Time:</strong> {trainingTimeLabel || '—'}
            </p>
            <p>
              <strong>Venue:</strong> {trainingVenue.trim() || '—'}
            </p>
          </div>

          <p className="mb-3">
            This session is specifically relevant to the <strong>{selectedTrainingDept.group}</strong> in your
            department.
          </p>

          <p className="font-semibold mb-1">The training will cover:</p>
          <ol className="list-decimal list-inside space-y-1 mb-3">
            {TRAINING_AGENDA.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>

          <p className="mb-3">
            Kindly ensure that all the officers in your department who use the platform attend, and that they come along
            with a smartphone or laptop for the hands-on practice.
          </p>
          <p className="mb-3">
            We count on your full cooperation and attendance to ensure a smooth adoption of the ORM platform across the
            Theatre Complex.
          </p>
          <p className="mb-6">Thank you.</p>

          <p className="font-semibold">Signed,</p>
          <p className="mt-4 font-semibold">CHAIRMAN THEATRE COMMERCIALIZED UNIT</p>
          <p>University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu.</p>

          <div className="mt-6">
            <p className="font-semibold">cc:</p>
            <ul className="list-disc list-inside">
              {CC_LIST.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </article>
      )}

      {!hasSelection && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <FileText className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-900">
            {letterType === 'ORM_BOOKING'
              ? 'Select a surgical unit above to preview and generate its own ORM booking letter, addressed to that unit\u2019s head and copied to the CMD, C-MAC and DA.'
              : letterType === 'ROSTER_UPLOAD'
              ? 'Select a department above to preview and generate its own weekly-roster directive letter, addressed to that department\u2019s head and copied to the CMD, C-MAC and DA.'
              : 'Select a department and set the date, time and venue above to preview and generate the ORM training-invitation letter, addressed to that department\u2019s head and copied to the CMD, C-MAC and DA.'}
          </p>
        </div>
      )}
    </div>
  );
}

