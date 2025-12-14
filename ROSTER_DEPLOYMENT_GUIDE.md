# Deploying Roster System to Vercel Production

## Automatic Deployment Steps

### 1. Deploy Database Schema to Vercel Postgres

You need to run the database migration on your Vercel Postgres database. Here's how:

#### Option A: Using Vercel CLI (Recommended)

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Login to Vercel
vercel login

# Link your project
vercel link

# Pull environment variables (including DATABASE_URL)
vercel env pull .env.production

# Run Prisma migration against production database
DATABASE_URL=$(grep DATABASE_URL .env.production | cut -d '=' -f2-) npx prisma db push
```

#### Option B: Using Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Copy your `DATABASE_URL` (Postgres connection string)
5. Run locally:
```bash
# Windows PowerShell
$env:DATABASE_URL="your-vercel-postgres-url-here"
npx prisma db push

# Or create a .env.production file with:
DATABASE_URL="your-vercel-postgres-url-here"

# Then run:
npx prisma db push
```

#### Option C: Using the SQL Script (If you have direct database access)

If you have access to run SQL directly on Vercel Postgres:

1. Go to Vercel Dashboard → Storage → Your Postgres Database → Query tab
2. Copy the contents of `deploy-roster-to-production.sql`
3. Paste and execute

### 2. Verify Deployment

After running the migration, verify it worked:

```bash
# Using the same DATABASE_URL from production
node deploy-roster.js
```

You should see:
```
✅ Database connected successfully
✅ Roster table exists
✅ TheatreAllocation has shift column
🎉 Roster deployment check complete!
```

### 3. Redeploy Vercel Application

The latest code is already pushed to GitHub, so Vercel should auto-deploy. If not:

```bash
# Force a new deployment
vercel --prod

# Or via dashboard: Deployments → Latest deployment → Redeploy
```

### 4. Verify in Browser

1. Go to your Vercel app URL
2. Hard refresh (Ctrl + Shift + R)
3. Look for **"Duty Roster"** in the sidebar between "Inventory" and "Staff Effectiveness"

## What This Deployment Adds

- ✅ Duty Roster management page with Excel upload
- ✅ 5 staff categories: Nurses, Anaesthetists, Porters, Cleaners, Anaesthetic Technicians
- ✅ 3 shift types: Morning, Call, Night
- ✅ Auto-fill staff in Theatre Allocation based on roster
- ✅ Shift tracking for theatre allocations
- ✅ Roster API endpoints for CRUD operations

## Troubleshooting

**If roster link still doesn't appear:**

1. Clear browser cache completely
2. Check Vercel deployment logs for errors
3. Verify DATABASE_URL environment variable is set in Vercel
4. Check that the latest commit (669adbd) is deployed
5. Run `node deploy-roster.js` to verify database schema

**If you get permission errors:**

Make sure your DATABASE_URL has write permissions to create tables and enums.

## Files Included

- `deploy-roster.js` - Verification script to check roster tables
- `deploy-roster-to-production.sql` - Manual SQL migration script
- `ROSTER_DEPLOYMENT_GUIDE.md` - This guide
