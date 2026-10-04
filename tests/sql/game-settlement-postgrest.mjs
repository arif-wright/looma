// Synthetic HTTP integration only. Never accepts a URL, live key, or user account.
import assert from 'node:assert/strict';
import { randomBytes, createHmac, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
const BASE = 'http://127.0.0.1:3000';
const HISTORY = 'id, xp_delta, currency_delta, meta, inserted_at, session:game_sessions!inner(id, user_id, game:game_titles(slug, name))';
const CHECKS = [
  'signed owner JWTs and anonymous/invalid/expired credentials',
  'two owners complete through service-only HTTP RPC and reload canonical state',
  'bidirectional session reward wallet ledger and receipt isolation',
  'canonical inner-joined history and owner-filtered service receipt queries',
  'authenticated and anonymous direct privileged RPCs denied',
  'legacy completion denied for all API roles',
  'service settlement rejects mismatched owner and session',
  'discarded HTTP completion response recovers identical receipt without double payout',
  'changed retry payload conflicts without mutating saved settlement',
  'direct owner and cross-owner settlement table writes denied'
];
const digest = value => createHash('sha256').update(value).digest('hex');
export function verifyReport(r) {
  assert.equal(r.status, 'PASSED');
  assert.deepEqual(r.checks, CHECKS);
  assert.equal(r.syntheticOwners.length, 2);
  assert.notEqual(r.syntheticOwners[0], r.syntheticOwners[1]);
  assert(r.http.length >= 70);
  assert(r.http.some(x => x.responseDiscarded === true && x.status === 200));
  assert(r.http.some(x => x.code === '42501' && x.status === 403));
  assert(r.http.some(x => x.code === 'P0001' && x.message === 'game_settlement_conflict'));
  assert(r.http.some(x => x.path.startsWith('/game_rewards?') && x.status === 200 && x.rows === 1));
  assert.equal(r.liveServicesUsed, false);
  assert.equal(r.settlements.length,2);
  assert.equal(r.recovery.committedSha256,r.recovery.replayedSha256);
  for(const hash of [r.conflictUnchangedSha256,r.deniedMutationsUnchangedSha256]) assert.match(hash,/^[a-f0-9]{64}$/);
}
if (process.argv.includes('--self-test')) {
  assert.throws(() => verifyReport({status:'NOT_RUN'}));
  assert.equal(CHECKS.length, 10);
  assert.equal(new URL(BASE).hostname,'127.0.0.1');
  console.log('PASS harness/report guards; HTTP integration NOT RUN'); process.exit(0);
}
if (process.argv.includes('--verify-report')) {
  verifyReport(JSON.parse(await readFile(process.argv.at(-1),'utf8')));
  console.log('Verified all 10 synthetic PostgREST integration groups'); process.exit(0);
}
if (process.argv.includes('--source-contract')) {
  const root = process.argv[process.argv.indexOf('--source-contract') + 1];
  const paths = ['src/routes/api/games/player/state/+server.ts','src/lib/server/queries/getPlayerStats.ts',
    'src/lib/server/games/settlement.ts','src/lib/server/games/guard.ts'];
  const sources = await Promise.all(paths.map(p => readFile(`${root}/${p}`,'utf8')));
  assert(sources[0].includes(HISTORY));
  for (const fragment of [".from('wallets')", ".select('balance, currency, updated_at')", ".eq('user_id', auth.user.id)", ".eq('currency', 'shards')", ".eq('session.user_id', auth.user.id)", ".order('inserted_at', { ascending: false })", '.limit(5)']) assert(sources[0].includes(fragment),fragment);
  for (const fragment of [".from('player_stats')", ".select('*')", ".eq('id', user.id)", '.single()']) assert(sources[1].includes(fragment),fragment);
  for (const fragment of [".from('economy_transactions').select('applied, result, meta')", ".eq('user_id',userId).eq('source','game_session').eq('idempotency_key',`game-session:${sessionId}`)"]) assert(sources[2].includes(fragment),fragment);
  assert(sources[3].includes(".from('game_sessions')"));
  await writeFile(process.argv.at(-1),JSON.stringify({status:'PASSED',paths:paths.map((path,i)=>({path,sha256:digest(sources[i])})),history:HISTORY},null,2));
  process.exit(0);
}
assert.equal(process.env.MEMVOYA_POSTGREST_TEST_ONLY,'1','Explicit disposable-container opt-in required');
assert.equal(process.env.HOME,'/tmp','Must run in dedicated test container');
const KEY = '/tmp/mv-test-auth/key';
if (process.argv.includes('--init')) {
  await mkdir('/tmp/mv-test-auth',{recursive:true,mode:0o700});
  await mkdir('/tmp/api-config',{recursive:true,mode:0o700});
  const key = randomBytes(48).toString('hex');
  await writeFile(KEY,key,{mode:0o600});
  await writeFile('/tmp/api-config/postgrest.conf',[
    'db-uri = "postgresql://mv_api_authenticator@127.0.0.1:55437/memvoya_postgrest_test"',
    'db-schemas = "public"','db-anon-role = "anon"','db-config = false',
    'server-host = "127.0.0.1"','server-port = 3000','log-level = "crit"',
    `jwt-secret = "${key}"`
  ].join('\n')+'\n',{mode:0o600});
  console.log('Initialized disposable container-only synthetic authentication'); process.exit(0);
}
const key = await readFile(KEY,'utf8');
const f = JSON.parse(await readFile('/tmp/fixture.json','utf8'));
const token = (role, sub, expire=600, signingKey=key) => {
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${b64({alg:'HS256',typ:'JWT'})}.${b64({role,...(sub?{sub}:{}),exp:Math.floor(Date.now()/1000)+expire})}`;
  return `${input}.${createHmac('sha256',signingKey).update(input).digest('base64url')}`;
};
const service = token('service_role');
const owners = f.owners.map(o=>({...o,jwt:token('authenticated',o.id)}));
assert.equal(owners.length,2);
const report = {status:'RUNNING',syntheticOwners:owners.map(o=>o.id),checks:[],http:[],settlements:[],liveServicesUsed:false,
  limits:['Synthetic JWT verification and PostgREST only; no hosted Auth, login, SvelteKit route, HMAC, browser or live deployment.',
    'Canonical player_stats read uses the repository view and owner filter; this is not a general profile/view RLS audit.',
    'Targeted migration bootstrap and explicit fixture privileges, not full historical Supabase reset or hosted ACL reconciliation.']};
function path(table, params={}) { return `/${table}?${new URLSearchParams(params)}`; }
async function http(jwt, endpoint, {method='GET',body,accept}={}) {
  assert(endpoint.startsWith('/') && !endpoint.startsWith('//'));
  const res = await fetch(BASE+endpoint,{method,redirect:'error',signal:AbortSignal.timeout(10_000),headers:{
    ...(jwt?{Authorization:`Bearer ${jwt}`} : {}),...(body?{'Content-Type':'application/json'}:{}),...(accept?{Accept:accept}:{}),
    ...(method==='PATCH'?{Prefer:'return=representation'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const raw=await res.text(); let data; try {data=raw?JSON.parse(raw):null;} catch {throw new Error(`Non-JSON HTTP ${res.status}: ${endpoint}`);}
  report.http.push({method,path:endpoint,status:res.status,...(Array.isArray(data)?{rows:data.length}:{}),
    ...(data?.code?{code:data.code,message:data.message}:{})});
  return {status:res.status,data};
}
async function ok(jwt, endpoint, opts) {const r=await http(jwt,endpoint,opts);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
async function rows(jwt,table,params={}) {const data=await ok(jwt,path(table,params));assert(Array.isArray(data));return data;}
const submit = (o,index=0) => ({p_user:o.id,p_session:o.sessions[index],p_score:1000,p_duration_ms:60000,p_nonce:o.nonce,
  p_client_version:'1.0.0',p_success:true,p_stats:{synthetic:true},p_max_rewards_per_hour:20,p_streak_multiplier_cap:1.5,p_achievement_shard_factor:2});
const rpc = (jwt,name,body) => http(jwt,`/rpc/${name}`,{method:'POST',body});
async function state(o) {
  const [stats,wallet,rewards] = await Promise.all([
    ok(o.jwt,path('player_stats',{select:'*',id:`eq.${o.id}`}),{accept:'application/vnd.pgrst.object+json'}),
    ok(o.jwt,path('wallets',{select:'balance,currency,updated_at',user_id:`eq.${o.id}`,currency:'eq.shards'}),{accept:'application/vnd.pgrst.object+json'}),
    rows(o.jwt,'game_rewards',{select:HISTORY.replaceAll(' ',''),'session.user_id':`eq.${o.id}`,order:'inserted_at.desc',limit:'5'})]);
  return {stats,wallet,rewards};
}
async function saved(jwt,owner,id) {return rows(jwt,'economy_transactions',{select:'applied,result,meta',user_id:`eq.${owner}`,source:'eq.game_session',idempotency_key:`eq.game-session:${id}`});}
async function snapshot(o) {
  const result={};
  for(const table of ['game_sessions','game_grants','wallets','wallet_tx','economy_transactions']) result[table]=await rows(service,table,{select:'*',user_id:`eq.${o.id}`,order:table==='wallets'?'user_id':'id'});
  result.game_rewards=await rows(service,'game_rewards',{select:'*',session_id:`in.(${o.sessions.join(',')})`,order:'id'});
  result.profiles=await rows(service,'profiles',{select:'id,xp',id:`eq.${o.id}`});
  return result;
}
async function denied(jwt,name,body) {
  const res=await rpc(jwt,name,body);
  assert.equal(res.status,jwt?403:401,`${name}: ${JSON.stringify(res)}`);
  assert.equal(res.data.code,'42501');
}
async function check(name,run) {await run();report.checks.push(name);console.log(`PASS: ${name}`);}
try {
  let ready=false;
  for(let i=0;i<60;i++) {try{const r=await fetch(BASE+'/game_titles?select=id',{headers:{Authorization:`Bearer ${owners[0].jwt}`},signal:AbortSignal.timeout(1000)});if(r.status===200){ready=true;break;}}catch{} await delay(500);}
  assert(ready,'PostgREST failed to become ready');
  await check(CHECKS[0],async()=>{
    for(const o of owners) {const s=await rows(o.jwt,'game_sessions',{select:'id,user_id'});assert.equal(s.length,o.sessions.length);assert(s.every(x=>x.user_id===o.id));}
    const anon=await http(null,'/game_sessions?select=id');assert.equal(anon.status,401);assert.equal(anon.data.code,'42501');
    for(const bad of [token('authenticated',owners[0].id,600,'invalid-test-signing-key-not-a-real-credential'),token('authenticated',owners[0].id,-3600)]) {const r=await http(bad,'/game_sessions?select=id');assert.equal(r.status,401);assert.match(r.data.code,/^PGRST30[13]$/);}
  });
  const receipts=[];
  await check(CHECKS[1],async()=>{
    for(const o of owners) {
      const before=await state(o);assert.equal(before.stats.xp,o.initialXp);assert.equal(Number(before.wallet.balance),o.initialWallet);assert.deepEqual(before.rewards,[]);
      const r=await rpc(service,'fn_settle_game_session',submit(o));assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.replayed,false);
      const receipt=r.data.receipt;receipts.push(receipt);assert.equal(receipt.sessionId,o.sessions[0]);assert.equal(receipt.xpDelta,10);assert.equal(receipt.currencyDelta,22);
      const after=await state(o);assert.equal(after.stats.xp,o.initialXp+10);assert.equal(Number(after.wallet.balance),o.initialWallet+22);assert.equal(after.rewards.length,1);
      report.settlements.push({owner:o.id,receipt,canonical:{xp:after.stats.xp,balance:after.wallet.balance,rewards:after.rewards}});
      const reward=after.rewards[0];assert.equal(reward.xp_delta,receipt.xpDelta);assert.equal(reward.currency_delta,receipt.currencyDelta);assert.equal(reward.session.id,o.sessions[0]);assert.equal(reward.session.user_id,o.id);assert.equal(reward.session.game.slug,f.game.slug);
      const session=await rows(o.jwt,'game_sessions',{id:`eq.${o.sessions[0]}`,select:'id,user_id,status,completed_at'});assert.equal(session[0].status,'completed');assert(session[0].completed_at);
    }
  });
  await check(CHECKS[2],async()=>{
    for(const [i,o] of owners.entries()) {
      const other=owners[1-i];
      for(const table of ['game_sessions','game_grants','wallets','wallet_tx','economy_transactions']) {
        const visible=await rows(o.jwt,table,{select:'*'});assert(visible.length>0);assert(visible.every(r=>r.user_id===o.id));
        assert.deepEqual(await rows(o.jwt,table,{select:'*',user_id:`eq.${other.id}`}),[]);
      }
      const rewards=await rows(o.jwt,'game_rewards',{select:'*'});assert.equal(rewards.length,1);assert.equal(rewards[0].session_id,o.sessions[0]);
      assert.deepEqual(await rows(o.jwt,'game_rewards',{select:'*',session_id:`eq.${other.sessions[0]}`}),[]);
      assert.deepEqual(await saved(o.jwt,other.id,other.sessions[0]),[]);
    }
  });
  await check(CHECKS[3],async()=>{
    for(const [i,o] of owners.entries()) {
      const other=owners[1-i];
      assert.deepEqual(await rows(o.jwt,'game_rewards',{select:HISTORY.replaceAll(' ',''),'session.user_id':`eq.${other.id}`,order:'inserted_at.desc',limit:'5'}),[]);
      const own=await saved(service,o.id,o.sessions[0]);assert.equal(own.length,1);assert.equal(own[0].applied,true);assert.deepEqual(own[0].result,receipts[i]);
      assert.deepEqual(await saved(service,o.id,other.sessions[0]),[],'Privileged receipt query must include both owner and session');
    }
  });
  await check(CHECKS[4],async()=>{
    for(const jwt of [null,...owners.map(o=>o.jwt)]) {
      for(const o of owners) {
        await denied(jwt,'fn_settle_game_session',submit(o));
        await denied(jwt,'fn_settle_achievement_reward',{p_user:o.id,p_achievement:f.achievement,p_shard_factor:2,p_meta:{synthetic:true}});
        await denied(jwt,'fn_award_game_xp',{p_user:o.id,p_xp:100});
        await denied(jwt,'fn_wallet_grant',{p_user:o.id,p_amount:100,p_source:'synthetic-denial',p_ref:o.sessions[0],p_meta:{}});
      }
    }
  });
  await check(CHECKS[5],async()=>{
    for(const jwt of [null,...owners.map(o=>o.jwt),service]) await denied(jwt,'fn_game_complete',{p_session:owners[0].sessions[0],p_score:999,p_duration_ms:60000});
  });
  await check(CHECKS[6],async()=>{
    for(const [i,o] of owners.entries()) {const res=await rpc(service,'fn_settle_game_session',{...submit(o),p_session:owners[1-i].sessions[0]});assert.equal(res.status,400);assert.equal(res.data.code,'P0001');assert.equal(res.data.message,'game_settlement_not_found');}
  });
  await check(CHECKS[7],async()=>{
    const o=owners[0],body=submit(o,1),before=await snapshot(o);
    // Deliberately destroy the successful response before reading its body. Only
    // the HTTP status is retained; recovery has no original receipt to consult.
    const status=await new Promise((resolve,reject)=>{const req=request(BASE+'/rpc/fn_settle_game_session',{method:'POST',headers:{Authorization:`Bearer ${service}`,'Content-Type':'application/json'}},res=>{const status=res.statusCode;res.destroy();resolve(status);});req.on('error',reject);req.setTimeout(10000,()=>req.destroy(new Error('discard-response watchdog')));req.end(JSON.stringify(body));});
    report.http.push({method:'POST',path:'/rpc/fn_settle_game_session',status,responseDiscarded:true});assert.equal(status,200);
    const stored=await saved(service,o.id,o.sessions[1]);assert.equal(stored.length,1);assert.equal(stored[0].applied,true);
    const afterCommit=await snapshot(o);assert.equal(afterCommit.game_rewards.length,before.game_rewards.length+1);assert.equal(afterCommit.wallet_tx.length,before.wallet_tx.length+1);
    const replay=await rpc(service,'fn_settle_game_session',body);assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);assert.deepEqual(replay.data.receipt,stored[0].result);assert.deepEqual(await snapshot(o),afterCommit);
    const canonical=await state(o);assert.equal(canonical.stats.xp,o.initialXp+20);assert.equal(Number(canonical.wallet.balance),o.initialWallet+44);assert.equal(canonical.rewards.length,2);
    report.recovery={sessionId:o.sessions[1],receipt:stored[0].result,canonicalXp:canonical.stats.xp,canonicalWallet:canonical.wallet.balance,beforeSha256:digest(JSON.stringify(before)),committedSha256:digest(JSON.stringify(afterCommit)),replayedSha256:digest(JSON.stringify(await snapshot(o)))};
  });
  await check(CHECKS[8],async()=>{
    const o=owners[0],before=await snapshot(o);
    for(const change of [{p_score:1001},{p_stats:{synthetic:true,changed:true}},{p_success:false}]) {const r=await rpc(service,'fn_settle_game_session',{...submit(o,1),...change});assert.equal(r.status,400);assert.equal(r.data.code,'P0001');assert.equal(r.data.message,'game_settlement_conflict');}
    assert.deepEqual(await snapshot(o),before);
    report.conflictUnchangedSha256=digest(JSON.stringify(before));
  });
  await check(CHECKS[9],async()=>{
    const before=await Promise.all(owners.map(snapshot));
    for(const o of owners) for(const target of owners) {
      for(const [table,query,body] of [
        ['game_sessions',{id:`eq.${target.sessions[0]}`},{score:999}],
        ['game_rewards',{session_id:`eq.${target.sessions[0]}`},{xp_delta:999}],
        ['wallets',{user_id:`eq.${target.id}`},{balance:999}],
        ['economy_transactions',{user_id:`eq.${target.id}`},{applied:false}]
      ]) {const r=await http(o.jwt,path(table,query),{method:'PATCH',body});assert.equal(r.status,403,JSON.stringify(r));assert.equal(r.data.code,'42501');}
    }
    assert.deepEqual(await Promise.all(owners.map(snapshot)),before);
    report.deniedMutationsUnchangedSha256=digest(JSON.stringify(before));
  });
  report.status='PASSED';verifyReport(report);
} catch(error) {report.status='FAILED';report.error=String(error?.stack||error);process.exitCode=1;console.error(report.error);}
finally {await writeFile('/tmp/postgrest-report.json',JSON.stringify(report,null,2)+'\n');}
