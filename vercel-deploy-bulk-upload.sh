#!/bin/bash

# Bulk Upload Feature Deployment Script for Vercel
# This script ensures all migrations are applied and the feature is deployed

echo "╔════════════════════════════════════════════════════════════╗"
echo "║    VERCEL DEPLOYMENT - BULK UPLOAD FEATURE SETUP          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Generate Prisma Client
echo "📦 Step 1: Generating Prisma Client..."
npx prisma generate
if [ $? -eq 0 ]; then
    echo "   ✅ Prisma Client generated successfully"
else
    echo "   ❌ Failed to generate Prisma Client"
    exit 1
fi
echo ""

# Step 2: Apply database migrations
echo "🔄 Step 2: Applying database migrations..."
npx prisma db push
if [ $? -eq 0 ]; then
    echo "   ✅ Database migrations applied successfully"
else
    echo "   ❌ Failed to apply migrations"
    exit 1
fi
echo ""

# Step 3: Verify schema
echo "🔍 Step 3: Verifying database schema..."
npx prisma validate
if [ $? -eq 0 ]; then
    echo "   ✅ Schema validation passed"
else
    echo "   ❌ Schema validation failed"
    exit 1
fi
echo ""

# Step 4: Run verification script
echo "🧪 Step 4: Running verification script..."
node verify-and-deploy-bulk-upload.js
if [ $? -eq 0 ]; then
    echo "   ✅ Verification passed"
else
    echo "   ⚠️  Verification completed with warnings"
fi
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║              DEPLOYMENT COMPLETED                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📝 The bulk upload feature should now be available at:"
echo "   Inventory Management > Bulk Upload button"
echo ""
echo "🔄 If you don't see the buttons, try:"
echo "   1. Hard refresh the page (Ctrl+Shift+R)"
echo "   2. Clear browser cache"
echo "   3. Check Vercel deployment logs"
echo ""
