/**
 * Exercises the REAL src/lib/roleGroups.ts + the role expansion in
 * permissions.ts and modules.ts, so a promotion can never silently REMOVE
 * access from a surgeon.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

function load(rel, deps = {}) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(rel);
  m.require = (id) => (deps[id] ? deps[id] : require(id));
  m._compile(js, path.join(ROOT, rel.replace(/\.ts$/, '.js')));
  return m.exports;
}

const RG = load('src/lib/roleGroups.ts');
const P = load('src/lib/permissions.ts', { './roleGroups': RG });
const M = load('src/lib/modules.ts', { './roleGroups': RG });

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

console.log('\n1. Role expansion');
check('a consultant surgeon is also a surgeon',
  RG.effectiveRoles('CONSULTANT_SURGEON').join() === 'CONSULTANT_SURGEON,SURGEON');
check('a resident surgeon is NOT a consultant',
  RG.effectiveRoles('SURGEON').join() === 'SURGEON');
check('unrelated roles are unchanged', RG.effectiveRoles('SCRUB_NURSE').join() === 'SCRUB_NURSE');
check('null role expands to nothing', RG.effectiveRoles(null).length === 0);
check('roleSatisfies: consultant satisfies SURGEON', RG.roleSatisfies('CONSULTANT_SURGEON', 'SURGEON'));
check('roleSatisfies: resident does not satisfy CONSULTANT_SURGEON',
  !RG.roleSatisfies('SURGEON', 'CONSULTANT_SURGEON'));
check('roleAllowed works through inheritance',
  RG.roleAllowed('CONSULTANT_SURGEON', ['SURGEON', 'ADMIN']));
check('roleAllowed rejects an unrelated role',
  !RG.roleAllowed('PORTER', ['SURGEON', 'ADMIN']));
check('anaesthetist pair deliberately NOT inherited (pre-existing config preserved)',
  RG.effectiveRoles('CONSULTANT_ANAESTHETIST').join() === 'CONSULTANT_ANAESTHETIST');

console.log('\n2. Groups and labels');
check('SURGEON_ROLES covers both grades',
  RG.SURGEON_ROLES.includes('SURGEON') && RG.SURGEON_ROLES.includes('CONSULTANT_SURGEON'));
check('isSurgeonRole true for both', RG.isSurgeonRole('SURGEON') && RG.isSurgeonRole('CONSULTANT_SURGEON'));
check('isSurgeonRole false for others', !RG.isSurgeonRole('ANAESTHETIST') && !RG.isSurgeonRole(null));
check('isConsultantRole distinguishes grade',
  RG.isConsultantRole('CONSULTANT_SURGEON') && !RG.isConsultantRole('SURGEON'));
check('seniority labels', RG.seniorityLabel('CONSULTANT_SURGEON') === 'Consultant'
  && RG.seniorityLabel('SURGEON') === 'Resident' && RG.seniorityLabel('PORTER') === null);

console.log('\n3. A promotion never removes permissions');
{
  const ACTIONS = ['create', 'read', 'update', 'delete'];
  const modules = Object.keys(P.permissions);
  let lost = [];
  for (const mod of modules) {
    for (const action of ACTIONS) {
      const resident = P.hasPermission('SURGEON', mod, action);
      const consultant = P.hasPermission('CONSULTANT_SURGEON', mod, action);
      if (resident && !consultant) lost.push(`${mod}.${action}`);
    }
  }
  check(`consultant keeps every one of the resident's permissions across ${modules.length} modules`,
    lost.length === 0, lost.join(', '));
  check('the permission matrix is actually exercised (sanity)',
    P.hasPermission('SURGEON', 'surgeryScheduling', 'create') === true);
  check('consultant can schedule surgery',
    P.hasPermission('CONSULTANT_SURGEON', 'surgeryScheduling', 'create') === true);
  check('a porter still cannot schedule surgery',
    P.hasPermission('PORTER', 'surgeryScheduling', 'create') === false);
}

console.log('\n4. A promotion never removes modules or pages');
{
  const resident = M.resolveAllowedModuleIds('SURGEON');
  const consultant = M.resolveAllowedModuleIds('CONSULTANT_SURGEON');
  const missing = [...resident].filter((id) => !consultant.has(id));
  check(`consultant sees all ${resident.size} resident modules`, missing.length === 0, missing.join(', '));
  check('module set is non-trivial', resident.size > 10);

  const paths = M.MODULES.flatMap((m) => m.paths);
  const deniedForConsultant = paths.filter(
    (p) => M.canAccessPath('SURGEON', [], p) && !M.canAccessPath('CONSULTANT_SURGEON', [], p)
  );
  check(`no path reachable by a resident is blocked for a consultant (${paths.length} paths)`,
    deniedForConsultant.length === 0, deniedForConsultant.join(', '));
  check('an unrelated role is still restricted somewhere',
    M.resolveAllowedModuleIds('CLEANER').size < resident.size);
}

console.log('\n5. Nav items');
{
  const resident = P.getVisibleNavItems('SURGEON');
  const consultant = P.getVisibleNavItems('CONSULTANT_SURGEON');
  const missing = resident.filter((i) => !consultant.includes(i));
  check(`consultant sees all ${resident.length} resident nav items`, missing.length === 0, missing.join(', '));
}

console.log('\n6. Theatre-ops governance screens are narrower than the board');
{
  // Everyone who works a list can see the operations board. The performance
  // figures read across theatres, and QA review decides whether a flagged case
  // was avoidable — neither is a shop-floor screen. Longest-prefix matching is
  // what makes the sub-paths override the parent module, so it is checked here
  // rather than assumed.
  const BOARD = '/dashboard/theatre-ops';
  const PERF = '/dashboard/theatre-ops/performance';
  const REVIEW = '/dashboard/theatre-ops/review';

  check('a porter can see the operations board', M.canAccessPath('PORTER', [], BOARD));
  check('a porter cannot see the performance figures', !M.canAccessPath('PORTER', [], PERF));
  check('a porter cannot see the QA review queue', !M.canAccessPath('PORTER', [], REVIEW));
  check('a scrub nurse cannot see the QA review queue', !M.canAccessPath('SCRUB_NURSE', [], REVIEW));

  check('a consultant surgeon sees the performance figures',
    M.canAccessPath('CONSULTANT_SURGEON', [], PERF));
  // Judging avoidability is a governance function, not a clinical one.
  check('a consultant surgeon does NOT sit on the QA review by default',
    !M.canAccessPath('CONSULTANT_SURGEON', [], REVIEW));
  check('the CMAC sees the QA review queue', M.canAccessPath('CMAC', [], REVIEW));
  check('the theatre manager sees the QA review queue (full access)',
    M.canAccessPath('THEATRE_MANAGER', [], REVIEW));

  // Check-in is the opposite case and must STAY broad. Everyone who works a
  // list has to be able to say whether they are coming — a porter, a cleaner
  // and a CSSD technician included. If a future narrowing of the theatre-ops
  // module ever catches this path, the people the board exists to track would
  // lose the only way to appear on it.
  const CHECKIN = '/dashboard/theatre-ops/check-in';
  check('a porter can check in', M.canAccessPath('PORTER', [], CHECKIN));
  check('a cleaner can check in', M.canAccessPath('CLEANER', [], CHECKIN));
  check('a scrub nurse can check in', M.canAccessPath('SCRUB_NURSE', [], CHECKIN));
  check('a CSSD technician can check in', M.canAccessPath('CSSD_STAFF', [], CHECKIN));
}

console.log('\n7. Per-role desks are gated the same way in the menu as in the API');
{
  // The sidebar reads lib/modules; the API reads lib/dashboards/desks. Two
  // lists, one intent — so a divergence would show a person a menu entry that
  // 403s when they tap it. These pin the pairs that matter.
  check('a store keeper sees the inventory desk',
    M.canAccessPath('THEATRE_STORE_KEEPER', [], '/dashboard/inventory-desk'));
  check('a store keeper does NOT see vendor accounts',
    !M.canAccessPath('THEATRE_STORE_KEEPER', [], '/dashboard/vendor-desk'));
  check('a store keeper does NOT see the finance desk',
    !M.canAccessPath('THEATRE_STORE_KEEPER', [], '/dashboard/finance-desk'));

  check('a consultant surgeon sees My Practice',
    M.canAccessPath('CONSULTANT_SURGEON', [], '/dashboard/my-practice'));
  check('a resident surgeon sees My Practice too',
    M.canAccessPath('SURGEON', [], '/dashboard/my-practice'));
  check('a consultant surgeon does NOT see the inventory desk',
    !M.canAccessPath('CONSULTANT_SURGEON', [], '/dashboard/inventory-desk'));

  check('procurement sees vendor accounts',
    M.canAccessPath('PROCUREMENT_OFFICER', [], '/dashboard/vendor-desk'));
  check('a scrub nurse sees no money desk',
    !M.canAccessPath('SCRUB_NURSE', [], '/dashboard/vendor-desk')
      && !M.canAccessPath('SCRUB_NURSE', [], '/dashboard/finance-desk'));
  check('a porter sees no desk at all',
    !M.canAccessPath('PORTER', [], '/dashboard/my-practice')
      && !M.canAccessPath('PORTER', [], '/dashboard/inventory-desk')
      && !M.canAccessPath('PORTER', [], '/dashboard/vendor-desk')
      && !M.canAccessPath('PORTER', [], '/dashboard/finance-desk'));
}

console.log('\n8. Display metadata exists for the new role');
check('role has a human label', P.getRoleName('CONSULTANT_SURGEON') === 'Consultant Surgeon');
check('role has a landing dashboard', P.getRoleDashboard('CONSULTANT_SURGEON') === '/dashboard/surgeries');

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
