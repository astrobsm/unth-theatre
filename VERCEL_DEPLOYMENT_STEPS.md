# Deploy UNTH Theatre Manager to Vercel

## 🚀 Step-by-Step Deployment Guide

### Prerequisites
- GitHub account (you already have this ✅)
- Your code is pushed to GitHub (done ✅)

---

## Part 1: Setup Database (5 minutes)

### Option A: Neon (Recommended - Generous Free Tier)

1. **Go to https://neon.tech**
2. Click **"Sign Up"** → Sign in with GitHub
3. Click **"Create a project"**
   - Name: `unth-theatre-db`
   - Region: Choose closest to you (US East for Nigeria)
4. **Copy the connection string**
   - Click on your project
   - Go to "Connection Details"
   - Copy the connection string (it looks like):
   ```
   postgresql://username:password@ep-xxxx-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   - **Save this - you'll need it in Step 2**

### Option B: Vercel Postgres (Alternative)

1. We'll set this up during Vercel deployment
2. Skip to Part 2 and choose Postgres when prompted

---

## Part 2: Deploy to Vercel (5 minutes)

### Step 1: Sign Up for Vercel

1. **Go to https://vercel.com**
2. Click **"Sign Up"**
3. Choose **"Continue with GitHub"**
4. Authorize Vercel to access your GitHub account

### Step 2: Import Your Project

1. On Vercel Dashboard, click **"Add New..." → "Project"**
2. Find and click **"Import"** next to `astrobsm/unth-theatre`
3. Vercel will detect it's a Next.js project ✅

### Step 3: Configure Environment Variables

Before clicking Deploy, add these environment variables:

1. Click **"Environment Variables"** section
2. Add these three variables:

   **Variable 1:**
   - Name: `DATABASE_URL`
   - Value: (paste your Neon connection string from Part 1)
   - Example: `postgresql://user:pass@ep-xxxx.neon.tech/neondb?sslmode=require`

   **Variable 2:**
   - Name: `NEXTAUTH_SECRET`
   - Value: Generate a random secret
     - Open PowerShell and run: 
       ```powershell
       -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
       ```
     - Or use: https://generate-secret.vercel.app/32
   
   **Variable 3:**
   - Name: `NEXTAUTH_URL`
   - Value: Leave empty for now (we'll update after deployment)

3. Make sure all variables are set for **Production, Preview, and Development**

### Step 4: Deploy!

1. Click **"Deploy"**
2. Wait 2-3 minutes for build to complete
3. You'll see "Congratulations!" when done

### Step 5: Update NEXTAUTH_URL

1. Copy your deployment URL (e.g., `https://unth-theatre.vercel.app`)
2. Go to **Settings → Environment Variables**
3. Edit `NEXTAUTH_URL`:
   - Change from empty to: `https://unth-theatre.vercel.app` (your actual URL)
4. Click **"Save"**
5. Go to **Deployments** tab → Click **"..." → "Redeploy"**

---

## Part 3: Setup Database Tables (5 minutes)

Your app is deployed, but the database is empty. Let's create the tables:

### Method 1: Using Neon Console (Easiest)

1. Go back to https://neon.tech
2. Open your project `unth-theatre-db`
3. Click **"SQL Editor"**
4. We need to run Prisma migrations - I'll generate the SQL for you

### Method 2: Using Vercel CLI (Alternative)

1. Install Vercel CLI:
   ```powershell
   npm install -g vercel
   ```

2. Login:
   ```powershell
   vercel login
   ```

3. Link your project:
   ```powershell
   cd "e:\theatre manger"
   vercel link
   ```
   - Select your team
   - Select `unth-theatre` project
   - Link to existing project: Yes

4. Pull environment variables:
   ```powershell
   vercel env pull .env.production
   ```

5. Run migrations:
   ```powershell
   npx prisma db push
   ```

6. (Optional) Seed the database:
   ```powershell
   npx prisma db seed
   ```

---

## Part 4: Create First Admin User (2 minutes)

1. **Visit your deployed app**: `https://your-app.vercel.app/auth/register`

2. **Register admin account**:
   - Username: `admin`
   - Full Name: `System Administrator`
   - Email: `admin@unth.edu.ng`
   - Role: Select **"Admin"**
   - Password: (choose a strong password)
   - Click **"Register"**

3. **Approve the admin user**:
   
   **Via Neon Console:**
   - Go to Neon.tech → Your project → SQL Editor
   - Run:
     ```sql
     UPDATE "User" SET status = 'APPROVED' WHERE username = 'admin';
     ```
   - Click **"Run query"**

   **Via Prisma Studio (if using Vercel CLI):**
   ```powershell
   npx prisma studio
   ```
   - Find the User table
   - Find admin user
   - Change status from PENDING to APPROVED
   - Save

4. **Login**: Go to `https://your-app.vercel.app/auth/login`
   - Username: `admin`
   - Password: (your password)

---

## ✅ Deployment Complete!

Your app is now live at: **https://your-app-name.vercel.app**

### What You Get:
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Automatic deployments on git push
- ✅ Preview deployments for pull requests
- ✅ 100GB bandwidth/month (free tier)
- ✅ Unlimited deployments

---

## Custom Domain (Optional)

### Add Your Own Domain:

1. In Vercel Dashboard → **Settings → Domains**
2. Add your domain (e.g., `theatre.unth.edu.ng`)
3. Follow DNS configuration instructions
4. Update `NEXTAUTH_URL` to your custom domain
5. Redeploy

---

## Automatic Deployments

Every time you push to GitHub, Vercel automatically:
- Builds your app
- Runs tests (if configured)
- Deploys to production
- Updates your live site

To deploy changes:
```powershell
git add .
git commit -m "Your changes"
git push
```

Vercel will automatically deploy in ~2 minutes!

---

## Monitoring & Logs

### View Logs:
1. Vercel Dashboard → Your Project
2. Click **"Deployments"**
3. Click on any deployment
4. View **"Build Logs"** or **"Function Logs"**

### View Analytics:
1. Vercel Dashboard → Your Project
2. Click **"Analytics"** tab
3. See visitor stats, page views, etc.

---

## Troubleshooting

### "Database connection failed"
- Check DATABASE_URL is correct in Vercel environment variables
- Ensure Neon database is active (free tier doesn't sleep)
- Check IP allowlist in Neon (should allow all)

### "NextAuth URL mismatch"
- NEXTAUTH_URL must match your deployment URL exactly
- Include `https://` prefix
- No trailing slash

### "Prisma Client not generated"
- Vercel automatically runs `prisma generate` during build
- Check build logs for errors
- Ensure `vercel.json` is in repository

### Build Fails
- Check build logs in Vercel dashboard
- Common issues:
  - Missing environment variables
  - Database connection during build
  - TypeScript errors

---

## Need Help?

If you encounter issues:
1. Check Vercel build logs
2. Check function logs in Vercel dashboard
3. Verify all environment variables are set
4. Ensure database connection string is correct

---

## Cost Breakdown (Free Tier)

**Vercel:**
- Hosting: FREE
- Bandwidth: 100GB/month
- Builds: 6,000 minutes/month
- Function executions: Unlimited
- Serverless function size: 50MB

**Neon:**
- Storage: 0.5GB
- Compute: Always active (no sleep)
- Branches: 10 (for testing)
- Data transfer: Unlimited

**Total Monthly Cost: $0** ✅

---

## Production Checklist

Before sharing with hospital staff:

- [ ] Admin user created and approved
- [ ] Database tables created
- [ ] Test login works
- [ ] Test creating a patient
- [ ] Test scheduling a surgery
- [ ] Environment variables secured
- [ ] Custom domain configured (optional)
- [ ] Backup strategy planned
- [ ] Monitor setup (Vercel Analytics)
- [ ] Document admin credentials securely

---

## Your Deployment URLs

After deployment, save these:

- **Live App**: https://________.vercel.app
- **Neon Dashboard**: https://console.neon.tech
- **Vercel Dashboard**: https://vercel.com/dashboard
- **GitHub Repo**: https://github.com/astrobsm/unth-theatre

---

You're all set! 🎉

Your theatre management system is now accessible worldwide at your Vercel URL.
