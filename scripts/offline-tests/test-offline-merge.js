/** Exercises the REAL src/lib/offlineMerge.ts (pure functions, transpiled on the fly). */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

const src = fs.readFileSync(path.join(ROOT, 'src/lib/offlineMerge.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const m = new Module('offlineMerge');
m._compile(js, path.join(ROOT, 'src/lib/offlineMerge.js'));
const M = m.exports;

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

const pend = (o) => ({ createdAt: Date.now(), url: '', method: 'POST', body: null, ...o });

console.log('\n1. Path parsing');
check('list path', JSON.stringify(M.parseApiPath('/api/surgeries')) === '{"entityType":"surgeries"}');
check('list path with query',
  JSON.stringify(M.parseApiPath('/api/surgeries?date=2026-07-29')) === '{"entityType":"surgeries"}');
check('detail path',
  JSON.stringify(M.parseApiPath('/api/surgeries/abc123')) === '{"entityType":"surgeries","id":"abc123"}');
check('nested path keeps the remainder as id',
  M.parseApiPath('/api/roster/departments/anaesthetists').id === 'departments/anaesthetists');
check('absolute url', M.parseApiPath('https://x.test/api/patients/9').entityType === 'patients');

console.log('\n2. Create appears in a bare-array list');
{
  const payload = [{ id: 's1', procedure: 'Appendectomy' }];
  const out = M.mergePendingIntoList(
    payload,
    [pend({ clientId: 'offline-1', entityType: 'surgeries', op: 'create', body: { procedure: 'EMLSCS', patientName: 'Ada' } })],
    'surgeries'
  );
  check('row count grows', out.length === 2, JSON.stringify(out));
  check('new row is first', out[0].procedure === 'EMLSCS');
  check('new row carries the client id', out[0].id === 'offline-1');
  check('new row is flagged pending', out[0][M.PENDING_FLAG] === 'create');
  check('server row untouched', out[1].id === 's1' && out[1][M.PENDING_FLAG] === undefined);
}

console.log('\n3. Create appears in a wrapped list');
{
  const out = M.mergePendingIntoList(
    { surgeries: [{ id: 's1' }], total: 1 },
    [pend({ clientId: 'offline-2', entityType: 'surgeries', op: 'create', body: { procedure: 'Ex-lap' } })],
    'surgeries'
  );
  check('merged into the named array', out.surgeries.length === 2);
  check('sibling fields preserved', out.total === 1);
}
{
  const out = M.mergePendingIntoList(
    { data: [{ id: 'p1' }] },
    [pend({ clientId: 'offline-3', entityType: 'patients', op: 'create', body: { name: 'B' } })],
    'patients'
  );
  check('merged into a generic `data` array', out.data.length === 2);
}

console.log('\n4. Updates and deletes');
{
  const out = M.mergePendingIntoList(
    [{ id: 's1', status: 'SCHEDULED' }, { id: 's2', status: 'SCHEDULED' }],
    [pend({ clientId: 'c1', entityType: 'surgeries', op: 'update', targetId: 's2', body: { status: 'COMPLETED' } })],
    'surgeries'
  );
  check('edit applied to the right row', out.find((r) => r.id === 's2').status === 'COMPLETED');
  check('other row unchanged', out.find((r) => r.id === 's1').status === 'SCHEDULED');
  check('edited row flagged', out.find((r) => r.id === 's2')[M.PENDING_FLAG] === 'update');
}
{
  const out = M.mergePendingIntoList(
    [{ id: 's1' }, { id: 's2' }],
    [pend({ clientId: 'c2', entityType: 'surgeries', op: 'delete', targetId: 's1' })],
    'surgeries'
  );
  check('deleted row removed', out.length === 1 && out[0].id === 's2');
}

console.log('\n5. Rejected changes stay visible but are badged');
{
  const out = M.mergePendingIntoList(
    [],
    [pend({ clientId: 'c3', entityType: 'surgeries', op: 'create', body: { procedure: 'X' }, failed: true })],
    'surgeries'
  );
  check('work is not thrown away', out.length === 1);
  check('flagged as rejected', out[0][M.FAILED_FLAG] === true);
}

console.log('\n6. No double-listing once the server has the row');
{
  // After sync the pending record is deleted; but even if a read races it, a
  // server row with the same id must not be duplicated.
  const out = M.mergePendingIntoList(
    [{ id: 'offline-9', procedure: 'X' }],
    [pend({ clientId: 'offline-9', entityType: 'surgeries', op: 'create', body: { procedure: 'X' } })],
    'surgeries'
  );
  check('row appears exactly once', out.length === 1, JSON.stringify(out));
}

console.log('\n7. Unknown shapes are left alone');
{
  const weird = { stats: { total: 4 }, generatedAt: 'now' };
  const out = M.mergePendingIntoList(weird, [pend({ clientId: 'c4', entityType: 'dashboard', op: 'create', body: {} })], 'dashboard');
  check('payload returned untouched', JSON.stringify(out) === JSON.stringify(weird));
  check('null payload survives', M.mergePendingIntoList(null, [pend({ clientId: 'c5', entityType: 'x', op: 'create' })], 'x') === null);
  check('empty pending list is a no-op', M.mergePendingIntoList([{ id: 1 }], [], 'x').length === 1);
}

console.log('\n8. Detail record merge');
{
  const out = M.mergePendingIntoRecord(
    { id: 's2', status: 'SCHEDULED', notes: 'keep' },
    [pend({ clientId: 'c6', entityType: 'surgeries', op: 'update', targetId: 's2', body: { status: 'CANCELLED' } })],
    's2'
  );
  check('edit applied', out.status === 'CANCELLED');
  check('untouched fields preserved', out.notes === 'keep');
  check('flagged', out[M.PENDING_FLAG] === 'update');
}
{
  const wrapped = M.mergePendingIntoRecord(
    { data: { id: 's3', status: 'A' } },
    [pend({ clientId: 'c7', entityType: 'surgeries', op: 'update', targetId: 's3', body: { status: 'B' } })],
    's3'
  );
  check('wrapped record merged', wrapped.data.status === 'B');
}
{
  const other = { id: 's9', status: 'A' };
  check('no pending edit for this id leaves it alone',
    M.mergePendingIntoRecord(other, [pend({ clientId: 'c8', entityType: 's', op: 'update', targetId: 'zzz', body: { status: 'B' } })], 's9').status === 'A');
}

console.log('\n9. The echo a form receives when queued offline');
{
  const p = pend({ clientId: 'offline-77', entityType: 'surgeries', op: 'create', body: { procedure: 'EMLSCS', patientName: 'Ada' } });
  const echo = M.offlineMutationEcho(p);
  check('has a navigable id', echo.id === 'offline-77');
  check('carries the submitted fields', echo.procedure === 'EMLSCS' && echo.patientName === 'Ada');
  check('marked offline + queued', echo.offline === true && echo.queued === true);
  check('still reports success for callers checking it', echo.success === true);
  check('explains itself to the user', String(echo.message).includes('sync'));

  const upd = M.offlineMutationEcho(pend({ clientId: 'c9', entityType: 'surgeries', op: 'update', targetId: 's5', body: { status: 'DONE' } }));
  check('update echo keeps the server id', upd.id === 's5');
}

console.log('\n10. Merging must not mutate, and must be detectable by identity');
{
  const original = { surgeries: [{ id: 's1' }], total: 1 };
  const snapshot = JSON.stringify(original);
  const out = M.mergePendingIntoList(
    original,
    [pend({ clientId: 'offline-x', entityType: 'surgeries', op: 'create', body: { procedure: 'Y' } })],
    'surgeries'
  );
  check('input payload not mutated', JSON.stringify(original) === snapshot);
  check('returns a NEW reference when it merged', out !== original);
  check('merge actually applied', out.surgeries.length === 2);

  const untouched = { stats: { a: 1 } };
  check('returns the SAME reference when nothing merged',
    M.mergePendingIntoList(untouched, [pend({ clientId: 'z', entityType: 'q', op: 'create' })], 'q') === untouched);
}
{
  const original = { data: { id: 's3', status: 'A' } };
  const snapshot = JSON.stringify(original);
  const out = M.mergePendingIntoRecord(
    original,
    [pend({ clientId: 'c', entityType: 's', op: 'update', targetId: 's3', body: { status: 'B' } })],
    's3'
  );
  check('record merge does not mutate its input', JSON.stringify(original) === snapshot);
  check('record merge returns a new reference', out !== original && out.data.status === 'B');
}

console.log('\n11. Chained offline work: local ids become server ids on sync');
{
  check('recognises a local id', M.isClientId('offline-abc') && !M.isClientId('ckz123'));

  check('server id from a bare record', M.extractServerId({ id: 'srv-1', name: 'x' }) === 'srv-1');
  check('server id from a wrapped record', M.extractServerId({ patient: { id: 'srv-2' } }) === 'srv-2');
  check('numeric id handled', M.extractServerId({ id: 42 }) === '42');
  check('does NOT mistake an echoed local id for a server id',
    M.extractServerId({ id: 'offline-9', success: true }) === null);
  check('no id present', M.extractServerId({ ok: true }) === null);

  // A nurse registers a patient offline, then books their surgery.
  const map = { 'offline-pt1': 'srv-pt1' };
  const surgeryBody = {
    patientId: 'offline-pt1',
    procedureName: 'EMLSCS',
    team: [{ userId: 'u1', patientRef: 'offline-pt1' }],
    unchanged: 'keep',
  };
  const remapped = M.remapClientIds(surgeryBody, map);
  check('the surgery now points at the real patient', remapped.patientId === 'srv-pt1');
  check('nested references rewritten too', remapped.team[0].patientRef === 'srv-pt1');
  check('everything else untouched', remapped.unchanged === 'keep' && remapped.procedureName === 'EMLSCS');
  check('the original body is not mutated', surgeryBody.patientId === 'offline-pt1');

  check('ids in the path are rewritten',
    M.remapUrl('/api/patients/offline-pt1', map) === '/api/patients/srv-pt1');
  check('query strings survive path rewriting',
    M.remapUrl('/api/patients/offline-pt1?full=1', map) === '/api/patients/srv-pt1?full=1');
  check('unrelated urls are returned as-is',
    M.remapUrl('/api/surgeries', map) === '/api/surgeries');

  // The critical safety property: never send work whose parent has not synced.
  check('held back while the parent is unresolved',
    M.hasUnresolvedClientId('/api/surgeries', { patientId: 'offline-pt2' }, map) === true);
  check('released once the parent is known',
    M.hasUnresolvedClientId('/api/surgeries', { patientId: 'offline-pt1' }, map) === false);
  check('detects an unresolved id nested deep in the body',
    M.hasUnresolvedClientId('/api/surgeries', { a: { b: [{ c: 'offline-zzz' }] } }, map) === true);
  check('detects an unresolved id in the path',
    M.hasUnresolvedClientId('/api/patients/offline-nope', null, map) === true);
  check('ordinary work is never held back',
    M.hasUnresolvedClientId('/api/surgeries', { patientId: 'srv-real' }, map) === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
