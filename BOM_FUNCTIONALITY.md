# Bill of Materials (BOM) Functionality

## Overview
Comprehensive BOM system for tracking and analyzing the total cost of all consumables used for each surgery, providing detailed cost breakdowns, analytics, and reporting capabilities.

## Features Implemented

### 1. Individual Surgery BOM Report (`/dashboard/surgeries/[id]/bom`)
**Purpose**: Detailed Bill of Materials for a specific surgery showing all consumables used and total costs.

**Key Features**:
- **Patient & Surgery Information**
  - Patient name, folder number, age, gender
  - Procedure name and surgeon details
  - Unit/department and surgery date
  - Surgery status

- **Key Metrics Cards**
  - Total items used
  - Subtotal cost
  - Markup (10%)
  - Profit margin percentage

- **Materials Breakdown Table**
  - Item name and category
  - Quantity used
  - Unit cost per item
  - Total cost (quantity × unit cost)
  - Sortable and filterable

- **Cost Summary**
  - Subtotal (material cost)
  - 10% markup
  - Total cost (with markup)
  - Patient charge

- **Cost by Category Analysis**
  - Visual breakdown by item category
  - Percentage distribution
  - Progress bars showing relative costs

- **Export Capabilities**
  - PDF export with UNTH branding
  - Print-friendly layout
  - Professional formatting with tables and charts
  - Auto-generated filename with date

**Access**: 
- From surgeries list: "BOM" button on each surgery row
- From consumables page: "View BOM Report" button (when items recorded)

### 2. BOM Analytics Dashboard (`/dashboard/reports/bom`)
**Purpose**: Comprehensive cost analysis and trends across all surgeries with filtering and comparison capabilities.

**Key Metrics**:
- Total surgeries with consumables tracked
- Total cost across all surgeries
- Average cost per surgery
- Total items used

**Analytics Views**:

1. **Cost Breakdown by Category**
   - Table showing each inventory category
   - Number of items per category
   - Total cost per category
   - Percentage of total cost
   - Visual distribution bars

2. **Cost Analysis by Unit/Department**
   - Surgery count per unit
   - Total cost per unit
   - Average cost per surgery by unit
   - Comparative analysis

3. **Recent Surgery Costs**
   - Last 10 surgeries with consumables
   - Patient name and procedure
   - Surgery date
   - Item count
   - Total cost
   - Direct link to individual BOM

4. **Monthly Cost Trend**
   - Monthly aggregation of costs
   - Surgery count per month
   - Average cost per month
   - Visual trend bars

**Filters**:
- Time period: 7/30/90/180/365 days
- Unit/department filter
- Real-time data refresh

**Export**: PDF report with all analytics data

**Access**: From Reports page → "BOM Analytics" card

### 3. Integration Points

**Surgeries List Page** (`/dashboard/surgeries`)
- Added "BOM" button with FileText icon
- Purple color scheme to distinguish from other actions
- Positioned next to Checklist and Consumables buttons

**Consumables Tracking Page** (`/dashboard/surgeries/[id]/consumables`)
- "View BOM Report" button in header
- Only shown when existing consumables recorded
- Secondary button styling

**Reports Page** (`/dashboard/reports`)
- New BOM Analytics card with purple gradient
- Prominent placement in 3-column grid
- Clear description of analytics features

## Database Schema

The BOM system leverages existing database models:

### Surgery Model
```prisma
model Surgery {
  totalItemsCost  Decimal?  @db.Decimal(10, 2)  // Total cost of consumables
  patientCharge   Decimal?  @db.Decimal(10, 2)  // Amount charged to patient
  items           SurgeryItem[]                   // Related consumables
}
```

### SurgeryItem Model
```prisma
model SurgeryItem {
  quantity   Int                              // Quantity used
  unitCost   Decimal  @db.Decimal(10, 2)     // Cost per unit
  totalCost  Decimal  @db.Decimal(10, 2)     // quantity × unitCost
  surgery    Surgery  @relation(...)          // Parent surgery
  item       InventoryItem @relation(...)     // Inventory item details
}
```

### InventoryItem Model
```prisma
model InventoryItem {
  name          String
  category      ItemCategory                   // For category breakdown
  unitCostPrice Decimal  @db.Decimal(10, 2)  // Base cost
  surgeryItems  SurgeryItem[]                 // Usage tracking
}
```

## API Endpoints

### 1. GET `/api/surgeries/[id]/bom`
**Purpose**: Fetch BOM data for a specific surgery

**Response**:
```json
{
  "id": "surgery-uuid",
  "procedureName": "Appendectomy",
  "scheduledDate": "2024-01-15",
  "status": "COMPLETED",
  "totalItemsCost": 45000,
  "patientCharge": 50000,
  "patient": {
    "name": "John Doe",
    "folderNumber": "FN12345",
    "age": 35,
    "gender": "Male"
  },
  "surgeon": { "fullName": "Dr. Smith" },
  "unit": "General Surgery",
  "items": [
    {
      "id": "item-uuid",
      "quantity": 5,
      "unitCost": 2000,
      "totalCost": 10000,
      "item": {
        "name": "Surgical Gloves",
        "category": "Protective Equipment"
      }
    }
  ]
}
```

### 2. GET `/api/analytics/bom`
**Purpose**: Fetch aggregated BOM analytics

**Query Parameters**:
- `days`: Number of days to analyze (default: 30)
- `unit`: Filter by unit/department (optional)

**Response**:
```json
{
  "totalSurgeries": 45,
  "totalCost": 2500000,
  "averageCostPerSurgery": 55555,
  "totalItems": 450,
  "costByCategory": [
    {
      "category": "Surgical Instruments",
      "totalCost": 800000,
      "itemCount": 120
    }
  ],
  "costByUnit": [
    {
      "unit": "General Surgery",
      "totalCost": 1200000,
      "surgeryCount": 25,
      "averageCost": 48000
    }
  ],
  "recentSurgeries": [...],
  "monthlyTrend": [
    {
      "month": "Jan 2024",
      "totalCost": 500000,
      "surgeryCount": 10
    }
  ]
}
```

## Cost Calculation Logic

### Subtotal Calculation
```
Subtotal = Σ(quantity × unitCost) for all items
```

### Markup Calculation
```
Markup = Subtotal × 0.10 (10%)
```

### Total Cost
```
Total Cost = Subtotal + Markup
```

### Patient Charge
```
Patient Charge = Total Cost (or custom amount if specified)
```

### Category Breakdown
```
For each category:
  Category Total = Σ(totalCost) for items in category
  Percentage = (Category Total / Overall Subtotal) × 100
```

## PDF Export Features

### Individual BOM PDF
- **Header**: UNTH branding with green background
- **Document Info**: Generated date, BOM ID
- **Patient Section**: All patient and surgery details
- **Materials Table**: Itemized list with costs
- **Cost Summary Box**: Highlighted totals
- **Footer**: Page numbers and confidentiality notice

### Analytics PDF
- **Overview Section**: Key metrics summary
- **Category Table**: Cost breakdown by category
- **Unit Table**: Department-wise analysis
- **Professional Styling**: Color-coded sections
- **Auto-naming**: Includes generation date

## User Roles & Permissions

All authenticated users can:
- View individual surgery BOMs
- Access BOM analytics dashboard
- Export PDF reports
- Filter and analyze data

The system respects existing role-based access control through NextAuth session verification.

## UI/UX Features

### Color Coding
- **BOM Links**: Purple (#9333EA) - distinguishes from other surgery actions
- **Cost Display**: Primary green for totals, orange for markup
- **Category Breakdown**: Primary gradient bars
- **Status Badges**: Standard surgery status colors

### Responsive Design
- Mobile-friendly tables with horizontal scroll
- Grid layouts adapt to screen size
- Print layout optimizations (@media print)

### Loading States
- Skeleton loaders during data fetch
- "Loading analytics..." message
- Disabled submit buttons during exports

### Empty States
- Clear messaging when no data available
- Icons and helpful text
- Action buttons to add data

## Business Value

### Cost Transparency
- Detailed visibility into surgery costs
- Category-wise spending analysis
- Unit-level cost comparison

### Financial Planning
- Historical cost trends
- Average cost benchmarking
- Budget variance tracking

### Inventory Management
- Usage pattern identification
- High-cost item tracking
- Category consumption analysis

### Reporting & Compliance
- Audit-ready cost documentation
- Professional PDF exports
- Timestamped records

### Decision Support
- Data-driven procurement decisions
- Cost optimization opportunities
- Unit performance comparison

## Technical Architecture

### Frontend
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript for type safety
- **Styling**: Tailwind CSS utility classes
- **PDF Generation**: jsPDF + jspdf-autotable
- **Icons**: Lucide React icons

### Backend
- **API**: Next.js API Routes (serverless)
- **ORM**: Prisma Client
- **Database**: PostgreSQL with Decimal precision
- **Authentication**: NextAuth session validation

### Performance
- Server-side data aggregation
- Indexed database queries
- Efficient decimal calculations
- Pagination for large datasets (recent surgeries limited to 10)

## Navigation Flow

```
Dashboard
└── Surgeries
    ├── Surgery List
    │   └── [BOM Button] → Individual BOM Report
    └── [Surgery] → Consumables
        └── [View BOM Report] → Individual BOM Report

Dashboard
└── Reports
    └── [BOM Analytics Card] → BOM Analytics Dashboard
        ├── Cost by Category
        ├── Cost by Unit
        ├── Recent Surgeries
        │   └── [View BOM] → Individual BOM Report
        └── Monthly Trend
```

## Future Enhancements (Potential)

1. **Budget Tracking**
   - Set cost budgets per surgery type
   - Alert on budget overruns
   - Variance analysis

2. **Cost Forecasting**
   - Predict future costs based on trends
   - Seasonal analysis
   - Procurement planning

3. **Comparative Analytics**
   - Compare costs across surgeons
   - Benchmark against similar procedures
   - Efficiency metrics

4. **Integration**
   - Link Theatre Setup materials to surgery BOM
   - Wastage tracking (allocated vs used)
   - Return item cost analysis

5. **Advanced Reporting**
   - Custom date range selection
   - Multi-unit comparison charts
   - Excel export option

## Files Created/Modified

### New Files
1. `src/app/dashboard/surgeries/[id]/bom/page.tsx` - Individual BOM report page
2. `src/app/api/surgeries/[id]/bom/route.ts` - BOM data API endpoint
3. `src/app/dashboard/reports/bom/page.tsx` - BOM analytics dashboard
4. `src/app/api/analytics/bom/route.ts` - BOM analytics API endpoint

### Modified Files
1. `src/app/dashboard/surgeries/page.tsx` - Added BOM button to surgery list
2. `src/app/dashboard/surgeries/[id]/consumables/page.tsx` - Added "View BOM Report" button
3. `src/app/dashboard/reports/page.tsx` - Added BOM Analytics card

## Testing Recommendations

1. **Individual BOM Report**
   - Test with surgery having no consumables (empty state)
   - Test with surgery having multiple categories
   - Verify cost calculations (subtotal + markup)
   - Test PDF export with different data volumes
   - Check print layout

2. **Analytics Dashboard**
   - Test with different time ranges (7, 30, 90 days)
   - Test unit filtering
   - Verify aggregations are correct
   - Test with no data (empty states)
   - Export PDF with full dataset

3. **Integration**
   - Navigate from surgeries list to BOM
   - Navigate from consumables to BOM
   - Navigate from reports to BOM analytics
   - Click through to individual BOMs from analytics

4. **Edge Cases**
   - Very large item counts (100+ items)
   - Zero-cost items
   - Missing patient/surgeon data
   - Concurrent PDF generations

## Conclusion

The BOM functionality provides a professional, comprehensive system for tracking and analyzing surgery consumable costs. It integrates seamlessly with existing modules (surgeries, consumables, reports) and offers both detailed individual reports and high-level analytics. The system supports informed decision-making through cost transparency, trend analysis, and exportable documentation.
