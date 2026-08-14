#!/usr/bin/env node
/**
 * Seed the starting communication templates.
 *
 *   node scripts/maintenance/seed-comm-templates.js
 *   node scripts/maintenance/seed-comm-templates.js --dry-run
 *
 * Idempotent: a template is inserted only if that code+channel does not exist.
 * An existing one is never overwritten, because somebody may have reworded it
 * for this hospital and a re-run must not undo that.
 *
 * Every template carries its SENSITIVITY, which is what the send policy enforces.
 * Classifying per template rather than per send means the rule cannot be decided
 * by whoever is in a hurry at 2am.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { PrismaClient } = require(path.join(ROOT, 'node_modules/@prisma/client'));

const dryRun = process.argv.includes('--dry-run');

/**
 * OPERATIONAL       no patient information at all — safe anywhere
 * PATIENT_IDENTIFIED names a patient — staff only on external channels
 * CLINICAL          clinical detail — never leaves the app
 */
const TEMPLATES = [
  // ── Theatre setup: the case that prompted the SLA work ────────────────────
  {
    code: 'THEATRE_SETUP_REMINDER',
    channel: 'IN_APP',
    subject: 'Theatre setup due',
    // No patient name: a setup reminder does not need one, and leaving it out
    // means the same wording can later go out on WhatsApp unchanged.
    body: 'Theatre {{theatreName}} is needed at {{targetTime}} and setup is not yet confirmed. Please complete and confirm it.',
    sensitivity: 'OPERATIONAL',
    variables: ['theatreName', 'targetTime'],
  },
  {
    code: 'THEATRE_SETUP_OVERDUE',
    channel: 'IN_APP',
    subject: 'Theatre setup OVERDUE',
    body: 'Theatre {{theatreName}} setup is overdue. The case is due at {{targetTime}}. Please attend immediately.',
    sensitivity: 'OPERATIONAL',
    variables: ['theatreName', 'targetTime'],
  },
  {
    code: 'THEATRE_SETUP_ESCALATED',
    channel: 'IN_APP',
    subject: 'ESCALATION — theatre not ready',
    body: 'Theatre {{theatreName}} remains unprepared for a case due at {{targetTime}}. Assigned: {{assigneeName}}. This has been escalated to {{escalatedTo}}.',
    sensitivity: 'OPERATIONAL',
    variables: ['theatreName', 'targetTime', 'assigneeName', 'escalatedTo'],
  },
  {
    // Spoken aloud, so it is written to be heard once: room first, then what.
    code: 'THEATRE_SETUP_ESCALATED',
    channel: 'RADIO',
    subject: 'Theatre not ready',
    body: 'Attention. Theatre {{theatreName}} is not yet ready for a case due at {{targetTime}}. Please attend.',
    sensitivity: 'OPERATIONAL',
    variables: ['theatreName', 'targetTime'],
  },

  // ── Staff assignment ──────────────────────────────────────────────────────
  {
    code: 'CASE_ASSIGNED',
    channel: 'IN_APP',
    subject: 'You have been assigned to a case',
    body: 'You are assigned to {{procedureName}} in {{theatreName}} at {{scheduledTime}}.',
    // Names no patient, so it can reach a phone later without reclassification.
    sensitivity: 'OPERATIONAL',
    variables: ['procedureName', 'theatreName', 'scheduledTime'],
  },
  {
    code: 'CASE_CANCELLED',
    channel: 'IN_APP',
    subject: 'Case cancelled',
    body: '{{procedureName}} in {{theatreName}} at {{scheduledTime}} has been cancelled. Reason: {{reason}}.',
    sensitivity: 'OPERATIONAL',
    variables: ['procedureName', 'theatreName', 'scheduledTime', 'reason'],
  },

  // ── Consent outstanding ───────────────────────────────────────────────────
  {
    code: 'CONSENT_OUTSTANDING',
    channel: 'IN_APP',
    subject: 'Consent outstanding',
    body: 'Consent is still outstanding for {{patientName}} ({{procedureName}}), deferred at booking by {{deferredBy}}. It must be obtained before the patient goes through to theatre.',
    // Names a patient, so on an external channel this is staff-only. In-app it
    // sits behind authentication and is fine.
    sensitivity: 'PATIENT_IDENTIFIED',
    variables: ['patientName', 'procedureName', 'deferredBy'],
  },

  // ── Vendors and consumables ───────────────────────────────────────────────
  {
    code: 'VENDOR_REQUEST_SENT',
    channel: 'EMAIL',
    subject: 'Request {{referenceNumber}} — please confirm',
    body: 'A request has been submitted under reference {{referenceNumber}}, required by {{requiredBy}}. Please confirm receipt.\n\n{{hospitalName}}',
    // Never names a patient: a supplier has no reason to know whose operation
    // the gloves are for.
    sensitivity: 'OPERATIONAL',
    variables: ['referenceNumber', 'requiredBy', 'hospitalName'],
  },
  {
    code: 'VENDOR_RESPONSE_OVERDUE',
    channel: 'EMAIL',
    subject: 'Reminder — request {{referenceNumber}} still unconfirmed',
    body: 'We have not received confirmation for request {{referenceNumber}}, which was required by {{requiredBy}}. Please respond.\n\n{{hospitalName}}',
    sensitivity: 'OPERATIONAL',
    variables: ['referenceNumber', 'requiredBy', 'hospitalName'],
  },

  // ── Patients ──────────────────────────────────────────────────────────────
  {
    code: 'PATIENT_BOOKING_CONFIRMED',
    channel: 'EMAIL',
    subject: 'Your procedure has been scheduled',
    // Deliberately does NOT name the procedure. A booking confirmation that
    // arrives in a shared inbox should not disclose what someone is having done.
    body: 'Dear {{patientName}},\n\nYour procedure has been scheduled for {{scheduledDate}}. Please attend as advised by your team.\n\nIf you need to change this, contact {{contactNumber}}.\n\n{{hospitalName}}',
    sensitivity: 'PATIENT_IDENTIFIED',
    variables: ['patientName', 'scheduledDate', 'contactNumber', 'hospitalName'],
  },
  {
    code: 'PATIENT_DELAY',
    channel: 'EMAIL',
    subject: 'An update about your procedure',
    body: 'Dear {{patientName}},\n\nThere has been a delay affecting your scheduled procedure on {{scheduledDate}}. We are sorry for the inconvenience and will contact you with a new time.\n\nFor any question, contact {{contactNumber}}.\n\n{{hospitalName}}',
    sensitivity: 'PATIENT_IDENTIFIED',
    variables: ['patientName', 'scheduledDate', 'contactNumber', 'hospitalName'],
  },
  {
    code: 'PATIENT_FEEDBACK_REQUEST',
    channel: 'EMAIL',
    subject: 'Your experience at {{hospitalName}}',
    body: 'Dear {{patientName}},\n\nWe would value your feedback. Please use this secure link, which expires in {{expiryDays}} days:\n\n{{feedbackLink}}\n\n{{hospitalName}}',
    sensitivity: 'PATIENT_IDENTIFIED',
    variables: ['patientName', 'feedbackLink', 'expiryDays', 'hospitalName'],
  },

  // ── The pattern for anything clinical ─────────────────────────────────────
  {
    code: 'CLINICAL_UPDATE_AVAILABLE',
    channel: 'EMAIL',
    subject: 'An update is available in ORM',
    // The model for every clinical notification: it says that something exists,
    // and nothing about what. The detail stays behind authentication.
    body: 'A clinical update is available for a patient in your care. Please log in to ORM to view it.\n\n{{hospitalName}}',
    sensitivity: 'OPERATIONAL',
    variables: ['hospitalName'],
  },
];

async function main() {
  const prisma = new PrismaClient();
  let inserted = 0;
  let skipped = 0;
  try {
    for (const t of TEMPLATES) {
      const existing = await prisma.communicationTemplate.findFirst({
        where: { code: t.code, channel: t.channel },
        select: { id: true, version: true },
      });
      if (existing) {
        skipped++;
        console.log(`  skip   ${t.code} (${t.channel}) — already present`);
        continue;
      }
      if (dryRun) {
        inserted++;
        console.log(`  would  ${t.code} (${t.channel}) — ${t.sensitivity}`);
        continue;
      }
      await prisma.communicationTemplate.create({
        data: {
          code: t.code,
          channel: t.channel,
          version: 1,
          subject: t.subject ?? null,
          body: t.body,
          variables: t.variables,
          sensitivity: t.sensitivity,
          // WhatsApp templates additionally need a provider id and Meta's
          // approval; none are seeded here for that reason.
          isActive: true,
        },
      });
      inserted++;
      console.log(`  ok     ${t.code} (${t.channel}) — ${t.sensitivity}`);
    }

    console.log(
      `\n${dryRun ? 'Would insert' : 'Inserted'} ${inserted}, skipped ${skipped}.\n` +
      'Existing templates are never overwritten — a local rewording survives a re-run.\n'
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
