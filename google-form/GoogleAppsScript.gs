/**
 * UNTH Operative Resource Manager — Bulk Staff Onboarding Form
 * ============================================================
 * Google Apps Script that:
 *   1. Programmatically creates a Google Form for staff to fill
 *   2. Validates submissions in real time
 *   3. Writes responses to a Google Sheet that mirrors the
 *      ORM "Bulk Staff Upload" Excel template column-for-column
 *   4. Provides one-click export to .xlsx ready for upload at
 *      Dashboard → User Management → "Upload Excel File"
 *
 * HOW TO USE
 * ----------
 *   1. Open https://script.google.com  →  New project
 *   2. Paste this entire file in the editor (replacing Code.gs)
 *   3. Save (Ctrl+S), name the project "UNTH ORM Staff Onboarding"
 *   4. Run the function `setupForm` once. Approve permissions when
 *      prompted (Google will warn — choose Advanced → Go to project).
 *   5. The Logger / Execution log will print:
 *        ▸ Form URL  (share this with staff via WhatsApp / email)
 *        ▸ Sheet URL (admin only — to review + export)
 *   6. To download the file ready for ORM upload, run
 *      `exportForBulkUpload`. The .xlsx will be e-mailed to the
 *      script owner AND saved in Drive root.
 *
 * The output file matches EXACTLY the columns expected by
 * `/api/users/bulk-upload`:
 *   Full Name | Username | Email | Role | Phone Number |
 *   Department | Staff Code | Staff ID | Password
 */

// ============================================================
// CONFIGURATION
// ============================================================
const FORM_TITLE = 'UNTH ORM — Staff Onboarding Form';
const FORM_DESCRIPTION =
  'Please complete this form so the UNTH Operative Resource Manager (ORM) ' +
  'team can create your login account.\n\n' +
  '• Use your real, full name as printed on your hospital ID.\n' +
  '• Choose a username you will remember (lowercase, no spaces — e.g. ngozi.mba).\n' +
  '• Your initial password will be the same as your username; you will be ' +
  'forced to change it on first login.\n\n' +
  'For help, contact the ORM administrator.';

const SHEET_NAME = 'Bulk Staff Upload';

// MUST match the role enum used by the ORM bulk-upload API
const VALID_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'SURGEON',
  'SCRUB_NURSE',
  'CIRCULATING_NURSE',
  'ANAESTHETIST',
  'ANAESTHETIC_TECHNICIAN',
  'CLEANER',
  'PORTER',
  'VIEWER'
];

const DEPARTMENTS = [
  'Theatre / Operating Rooms',
  'Anaesthesia',
  'Surgery (General)',
  'Surgery (Orthopaedic)',
  'Surgery (Paediatric)',
  'Surgery (Cardiothoracic)',
  'Surgery (Neuro)',
  'Surgery (Plastic / Reconstructive)',
  'Surgery (ENT)',
  'Surgery (Ophthalmic)',
  'Obstetrics & Gynaecology',
  'Recovery / PACU',
  'CSSD / Sterile Services',
  'Holding Area',
  'Theatre Stores',
  'Cleaning Services',
  'Porter Services',
  'Pharmacy',
  'Blood Bank',
  'IT / Systems',
  'Administration',
  'Other'
];

// ============================================================
// MAIN: create the form
// ============================================================
function setupForm() {
  // 1. Create the form
  const form = FormApp.create(FORM_TITLE)
    .setDescription(FORM_DESCRIPTION)
    .setCollectEmail(false)
    .setAllowResponseEdits(true)
    .setLimitOneResponsePerUser(false)
    .setShowLinkToRespondAgain(false)
    .setConfirmationMessage(
      'Thank you! Your details have been received. The ORM team will create ' +
      'your account and notify you. Initial password will be your username.'
    );

  // 2. Add fields (in the same order as the bulk-upload template)
  form.addTextItem()
    .setTitle('Full Name')
    .setHelpText('Exactly as printed on your hospital ID, e.g. Dr. Ngozi Mba')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Username')
    .setHelpText('Lowercase letters, numbers, dot or underscore. No spaces. Example: ngozi.mba')
    .setRequired(true)
    .setValidation(
      FormApp.createTextValidation()
        .setHelpText('Use only lowercase letters, numbers, "." or "_" (3–30 chars).')
        .requireTextMatchesPattern('^[a-z0-9._]{3,30}$')
        .build()
    );

  form.addTextItem()
    .setTitle('Email')
    .setHelpText('Optional but recommended for password reset. Hospital or personal email.')
    .setRequired(false)
    .setValidation(
      FormApp.createTextValidation()
        .setHelpText('Please enter a valid email address (or leave blank).')
        .requireTextMatchesPattern('^$|^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')
        .build()
    );

  form.addListItem()
    .setTitle('Role')
    .setHelpText('Pick the role that best describes your duties in theatre.')
    .setRequired(true)
    .setChoiceValues(VALID_ROLES);

  form.addTextItem()
    .setTitle('Phone Number')
    .setHelpText('Nigerian mobile number, e.g. 08012345678')
    .setRequired(false)
    .setValidation(
      FormApp.createTextValidation()
        .setHelpText('Enter 11 digits starting with 0, or +234 format (or leave blank).')
        .requireTextMatchesPattern('^$|^(0\\d{10}|\\+234\\d{10})$')
        .build()
    );

  form.addListItem()
    .setTitle('Department')
    .setHelpText('Pick the department / specialty you primarily work in.')
    .setRequired(false)
    .setChoiceValues(DEPARTMENTS);

  form.addTextItem()
    .setTitle('Staff Code')
    .setHelpText('REQUIRED for Cleaners and Porters (e.g. CLN001, PRT001). Optional for others.')
    .setRequired(false);

  form.addTextItem()
    .setTitle('Staff ID')
    .setHelpText('Hospital employee ID number (e.g. EMP001234). Optional.')
    .setRequired(false);

  // 3. Create the linked Google Sheet
  const ss = SpreadsheetApp.create(SHEET_NAME);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // 4. Install onSubmit trigger to normalise the response sheet
  ScriptApp.newTrigger('onFormSubmit')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  // 5. Save IDs for later
  const props = PropertiesService.getScriptProperties();
  props.setProperty('FORM_ID', form.getId());
  props.setProperty('SHEET_ID', ss.getId());

  // 6. Print URLs
  const formUrl  = form.getPublishedUrl();
  const editUrl  = form.getEditUrl();
  const sheetUrl = ss.getUrl();

  Logger.log('===========================================');
  Logger.log('  ✅  UNTH ORM Staff Onboarding Form ready');
  Logger.log('===========================================');
  Logger.log(' Share this with staff (fill-in URL):');
  Logger.log('   ' + formUrl);
  Logger.log('');
  Logger.log(' Admin form-edit URL:');
  Logger.log('   ' + editUrl);
  Logger.log('');
  Logger.log(' Response spreadsheet (admin only):');
  Logger.log('   ' + sheetUrl);
  Logger.log('===========================================');

  return { formUrl, editUrl, sheetUrl };
}

// ============================================================
// onFormSubmit: copy + clean response into "Bulk Staff Upload" tab
// matching the ORM template's column order exactly.
// ============================================================
function onFormSubmit(e) {
  const ss = e.source;
  let outSheet = ss.getSheetByName(SHEET_NAME);
  if (!outSheet) {
    outSheet = ss.insertSheet(SHEET_NAME);
    outSheet.appendRow([
      'Full Name', 'Username', 'Email', 'Role',
      'Phone Number', 'Department', 'Staff Code', 'Staff ID', 'Password'
    ]);
    outSheet.getRange(1, 1, 1, 9)
      .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    outSheet.setFrozenRows(1);
  }

  const r = e.namedValues || {};
  const get = (k) => (r[k] && r[k][0] ? String(r[k][0]).trim() : '');

  const fullName   = get('Full Name');
  const username   = get('Username').toLowerCase();
  const email      = get('Email');
  const role       = get('Role');
  const phone      = get('Phone Number');
  const department = get('Department');
  const staffCode  = get('Staff Code');
  const staffId    = get('Staff ID');
  // Password is intentionally blank — the API will default it to the username,
  // and the user will be forced to change it on first login.
  const password   = '';

  outSheet.appendRow([
    fullName, username, email, role,
    phone, department, staffCode, staffId, password
  ]);
}

// ============================================================
// exportForBulkUpload: download the cleaned sheet as .xlsx and
// e-mail it to the script owner. Run this whenever you're ready
// to upload a new batch of staff to ORM.
// ============================================================
function exportForBulkUpload() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) {
    throw new Error('Sheet ID not found. Run setupForm() first.');
  }

  const ss = SpreadsheetApp.openById(sheetId);
  const target = ss.getSheetByName(SHEET_NAME);
  if (!target || target.getLastRow() < 2) {
    throw new Error('No staff submissions yet. Wait for responses, then re-run.');
  }

  // Export ENTIRE spreadsheet as xlsx (Google Drive API export endpoint)
  const url = 'https://docs.google.com/spreadsheets/d/' + sheetId +
              '/export?format=xlsx&id=' + sheetId;
  const token = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token }
  });

  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const filename = 'UNTH-ORM-Staff-Bulk-Upload-' + dateStr + '.xlsx';
  const blob = response.getBlob().setName(filename);

  // Save a copy in Drive root
  const file = DriveApp.createFile(blob);
  const fileUrl = file.getUrl();

  // E-mail to the script owner
  const recipient = Session.getActiveUser().getEmail();
  if (recipient) {
    MailApp.sendEmail({
      to: recipient,
      subject: 'UNTH ORM — Bulk Staff Upload file ready (' + dateStr + ')',
      body:
        'The latest UNTH ORM staff onboarding spreadsheet is attached.\n\n' +
        'How to upload:\n' +
        '  1. Open the ORM dashboard → User Management\n' +
        '  2. Click "Upload Excel File"\n' +
        '  3. Select the attached file\n' +
        '  4. Review the success / error report\n\n' +
        'A copy is also saved in your Drive: ' + fileUrl,
      attachments: [blob]
    });
  }

  Logger.log('Exported file: ' + fileUrl);
  Logger.log('Sent to: ' + recipient);
  return fileUrl;
}

// ============================================================
// reset: dangerous — only use during testing. Deletes the form,
// the sheet, and all submissions.
// ============================================================
function reset_DANGEROUS() {
  const props = PropertiesService.getScriptProperties();
  const formId  = props.getProperty('FORM_ID');
  const sheetId = props.getProperty('SHEET_ID');
  if (formId)  try { DriveApp.getFileById(formId).setTrashed(true);  } catch(_) {}
  if (sheetId) try { DriveApp.getFileById(sheetId).setTrashed(true); } catch(_) {}
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  props.deleteAllProperties();
  Logger.log('Form, sheet and triggers deleted. Run setupForm() to start fresh.');
}
