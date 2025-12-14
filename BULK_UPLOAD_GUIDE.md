# Bulk Staff Upload Feature - User Guide

## Overview
The User Management module now supports bulk upload of staff details via Excel spreadsheet, allowing administrators to create multiple user accounts at once with auto-generated credentials and forced password change on first login.

## Features

### ✅ Excel-Based Bulk Upload
- Upload multiple staff members at once using Excel files
- Auto-generate login credentials for all staff
- Role-based account creation
- Automatic approval of uploaded users

### ✅ Forced Password Change
- All bulk-uploaded users must change password on first login
- Secure default password (username used if not specified)
- Password strength requirements (minimum 8 characters)

### ✅ Upload Template
- Download pre-formatted Excel template
- Includes instructions sheet with valid roles and requirements
- Sample data row for reference

## How to Use

### Step 1: Download Template

1. Go to **Dashboard → User Management**
2. Click **"Download Template"** button
3. Save the `staff_upload_template.xlsx` file

### Step 2: Fill in Staff Details

Required columns (must be filled):
- **Full Name**: Staff member's complete name
- **Username**: Unique username for login (no spaces)
- **Role**: Select from valid roles (see below)

Optional columns:
- **Email**: Staff email address
- **Phone Number**: Contact number
- **Department**: Department name
- **Staff Code**: Unique code for cleaners/porters
- **Staff ID**: Employee ID number
- **Password**: Custom default password (if blank, username is used)

### Step 3: Upload Excel File

1. Click **"Upload Excel File"** button
2. Select your filled template
3. Wait for processing
4. Review upload results:
   - ✓ Number of users created successfully
   - ⚠ Any errors with row numbers and details

### Step 4: Share Credentials

After successful upload:
- Users are automatically approved
- Default password is their username (or custom password if provided)
- Inform staff to log in and change their password

## Valid User Roles

| Role | Description |
|------|-------------|
| **ADMIN** | System administrator with full access |
| **SYSTEM_ADMINISTRATOR** | Technical administrator |
| **THEATRE_MANAGER** | Theatre operations manager |
| **THEATRE_CHAIRMAN** | Theatre department chairman |
| **SURGEON** | Operating surgeon |
| **SCRUB_NURSE** | Scrub nurse in theatre |
| **CIRCULATING_NURSE** | Circulating nurse in theatre |
| **ANAESTHETIST** | Anesthesiologist |
| **ANAESTHETIC_TECHNICIAN** | Anesthesia technician |
| **CLEANER** | Theatre cleaning staff |
| **PORTER** | Patient transport staff |
| **VIEWER** | Read-only access |

## First Login Process

When staff log in for the first time:

1. Enter username and default password
2. **Password Change Modal** appears automatically
3. Enter new password (minimum 8 characters)
4. Confirm new password
5. Click "Change Password & Continue"
6. Redirected to appropriate dashboard based on role

## Excel Template Format

```
Full Name    | Username  | Email              | Role        | Phone Number | Department | Staff Code | Staff ID | Password
-------------|-----------|-------------------|-------------|--------------|------------|------------|----------|----------
John Doe     | johndoe   | john@example.com  | SURGEON     | 08012345678  | Surgery    | SRG001     | EMP001   | optional
Jane Smith   | janesmith | jane@example.com  | SCRUB_NURSE | 08098765432  | Theatre    | SN001      | EMP002   |
```

## Error Handling

The upload process validates each row and reports errors:

**Common Errors:**
- ❌ Missing required fields (Full Name, Username, Role)
- ❌ Invalid role name
- ❌ Username already exists
- ❌ Email already exists (if provided)
- ❌ Staff code already exists (if provided)

**Error Report Format:**
```
Row 3: Username 'johndoe' already exists
Row 5: Invalid role: DOCTOR. Must be one of: ADMIN, SURGEON, ...
Row 7: Missing required fields (Full Name, Username, Role)
```

## Security Features

### ✅ Automatic Approval
- All bulk-uploaded users are auto-approved
- No manual approval required from admin
- Uploaded by user is tracked in database

### ✅ Password Security
- All users flagged for mandatory password change
- First login triggers password change modal
- Cannot proceed without changing password
- New password must be minimum 8 characters

### ✅ Audit Trail
- Upload tracked with timestamp
- Uploader user ID recorded
- All user creation logged

## Tips for Bulk Upload

1. **Use Staff Codes** for cleaners and porters to enable quick duty logging
2. **Provide emails** for password reset functionality
3. **Keep usernames simple** - often first.lastname format
4. **Review template instructions** sheet before uploading
5. **Test with small batch** first (5-10 users) before full upload
6. **Download template each time** to ensure latest format

## Role-Based Dashboard Redirection

After password change, users are redirected based on role:

| Role | Default Dashboard |
|------|------------------|
| Surgeon, Nurses, Anaesthetists | Surgeries |
| Theatre Store Keeper | Inventory |
| Holding Area Nurse | Holding Area |
| Recovery Room Nurse | PACU (Recovery) |
| Theatre Manager/Admin | Main Dashboard |

## Troubleshooting

**Upload fails completely:**
- Check Excel file format (.xlsx or .xls)
- Ensure header row matches template exactly
- Verify at least one data row exists

**Some users not created:**
- Review error report for specific issues
- Check for duplicate usernames/emails
- Verify role names match exactly (case-sensitive)

**Password change fails:**
- Ensure password is at least 8 characters
- Verify passwords match
- Try logging out and logging in again

## API Endpoints

For developers integrating with the system:

- **POST** `/api/users/bulk-upload` - Upload users array
- **GET** `/api/users/check-first-login` - Check if user needs password change
- **POST** `/api/auth/change-password-first-login` - Change password on first login

## Database Changes

New User model fields:
- `isFirstLogin` (Boolean) - Tracks first-time login
- `mustChangePassword` (Boolean) - Forces password change
- Both default to `true` for bulk-uploaded users
- Set to `false` after password is changed

## Support

For issues or questions:
1. Check upload error report for specific issues
2. Verify Excel template format matches current version
3. Contact system administrator for database-level issues
4. Review audit logs for upload history
