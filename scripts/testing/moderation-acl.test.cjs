// Isolated source tests. No network, databases, credentials, or hosted clients.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const root=path.resolve(__dirname,'../..');
function load(relative, requires={}) {
 const src=fs.readFileSync(path.join(root,relative),'utf8');
 const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:relative,reportDiagnostics:true});
 assert.equal((compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 const exports={};
 vm.runInNewContext(compiled.outputText,{exports,Date,require:(name)=>{assert(name in requires,`Unexpected dependency ${name}`);return requires[name];}},{filename:relative});
 return exports;
}
const state=load('src/lib/server/moderation/state.ts');
const mod=load('src/lib/server/moderation/index.ts',{'./state':state,'$lib/server/admin-guard':{getAdminFlags:async()=>({isAdmin:false,isSuper:false})}});
const normalize=x=>JSON.parse(JSON.stringify(x));
const now=Date.parse('2026-10-06T15:00:00Z'),past='2026-10-06T14:59:59Z',future='2026-10-06T15:00:01Z';
for(const [name,row,expected] of [
 ['missing',null,{status:'active',until:null}],
 ['missing fields',{}, {status:'active',until:null}],
 ['unknown status',{moderation_status:'unknown'},{status:'active',until:null}],
 ['active',{moderation_status:'active'},{status:'active',until:null}],
 ['expired mute',{moderation_status:'muted',moderation_until:past},{status:'active',until:null}],
 ['expired suspension',{moderation_status:'suspended',moderation_until:past},{status:'active',until:null}],
 ['at boundary',{moderation_status:'muted',moderation_until:new Date(now).toISOString()},{status:'active',until:null}],
 ['future mute',{moderation_status:'muted',moderation_until:future},{status:'muted',until:future}],
 ['future suspension',{moderation_status:'suspended',moderation_until:future},{status:'suspended',until:future}],
 ['indefinite mute',{moderation_status:'muted',moderation_until:null},{status:'muted',until:null}],
 ['invalid suspension expiry',{moderation_status:'suspended',moderation_until:'bad'},{status:'suspended',until:'bad'}],
 ['ban never expires',{moderation_status:'banned',moderation_until:past},{status:'banned',until:past}],
 ['ban without expiry',{moderation_status:'banned'},{status:'banned',until:null}],
]) test(`effective state: ${name}`,()=>{const before=JSON.stringify(row);assert.deepEqual(normalize(state.effectiveModerationState(row,now)),expected);assert.equal(JSON.stringify(row),before);});
function client(row){const calls=[];const q={select:(x)=>{calls.push(['select',x]);return q;},eq:(...x)=>{calls.push(['eq',...x]);return q;},maybeSingle:async()=>({data:row}),upsert:()=>{throw new Error('Read attempted mutation');}};return {calls,db:{from:(x)=>{calls.push(['from',x]);return q;}}};}
test('getModerationState never writes expired state',async()=>{const c=client({moderation_status:'muted',moderation_until:'2000-01-01T00:00:00Z'});assert.deepEqual(normalize(await mod.getModerationState(c.db,'synthetic-owner')),{status:'active',until:null});assert.deepEqual(c.calls,[['from','user_preferences'],['select','moderation_status, moderation_until'],['eq','user_id','synthetic-owner']]);});
for(const scope of ['message_send','friend_request','circle_create']){
 test(`expired suspension permits ${scope} without writes`,async()=>{const c=client({moderation_status:'suspended',moderation_until:'2000-01-01T00:00:00Z'});assert.deepEqual(normalize(await mod.enforceSocialActionAllowed(c.db,'synthetic-owner',scope)),{ok:true});});
 test(`current ban denies ${scope}`,async()=>{const c=client({moderation_status:'banned',moderation_until:'2000-01-01T00:00:00Z'});const r=await mod.enforceSocialActionAllowed(c.db,'synthetic-owner',scope);assert.equal(r.ok,false);assert.equal(r.moderationStatus,'banned');});
 test(`future suspension denies ${scope}`,async()=>{const c=client({moderation_status:'suspended',moderation_until:'2099-01-01T00:00:00Z'});const r=await mod.enforceSocialActionAllowed(c.db,'synthetic-owner',scope);assert.equal(r.ok,false);});
}
test('mute blocks messaging but preserves existing friend/circle semantics',async()=>{for(const scope of ['message_send','friend_request','circle_create']){const c=client({moderation_status:'muted',moderation_until:'2099-01-01T00:00:00Z'});assert.equal((await mod.enforceSocialActionAllowed(c.db,'synthetic-owner',scope)).ok,scope!=='message_send');}});
test('all four display readers use common effective state and fetch expiry',()=>{for(const p of ['src/routes/api/messenger/messages/+server.ts','src/routes/api/circles/detail/+server.ts','src/routes/api/friends/list/+server.ts','src/routes/api/moderation/cases/+server.ts']){const s=fs.readFileSync(path.join(root,p),'utf8');assert(s.includes('effectiveModerationState(row)'));assert(s.includes(".select('user_id, moderation_status, moderation_until')"));assert(!s.includes("row.moderation_status === 'muted'"));const r=ts.transpileModule(s,{fileName:p,reportDiagnostics:true});assert.equal((r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);}});
test('SQL changes are exactly the two proposed REVOKEs',()=>{const s=fs.readFileSync(path.join(root,'scripts/sql/moderation-acl-hardening-proposal.sql'),'utf8').replace(/--[^\n]*/g,'');assert.equal((s.match(/\bREVOKE\b/g)||[]).length,2);assert(!/\b(GRANT|ALTER|CREATE|DROP|TRUNCATE\s+TABLE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+public\.)\b/.test(s));assert(s.includes("has_table_privilege(role_name,'public.user_preferences','INSERT')"));assert(s.includes("has_column_privilege(role_name,'public.user_preferences',col_name,privilege_name)"));assert(s.includes('preserved_before IS DISTINCT FROM preserved_after'));assert.equal((s.match(/RESTRICT;/g)||[]).length,2);});
