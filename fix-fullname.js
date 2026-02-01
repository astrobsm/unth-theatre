const fs = require('fs');
const path = require('path');

function fixFullNameInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;
  
  // Fix patterns like: .fullName} or .fullName) or .fullName, (but not already fixed with ?.)
  // Match .fullName followed by any non-? character, but not if already using ?.
  content = content.replace(/(?<!\?)\.fullName(\s*\}|\s*\)|\s*,|\s*<|\s*`)/g, '?.fullName || \'Not assigned\'$1');
  
  // Fix nested patterns like .surgery.surgeon.fullName (make each level optional)
  content = content.replace(/\.surgery\.surgeon\.fullName/g, '.surgery?.surgeon?.fullName');
  content = content.replace(/\.surgery\.anesthetist\.fullName/g, '.surgery?.anesthetist?.fullName');
  content = content.replace(/\.surgery\.scrubNurse\.fullName/g, '.surgery?.scrubNurse?.fullName');
  
  // Fix other patterns
  content = content.replace(/\.prescribedBy\.fullName/g, '.prescribedBy?.fullName');
  content = content.replace(/\.packedBy\.fullName/g, '.packedBy?.fullName');
  content = content.replace(/\.anesthetist\.fullName/g, '.anesthetist?.fullName');
  content = content.replace(/\.consultantAnesthetist\.fullName/g, '.consultantAnesthetist?.fullName');
  content = content.replace(/\.surgeon\.fullName/g, '.surgeon?.fullName');
  content = content.replace(/\.triggeredBy\.fullName/g, '.triggeredBy?.fullName');
  content = content.replace(/\.reportedBy\.fullName/g, '.reportedBy?.fullName');
  content = content.replace(/\.reviewedBy\.fullName/g, '.reviewedBy?.fullName');
  content = content.replace(/\.cancelledBy\.fullName/g, '.cancelledBy?.fullName');
  content = content.replace(/\.createdBy\.fullName/g, '.createdBy?.fullName');
  content = content.replace(/\.acknowledgedBy\.fullName/g, '.acknowledgedBy?.fullName');
  content = content.replace(/\.requestedBy\.fullName/g, '.requestedBy?.fullName');
  
  // Clean up double optional chaining
  content = content.replace(/\?\.\?/g, '?.');
  content = content.replace(/\?\?/g, '?');
  
  // Ensure || 'Not assigned' is present after fullName
  content = content.replace(/\.fullName(?!\s*\|\|)(\s*[\}\)\,\<\`])/g, '.fullName || \'Not assigned\'$1');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('Fixed:', filePath);
    return true;
  }
  return false;
}

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

let fixedCount = 0;
walkDir('./src', (filePath) => {
  if (filePath.endsWith('.tsx')) {
    if (fixFullNameInFile(filePath)) {
      fixedCount++;
    }
  }
});

console.log(`\nTotal files fixed: ${fixedCount}`);
