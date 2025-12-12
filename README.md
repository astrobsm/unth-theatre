# Operative Resource Manager-ORM - UNTH Ituku Ozalla

A comprehensive theatre management system for the University of Nigeria Teaching Hospital Ituku Ozalla, designed to streamline surgical operations, inventory management, and patient care tracking.

## 🏥 Features

### 1. **Role-Based Authentication**
- Multi-role access control (Admin, Theatre Manager, Theatre Chairman, Surgeon, Scrub Nurse)
- User profile creation with admin approval workflow
- Secure password hashing with bcrypt
- Session management with NextAuth.js

### 2. **Inventory Management**
- Track consumables, machines, and devices
- Cost price tracking and supplier management
- Automatic low-stock alerts
- Reorder level monitoring
- Maintenance logging for equipment
- Supply record tracking

### 3. **Surgery Scheduling**
- Comprehensive patient information forms
- Patient details (name, folder number, PT number, age, gender, ward)
- Procedure indication and subspecialty selection
- Special needs tracking:
  - Blood transfusion requirements
  - Diathermy needs
  - Stereo requirements
  - Montrell mattress needs
  - Custom special needs
- Surgeon assignment
- Date and time scheduling

### 4. **WHO Surgical Safety Checklists**
- Sign-in checklist
- Time-out checklist
- Sign-out checklist
- Compliance tracking

### 5. **Preoperative Fitness Assessment**
- Comorbidity tracking (diabetes, hypertension, heart disease, etc.)
- Current medications documentation
- Allergy recording
- ASA score assignment
- Fitness level determination
- Recommendations and notes

### 6. **Patient Transfer Tracking**
- Ward to Holding Area
- Holding Area to Theatre Suite
- Theatre Suite to Recovery
- Recovery to Ward
- Transfer timestamp and personnel logging

### 7. **Case Cancellation Management**
- Detailed cancellation documentation
- Reason categorization
- Comprehensive notes
- Audit trail

### 8. **Cost Management**
- Item cost tracking for each surgery
- Automatic calculation of patient charges (10% markup)
- Supply cost analysis
- Financial reporting

### 9. **Audit Logging**
- Comprehensive activity tracking
- User action logging
- Change history
- IP address logging

## 🛠 Technology Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: NextAuth.js
- **Form Validation**: Zod
- **Icons**: Lucide React

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- Node.js 18+ and npm
- PostgreSQL 14+
- Git

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd "theatre manger"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Database Setup

#### Create PostgreSQL Database
```sql
-- Connect to PostgreSQL
psql -U postgres

-- Create database
CREATE DATABASE theatre_db;

-- Exit psql
\q
```

#### Configure Environment Variables
Create a `.env` file in the root directory with the following:

```env
DATABASE_URL="postgresql://postgres:natiss_natiss@localhost:5432/theatre_db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-super-secret-key-change-this-in-production"
```

**Important**: Change `NEXTAUTH_SECRET` to a random secure string in production.

#### Initialize Database
```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma db push

# (Optional) Seed database with sample data
npx prisma db seed
```

### 4. Run the Application

#### Development Mode
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

#### Production Build
```bash
npm run build
npm start
```

## 👤 Default Admin Account

After setting up the database, create an admin account:

1. Navigate to `http://localhost:3000/auth/register`
2. Register with the following details:
   - Username: admin
   - Full Name: System Administrator
   - Email: admin@unth.edu.ng
   - Role: Admin
   - Password: (choose a secure password)

3. Manually approve the account in the database:
```sql
UPDATE users SET status = 'APPROVED' WHERE username = 'admin';
```

Or use Prisma Studio:
```bash
npx prisma studio
```

## 📂 Project Structure

```
theatre-manger/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── api/               # API routes
│   │   │   ├── auth/          # Authentication endpoints
│   │   │   ├── inventory/     # Inventory management
│   │   │   ├── surgeries/     # Surgery scheduling
│   │   │   ├── patients/      # Patient management
│   │   │   └── dashboard/     # Dashboard statistics
│   │   ├── auth/              # Authentication pages
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── dashboard/         # Main application
│   │   │   ├── inventory/
│   │   │   ├── surgeries/
│   │   │   ├── patients/
│   │   │   ├── transfers/
│   │   │   ├── checklists/
│   │   │   ├── cancellations/
│   │   │   └── users/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── providers.tsx
│   ├── lib/
│   │   ├── auth.ts            # NextAuth configuration
│   │   ├── prisma.ts          # Prisma client
│   │   └── utils.ts           # Utility functions
│   └── types/
│       └── next-auth.d.ts     # TypeScript type definitions
├── .env                       # Environment variables
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

## 🔑 User Roles & Permissions

### Admin
- Full system access
- User approval and management
- All CRUD operations
- System configuration

### Theatre Manager
- Inventory management
- Surgery scheduling
- Patient management
- Transfer tracking
- User approval

### Theatre Chairman
- Surgery oversight
- Reports and analytics
- Approval workflows

### Surgeon
- Surgery scheduling
- Patient assessment
- WHO checklist completion
- Surgery documentation

### Scrub Nurse
- Inventory usage tracking
- WHO checklist assistance
- Patient transfer logging

## 📊 Database Schema

The system uses the following main entities:

- **Users**: System users with role-based access
- **Patients**: Patient demographic information
- **InventoryItems**: Consumables, machines, and devices
- **Surgeries**: Scheduled and completed procedures
- **SurgeryItems**: Items used in each surgery
- **WHOChecklists**: Surgical safety checklists
- **PreoperativeFitnessAssessments**: Patient fitness evaluations
- **PatientTransfers**: Movement tracking
- **CaseCancellations**: Cancelled surgery records
- **MaintenanceLogs**: Equipment maintenance history
- **SupplyRecords**: Inventory supply tracking
- **AuditLogs**: System activity logs

## 🔒 Security Features

- Password hashing with bcrypt
- JWT-based session management
- Role-based access control
- SQL injection prevention via Prisma ORM
- XSS protection
- CSRF protection
- Comprehensive audit logging

## 🧪 Testing

```bash
# Run linting
npm run lint

# Type checking
npx tsc --noEmit
```

## 📈 Future Enhancements

- [ ] Real-time notifications
- [ ] Advanced reporting and analytics
- [ ] PDF report generation
- [ ] Email notifications
- [ ] Mobile application
- [ ] Barcode scanning for inventory
- [ ] Integration with hospital information system
- [ ] Telemedicine integration
- [ ] AI-powered scheduling optimization

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL is running
pg_isready -U postgres

# Verify database exists
psql -U postgres -l | grep theatre_db

# Reset database (CAUTION: Deletes all data)
npx prisma db push --force-reset
```

### Port Already in Use
```bash
# Kill process on port 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Use different port
PORT=3001 npm run dev
```

## 📝 License

This project is proprietary software developed for the University of Nigeria Teaching Hospital Ituku Ozalla.

## 👥 Contributors

- Development Team - Theatre Manager System

## 📞 Support

For technical support or feature requests, contact the hospital IT department.

---

**University of Nigeria Teaching Hospital Ituku Ozalla**  
*Excellence in Healthcare Delivery*
