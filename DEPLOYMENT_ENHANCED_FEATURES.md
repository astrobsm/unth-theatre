# Quick Deployment Guide - Enhanced Features

## Overview
This guide will help you deploy the new enhanced features including Blood Bank module, Pharmacist module, Pre-operative Reviews, and Emergency Alerts.

## Prerequisites
- Existing Theatre Manager installation
- PostgreSQL database access
- Node.js installed
- Admin access to the system

---

## Step 1: Update Database Schema

### Option A: Using Prisma Migrate (Recommended for Production)

```powershell
# Navigate to project directory
cd "e:\theatre manger"

# Generate Prisma client with new models
npx prisma generate

# Create migration
npx prisma migrate dev --name add_enhanced_features

# Apply migration to database
npx prisma migrate deploy
```

### Option B: Using Prisma Push (Development/Testing)

```powershell
# Push schema changes directly
npx prisma db push
```

---

## Step 2: Create User Accounts for New Roles

### Using SQL (Direct Database Access)

```sql
-- Connect to PostgreSQL
psql -U postgres -d theatre_db

-- Create Blood Bank Staff User
INSERT INTO users (
  id,
  username,
  email,
  password,
  "fullName",
  role,
  status,
  "createdAt",
  "updatedAt"
)
VALUES (
  gen_random_uuid(),
  'bloodbank',
  'bloodbank@hospital.com',
  '$2b$10$YourHashedPasswordHere',  -- Use bcrypt to hash: 'bloodbank123'
  'Blood Bank Officer',
  'BLOODBANK_STAFF',
  'APPROVED',
  NOW(),
  NOW()
);

-- Create Pharmacist User
INSERT INTO users (
  id,
  username,
  email,
  password,
  "fullName",
  role,
  status,
  "createdAt",
  "updatedAt"
)
VALUES (
  gen_random_uuid(),
  'pharmacist',
  'pharmacy@hospital.com',
  '$2b$10$YourHashedPasswordHere',  -- Use bcrypt to hash: 'pharmacy123'
  'Chief Pharmacist',
  'PHARMACIST',
  'APPROVED',
  NOW(),
  NOW()
);
```

### Generate Password Hashes

```javascript
// Use Node.js to generate password hashes
const bcrypt = require('bcryptjs');

async function hashPassword(password) {
  const hash = await bcrypt.hash(password, 10);
  console.log(hash);
}

hashPassword('bloodbank123');  // For blood bank staff
hashPassword('pharmacy123');   // For pharmacist
```

---

## Step 3: Restart Application

```powershell
# If using development server
npm run dev

# If using production build
npm run build
npm start

# If using PM2
pm2 restart theatre-manager
```

---

## Step 4: Verify Installation

### Test Database Tables

```sql
-- Check if new tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'preoperative_anesthetic_reviews',
  'anesthetic_prescriptions',
  'blood_requests',
  'emergency_surgery_alerts',
  'tv_alert_display_logs'
);

-- Should return 5 rows
```

### Test API Endpoints

```powershell
# Test pre-op reviews endpoint (requires authentication)
Invoke-WebRequest -Uri "http://localhost:3000/api/preop-reviews" -Method GET

# Test prescriptions endpoint
Invoke-WebRequest -Uri "http://localhost:3000/api/prescriptions" -Method GET

# Test blood requests endpoint
Invoke-WebRequest -Uri "http://localhost:3000/api/blood-requests" -Method GET

# Test emergency alerts endpoint
Invoke-WebRequest -Uri "http://localhost:3000/api/emergency-alerts" -Method GET
```

### Test User Login

1. Navigate to http://localhost:3000
2. Login with new credentials:
   - **Blood Bank:** username: `bloodbank`, password: `bloodbank123`
   - **Pharmacist:** username: `pharmacist`, password: `pharmacy123`
3. Verify dashboards redirect correctly

---

## Step 5: Configure Permissions

All permissions are pre-configured in `/src/lib/permissions.ts`. Verify roles have correct access:

### Blood Bank Staff Can:
- ✅ View blood requests
- ✅ Acknowledge requests
- ✅ Update blood preparation status
- ✅ View daily blood summary
- ✅ Receive emergency alerts

### Pharmacist Can:
- ✅ View approved prescriptions
- ✅ Mark prescriptions as packed
- ✅ Add packing notes
- ✅ View surgery schedules
- ✅ Receive emergency alerts

### Anesthetist Can (Enhanced):
- ✅ Create pre-operative reviews
- ✅ Create prescriptions
- ✅ Approve reviews (if consultant)
- ✅ Approve prescriptions (if consultant)
- ✅ Request blood for surgeries

---

## Step 6: Test Complete Workflow

### Test Pre-Operative Review Workflow

1. **As Anesthetist:**
   - Login as anesthetist
   - Find scheduled surgery
   - Create pre-operative review
   - Fill in patient assessment
   - Save review

2. **As Consultant Anesthetist:**
   - Review the pre-op assessment
   - Approve or request changes

3. **Verify:**
   - Review status updates
   - Notifications sent correctly

### Test Prescription Workflow

1. **As Anesthetist:**
   - Create prescription from pre-op review
   - List medications, fluids, emergency drugs
   - Submit for approval

2. **As Consultant:**
   - Review prescription
   - Approve

3. **As Pharmacist:**
   - View approved prescription
   - Pack medications
   - Mark as packed

4. **Verify:**
   - Status updates through workflow
   - Notifications at each stage

### Test Blood Request Workflow

1. **As Surgeon/Anesthetist:**
   - Book surgery requiring blood
   - Create blood request
   - Specify blood type and units

2. **As Blood Bank Staff:**
   - Receive notification
   - Acknowledge request
   - Update preparation status
   - Mark as ready

3. **Verify:**
   - Alerts sent immediately
   - Daily summary shows request
   - Status tracking works

### Test Emergency Alert

1. **As Surgeon/Theatre Manager:**
   - Book emergency surgery OR
   - Mark existing surgery as EMERGENCY
   - Fill in alert details

2. **Verify:**
   - RED ALERT sent to all staff
   - Alert appears on emergency dashboard
   - Blood request auto-created (if specified)
   - TV display would show alert

3. **As Theatre Staff:**
   - Acknowledge alert
   - Update readiness status

---

## Step 7: Monitor Logs

### Check for Errors

```powershell
# Application logs
# Check console output for any errors during:
# - Database queries
# - API requests
# - Authentication
```

### Common Issues

**Issue:** Prisma client not updated
```powershell
# Solution:
npx prisma generate
npm run dev  # Restart server
```

**Issue:** Database connection error
```powershell
# Solution: Check DATABASE_URL in .env file
# Should be: postgresql://postgres:natiss_natiss@localhost:5432/theatre_db
```

**Issue:** Permission denied errors
```powershell
# Solution: Check user role is set correctly in database
# Verify status is 'APPROVED'
```

---

## Step 8: Training Users

### Blood Bank Staff Training
1. Show how to access blood bank dashboard
2. Demonstrate acknowledging requests
3. Explain status updates
4. Show emergency request handling

### Pharmacist Training
1. Show prescription dashboard
2. Demonstrate packing workflow
3. Explain urgency levels
4. Show how to add packing notes

### Anesthetist Training
1. Show pre-op review creation
2. Demonstrate prescription creation
3. Explain approval workflow
4. Show how prescriptions appear for pharmacist

---

## Rollback Procedure (If Needed)

### If Issues Arise

```powershell
# Option 1: Revert last migration
npx prisma migrate resolve --rolled-back <migration-name>

# Option 2: Restore database from backup
psql -U postgres -d theatre_db < backup_before_update.sql

# Option 3: Disable new features temporarily
# Set feature flags in code to hide new modules
```

---

## Post-Deployment Checklist

- [ ] Database schema updated successfully
- [ ] New user accounts created
- [ ] Users can login with new roles
- [ ] API endpoints responding correctly
- [ ] Pre-op review workflow tested
- [ ] Prescription workflow tested
- [ ] Blood request workflow tested
- [ ] Emergency alerts triggering correctly
- [ ] Permissions configured correctly
- [ ] Notifications sending properly
- [ ] No errors in server logs
- [ ] Staff trained on new features
- [ ] Documentation distributed
- [ ] Backup taken after successful deployment

---

## Performance Monitoring

### Watch These Metrics

1. **Response Times**
   - API endpoint response times should be < 500ms
   - Database queries < 100ms

2. **Alert Delivery**
   - Emergency alerts should deliver within seconds
   - Email notifications within 1 minute

3. **Database Growth**
   - Monitor table sizes
   - Set up regular backups

---

## Support

### Getting Help

1. **Check Logs:**
   - Application logs for errors
   - Database logs for query issues
   - Browser console for frontend errors

2. **Common Solutions:**
   - Restart application
   - Clear browser cache
   - Regenerate Prisma client
   - Check database connection

3. **Documentation:**
   - ENHANCED_FEATURES_GUIDE.md - Complete feature documentation
   - SETUP_GUIDE.md - General setup instructions
   - USER_GUIDE.md - End-user documentation

---

## Maintenance

### Regular Tasks

**Daily:**
- Monitor emergency alerts
- Check notification delivery
- Verify blood requests processing

**Weekly:**
- Review pre-op completion rates
- Check prescription turnaround times
- Analyze blood usage patterns

**Monthly:**
- Database backup
- Clear old TV display logs
- Review resolved emergency alerts
- Performance optimization

---

## Next Steps

After successful deployment:

1. ✅ Monitor system for first week closely
2. ✅ Gather user feedback
3. ✅ Fine-tune notification settings
4. ✅ Optimize database queries if needed
5. ✅ Create user training materials
6. ✅ Plan for future enhancements

---

**Deployment Date:** _______________  
**Deployed By:** _______________  
**Version:** 1.0 (Enhanced Features)  
**System:** Theatre Manager - UNTH Ituku Ozalla
