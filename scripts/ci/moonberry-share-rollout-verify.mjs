// Separate fail-closed rollout gate. Existing 32-scenario/9-wait and browser gates
// stay unchanged. Self-tests use synthetic JSON only and open no server/socket.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readContract, wrapperSha256, productSha256, scenarios, lockScenario, lockLabel, statements } from '../../tests/sql/helpers/moonberry-rollout-contract.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}test-results/moonberry-share/rollout/`;
const absentState = { private_schema: false, functions: 0, triggers: 0, quantity_check: 'CHECK (quantity > 0)', history_rows: 0 };
export function verify(report, cluster) {
  assert.equal(report.status, 'PASSED'); assert.equal(report.checkCount, scenarios.length);
  assert.equal(report.checks.length, scenarios.length); assert.equal(new Set(report.checks.map(c => c.name)).size, scenarios.length);
  assert.deepEqual(report.checks.map(c => c.name).sort(), [...scenarios].sort(), 'Exact rollout scenario set required');
  assert(report.checks.every(c => c.status === 'PASSED')); assert.equal(report.failureCount, 0);
  assert.deepEqual(report.failures, []); assert.equal(report.fatalError, undefined); assert.equal(report.sourceHashesUnchanged, true);
  assert.equal(report.wrapperSource.sha256, wrapperSha256); assert.equal(report.wrapperSource.productSha256, productSha256);
  assert.equal(report.wrapperSource.topLevelStatementCount, 6);
  const evidence = index => report.checks.find(c => c.name === scenarios[index]).evidence;
  assert.deepEqual(evidence(0).config, { catalog: 1, map: 1, landmark: 1, node: 1 });
  assert.equal(evidence(0).tables.length, 6); assert(evidence(0).tables.every(t => t.owner && t.relrowsecurity && !t.relforcerowsecurity));
  for (const [index, count] of [[2,5],[3,4],[4,4],[7,3]]) {
    assert.equal(evidence(index).variants.length, count);
    for (const variant of evidence(index).variants) { assert(variant.expectedError.startsWith('moonberry_')); assert.deepEqual(variant.rollback, absentState); }
  }
  for (const index of [1,5,6,8,9,10]) assert.deepEqual(evidence(index).rollback, absentState);
  assert.equal(evidence(1).submittedWrapperSha256, wrapperSha256); assert.equal(evidence(1).withoutRunnerTransaction, true);
  assert.equal(evidence(8).injectedOnlyFinalPostflightHash, true); assert.equal(evidence(8).exactWrapperSha256, wrapperSha256);
  assert.notEqual(evidence(8).submittedSha256, wrapperSha256);
  assert.equal(evidence(10).modelOnly, true); assert.equal(evidence(10).managementApiLedgerCoatomicityVerified, false);
  assert.equal(evidence(10).observedBeforeFailure.functions, 3); assert.equal(evidence(10).observedBeforeFailure.history_rows, 1);
  assert.equal(evidence(11).submittedWrapperSha256, wrapperSha256); assert.equal(evidence(11).embeddedProductSha256, productSha256);
  assert.equal(evidence(11).exactBytes, true);
  for (const index of [11,12]) {
    const p = evidence(index).postconditions;
    assert.deepEqual(p.state, { private_schema: true, functions: 3, triggers: 1, quantity_check: 'CHECK (quantity >= 0)', history_rows: 1 });
    assert.deepEqual(p.privateGrants, []); assert.equal(p.rpc.length, 2);
    assert.deepEqual(p.privateObject, { schema_owner: true, table_owner: true, relrowsecurity: true, not_forced: true, policies: 0 });
    for (const fn of p.rpc) { assert(fn.owner && fn.prosecdef && fn.authenticated); assert.equal(fn.anon, false); assert.equal(fn.service, false); assert.equal(fn.unexpected_grants, 0); assert.deepEqual(fn.proconfig, ['search_path=""']); }
    assert(p.receiptColumns.length > 0); assert(p.receiptConstraints.length > 0); assert.equal(p.depletionTrigger.length, 1);
  }
  assert.deepEqual(evidence(12).history, [{ version: 'synthetic-local-v1', name: 'moonberry_share_v1', wrapper_sha256: wrapperSha256 }]);
  assert.equal(evidence(12).modelOnly, true);
  assert.equal(evidence(13).expectedError, 'moonberry_feature_name_exists_stop_do_not_reapply');
  assert.deepEqual(evidence(13).unchanged, evidence(11).postconditions.state);
  assert.equal(report.historyModel.synthetic, true); assert.equal(report.historyModel.managementApiLedgerCoatomicityVerified, false);
  assert.equal(report.historyModel.responseLossInjectedInHarness, true); assert.equal(report.historyModel.commitObservedByHarness, true);
  assert.equal(report.historyModel.simulatedClientOutcome, 'unknown'); assert.equal(report.historyModel.readbackConfirmed, true);
  assert.equal(report.historyModel.replayAttemptedDuringReconciliation, false); assert.equal(report.historyModel.resolution, 'synthetic_committed_do_not_reapply');
  assert.equal(report.blockingEvidence.length, 1); const wait = report.blockingEvidence[0];
  assert.equal(wait.scenario, lockScenario); assert.equal(wait.label, lockLabel); assert.notEqual(wait.waiterPid, wait.holderPid);
  assert(wait.activity.some(row => row.pid === wait.waiterPid && row.wait_event_type === 'Lock' && row.blockers.includes(wait.holderPid)));
  assert(wait.locks.some(lock => lock.pid === wait.waiterPid && lock.relation === 'user_items' && lock.mode === 'AccessExclusiveLock' && !lock.granted));
  assert.equal(wait.sqlstate, '55P03'); assert(wait.elapsedMs >= 4500 && wait.elapsedMs < 12000);
  assert.deepEqual(wait.remainingLocks, []); assert.deepEqual(wait.rollback, absentState);
  assert.deepEqual(evidence(9), wait);
  assert.equal(report.featurePostflight.receipt_columns.length, 8);
  assert.equal(report.featurePostflight.functions.length, 3);
  assert(report.featurePostflight.receipt_constraints.length > 0);
  assert(report.featurePostflight.private_acl.length > 0);
  assert(report.featurePostflight.private_acl.every(acl => acl.grantee === 'postgres'));
  assert(report.featurePostflight.functions.every(fn => typeof fn.arguments === 'string'));
  assert.equal(report.native.current_user, 'postgres'); assert.equal(report.native.listen_addresses, '');
  assert.equal(report.native.server_address, null); assert.equal(report.native.server_port, null);
  assert(report.hba.length > 0 && report.hba.every(rule => !rule.error && (rule.type==='local' ? rule.auth_method==='peer' : rule.auth_method==='reject')));
  assert.equal(report.cleanup.databaseDropped, true); assert.equal(report.cleanup.error, undefined);
  assert.equal(cluster.status, 'PASSED'); assert.equal(cluster.transactionsStarted, true);
  assert.match(cluster.postgresVersion, /^postgres \(PostgreSQL\) 17\./); assert.equal(cluster.noHostedCredentials, true);
  assert.equal(cluster.directoryModes.cluster, 0o700); assert.equal(cluster.directoryModes.socket, 0o700);
  for (const key of ['serverStopped','serverPidAbsent','socketRemoved','syntheticClusterDeleted']) assert.equal(cluster.cleanup[key], true);
  assert.equal(cluster.cleanup.pgCtlStatus, 3); assert.equal(cluster.cleanup.error, undefined);
  return `Verified all ${scenarios.length} exact rollout scenarios, observed 5-second lock timeout, synthetic history readback and complete cleanup. Hosted ledger coatomicity remains unverified.`;
}
async function selfTest() {
  await readContract(root);
  assert.deepEqual(statements("-- outer\nSET LOCAL x=';'; DO $x$ BEGIN PERFORM ';'; END; $x$;"), ["SET LOCAL x=';'", "DO $x$ BEGIN PERFORM ';'; END; $x$"]);
  assert.throws(() => statements('DO $unclosed$'), /Unterminated/);
  assert.throws(() => statements('BEGIN'), /terminate/);
  const drift = { expectedError: 'moonberry_synthetic_drift', rollback: absentState };
  const postconditions = { state: { private_schema: true, functions: 3, triggers: 1, quantity_check: 'CHECK (quantity >= 0)', history_rows: 1 },
    privateGrants: [], privateObject: { schema_owner: true, table_owner: true, relrowsecurity: true, not_forced: true, policies: 0 },
    rpc: ['share_moonberry','read_moonberry_share_moments'].map(proname => ({ proname, owner: true, prosecdef: true, authenticated: true, anon: false, service: false, unexpected_grants: 0, proconfig: ['search_path=""'] })),
    receiptColumns: [{ synthetic: true }], receiptConstraints: [{ synthetic: true }], depletionTrigger: [{ synthetic: true }] };
  const wait = { scenario: lockScenario, label: lockLabel, holderPid: 1, waiterPid: 2,
    activity: [{ pid: 2, wait_event_type: 'Lock', blockers: [1] }], locks: [{ pid: 2, relation: 'user_items', mode: 'AccessExclusiveLock', granted: false }], elapsedMs: 5000, sqlstate: '55P03', remainingLocks: [], rollback: absentState };
  const evidence = [
    { config: { catalog: 1, map: 1, landmark: 1, node: 1 }, tables: Array.from({length:6}, () => ({owner:true,relrowsecurity:true,relforcerowsecurity:false})) },
    { rollback: absentState, submittedWrapperSha256: wrapperSha256, withoutRunnerTransaction: true },
    { variants: Array(5).fill(drift) }, { variants: Array(4).fill(drift) }, { variants: Array(4).fill(drift) }, drift, drift, { variants: Array(3).fill(drift) },
    { rollback: absentState, injectedOnlyFinalPostflightHash: true, exactWrapperSha256: wrapperSha256, submittedSha256: 'synthetic-failure-injection' }, wait,
    { rollback: absentState, modelOnly: true, managementApiLedgerCoatomicityVerified: false, observedBeforeFailure: { functions: 3, history_rows: 1 } },
    { submittedWrapperSha256: wrapperSha256, embeddedProductSha256: productSha256, exactBytes: true, postconditions },
    { postconditions, modelOnly: true, history: [{ version: 'synthetic-local-v1', name: 'moonberry_share_v1', wrapper_sha256: wrapperSha256 }] },
    { expectedError: 'moonberry_feature_name_exists_stop_do_not_reapply', unchanged: postconditions.state }
  ];
  const report = { status:'PASSED',checkCount:scenarios.length,checks:scenarios.map((name,i)=>({name,status:'PASSED',evidence:evidence[i]})),failureCount:0,failures:[],sourceHashesUnchanged:true,
    wrapperSource: { sha256:wrapperSha256,productSha256,topLevelStatementCount:6 }, blockingEvidence:[wait], cleanup:{databaseDropped:true},
    featurePostflight:{receipt_columns:Array(8).fill({synthetic:true}),functions:Array(3).fill({arguments:''}),receipt_constraints:[{synthetic:true}],private_acl:[{grantee:'postgres'}]},
    native:{current_user:'postgres',listen_addresses:'',server_address:null,server_port:null},hba:[{type:'local',auth_method:'peer',error:null}],
    historyModel:{synthetic:true,managementApiLedgerCoatomicityVerified:false,responseLossInjectedInHarness:true,commitObservedByHarness:true,simulatedClientOutcome:'unknown',readbackConfirmed:true,replayAttemptedDuringReconciliation:false,resolution:'synthetic_committed_do_not_reapply'} };
  const cluster = { status:'PASSED',transactionsStarted:true,postgresVersion:'postgres (PostgreSQL) 17.0',noHostedCredentials:true,directoryModes:{cluster:0o700,socket:0o700},cleanup:{serverStopped:true,serverPidAbsent:true,socketRemoved:true,syntheticClusterDeleted:true,pgCtlStatus:3} };
  verify(report,cluster);
  const mutations = [
    r=>r.status='NOT_RUN', r=>r.checks.pop(), r=>r.checks[1].name=r.checks[0].name,
    r=>r.checks[1].name='substituted scenario', r=>r.sourceHashesUnchanged=false,
    r=>r.wrapperSource.sha256='changed', r=>r.wrapperSource.productSha256='changed',
    r=>r.checks[2].evidence.variants.pop(), r=>r.checks[8].evidence.rollback.quantity_check='CHECK (quantity >= 0)',
    r=>r.checks[11].evidence.exactBytes=false, r=>r.checks[11].evidence.postconditions.privateGrants.push({grantee:0}),
    r=>r.historyModel.managementApiLedgerCoatomicityVerified=true, r=>r.historyModel.readbackConfirmed=false,
    r=>r.blockingEvidence=[], r=>r.blockingEvidence[0].activity[0].blockers=[],
    r=>r.blockingEvidence[0].locks[0].granted=true, r=>r.blockingEvidence[0].elapsedMs=15000,
    r=>r.blockingEvidence[0].remainingLocks=[{}], r=>r.cleanup.databaseDropped=false
  ];
  for (const mutate of mutations) { const changed=structuredClone(report); mutate(changed); assert.throws(()=>verify(changed,cluster)); }
  for (const key of ['serverStopped','serverPidAbsent','socketRemoved','syntheticClusterDeleted']) {
    const changed=structuredClone(cluster); changed.cleanup[key]=false; assert.throws(()=>verify(report,changed));
  }
  console.log(`Rollout contract bytes/framing and report gate self-tests passed; ${mutations.length+4} incomplete/unsafe report variants rejected. No database was opened.`);
}
if (process.argv[2] === '--self-test') await selfTest();
else if (process.argv[2] === 'rollout') {
  await readContract(root);
  console.log(verify(JSON.parse(await readFile(`${output}rollout-postgres.json`,'utf8')),JSON.parse(await readFile(`${output}rollout-cluster.json`,'utf8'))));
} else throw new Error('Usage: moonberry-share-rollout-verify.mjs rollout|--self-test');
