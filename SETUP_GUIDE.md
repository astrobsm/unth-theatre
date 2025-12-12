# Theatre Manager - Quick Setup Guide

## Step-by-Step Installation

### 1. Install Prerequisites

#### Install Node.js
1. Download Node.js 18+ from https://nodejs.org/
2. Run the installer
3. Verify installation:
```powershell
node --version
npm --version
```

#### Install PostgreSQL
1. Download PostgreSQL 14+ from https://www.postgresql.org/download/windows/
2. Run the installer
3. Set password: `natiss_natiss` for user `postgres`
4. Note the port (default: 5432)
5. Verify installation:
```powershell
psql --version
```

### 2. Setup Database

Open PowerShell as Administrator and run:

```powershell
# Connect to PostgreSQL
psql -U postgres

# Enter password when prompted: natiss_natiss

# Create database
CREATE DATABASE theatre_db;

# Verify database was created
\l

# Exit psql
\q
```

### 3. Install Project Dependencies

Navigate to the project folder:
```powershell
cd "e:\theatre manger"

# Install all dependencies
npm install
```

This will install:
- Next.js and React
- Prisma ORM
- NextAuth.js for authentication
- Tailwind CSS for styling
- All other required packages

### 4. Configure Environment

The `.env` file should already exist with:
```
DATABASE_URL="postgresql://postgres:natiss_natiss@localhost:5432/theatre_db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-super-secret-key-change-this-in-production"
```

**Important**: For production, generate a secure NEXTAUTH_SECRET:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Initialize Database

```powershell
# Generate Prisma Client
npx prisma generate

# Push schema to database
npx prisma db push

# Seed database with sample data
npm run db:seed
```

### 6. Run the Application

```powershell
# Development mode
npm run dev
```

Open browser to: http://localhost:3000

### 7. Login

Use these default credentials:

**Admin Account:**
- Username: `admin`
- Password: `admin123`

**Theatre Manager:**
- Username: `manager`
- Password: `manager123`

**Surgeon:**
- Username: `surgeon1`
- Password: `surgeon123`

**Important**: Change these passwords after first login!

### 8. Verify Installation

1. Login with admin account
2. Navigate to Dashboard
3. Check:
   - ✓ User Management page
   - ✓ Inventory page
   - ✓ Surgeries page
   - ✓ Patients page

## Common Issues

### Port 3000 Already in Use
```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual number)
taskkill /PID <PID> /F

# Or use a different port
$env:PORT=3001; npm run dev
```

### Database Connection Failed
1. Check PostgreSQL is running:
   - Open Services (services.msc)
   - Look for "PostgreSQL" service
   - Ensure it's Running

2. Verify credentials:
   - Username: postgres
   - Password: natiss_natiss
   - Database: theatre_db
   - Port: 5432

3. Test connection:
```powershell
psql -U postgres -d theatre_db
```

### Module Not Found Errors
```powershell
# Clear node_modules and reinstall
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

### Prisma Client Not Generated
```powershell
npx prisma generate
```

## Development Tools

### Prisma Studio (Database GUI)
```powershell
npm run db:studio
```
Opens at: http://localhost:5555

### View Application Logs
Check the terminal where `npm run dev` is running for errors and logs.

### Database Reset (CAUTION: Deletes all data)
```powershell
npx prisma db push --force-reset
npm run db:seed
```

## Production Deployment

### Build for Production
```powershell
npm run build
npm start
```

### Environment Variables for Production
Update `.env`:
```
DATABASE_URL="postgresql://user:password@host:5432/theatre_db"
NEXTAUTH_URL="https://your-domain.com"
NEXTAUTH_SECRET="<generated-secure-random-string>"
NODE_ENV="production"
```

## Next Steps

1. Change default passwords
2. Create additional user accounts
3. Add inventory items
4. Register patients
5. Schedule surgeries
6. Configure WHO checklists

## Support

For issues or questions:
- Check the README.md file
- Review the logs in the terminal
- Contact IT department

---

**University of Nigeria Teaching Hospital Ituku Ozalla**
