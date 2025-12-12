# Theatre Manager - User Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [User Roles](#user-roles)
3. [Core Features](#core-features)
4. [Common Tasks](#common-tasks)
5. [Best Practices](#best-practices)

---

## Getting Started

### First Login
1. Open your browser and navigate to `http://localhost:3000`
2. Click "Sign in to your account"
3. Enter your username and password
4. You will be redirected to the dashboard

### Dashboard Overview
The dashboard provides:
- Quick statistics overview
- Today's scheduled surgeries
- Low stock alerts
- Quick action buttons
- Navigation menu on the left

---

## User Roles

### Admin
**Full system access including:**
- User approval and management
- All inventory operations
- Surgery scheduling and management
- Patient records
- System configuration
- Reports and analytics

### Theatre Manager
**Operational management:**
- Inventory management
- Surgery scheduling oversight
- User approval (limited)
- Transfer tracking
- Reports generation

### Theatre Chairman
**Clinical oversight:**
- Surgery scheduling review
- Quality assurance
- Reports viewing
- Case cancellation review

### Surgeon
**Clinical operations:**
- Schedule own surgeries
- Complete WHO checklists
- Patient assessment
- View patient records

### Scrub Nurse
**Theatre support:**
- Inventory usage tracking
- Patient transfer logging
- WHO checklist assistance
- Supply requests

---

## Core Features

### 1. Inventory Management

#### Adding New Inventory Item
1. Navigate to **Inventory** from the sidebar
2. Click **"Add Item"** button
3. Fill in the form:
   - Item name
   - Category (Consumable/Machine/Device)
   - Description
   - Unit cost price
   - Quantity
   - Reorder level
   - Supplier
4. Click **"Save"**

#### Monitoring Stock Levels
- Red badge = Low stock (below reorder level)
- Green badge = In stock
- Yellow alert banner shows all low stock items

#### Recording Supply Deliveries
1. Go to Inventory
2. Select an item
3. Click **"Record Supply"**
4. Enter quantity and cost details
5. Save

---

### 2. Surgery Scheduling

#### Scheduling a New Surgery
1. Navigate to **Surgeries**
2. Click **"Schedule Surgery"**
3. Complete the form:

**Patient Information:**
- Select existing patient or add new
- Folder number
- PT number
- Age, gender, ward

**Surgery Details:**
- Subspecialty (e.g., General Surgery, Orthopedics)
- Indication for surgery
- Procedure name
- Date and time

**Special Requirements:**
- ☐ Blood transfusion needed
- ☐ Diathermy required
- ☐ Stereo equipment
- ☐ Montrell mattress
- Other special needs (text field)

4. Assign surgeon
5. Click **"Schedule"**

#### Viewing Surgery Details
- Click on any surgery in the list
- View all details including:
  - Patient information
  - Procedure details
  - Items used and costs
  - WHO checklists status

---

### 3. Patient Management

#### Registering a New Patient
1. Go to **Patients**
2. Click **"Add Patient"**
3. Enter:
   - Full name
   - Folder number (unique)
   - PT number (optional)
   - Age
   - Gender
   - Ward
4. Click **"Save"**

#### Preoperative Fitness Assessment
1. Select patient
2. Click **"Fitness Assessment"**
3. Complete:
   - Comorbidities checklist
   - Current medications
   - Allergies
   - ASA score
   - Fitness level
   - Recommendations
4. Submit

---

### 4. WHO Surgical Safety Checklist

#### Sign In (Before Anesthesia)
Complete before inducing anesthesia:
- ✓ Patient identity confirmed
- ✓ Site marked
- ✓ Anesthesia safety check
- ✓ Pulse oximeter on patient
- ✓ Known allergies checked

#### Time Out (Before Skin Incision)
Complete before making incision:
- ✓ Team members introduced
- ✓ Procedure confirmed
- ✓ Critical steps reviewed
- ✓ Equipment concerns addressed
- ✓ Antibiotics given
- ✓ Imaging displayed

#### Sign Out (Before Patient Leaves)
Complete before patient leaves OR:
- ✓ Procedure recorded
- ✓ Instrument count correct
- ✓ Specimens labeled
- ✓ Equipment problems noted
- ✓ Recovery plan reviewed

---

### 5. Patient Transfer Tracking

#### Recording a Transfer
1. Navigate to **Transfers**
2. Click **"Record Transfer"**
3. Select:
   - Patient
   - From location (Ward/Holding Area/Theatre/Recovery)
   - To location
   - Time (auto-filled)
   - Optional notes
4. Submit

**Transfer Flow:**
```
Ward → Holding Area → Theatre Suite → Recovery → Ward
```

---

### 6. Case Cancellation

#### Recording a Cancellation
1. Go to **Surgeries**
2. Find the scheduled surgery
3. Click **"Cancel"**
4. Provide:
   - Primary reason (dropdown)
   - Detailed explanation
   - Contributing factors
5. Submit

**Common Cancellation Reasons:**
- Patient not fit for surgery
- Equipment failure
- Emergency case priority
- Surgeon unavailable
- Patient refused
- Administrative issues

---

### 7. Cost Management

The system automatically:
- Tracks items used in each surgery
- Calculates total cost
- Applies 10% markup for patient billing
- Generates cost reports

**Example:**
```
Item: Surgical Gloves
Cost Price: ₦5,000
Patient Charge: ₦5,500 (10% markup)
```

---

## Common Tasks

### Approving New Users (Admin/Manager Only)
1. Go to **User Management**
2. View "Pending Approvals" section
3. Review user details
4. Click **"Approve"** or **"Reject"**

### Checking Low Stock Items
1. Dashboard shows alert banner
2. Click alert or go to **Inventory**
3. Filter by "Low Stock"
4. Order supplies as needed

### Viewing Today's Surgeries
1. Dashboard shows count
2. Go to **Surgeries**
3. Filter by today's date
4. View schedule

### Generating Reports
1. Navigate to **Reports**
2. Select report type:
   - Surgery statistics
   - Inventory usage
   - Cost analysis
   - Cancellation trends
3. Choose date range
4. Click **"Generate"**

---

## Best Practices

### Security
- ✓ Change default password immediately
- ✓ Use strong passwords (8+ characters, mixed case, numbers)
- ✓ Never share login credentials
- ✓ Log out when finished
- ✓ Report suspicious activity

### Data Entry
- ✓ Double-check patient details
- ✓ Use correct folder/PT numbers
- ✓ Complete all required fields
- ✓ Add notes for clarity
- ✓ Verify before submitting

### Inventory Management
- ✓ Update stock immediately after use
- ✓ Record all supplies received
- ✓ Set appropriate reorder levels
- ✓ Regular stock audits
- ✓ Report discrepancies

### Surgery Scheduling
- ✓ Confirm patient availability
- ✓ Check equipment availability
- ✓ Verify special requirements
- ✓ Coordinate with team members
- ✓ Update status promptly

### WHO Checklists
- ✓ Complete all sections
- ✓ Involve entire team
- ✓ Take time to verify each item
- ✓ Speak up if concerns arise
- ✓ Document any deviations

---

## Troubleshooting

### Cannot Login
- Verify username and password
- Check if account is approved (contact admin)
- Ensure caps lock is off

### Page Not Loading
- Refresh browser (F5)
- Clear browser cache
- Check internet connection
- Contact IT support

### Missing Data
- Check filters are not hiding data
- Verify you have permission to view
- Try different search terms

### Error Messages
- Read the error message carefully
- Note what you were doing when it occurred
- Contact IT support with details

---

## Support

For help:
1. Check this user guide
2. Contact your supervisor
3. Email IT department
4. Call hospital IT helpdesk

---

**University of Nigeria Teaching Hospital Ituku Ozalla**  
*Theatre Manager System v1.0*
