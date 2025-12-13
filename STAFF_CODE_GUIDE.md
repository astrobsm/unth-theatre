# Staff Code Setup for Cleaners and Porters

## What is Staff Code?

Staff Code is a unique identifier assigned to cleaners and porters that allows them to quickly log their duties (cleaning, patient transport) without having to fully log in to the system.

## How to Set Up Staff Codes

### For Administrators:

1. **Log in** as Admin/Theatre Manager/Chairman
2. Go to **Users** page in the dashboard
3. Find the cleaner or porter user
4. **Edit their profile** and assign a unique `staffCode` (e.g., "CLN001", "PRT001")
5. **Save** the changes

### For Cleaners and Porters:

Once your administrator has assigned you a staff code:

1. Go to the **Login page**
2. Click **"▼ Quick Duty Logging (Cleaners/Porters)"** at the bottom
3. Enter your **Staff Code** (the code given to you by your administrator)
4. Click the appropriate button:
   - **🧹 Start Cleaning** - When you begin cleaning a theatre
   - **✓ End Cleaning** - When you finish cleaning
   - **🚑 Start Transport** - When you begin transporting a patient
   - **✓ End Transport** - When you finish transport
   - **⏱️ Start Other Duty** - For other assigned duties
   - **✓ End Other Duty** - When other duty is complete

## Staff Code Format Recommendations

- **Cleaners**: CLN001, CLN002, CLN003, etc.
- **Porters**: PRT001, PRT002, PRT003, etc.
- Keep codes short (6-8 characters max)
- Make them easy to remember
- Avoid special characters

## User Roles That Can Use Staff Code

- **CLEANER** - Can log cleaning activities
- **PORTER** - Can log patient transport activities  
- **ORDERLY** - Can log general duties

## Creating Cleaner/Porter Users

When registering a new cleaner or porter:

1. Go to **Register** page
2. Fill in basic information
3. Select role: **CLEANER** or **PORTER**
4. Wait for administrator approval
5. Administrator will then assign a staff code

## Security Notes

- Staff codes are unique - no two users can have the same code
- Users must be **APPROVED** before their staff code works
- Only users with role CLEANER/PORTER can use quick duty logging
- All duty logs are tracked with timestamps for accountability

## Troubleshooting

**"Invalid staff code" error:**
- Check if code was typed correctly (case-sensitive)
- Verify administrator has assigned you a code
- Contact your supervisor if issue persists

**"Staff account is not approved" error:**
- Your account is pending administrator approval
- Contact Theatre Manager or Chairman for approval

**"Only cleaners can log cleaning duties" error:**
- You may be trying to use cleaning functions with a porter code
- Use the correct button for your role
