# Theatre Allocation Form Update Instructions

## Changes Needed in `/dashboard/theatres/page.tsx`:

### 1. Add Shift State and Auto-fill
Add after line 54:
```typescript
const [selectedShift, setSelectedShift] = useState<string>('MORNING');
const [autofilledStaff, setAutofilledStaff] = useState<any>(null);
```

### 2. Add Auto-fill Function
Add this function to fetch roster suggestions:
```typescript
const fetchRosterSuggestions = async (theatreId: string, date: string, shift: string) => {
  try {
    const response = await fetch(`/api/roster/autofill?theatreId=${theatreId}&date=${date}&shift=${shift}`);
    if (response.ok) {
      const data = await response.json();
      setAutofilledStaff(data.staffSuggestions);
      
      // Auto-fill the form if we have a form reference
      if (data.staffSuggestions) {
        Object.keys(data.staffSuggestions).forEach((key) => {
          const value = data.staffSuggestions[key];
          if (value) {
            const element = document.querySelector(`[name="${key}Id"]`) as HTMLSelectElement;
            if (element) {
              element.value = value;
            }
          }
        });
      }
    }
  } catch (error) {
    console.error('Failed to fetch roster suggestions:', error);
  }
};
```

### 3. Update handleAddAllocation to include shift
In the handleAddAllocation function, add shift to the request body:
```typescript
shift: formData.get('shift'),
```

### 4. Update Modal to be Scrollable
Replace the modal wrapper (line 510):
```typescript
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
  <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
    <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
      <h2 className="text-2xl font-bold">Add Theatre Allocation</h2>
    </div>
    <form onSubmit={handleAddAllocation} className="p-6 space-y-4">
```

### 5. Add Shift Selector and Auto-fill Trigger
Add after the Theatre Suite selector (around line 520):
```typescript
<div>
  <label className="label">Shift *</label>
  <select 
    name="shift" 
    required 
    className="input-field"
    value={selectedShift}
    onChange={(e) => {
      setSelectedShift(e.target.value);
      const theatreSelect = document.querySelector('[name="theatreId"]') as HTMLSelectElement;
      if (theatreSelect?.value && selectedDate) {
        fetchRosterSuggestions(theatreSelect.value, selectedDate, e.target.value);
      }
    }}
  >
    <option value="MORNING">Morning</option>
    <option value="CALL">Call</option>
    <option value="NIGHT">Night</option>
  </select>
</div>
```

### 6. Add Theatre Change Handler
Update the theatre selector to trigger auto-fill:
```typescript
<select 
  name="theatreId" 
  required 
  className="input-field"
  onChange={(e) => {
    if (e.target.value && selectedDate && selectedShift) {
      fetchRosterSuggestions(e.target.value, selectedDate, selectedShift);
    }
  }}
>
```

### 7. Make Staff Assignments Section Scrollable
Wrap staff assignments (around line 650) in a scrollable container:
```typescript
<div className="border-t pt-4 mt-4 max-h-96 overflow-y-auto">
  <h3 className="text-lg font-semibold text-gray-900 mb-3 sticky top-0 bg-white pb-2">
    Staff Assignments {autofilledStaff && <span className="text-sm text-green-600">(Auto-filled from roster)</span>}
  </h3>
  
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-2">
    {/* All staff selectors here */}
  </div>
</div>
```

### 8. Update API Route
In `/api/allocations/route.ts`, add shift field to Prisma create:
```typescript
shift: body.shift || null,
```

## Summary
These changes will:
- ✅ Make the allocation form scrollable
- ✅ Add shift field (Morning/Call/Night)
- ✅ Auto-fill staff from roster when theatre + shift selected
- ✅ Show visual indication of auto-filled data
- ✅ Allow manual override of auto-filled selections
