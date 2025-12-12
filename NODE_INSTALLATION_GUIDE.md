# Theatre Manager - Node.js Installation Guide

## Quick Installation Steps for Windows

### Method 1: Download and Install (Recommended)

1. **Download Node.js:**
   - Open your web browser
   - Go to: https://nodejs.org/
   - Click on the **LTS (Long Term Support)** version button
   - The download should start automatically (file name: node-v20.x.x-x64.msi)

2. **Install Node.js:**
   - Locate the downloaded file (usually in your Downloads folder)
   - Double-click the .msi file to run the installer
   - Click "Next" through the installation wizard
   - **IMPORTANT:** Make sure "Add to PATH" is checked
   - Click "Install"
   - Wait for installation to complete
   - Click "Finish"

3. **Verify Installation:**
   - Close and reopen PowerShell (this is important!)
   - Run these commands:
   ```powershell
   node --version
   npm --version
   ```
   - You should see version numbers (e.g., v20.10.0 and 10.2.3)

### Method 2: Using Chocolatey (Alternative)

If you have Chocolatey package manager installed:

```powershell
# Run PowerShell as Administrator
choco install nodejs-lts -y
```

### Method 3: Using Winget (Windows 11/10)

```powershell
# Run PowerShell as Administrator
winget install OpenJS.NodeJS.LTS
```

---

## After Installing Node.js

Once Node.js is installed, follow these steps:

### Step 1: Close and Reopen PowerShell
**IMPORTANT:** You must restart PowerShell for the PATH changes to take effect.

### Step 2: Verify Installation
```powershell
node --version
npm --version
```

### Step 3: Navigate to Project
```powershell
cd "e:\theatre manger"
```

### Step 4: Install Project Dependencies
```powershell
npm install
```

This will take 3-5 minutes as it downloads all required packages.

### Step 5: Install PostgreSQL

While npm is installing, download and install PostgreSQL:

1. Go to: https://www.postgresql.org/download/windows/
2. Download the installer
3. Run the installer with these settings:
   - Username: postgres
   - Password: natiss_natiss
   - Port: 5432 (default)
   - Install all components

### Step 6: Create Database

Open a new PowerShell window and run:

```powershell
# Connect to PostgreSQL
psql -U postgres

# When prompted, enter password: natiss_natiss

# Create the database
CREATE DATABASE theatre_db;

# List databases to verify
\l

# Exit
\q
```

### Step 7: Initialize Database Schema

Back in your project PowerShell:

```powershell
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Seed sample data
npm run db:seed
```

### Step 8: Start the Application

```powershell
npm run dev
```

### Step 9: Access the Application

Open your browser and go to: **http://localhost:3000**

### Step 10: Login

Use these credentials:

**Admin Account:**
- Username: `admin`
- Password: `admin123`

**Theatre Manager:**
- Username: `manager`
- Password: `manager123`

**Surgeon:**
- Username: `surgeon1`
- Password: `surgeon123`

---

## Troubleshooting

### "node is not recognized" after installation

**Solution:** Close and reopen PowerShell. The PATH environment variable needs to be refreshed.

### Installation seems stuck

**Solution:** This is normal. npm install can take several minutes. Wait for it to complete.

### Port 3000 is already in use

**Solution:**
```powershell
# Use a different port
$env:PORT=3001; npm run dev
```

### PostgreSQL connection failed

**Solution:**
1. Check PostgreSQL service is running (services.msc)
2. Verify credentials in .env file
3. Ensure database theatre_db exists

### Module not found errors

**Solution:**
```powershell
# Clear and reinstall
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
```

---

## What Gets Installed

When you run `npm install`, these packages will be installed:

**Production Dependencies:**
- Next.js 14 (React framework)
- React 18 (UI library)
- Prisma Client (Database ORM)
- NextAuth.js (Authentication)
- Tailwind CSS (Styling)
- bcryptjs (Password hashing)
- Zod (Validation)
- And 50+ more packages...

**Development Dependencies:**
- TypeScript
- ESLint
- Prisma CLI
- Type definitions

**Total download size:** ~200-300 MB  
**Installation time:** 3-5 minutes (depending on internet speed)

---

## Need Help?

If you encounter any issues:

1. Make sure you're running PowerShell (not Command Prompt)
2. Check that you have internet connection
3. Try running PowerShell as Administrator
4. Ensure antivirus isn't blocking the installation

---

## Next Steps After Installation

1. ✅ Change default passwords
2. ✅ Explore the dashboard
3. ✅ Add inventory items
4. ✅ Register patients
5. ✅ Schedule surgeries
6. ✅ Review the USER_GUIDE.md for detailed instructions

---

**University of Nigeria Teaching Hospital Ituku Ozalla**  
*Theatre Manager System v1.0*
