# Theatre Manager - System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    THEATRE MANAGER SYSTEM                    │
│         University of Nigeria Teaching Hospital              │
│                    Ituku Ozalla                              │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                        USER ROLES                             │
├──────────────────────────────────────────────────────────────┤
│  Admin  │ Theatre   │ Theatre   │  Surgeon  │  Scrub Nurse  │
│         │  Manager  │ Chairman  │           │               │
└──────────────────────────────────────────────────────────────┘
           │             │            │             │
           └─────────────┴────────────┴─────────────┘
                          │
                    Authentication
                    (NextAuth.js)
                          │
           ┌──────────────┴──────────────┐
           │                             │
    ┌──────▼──────┐            ┌────────▼────────┐
    │   Frontend  │            │     Backend     │
    │   Next.js   │◄──────────►│   API Routes    │
    │   React     │            │                 │
    │   Tailwind  │            │   Validation    │
    └─────────────┘            └────────┬────────┘
                                        │
                               ┌────────▼────────┐
                               │   Prisma ORM    │
                               └────────┬────────┘
                                        │
                               ┌────────▼────────┐
                               │   PostgreSQL    │
                               │   theatre_db    │
                               └─────────────────┘
```

## Module Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MAIN MODULES                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Inventory   │  │   Surgery    │  │   Patient    │     │
│  │  Management  │  │  Scheduling  │  │  Management  │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                  │              │
│         │                 │                  │              │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐     │
│  │  Supplies    │  │     WHO      │  │  Transfers   │     │
│  │  Tracking    │  │  Checklists  │  │   Tracking   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Cost       │  │ Cancellation │  │     User     │     │
│  │  Management  │  │    Logging   │  │  Management  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│    Users    │      │  Patients   │      │  Inventory  │
│             │      │             │      │    Items    │
│ - id        │      │ - id        │      │             │
│ - username  │      │ - name      │      │ - id        │
│ - password  │      │ - folder#   │      │ - name      │
│ - role      │      │ - PT#       │      │ - category  │
│ - status    │      │ - age       │      │ - cost      │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                     │
       │                    │                     │
       │         ┌──────────▼──────────┐          │
       │         │     Surgeries       │          │
       │         │                     │          │
       └────────►│ - id                │◄─────────┘
                 │ - patient_id        │
                 │ - surgeon_id        │
                 │ - procedure         │
                 │ - date/time         │
                 │ - special_needs     │
                 │ - status            │
                 └──────┬──────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
  │   WHO     │  │  Surgery  │  │   Case    │
  │Checklists │  │   Items   │  │Cancellation│
  │           │  │           │  │           │
  │ - sign_in │  │ - item_id │  │ - reason  │
  │ - timeout │  │ - qty     │  │ - notes   │
  │ - signout │  │ - cost    │  │ - date    │
  └───────────┘  └───────────┘  └───────────┘
```

## Data Flow

### Surgery Scheduling Flow
```
1. Login → 2. Patient Registration → 3. Fitness Assessment
                                              │
                                              ▼
                                    4. Schedule Surgery
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
            5. Assign Items            6. Set Special              7. WHO Checklist
               & Calculate Cost           Requirements                 Preparation
                    │                         │                         │
                    └─────────────────────────┴─────────────────────────┘
                                              │
                                              ▼
                                    8. Surgery Execution
                                              │
                                              ▼
                                    9. Post-Op Documentation
                                              │
                                              ▼
                                    10. Patient Transfer
```

### Patient Transfer Flow
```
┌──────┐    ┌────────────┐    ┌────────┐    ┌─────────┐    ┌──────┐
│ Ward │───►│  Holding   │───►│Theatre │───►│Recovery │───►│ Ward │
│      │    │    Area    │    │ Suite  │    │         │    │      │
└──────┘    └────────────┘    └────────┘    └─────────┘    └──────┘
   ▲                                                            │
   └────────────────────────────────────────────────────────────┘
              (Each transition is logged with timestamp)
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 1: Authentication (NextAuth.js)                      │
│  ├─ Password hashing (bcrypt)                               │
│  ├─ Session management (JWT)                                │
│  └─ Login attempt tracking                                  │
│                                                              │
│  Layer 2: Authorization (Role-based)                        │
│  ├─ Admin: Full access                                      │
│  ├─ Manager: Operational access                             │
│  ├─ Chairman: Oversight access                              │
│  ├─ Surgeon: Clinical access                                │
│  └─ Nurse: Support access                                   │
│                                                              │
│  Layer 3: Data Validation                                   │
│  ├─ Input sanitization (Zod)                                │
│  ├─ SQL injection prevention (Prisma)                       │
│  └─ XSS protection                                          │
│                                                              │
│  Layer 4: Audit Trail                                       │
│  ├─ All actions logged                                      │
│  ├─ User identification                                     │
│  ├─ Timestamp recording                                     │
│  └─ Change tracking                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

```
Authentication:
POST   /api/auth/register          - User registration
POST   /api/auth/[...nextauth]     - Login/logout

Users:
GET    /api/users                  - List all users
POST   /api/users/:id/approve      - Approve user
POST   /api/users/:id/reject       - Reject user

Inventory:
GET    /api/inventory              - List items
POST   /api/inventory              - Create item
GET    /api/inventory/:id          - Get item details
PUT    /api/inventory/:id          - Update item
DELETE /api/inventory/:id          - Delete item

Patients:
GET    /api/patients               - List patients
POST   /api/patients               - Create patient
GET    /api/patients/:id           - Get patient details

Surgeries:
GET    /api/surgeries              - List surgeries
POST   /api/surgeries              - Schedule surgery
GET    /api/surgeries/:id          - Get surgery details
PUT    /api/surgeries/:id          - Update surgery

Transfers:
GET    /api/transfers              - List transfers
POST   /api/transfers              - Record transfer

Dashboard:
GET    /api/dashboard/stats        - Get statistics
```

## Technology Stack Details

```
Frontend Stack:
├── Next.js 14 (App Router)
├── React 18
├── TypeScript
├── Tailwind CSS
└── Lucide Icons

Backend Stack:
├── Next.js API Routes
├── Prisma ORM
└── Zod Validation

Database:
└── PostgreSQL 14+

Authentication:
├── NextAuth.js
└── bcryptjs

Development Tools:
├── ESLint
├── Prisma Studio
└── TypeScript Compiler
```

## Deployment Architecture

```
Development:
localhost:3000 → Next.js Dev Server → PostgreSQL (localhost)

Production:
┌──────────────┐
│   Nginx/     │
│   Apache     │
└──────┬───────┘
       │
┌──────▼───────┐
│   Next.js    │
│  Production  │
│    Server    │
└──────┬───────┘
       │
┌──────▼───────┐
│  PostgreSQL  │
│   Database   │
│   (Remote)   │
└──────────────┘
```

## File Structure

```
theatre-manger/
│
├── prisma/
│   ├── schema.prisma          (Database schema)
│   └── seed.ts                (Sample data)
│
├── src/
│   ├── app/
│   │   ├── api/              (Backend endpoints)
│   │   │   ├── auth/
│   │   │   ├── inventory/
│   │   │   ├── surgeries/
│   │   │   ├── patients/
│   │   │   ├── transfers/
│   │   │   └── users/
│   │   │
│   │   ├── auth/             (Login/Register pages)
│   │   ├── dashboard/        (Main application)
│   │   │   ├── inventory/
│   │   │   ├── surgeries/
│   │   │   ├── patients/
│   │   │   ├── transfers/
│   │   │   └── users/
│   │   │
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── lib/
│   │   ├── auth.ts           (Auth configuration)
│   │   ├── prisma.ts         (Database client)
│   │   └── utils.ts          (Helper functions)
│   │
│   └── types/
│       └── next-auth.d.ts    (Type definitions)
│
├── .env                       (Environment config)
├── package.json               (Dependencies)
├── next.config.js             (Next.js config)
├── tailwind.config.ts         (Tailwind config)
├── tsconfig.json              (TypeScript config)
│
└── Documentation/
    ├── README.md              (Project overview)
    ├── SETUP_GUIDE.md         (Installation guide)
    ├── USER_GUIDE.md          (User manual)
    └── ARCHITECTURE.md        (This file)
```

---

**University of Nigeria Teaching Hospital Ituku Ozalla**  
*Theatre Manager System - Technical Architecture*
