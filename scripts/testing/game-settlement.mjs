// Real SQL in local PostgreSQL/WASM. Independent-backend concurrency is a separate native suite.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { bootstrap } from '../../tests/sql/helpers/game-settlement-fixture.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const q=s=>`'${String(s).replaceAll("'","''")}'`;
const rows=async sql=>(await db.query(sql)).rows;
const scalar=async sql=>(await rows(sql))[0].result;
let tests=0;
async function test(name,run){await run();tests++;console.log(`PASS: ${name}`);}
async function fixture({companion=false,achievements=false}={}){
  const f={owner:randomUUID(),other:randomUUID(),game:randomUUID(),session:randomUUID(),comp:randomUUID()};
  await db.exec(`insert into auth.users values(${q(f.owner)}),(${q(f.other)});
    insert into profiles(id) values(${q(f.owner)}),(${q(f.other)});
    insert into game_titles(id,slug,name) values(${q(f.game)},${q(f.game)},'Synthetic test');
    insert into game_sessions(id,user_id,game_id,nonce,started_at) values(${q(f.session)},${q(f.owner)},${q(f.game)},'nonce',clock_timestamp()-interval '2 minutes');`);
  if(companion) await db.exec(`insert into companions(id,owner_id,name,affection,trust,is_active,state) values(${q(f.comp)},${q(f.owner)},'Synthetic companion',50,40,true,'active');
    insert into companion_stats(companion_id,bond_level) values(${q(f.comp)},4);`);
  if(achievements) await db.exec(`insert into achievements(key,game_id,name,description,points,rule) values
    (${q(f.game+'-first')},${q(f.game)},'First','Synthetic',10,'{"kind":"first_clear"}'),
    (${q(f.game+'-score')},${q(f.game)},'Score','Synthetic',5,'{"kind":"score_threshold","gte":1000}');`);
  return f;
}
const call=(f,over={})=>`select public.fn_settle_game_session(${q(over.owner??f.owner)},${q(over.session??f.session)},${over.score??1000},${over.duration??60000},${q(over.nonce??'nonce')},${q(over.version??'1.0.0')},${over.success??'null'},${over.stats?`${q(JSON.stringify(over.stats))}::jsonb`:'null'},${over.cap??60},${over.multiplier??2},${over.factor??5}) as result`;
async function fail(sql,message){await assert.rejects(()=>db.query(sql),e=>e.message===message);}
async function snapshot(f){return scalar(`select jsonb_build_object('session',(select to_jsonb(s) from game_sessions s where id=${q(f.session)}),
    'xp',(select xp from profiles where id=${q(f.owner)}),'wallet',(select balance from wallets where user_id=${q(f.owner)}),
    'rewards',(select count(*) from game_rewards where session_id=${q(f.session)}),'scores',(select count(*) from game_scores where session_id=${q(f.session)}),
    'grants',(select count(*) from game_grants where user_id=${q(f.owner)}),'tx',(select count(*) from wallet_tx where user_id=${q(f.owner)}),
    'receipts',(select count(*) from economy_transactions where user_id=${q(f.owner)}),'points',(select points from user_points where user_id=${q(f.owner)}),
    'unlocks',(select count(*) from user_achievements where user_id=${q(f.owner)}),'rituals',(select count(*) from companion_rituals where owner_id=${q(f.owner)}),
    'emotions',(select count(*) from companion_emotional_state where user_id=${q(f.owner)}),'companion',(select to_jsonb(c) from companions c where id=${q(f.comp)})) as result`);}
try{
  const manifest=[];await bootstrap(db,resolve(new URL('../..',import.meta.url).pathname),manifest);
  await test('existing JavaScript reward arithmetic is preserved across all base/streak/bond tiers',async()=>{
    const matrix=await rows(`select base,days,least(1::double precision+0.1::double precision*days,2::double precision) mult,
      floor(base*least(1::double precision+0.1::double precision*days,2::double precision))::int reward
      from generate_series(1,200) base cross join generate_series(0,46) days`);
    for(const r of matrix){assert.equal(r.mult,Math.min(1+0.1*r.days,2));assert.equal(r.reward,Math.floor(r.base*Math.min(1+0.1*r.days,2)));}
    const xp=await rows(`select base,mult,floor(base*mult+0.5)::int reward from generate_series(1,100) base
      cross join unnest(array[1,1.02,1.05,1.08,1.10]::double precision[]) mult`);
    for(const r of xp)assert.equal(r.reward,Math.round(r.base*r.mult));
  });
  await test('atomic base + achievements + play ritual use canonical XP and wallet',async()=>{
    const f=await fixture({companion:true,achievements:true});const first=await scalar(call(f));
    assert.equal(first.replayed,false);assert.equal(first.receipt.xpDelta,11);assert.equal(first.receipt.currencyDelta,22);
    assert.equal(first.receipt.achievements.length,2);assert.equal(first.receipt.rituals.completed.length,1);
    const state=await snapshot(f);assert.equal(state.xp,31);assert.equal(state.wallet,100);assert.equal(state.points,15);
    assert.equal(state.rewards,1);assert.equal(state.grants,1);assert.equal(state.scores,1);assert.equal(state.companion.affection,51);
    const second=await scalar(call(f));assert.equal(second.replayed,true);assert.deepEqual(first.receipt,second.receipt);assert.deepEqual(state,await snapshot(f));
  });
  await test('immutable replay survives config/catalog/bonus changes and quota',async()=>{
    const f=await fixture({companion:true});const first=await scalar(call(f,{stats:{b:2,a:1},success:'true'}));const before=await snapshot(f);
    await db.exec(`update game_titles set is_active=false,max_score=0 where id=${q(f.game)};update companion_stats set bond_level=10 where companion_id=${q(f.comp)};`);
    const replay=await scalar(call(f,{stats:{a:1,b:2},success:'true',cap:0,multiplier:0,factor:0}));
    assert.deepEqual(replay.receipt,first.receipt);assert.equal(replay.replayed,true);assert.deepEqual(await snapshot(f),before);
    for(const change of [{score:999},{duration:59000},{success:'false'},{stats:{a:2}},{version:'2.0.0'}])
      await fail(call(f,{stats:{a:1,b:2},success:'true',...change}),'game_settlement_conflict');
    await fail(call(f,{nonce:'other'}),'game_settlement_nonce_mismatch');
    await fail(call(f,{owner:f.other}),'game_settlement_not_found');
  });
  await test('completed legacy and partial started sessions are never backfilled',async()=>{
    const f=await fixture();await db.exec(`update game_sessions set status='completed',completed_at=now() where id=${q(f.session)};`);
    await fail(call(f),'game_settlement_legacy_unreconciled');assert.equal((await snapshot(f)).receipts,0);
    const g=await fixture();await db.exec(`insert into game_rewards(session_id,xp_delta) values(${q(g.session)},10);`);
    const before=await snapshot(g);await fail(call(g),'game_settlement_legacy_unreconciled');assert.deepEqual(await snapshot(g),before);
  });
  await test('new award cap, active title, server-time and numeric bounds fail without writes',async()=>{
    for(const [changes,message] of [[{score:-1},'invalid_input'],[{duration:0},'invalid_input'],[{duration:999},'invalid_duration'],[{score:999999},'invalid_score'],[{score:9000},'invalid_score_rate'],[{version:'0.0.1'},'client_outdated'],[{cap:0},'invalid_config']]){
      const f=await fixture();const before=await snapshot(f);await fail(call(f,changes),'game_settlement_'+message);assert.deepEqual(await snapshot(f),before);
    }
    const f=await fixture();await db.exec(`update game_sessions set started_at=clock_timestamp() where id=${q(f.session)};`);
    await fail(call(f),'game_settlement_invalid_duration');
    await db.exec(`update game_sessions set started_at=clock_timestamp()-interval '2 minutes' where id=${q(f.session)};update game_titles set is_active=false where id=${q(f.game)};`);
    await fail(call(f),'game_settlement_game_unavailable');
  });
  await test('hourly quota serial semantics and zero-score existing minimum award',async()=>{
    const f=await fixture();const result=await scalar(call(f,{score:0,cap:1}));assert.equal(result.receipt.xpDelta,1);assert.equal(result.receipt.currencyDelta,1);
    const other= randomUUID();await db.exec(`insert into game_sessions(id,user_id,game_id,nonce,started_at) values(${q(other)},${q(f.owner)},${q(f.game)},'nonce',now()-interval '2 minutes');`);
    await fail(call(f,{session:other,cap:1}),'game_settlement_cap_rewards_hourly');assert.equal((await scalar(call(f,{score:0,cap:1}))).replayed,true);
  });
  await test('owner-reset daily ritual cannot pay again; legacy claimed ritual is not repaired',async()=>{
    const f=await fixture({companion:true});await scalar(call(f));
    await db.exec(`delete from companion_rituals where owner_id=${q(f.owner)};`);
    const sid=randomUUID();await db.exec(`insert into game_sessions(id,user_id,game_id,nonce,started_at) values(${q(sid)},${q(f.owner)},${q(f.game)},'nonce',now()-interval '2 minutes');`);
    const second=await scalar(call(f,{session:sid}));assert.equal(second.receipt.rituals.completed.length,0);assert.equal((await snapshot(f)).xp,42);
    const g=await fixture({companion:true});await db.exec(`insert into companion_rituals(owner_id,ritual_key,ritual_date,completed,reward_claimed) values(${q(g.owner)},'play_game_with_companion',(now() at time zone 'UTC')::date,true,true);`);
    const legacy=await scalar(call(g));assert.equal(legacy.receipt.rituals.completed.length,0);assert.equal((await snapshot(g)).xp,11);
  });
  await test('fallback companion keeps bonus/ritual while inactive affection stays unchanged',async()=>{
    const f=await fixture({companion:true});await db.exec(`update companions set is_active=false where id=${q(f.comp)};`);
    const r=await scalar(call(f));assert.equal(r.receipt.xpDelta,11);assert.equal(r.receipt.rituals.completed.length,1);assert.equal((await snapshot(f)).companion.affection,50);
  });
  await test('all real write stages rollback; clean retry settles exactly once',async()=>{
    const tables=['game_sessions','game_scores','economy_transactions','user_achievements','user_points','companion_rituals','companions','companion_emotional_state','game_rewards','game_grants','profiles','wallet_tx','wallets'];
    await db.exec(`create function public.test_settlement_fault() returns trigger language plpgsql as $$ begin
      if current_setting('test.fail',true)=(tg_table_name||':'||tg_op||(case when tg_table_name='economy_transactions' then ':'||(to_jsonb(new)->>'source') else '' end)) then raise exception 'injected_failure'; end if;
      return new; end; $$;`);
    for(const table of tables)await db.exec(`create trigger inject_settlement_fault after insert or update on ${table} for each row execute function public.test_settlement_fault();`);
    const stages=['game_sessions:UPDATE','game_scores:INSERT','economy_transactions:INSERT:game_session','user_achievements:INSERT','user_points:INSERT','wallet_tx:INSERT','wallets:INSERT','economy_transactions:UPDATE:achievement','companion_rituals:INSERT','companion_rituals:UPDATE','profiles:UPDATE','companions:UPDATE','companion_emotional_state:INSERT','companion_emotional_state:UPDATE','economy_transactions:UPDATE:companion_ritual','game_rewards:INSERT','game_grants:INSERT','economy_transactions:UPDATE:game_session'];
    for(const stage of stages){
      const f=await fixture({companion:true,achievements:true});const before=await snapshot(f);
      await db.exec(`select set_config('test.fail',${q(stage)},false);`);await fail(call(f),'injected_failure');
      await db.exec(`select set_config('test.fail','',false);`);assert.deepEqual(await snapshot(f),before,stage);
      const first=await scalar(call(f));const paid=await snapshot(f);assert.equal(paid.wallet,100,stage);assert.equal(paid.xp,31,stage);
      assert.deepEqual((await scalar(call(f))).receipt,first.receipt);assert.deepEqual(await snapshot(f),paid);
    }
    console.log(`  ${stages.length} injected write-stage failures verified`);
  });
  await test('new/legacy RPC unavailable to anon/authenticated; service-only owner check and RLS receipt isolation',async()=>{
    const f=await fixture();await scalar(call(f));
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role};`);await assert.rejects(()=>db.query(call(f)),e=>e.code==='42501');
      await assert.rejects(()=>db.query(`select fn_game_complete(${q(f.session)},1,1)`),e=>e.code==='42501');await db.exec('reset role;');
    }
    await db.exec(`select set_config('request.jwt.claim.sub',${q(f.other)},false);set role authenticated;`);
    assert.equal((await rows(`select count(*)::int n from economy_transactions where user_id=${q(f.owner)}`))[0].n,0);
    assert.equal((await rows(`select count(*)::int n from game_rewards where session_id=${q(f.session)}`))[0].n,0);await db.exec('reset role;');
    await db.exec('set role service_role;');await fail(call(f,{owner:f.other}),'game_settlement_not_found');await db.exec('reset role;');
  });
  console.log(`PASS: ${tests} SQL groups; native independent-backend concurrency NOT run by this script.`);
}catch(e){console.error(e.message,e.detail??'',e.where??'');process.exitCode=1;}finally{await db.close();}
