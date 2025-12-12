# Update Summary - Surgery Booking & Ward List

## Changes to be implemented:

### 1. Surgery Booking Form - Dynamic Surgical Team
- Add dynamic fields for surgical team members
- Roles: Consultant, Senior Registrar, Registrar, House Officers
- Allow adding multiple members per role
- Each entry can be added one after another

### 2. Ward Selection Update
Ward list to include:
- Ward 1
- Ward 2
- Ward 3
- Ward 4
- Ward 5
- Ward 6A
- Ward 6B
- Ward 8
- Ward 9
- Ward 10
- Neurosurgical Ward
- Surgical Emergency Ward
- Medical Emergency Ward
- ICU
- Post Natal Ward
- Oncology Ward
- Male Medical Ward
- Female Medical Ward
- Male Medical Ward Extension
- Psychiatric Ward
- Eye Ward
- White Room (Private)
- Pink Room (Private)
- Blue Room (Private)
- Others (specify)

### 3. Inventory - Machines & Devices
Add fields for equipment:
- Half-life (for consumables/chemicals)
- Depreciation rate
- Maintenance intervals
- Alert triggers based on maintenance due dates

### 4. Fix API Errors
- Fix: /api/surgeries/[id]/count 404 error
- Fix: Theatre form reset error

Files to modify:
1. src/app/dashboard/surgeries/new/page.tsx - Surgical team
2. src/app/dashboard/patients/new/page.tsx - Ward list
3. src/app/dashboard/inventory/new/page.tsx - Equipment fields
4. src/app/api/surgeries/[id]/count/route.ts - Create if missing
5. src/app/dashboard/theatres/page.tsx - Fix form reset
