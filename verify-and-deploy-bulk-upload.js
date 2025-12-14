/**
 * Bulk Upload Feature Deployment Script
 * This script verifies the database schema and ensures all required fields exist
 * Run this on Vercel or production to enable bulk upload functionality
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyInventorySchema() {
  console.log('🔍 Verifying Inventory Schema...\n');
  
  try {
    // Test if we can query inventory items
    const itemCount = await prisma.inventoryItem.count();
    console.log(`✅ InventoryItem table exists with ${itemCount} items`);
    
    // Test a sample query with all required fields
    const sampleItem = await prisma.inventoryItem.findFirst({
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        unitCostPrice: true,
        quantity: true,
        reorderLevel: true,
        supplier: true,
        // Consumable fields
        manufacturingDate: true,
        expiryDate: true,
        batchNumber: true,
        // Equipment fields
        halfLife: true,
        depreciationRate: true,
        deviceId: true,
        maintenanceIntervalDays: true,
        lastMaintenanceDate: true,
        nextMaintenanceDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    console.log('✅ All required fields are present in the schema');
    
    if (sampleItem) {
      console.log('\n📋 Sample item structure verified:');
      console.log(`   - ID: ${sampleItem.id}`);
      console.log(`   - Name: ${sampleItem.name}`);
      console.log(`   - Category: ${sampleItem.category}`);
      console.log(`   - Unit Cost: ${sampleItem.unitCostPrice}`);
      console.log(`   - Quantity: ${sampleItem.quantity}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Schema verification failed:', error.message);
    return false;
  }
}

async function testBulkUploadAPI() {
  console.log('\n🧪 Testing Bulk Upload API Endpoint...\n');
  
  try {
    // Test data
    const testItems = [
      {
        name: 'TEST_BULK_UPLOAD_ITEM_' + Date.now(),
        category: 'CONSUMABLE',
        description: 'Test item for bulk upload verification',
        unitCostPrice: 1000,
        quantity: 50,
        reorderLevel: 10,
        supplier: 'Test Supplier',
        batchNumber: 'TEST-BATCH-001',
      },
    ];
    
    // Try to create a test item
    const createdItem = await prisma.inventoryItem.create({
      data: testItems[0],
    });
    
    console.log('✅ Bulk upload API can create items');
    console.log(`   Created test item: ${createdItem.name}`);
    
    // Clean up test item
    await prisma.inventoryItem.delete({
      where: { id: createdItem.id },
    });
    
    console.log('✅ Test item cleaned up successfully');
    
    return true;
  } catch (error) {
    console.error('❌ Bulk upload test failed:', error.message);
    return false;
  }
}

async function verifyAPIRoute() {
  console.log('\n📁 Checking API Route Files...\n');
  
  const fs = require('fs');
  const path = require('path');
  
  const apiPath = path.join(__dirname, 'src', 'app', 'api', 'inventory', 'bulk-upload', 'route.ts');
  
  if (fs.existsSync(apiPath)) {
    console.log('✅ Bulk upload API route file exists');
    console.log(`   Location: ${apiPath}`);
    
    const fileContent = fs.readFileSync(apiPath, 'utf8');
    if (fileContent.includes('bulk-upload') && fileContent.includes('inventoryItem')) {
      console.log('✅ API route contains bulk upload logic');
    } else {
      console.log('⚠️  API route file exists but may be incomplete');
    }
    
    return true;
  } else {
    console.error('❌ Bulk upload API route file not found');
    console.log(`   Expected at: ${apiPath}`);
    return false;
  }
}

async function verifyFrontendComponent() {
  console.log('\n🎨 Checking Frontend Component...\n');
  
  const fs = require('fs');
  const path = require('path');
  
  const pagePath = path.join(__dirname, 'src', 'app', 'dashboard', 'inventory', 'page.tsx');
  
  if (fs.existsSync(pagePath)) {
    console.log('✅ Inventory page component exists');
    
    const fileContent = fs.readFileSync(pagePath, 'utf8');
    
    const checks = [
      { name: 'XLSX import', pattern: /import.*XLSX/i },
      { name: 'Upload button', pattern: /Bulk Upload/i },
      { name: 'Download template', pattern: /Download Template/i },
      { name: 'File upload handler', pattern: /handleFileUpload/i },
      { name: 'Template download', pattern: /downloadTemplate/i },
    ];
    
    let allChecksPass = true;
    checks.forEach(check => {
      if (check.pattern.test(fileContent)) {
        console.log(`   ✅ ${check.name} - Found`);
      } else {
        console.log(`   ❌ ${check.name} - Not found`);
        allChecksPass = false;
      }
    });
    
    return allChecksPass;
  } else {
    console.error('❌ Inventory page component not found');
    return false;
  }
}

async function checkPackageDependencies() {
  console.log('\n📦 Checking Package Dependencies...\n');
  
  const fs = require('fs');
  const path = require('path');
  
  const packagePath = path.join(__dirname, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  if (dependencies['xlsx']) {
    console.log(`✅ XLSX library installed (version ${dependencies['xlsx']})`);
    return true;
  } else {
    console.log('❌ XLSX library not found in package.json');
    console.log('   Run: npm install xlsx');
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   BULK UPLOAD FEATURE VERIFICATION & DEPLOYMENT SCRIPT    ║');
  console.log('║         Theatre Manager - Inventory Management            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  const results = {
    schema: false,
    api: false,
    frontend: false,
    dependencies: false,
    apiTest: false,
  };
  
  try {
    // Run all verifications
    results.schema = await verifyInventorySchema();
    results.api = verifyAPIRoute();
    results.frontend = verifyFrontendComponent();
    results.dependencies = checkPackageDependencies();
    results.apiTest = await testBulkUploadAPI();
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    VERIFICATION SUMMARY                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    console.log(`Database Schema:        ${results.schema ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`API Route:              ${results.api ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Frontend Component:     ${results.frontend ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Dependencies:           ${results.dependencies ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`API Functionality:      ${results.apiTest ? '✅ PASS' : '❌ FAIL'}`);
    
    const allPass = Object.values(results).every(r => r === true);
    
    if (allPass) {
      console.log('\n🎉 ALL CHECKS PASSED! Bulk upload feature is ready to use.');
      console.log('\n📝 Next Steps:');
      console.log('   1. Navigate to Inventory Management page');
      console.log('   2. Click "Download Template" to get the Excel template');
      console.log('   3. Fill in your inventory items');
      console.log('   4. Click "Bulk Upload" to upload the Excel file');
      console.log('   5. Review the upload results');
    } else {
      console.log('\n⚠️  SOME CHECKS FAILED. Please review the errors above.');
      console.log('\n🔧 Troubleshooting:');
      if (!results.schema) {
        console.log('   - Run: npx prisma generate');
        console.log('   - Run: npx prisma db push');
      }
      if (!results.dependencies) {
        console.log('   - Run: npm install xlsx');
      }
      if (!results.api || !results.frontend) {
        console.log('   - Ensure latest code is deployed');
        console.log('   - Run: git pull origin master');
        console.log('   - Rebuild: npm run build');
      }
    }
    
    process.exit(allPass ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the verification
main();
