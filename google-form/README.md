# UNTH ORM — Staff Onboarding Google Form

A ready-to-run Google Apps Script that auto-builds a Google Form, collects staff details, and exports an Excel file that drops straight into **Dashboard → User Management → Upload Excel File**.

## What it does

1. **Creates a polished Google Form** with built-in validation (username pattern, email format, Nigerian phone format, role drop-down, department drop-down).
2. **Auto-creates a linked Google Sheet** with a tab named *Bulk Staff Upload* whose columns match the ORM template **exactly**:
   `Full Name | Username | Email | Role | Phone Number | Department | Staff Code | Staff ID | Password`
3. **Normalises every submission** in real time (lowercases the username, trims whitespace, leaves the Password column blank so the API defaults it to the username and forces change on first login).
4. **One-click export to .xlsx** that is also e-mailed to the admin.

## Setup (5 minutes, one-time)

1. Go to https://script.google.com → **New project**
2. Delete the placeholder `Code.gs` content and paste the contents of [`GoogleAppsScript.gs`](./GoogleAppsScript.gs)
3. Press **Save** (Ctrl + S) — name the project `UNTH ORM Staff Onboarding`
4. In the function-name dropdown at the top, choose **`setupForm`** → click **Run**
5. Google will warn about an unverified app:
   - Click **Advanced** → **Go to UNTH ORM Staff Onboarding (unsafe)** → **Allow**
   - This is normal for personal scripts; only you can run it.
6. Open **View → Logs** (or **Execution log**) — you'll see three URLs printed:
   - **Form URL** → share this on the staff WhatsApp group / email
   - **Form-edit URL** → bookmark for yourself
   - **Sheet URL** → bookmark for yourself

## Daily / weekly admin workflow

1. Wait for staff to fill the form (responses pile up automatically in the sheet's *Bulk Staff Upload* tab).
2. In the Apps Script editor, run the function **`exportForBulkUpload`**.
3. The script:
   - Builds an `.xlsx` named `UNTH-ORM-Staff-Bulk-Upload-YYYY-MM-DD.xlsx`
   - Saves a copy in your Google Drive root
   - E-mails it to you with attachment + Drive link
4. Open the ORM dashboard → **User Management** → **Upload Excel File** → select that file.
5. Review the success / error report shown by ORM.
6. Tell the new staff to log in with username = the one they chose, password = the same value (they'll be forced to change it).

## Field validation built in

| Field | Rule |
|---|---|
| Full Name | Required |
| Username | Required, regex `^[a-z0-9._]{3,30}$` (lowercase, no spaces) |
| Email | Optional but must be valid email if filled |
| Role | Required, drop-down — exact ORM enum values |
| Phone Number | Optional, must be `08…` (11 digits) or `+234…` if filled |
| Department | Optional, drop-down |
| Staff Code | Optional (REQUIRED in ORM only for cleaners/porters — covered by helper text) |
| Staff ID | Optional |

## Re-running / cleanup

- Re-running `setupForm` makes a **second** form. To start over, run `reset_DANGEROUS` first (deletes the form, the sheet, and all responses).
- The Form URL never changes once created — keep sharing the same one.

## Why no password field on the form?

Two reasons:
1. **Security**: passwords typed into a Google Form are stored in plain text in the response sheet — bad practice.
2. **The ORM API already forces password change on first login.** When the Password column is blank, the bulk-upload endpoint defaults it to the username; the user then must change it the first time they sign in.

## Troubleshooting

- *"You do not have permission to call MailApp.sendEmail"* — the first run needs the OAuth scope; click **Allow** when prompted.
- *"No staff submissions yet"* — at least one form response must exist before `exportForBulkUpload` can produce a file.
- *Username rejected by ORM as duplicate* — the form can't check the live ORM database; if the bulk-upload report flags duplicates, just delete those rows from the sheet and re-export, then re-upload.
