# Deployment Guide - UNTH Theatre Manager

## GitHub Pages Limitation
❌ **GitHub Pages cannot host this application** because it only supports static HTML/CSS/JS files.  
✅ This is a full-stack Next.js app with API routes, server-side rendering, and PostgreSQL database.

---

## Recommended Deployment Options

### Option 1: Vercel (Recommended - Easiest & Free)

**Why Vercel?**
- Built by Next.js creators
- Zero-config Next.js deployment
- Free tier includes:
  - Unlimited deployments
  - Custom domains
  - Automatic HTTPS
  - 100GB bandwidth/month
- Automatic deployments from GitHub

**Steps:**

1. **Sign up for Vercel**
   - Go to https://vercel.com
   - Sign up with your GitHub account

2. **Import your repository**
   - Click "Add New Project"
   - Select `astrobsm/unth-theatre`
   - Vercel will auto-detect Next.js

3. **Add Environment Variables**
   ```env
   DATABASE_URL=your_postgres_connection_string
   NEXTAUTH_URL=https://your-app.vercel.app
   NEXTAUTH_SECRET=generate_random_secret_here
   ```

4. **Database Options:**

   **Option A: Vercel Postgres (Recommended)**
   - Click "Storage" → "Create Database" → "Postgres"
   - Free tier: 256MB storage, 60 hours compute/month
   - Automatically adds DATABASE_URL to your project

   **Option B: External PostgreSQL**
   - Use Neon.tech (free tier: 0.5GB, generous free tier)
   - Use Supabase (free tier: 500MB + authentication)
   - Use Railway (free $5/month credit)

5. **Deploy**
   - Click "Deploy"
   - Your app will be live at `https://your-app.vercel.app`
   - Set custom domain if needed

6. **First-time Setup**
   - After deployment, run migrations via Vercel CLI:
     ```bash
     npm install -g vercel
     vercel login
     vercel env pull
     npx prisma db push
     ```

---

### Option 2: Railway (Simple with Database Included)

**Why Railway?**
- Database and app in one place
- PostgreSQL included
- Free $5/month credit (500 hours)
- Easy GitHub integration

**Steps:**

1. **Sign up**
   - Go to https://railway.app
   - Sign in with GitHub

2. **New Project from GitHub**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose `astrobsm/unth-theatre`

3. **Add PostgreSQL**
   - Click "+ New" → "Database" → "Add PostgreSQL"
   - Railway automatically creates DATABASE_URL variable

4. **Add Environment Variables**
   - Go to Variables tab
   - Add:
     ```
     NEXTAUTH_URL=${{RAILWAY_PUBLIC_DOMAIN}}
     NEXTAUTH_SECRET=your_random_secret_here
     ```

5. **Deploy & Setup**
   - Railway auto-deploys on git push
   - Run migrations in Railway CLI:
     ```bash
     railway login
     railway run npx prisma db push
     ```

---

### Option 3: Render (Free Tier Available)

**Why Render?**
- Free tier (slower, sleeps after 15 min inactivity)
- PostgreSQL included
- Simple deployment

**Steps:**

1. **Sign up**
   - Go to https://render.com
   - Sign in with GitHub

2. **Create PostgreSQL Database**
   - Dashboard → "New +" → "PostgreSQL"
   - Free tier: 256MB, expires in 90 days
   - Copy the "External Database URL"

3. **Create Web Service**
   - "New +" → "Web Service"
   - Connect `astrobsm/unth-theatre`
   - Settings:
     - Build Command: `npm install && npx prisma generate && npm run build`
     - Start Command: `npm start`

4. **Environment Variables**
   - Add:
     ```
     DATABASE_URL=your_postgres_url_from_step_2
     NEXTAUTH_URL=https://your-app.onrender.com
     NEXTAUTH_SECRET=your_random_secret
     ```

5. **Deploy**
   - Click "Create Web Service"
   - After first deploy, run migrations via Render Shell

---

## Quick Setup: Vercel + Neon (Fastest Free Option)

### Step 1: Setup Neon Database (2 minutes)

1. Go to https://neon.tech
2. Sign up with GitHub
3. Create new project "unth-theatre-db"
4. Copy connection string (looks like):
   ```
   postgresql://user:password@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Step 2: Deploy to Vercel (3 minutes)

1. Go to https://vercel.com
2. Import `astrobsm/unth-theatre` repository
3. Add environment variables:
   - `DATABASE_URL`: (paste Neon connection string)
   - `NEXTAUTH_SECRET`: `openssl rand -base64 32` (run in terminal)
   - `NEXTAUTH_URL`: Leave empty for now
4. Click Deploy
5. After deployment:
   - Copy your Vercel URL (e.g., `unth-theatre.vercel.app`)
   - Add to environment variables: `NEXTAUTH_URL=https://unth-theatre.vercel.app`
   - Redeploy

### Step 3: Run Database Migrations

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Link to your project
vercel link

# Pull environment variables
vercel env pull

# Run migrations
npx prisma db push

# Seed database (optional)
npx prisma db seed
```

### Step 4: Create Admin User

1. Go to your deployed app: `https://your-app.vercel.app/auth/register`
2. Register admin account
3. Approve via Neon SQL Editor:
   ```sql
   UPDATE "User" SET status = 'APPROVED' WHERE username = 'admin';
   ```

---

## Cost Comparison

| Platform | Free Tier | Database | Best For |
|----------|-----------|----------|----------|
| **Vercel + Neon** | ✅ Generous | 0.5GB | Production-ready |
| **Railway** | $5 credit/month | 1GB | All-in-one |
| **Render** | ✅ With limits | 256MB (90 days) | Testing |
| **Vercel + Vercel Postgres** | ✅ Limited | 256MB | Integrated |

---

## Production Checklist

Before going live:

- [ ] Set strong `NEXTAUTH_SECRET` (use `openssl rand -base64 32`)
- [ ] Configure custom domain with HTTPS
- [ ] Enable database backups
- [ ] Set up error monitoring (Sentry)
- [ ] Configure rate limiting for API routes
- [ ] Review and set CORS policies
- [ ] Create database backup schedule
- [ ] Document admin credentials securely
- [ ] Set up uptime monitoring
- [ ] Configure email notifications (SendGrid/Resend)

---

## Why Not GitHub Pages?

GitHub Pages is designed for **static websites** only:
- ❌ No Node.js runtime
- ❌ No server-side code execution
- ❌ No API routes
- ❌ No database connections
- ❌ No environment variables

Your app requires:
- ✅ Node.js server (for Next.js API routes)
- ✅ Database connection (PostgreSQL)
- ✅ Server-side rendering
- ✅ Authentication with sessions
- ✅ Real-time data processing

---

## Next Steps

**Recommended Path:**
1. Deploy to **Vercel** (easiest for Next.js)
2. Use **Neon** for database (generous free tier)
3. Follow "Quick Setup" section above
4. Your app will be live in ~10 minutes

**Your app will be accessible at:**
- `https://unth-theatre.vercel.app` (or your custom domain)
- Not `github.io` - that's only for static sites

Need help with deployment? Let me know which platform you choose!
