import { beforeCourtyardChordSelection } from './courtyard-chord-preservation.mjs';
import { beforePlazaDeparture } from './plaza-departure-preservation.mjs';
// OFFLINE FABRICATED SCHEMA TESTS ONLY. A passing test is not native movement,
// browser execution, captured pixels, visual approval, or release evidence.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fabricateNativeCourtyard,reconcileFabricatedCopies,loadContract,SOURCE_URL,FABRICATED_SOLIDS,fabricatedSweep} from './courtyard-native-schema.mjs';
const {verifyCourtyardState,verifyCourtyardAction}=await loadContract('verify-courtyard.mjs');
const {COURTYARD_ACTIONS,COURTYARD_LIMITS,COURTYARD_VIEWS,COURTYARD_SOLIDS,courtyardTraceIssues,courtyardChordAllowed}=await loadContract('courtyard-contract.mjs');
const {TITLES}=await loadContract('cases.mjs');
const {requiredScreenshots}=await loadContract('screenshots.mjs');
const prototypes=[fabricateNativeCourtyard(0),fabricateNativeCourtyard(1)];
const fixture=(index=0)=>structuredClone(prototypes[index]);
const state=f=>f.observation.state;
const checkpoint=(f,label)=>state(f).checkpoints.find(p=>p.label===label);
const game=(f,label)=>checkpoint(f,label).scene.gameplay;
const verify=f=>verifyCourtyardState(f.observation,f.driver,f.index);
const negative=(name,mutate,{index=0,message}={})=>test(`FABRICATED state rejects ${name}`,()=>{
  const f=fixture(index);mutate(f);reconcileFabricatedCopies(f);assert.throws(()=>verify(f),message);
});
function actionFixture(label){
  const f=fixture(),i=COURTYARD_ACTIONS.findIndex(a=>a.label===label);
  return {action:structuredClone(COURTYARD_ACTIONS[i]),before:state(f).checkpoints[i-1],after:state(f).checkpoints[i],motion:state(f).plazaMotion};
}
const verifyAction=f=>verifyCourtyardAction(f.action,f.before,f.after,f.motion);
const activeSamples=f=>f.motion.filter(p=>p.at>f.before.scene.gameplay.at&&p.at<=f.after.scene.gameplay.at&&p.area===0);
const activation=f=>f.motion.findIndex((p,i)=>i&&p.at>f.before.scene.gameplay.at&&p.at<=f.after.scene.gameplay.at&&p.dash.cd>=200&&f.motion[i-1].dash.cd<=50);
const negativeAction=(name,label,mutate,message)=>test(`FABRICATED action rejects ${name}`,()=>{
  const f=actionFixture(label);mutate(f);assert.throws(()=>verifyAction(f),message);
});
for(const index of [0,1])test(`FABRICATED full ${index?'phone':'desktop'} schema accepted, never native proof`,()=>{
  const f=fixture(index);assert.equal(f.fabricated,true);assert.equal(f.observation.notNativeEvidence,true);
  assert.match(f.warning,/never native/);assert.equal(f.observation.browserVersion,'FABRICATED-NOT-EXECUTED');verify(f);
});
test('native case contract remains exactly 45 checkpoints, 50 ordinary + three setup legs, 18 captures, six walks and ten dashes per viewport',()=>{
  assert.equal(COURTYARD_ACTIONS.length,45);assert.equal(new Set(COURTYARD_ACTIONS.map(a=>a.label)).size,45);
  assert.equal(COURTYARD_ACTIONS.reduce((n,a)=>n+(a.points?.length??0),0),50);
  assert.deepEqual(COURTYARD_ACTIONS.filter(a=>a.kind==='setup').map(a=>a.label),['west-inner-ready','west-inner-dash-ready','east-inner-ready']);assert.equal(COURTYARD_VIEWS.length,18);
  assert.equal(COURTYARD_ACTIONS.filter(a=>a.kind==='walk').length,6);
  assert.equal(COURTYARD_ACTIONS.filter(a=>a.kind==='dash'&&!a.target.endsWith('-end')).length,6);
  assert.equal(COURTYARD_ACTIONS.filter(a=>a.kind==='dash'&&a.target.endsWith('-end')).length,4);
  assert.deepEqual(COURTYARD_LIMITS,{caseMs:600000,legs:64,pulses:1200,motion:12000});
});
test('fabricated simulator copies independent exact polygons rather than consuming verifier collision helpers',()=>{
  assert.deepEqual(FABRICATED_SOLIDS,COURTYARD_SOLIDS);
  assert.equal(fabricatedSweep([1456,688],[1456,921.52],FABRICATED_SOLIDS.west),0);
  assert(fabricatedSweep([1088,400],[1088,633.52],FABRICATED_SOLIDS.west)>38);
  const source=readFileSync(new URL('./courtyard-native-schema.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/import\s*\{[^}]*\b(?:sweptDistance|roomAllows|COURTYARD_SOLIDS)\b/);
});
for(const a of COURTYARD_ACTIONS.filter(a=>['walk','dash'].includes(a.kind)))test(`FABRICATED individual attempt accepted: ${a.label}`,()=>verifyAction(actionFixture(a.label)));

// Driver, finite budgets, complete ordered evidence, and clean teardown.
test('FABRICATED state rejects missing live/cleanup state',()=>{for(const key of ['state','afterCleanup']){const f=fixture();f.observation[key]=null;assert.throws(()=>verify(f));}});
for(const [name,mutate] of Object.entries({
  'wrong driver kind':f=>f.driver.kind='controlled-courtyard-visual-driver',
  'wrong driver viewport index':f=>f.driver.index=1,
  'incomplete driver':f=>f.driver.completed=false,
  'missing completed action':f=>f.driver.completedActions.pop(),
  'wrong completed action':f=>f.driver.completedActions[2]='invented-walk',
  'reordered completed actions':f=>f.driver.completedActions.reverse(),
  'missing checkpoint':f=>state(f).checkpoints.splice(2,1),
  'wrong checkpoint label':f=>state(f).checkpoints[2].label='invented-walk',
  'duplicate checkpoint label':f=>state(f).checkpoints[2].label=state(f).checkpoints[1].label,
  'wrong leg count':f=>f.driver.legs=52,
  'leg overflow':f=>f.driver.legs=65,
  'no pulses':f=>f.driver.pulses=0,
  'pulse overflow':f=>f.driver.pulses=1201,
  'fractional pulses':f=>f.driver.pulses=1.5,
  'nonfinite pulses':f=>f.driver.pulses=NaN,
  'motion overflow flag':f=>state(f).plazaMotionOverflow=true,
  'missing motion':f=>state(f).plazaMotion=[],
  'excessive motion':f=>{const tail=state(f).plazaMotion.at(-1);while(state(f).plazaMotion.length<=12000)state(f).plazaMotion.push({...structuredClone(tail),at:tail.at+state(f).plazaMotion.length});},
  'forbidden transport':f=>state(f).blocked.push({url:'https://forbidden.invalid'}),
  'changed reward mutation':f=>state(f).rewardMutations[0].value.xpDelta=1,
  'wrong fixture profile':f=>state(f).profile='readiness',
  'not ready':f=>state(f).ready=false,
  'duplicate scene':f=>state(f).scenes.push(structuredClone(state(f).scenes[0])),
  'undecoded texture':f=>state(f).scenes[0].decodedKeys.pop(),
  'texture load failure':f=>state(f).scenes[0].loadErrors.push('failed'),
  'failed load count':f=>state(f).scenes[0].totalFailed=1,
  'no engine frame':f=>state(f).scenes[0].framesAfterCreate=0,
  'scene created before preload':f=>state(f).scenes[0].createAt=-1,
  'live scene prematurely destroyed':f=>state(f).scenes[0].destroyed=true,
  'cleanup scene not destroyed':f=>f.observation.afterCleanup.scenes[0].destroyed=false,
  'leaked canvas':f=>f.observation.afterCleanup.canvasCount=1,
  'leaked auth callback':f=>f.observation.afterCleanup.authCallbacks=1,
  'leaked mounted page':f=>f.observation.afterCleanup.mountedPages=[1]
}))negative(name,mutate);
for(const key of ['api','checkpoints','visuals','plazaMotion'])test(`FABRICATED state rejects cleanup-only ${key} drift`,()=>{const f=fixture();f.observation.afterCleanup[key].pop();assert.throws(()=>verify(f));});

// A filename/title relabel does not turn controlled setter observations into
// native evidence. Native provenance is checked in BOTH state snapshots.
for(const snapshot of ['state','afterCleanup'])for(const [name,mutate] of Object.entries({
  'missing provenance':e=>null,
  'controlled mode':e=>({...e,evidenceMode:'controlled-courtyard-visual'}),
  'controlled mode mislabeled native':e=>({...e,evidenceMode:'native-courtyard',visualEnabled:true,visual:{assignments:[{x:1456,y:688}]}}),
  'controlled receipt hidden under native mode':e=>({...e,visual:{assignments:1}}),
  'native movement denied':e=>({...e,nativeMovementEvidence:false})
}))test(`FABRICATED ${snapshot} rejects ${name}`,()=>{const f=fixture();f.observation[snapshot].courtyardEvidence=mutate(f.observation[snapshot].courtyardEvidence);assert.throws(()=>verify(f),/Controlled assignments/);});

for(const [name,mutate] of Object.entries({
  'stale probe request':f=>game(f,'west-inner-ready').plazaProbe.requestedAt=checkpoint(f,'courtyard-home').at,
  'reused probe ID':f=>game(f,'west-inner-ready').plazaProbe.id=1,
  'fractional probe ID':f=>game(f,'west-inner-ready').plazaProbe.id=1.5,
  'probe response from another frame':f=>game(f,'west-inner-ready').plazaProbe.respondedAt-=1,
  'future probe request':f=>game(f,'west-inner-ready').plazaProbe.requestedAt=game(f,'west-inner-ready').at+1,
  'stale checkpoint timestamp':f=>checkpoint(f,'west-inner-ready').at+=1000,
  'checkpoint before render':f=>checkpoint(f,'west-inner-ready').at=game(f,'west-inner-ready').at-1,
  'checkpoint with no matching native frame':f=>{const g=game(f,'west-inner-ready');state(f).plazaMotion=state(f).plazaMotion.filter(p=>p.at!==g.at);},
  'wrong scene identity':f=>checkpoint(f,'west-inner-ready').scene.id=999,
  'held input in full probe':f=>game(f,'west-inner-ready').intent.y=1,
  'changed move target':f=>game(f,'west-inner-ready').x+=9,
  'nonchronological trace':f=>state(f).plazaMotion[3].at=state(f).plazaMotion[1].at-1,
  'nonfinite trace position':f=>state(f).plazaMotion[3].x=NaN,
  'missing observed intent':f=>delete state(f).plazaMotion[3].intent,
  'missing engine delta':f=>delete state(f).plazaMotion[3].courtyardFrame,
  'zero engine delta':f=>state(f).plazaMotion[3].courtyardFrame.delta=0,
  'nonfinite engine delta':f=>state(f).plazaMotion[3].courtyardFrame.delta=Infinity,
  'original room boundary crossing':f=>state(f).plazaMotion[3].x=-999,
  'old shop crossing':f=>{state(f).plazaMotion[3].x=1664;state(f).plazaMotion[3].y=536;},
  'old rear crossing':f=>{state(f).plazaMotion[3].x=1400;state(f).plazaMotion[3].y=352;},
  'old endcap crossing':f=>{state(f).plazaMotion[3].x=1824;state(f).plazaMotion[3].y=296;},
  'new west crossing':f=>{state(f).plazaMotion[3].x=1456;state(f).plazaMotion[3].y=752;},
  'new east crossing':f=>{state(f).plazaMotion[3].x=1872;state(f).plazaMotion[3].y=816;}
}))negative(name,mutate);

negativeAction('walk without sustained held intent','west-inner-walk-blocked',f=>activeSamples(f).forEach(p=>p.intent={x:0,y:0}),/Sustained/);
negativeAction('walk with short observation interval','west-inner-walk-blocked',f=>f.after.at=f.before.at+500,/700ms/);
negativeAction('walk without real approach','west-inner-walk-blocked',f=>{const p=f.before.scene.gameplay;activeSamples(f).forEach(q=>{q.x=p.x;q.y=p.y;});},/genuinely approaches/);
negativeAction('walk without two actual blocked frames','west-inner-walk-blocked',f=>{activeSamples(f).forEach((p,i)=>p.x+=i/10000);},/two held frames/);
negativeAction('walk far from target wall','west-inner-walk-blocked',f=>f.after.scene.gameplay.y=600,/one actual engine movement step/);
negativeAction('walk missing real delta','west-inner-walk-blocked',f=>activeSamples(f).filter(p=>p.intent.y===1).forEach(p=>delete p.courtyardFrame),/engine delta/);
negativeAction('walk whose held intent lasts too little','west-inner-walk-blocked',f=>activeSamples(f).forEach((p,i)=>{if(i>3)p.intent={x:0,y:0};}),/Sustained/);
negativeAction('dash with too few native frames','west-inner-dash-blocked',f=>f.motion=f.motion.filter(p=>p.at<=f.before.scene.gameplay.at).concat(activeSamples(f).slice(0,2)),/multiple native frames/);
negativeAction('dash without cooldown activation','west-inner-dash-blocked',f=>activeSamples(f).forEach(p=>p.dash.cd=0),/Exactly one real cooldown/);
negativeAction('dash with two cooldown activations','west-inner-dash-blocked',f=>{const samples=activeSamples(f);samples[3].dash.cd=0;samples[4].dash.cd=684;},/Exactly one real cooldown/);
negativeAction('dash in wrong actual direction','west-inner-dash-blocked',f=>f.motion[activation(f)].dash.lastDir={x:1,y:0},/direction/);
negativeAction('dash using no engine delta','west-inner-dash-blocked',f=>delete f.motion[activation(f)].courtyardFrame,/observed engine delta/);
negativeAction('dash using zero engine delta','west-inner-dash-blocked',f=>f.motion[activation(f)].courtyardFrame.delta=0,/observed engine delta/);
negativeAction('blocked dash that fails same-frame normal rollback','west-inner-dash-blocked',f=>f.motion[activation(f)].y+=3.52,/rolls back dash AND/);
negativeAction('blocked dash endpoint-only collision leak','west-inner-dash-blocked',f=>{const i=activation(f);f.motion[i].y=f.motion[i-1].y+233.52;},/rolls back dash AND/);
negativeAction('free-end dash using just 230 units','west-end-forward-dash',f=>f.motion[activation(f)].y-=3.52,/complete actual normal-movement term/);
negativeAction('free-end dash with invented same-frame delta','west-end-forward-dash',f=>f.motion[activation(f)].courtyardFrame.delta=17,/complete actual normal-movement term/);
negativeAction('dash whose complete ray crosses room boundary','west-inner-dash-blocked',f=>f.motion[activation(f)].courtyardFrame.delta=5000,/original convex room boundary/);
// Build standalone attempts at deliberate coordinates. These are still visibly
// fabricated and intentionally omit state geometry so action logic is isolated.
function standaloneDash({key='s',target='west',start=[1456,688],delta=16,blocked=true}){
  const dir=[Number(key==='d')-Number(key==='a'),Number(key==='s')-Number(key==='w')],end=start.map((n,i)=>n+dir[i]*(230+220*delta/1000));
  const frame=(at,pos,cd,intent=dir)=>({at,area:0,x:pos[0],y:pos[1],intent:{x:intent[0],y:intent[1]},dash:{cd,timer:cd>500?100:0,lastDir:{x:dir[0],y:dir[1]}},courtyardFrame:{delta}});
  const pos=blocked?start:end,motion=[frame(0,start,0,[0,0]),frame(16,pos,684),frame(32,pos,668),frame(48,pos,652,[0,0])];
  return {action:{kind:'dash',key,target},before:{at:1,scene:{gameplay:motion[0]}},after:{at:49,scene:{gameplay:motion[3]}},motion};
}
for(const [name,args,message] of [
  ['ray that never reaches intended wall',{start:[1088,400]},/intended wall union/],
  ['attempted endpoint still inside intended footprint',{start:[1456,518.48]},/endpoint lies beyond target/],
  ['old shop collider masking west-wall dash',{start:[1664,560]},/isolated from shop/],
  ['other new wall masking west-wall dash',{start:[1872,752]},/isolated from east/],
  ['free-end dash that never crosses endpoint level',{start:[1088,300],target:'west-end',blocked:false},/really crosses the endpoint level/],
  ['free-end dash at wrong side of footprint',{start:[2112,400],target:'west-end',blocked:false},/outside the entire endpoint footprint/]
])test(`FABRICATED standalone dash rejects ${name}`,()=>assert.throws(()=>verifyAction(standaloneDash(args)),message));

for(const [name,mutate] of Object.entries({
  'missing wall owner':f=>game(f,'west-inner-ready').courtyardLifecycle.ownerPresent=false,
  'missing owned wall identity':f=>game(f,'west-inner-ready').courtyardLifecycle.current.pop(),
  'wrong owned wall identity':f=>game(f,'west-inner-ready').courtyardLifecycle.current[0].objectId=9000,
  'wall owner leaked into dungeon':f=>game(f,'courtyard-departed').courtyardLifecycle.ownerPresent=true,
  'wall object leaked into dungeon':f=>game(f,'courtyard-departed').courtyardLifecycle.current=[{objectId:1000}],
  'original wall remains alive after return':f=>game(f,'courtyard-returned-owned').courtyardLifecycle.initial[0].destroyed=false,
  'wall ID reused after return':f=>{const g=game(f,'courtyard-returned-owned');g.townArt.ground.courtyard[0].objectId=1000;g.courtyardLifecycle.current[0].objectId=1000;},
  'wall ID replaced before departure':f=>{const g=game(f,'west-inner-ready');g.townArt.ground.courtyard[0].objectId=4000;g.courtyardLifecycle.current[0].objectId=4000;},
  'unknown extra Graphics object':f=>game(f,'west-inner-ready').townArt.ground.worldGraphicsCount=7,
  'changed wall draw command':f=>game(f,'west-inner-ready').townArt.ground.courtyard[0].commands[9]+=1,
  'translucent wall foundation':f=>game(f,'west-inner-ready').townArt.ground.courtyard[0].alpha=.28,
  'wrong inner cutaway':f=>game(f,'west-inner-walk-blocked').townArt.ground.courtyard[2].alpha=1,
  'wrong outer cutaway':f=>game(f,'west-outer-walk-blocked').townArt.ground.courtyard[2].alpha=.28,
  'wrong elbow painter ordering':f=>game(f,'west-elbow-witness').townArt.ground.courtyard[2].depth=999,
  'wrong wall transform':f=>game(f,'west-inner-ready').townArt.ground.courtyard[0].scaleX=2,
  'changed original perimeter':f=>game(f,'west-inner-ready').townArt.ground.perimeter[0].depth=999,
  'changed original backdrop':f=>game(f,'west-inner-ready').townArt.ground.backdrop[0].commands[10]+=1,
  'missing hero source silhouette':f=>game(f,'west-inner-ready').viewportGeometry.heroVisible=null,
  'hidden hero under UI':f=>game(f,'west-inner-ready').viewportGeometry.heroVisible.screenBounds.y=20,
  'camera zoom changed between checkpoints':f=>game(f,'west-inner-ready').viewportGeometry.camera.zoom=.8,
  'missing analytic visibility':f=>delete game(f,'west-inner-ready').courtyardVisibility,
  'analytic visibility mislabeled native pixels':f=>game(f,'west-inner-ready').courtyardVisibility.nativePixels=true,
  'invalid analytic visibility':f=>game(f,'west-inner-ready').courtyardVisibility.valid=false,
  'wrong analytic alpha threshold':f=>game(f,'west-inner-ready').courtyardVisibility.alphaThreshold=32,
  'too few source silhouette samples':f=>game(f,'west-inner-ready').courtyardVisibility.samples=19,
  'unbounded source silhouette samples':f=>game(f,'west-inner-ready').courtyardVisibility.samples=20001,
  'mostly obscured silhouette':f=>game(f,'west-inner-ready').courtyardVisibility.readable=49,
  'low silhouette transmission':f=>game(f,'west-inner-ready').courtyardVisibility.meanTransmission=.39,
  'missing capture view':f=>state(f).visuals.pop(),
  'wrong capture label':f=>state(f).visuals[0].label='controlled-visual-relabel',
  'wrong desktop viewport':f=>state(f).visuals[0].viewport.width=390,
  'unapproved API request':f=>state(f).api.push({path:'/api/games/real-settlement',method:'POST',at:100}),
  'duplicate departure request':f=>state(f).api.push(structuredClone(state(f).api[0])),
  'modified departure body':f=>state(f).api[0].body.extra='not-allowed',
  'departure before arrival':f=>state(f).api[0].at=1,
  'response after departure':f=>state(f).api[0].responseAt=checkpoint(f,'courtyard-departed').at+1,
  'sign before departure':f=>state(f).api[1].at=1,
  'wrong sign duration':f=>state(f).api[1].body.durationMs=999,
  'changed completion score':f=>state(f).api[2].body.score=1,
  'extra completion field':f=>state(f).api[2].body.extra='not-allowed',
  'wrong saved elapsed time':f=>state(f).api[2].body.stats.expeditionDurationMs=1099,
  'wrong API method':f=>state(f).api[3].method='POST',
  'wrong return outcome':f=>game(f,'courtyard-returned-owned').outcome='rescued',
  'return without excursion timer':f=>game(f,'courtyard-returned-owned').elapsed=0,
  'active town timer':f=>game(f,'west-inner-ready').elapsed=1,
  'phantom predeparture session':f=>checkpoint(f,'west-inner-ready').starts=1
}))negative(name,mutate);
negative('wrong phone viewport',f=>state(f).visuals[0].viewport.width=1280,{index:1});
negative('phone hero clipped at home',f=>game(f,'courtyard-home').viewportGeometry.heroGround.x=-5,{index:1});
negative('phone HUD overflow after return',f=>game(f,'courtyard-returned-owned').viewportGeometry.hud.width=999,{index:1});
test('FABRICATED state rejects visual whose observed gameplay differs from the probe',()=>{const f=fixture();state(f).visuals[0].scene.gameplay.x+=1;f.observation.afterCleanup.visuals=structuredClone(state(f).visuals);assert.throws(()=>verify(f));});

// Additive source-wiring preservation, pinned to the provided approved baseline.
const source=name=>readFileSync(new URL(name,SOURCE_URL),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const ORIGINAL_HASHES={
  'cases.mjs':'b11aea766a2497ea2e0682b0d9cc43854d99724d4848891ee822137f8a126196',
  'screenshots.mjs':'ef3c40e44fc363ef3dc65982684753685b692dad853a75e28e8f490726170e26',
  'plaza-navigation.mjs':'3236281de80be869dbbf0319a73c90aa9c39d057c22b7e8bb347b3c2dde9b322',
  'readiness.browser.spec.ts':'8afafcd3d89d1e89166993e8da51b7c6c2bb02040c945b2043650fd9c7df241d'
};
for(const [name,hash]of Object.entries(ORIGINAL_HASHES))test(`original ${name} remains byte-preserved outside the exact additive predicate delta`,()=>assert.equal(sha(beforeCourtyardChordSelection(name,source(name))),hash));
test('original fourteen readiness cases and twenty-one captures remain unchanged',()=>{assert.equal(TITLES.length,14);assert.equal(TITLES.flatMap((_,i)=>requiredScreenshots(i)).length,21);});
test('original native mover declaration/body remain literal-preserved with exports only',()=>{
  const normalized=beforePlazaDeparture(source('plaza-browser.ts'))
    .replace('\n// Shared native primitives; the original exploration calls keep their defaults.\nexport { release, position, releasedFrame, freshGameplay, move, walkInto, dashInto };\n','');
  assert.equal(sha(normalized),'35567c3633c5cf94ebd62915b466e5dc308626289a3f9dfd1625593a94dcbe04');
});
test('native path retains original controller and has no controlled pose, input, collision or clock setters',()=>{
  const s=source('courtyard-browser.ts');
  assert.match(s,/from ['"]\.\/plaza-browser['"]/);assert.match(s,/from ['"]\.\/courtyard-navigation['"]/);assert.match(s,/await moveCourtyard\(page,x,y,/);
  assert.match(s,/courtyardChordAllowed\(pulse\)/);assert.match(s,/receipt\.pulses>COURTYARD_LIMITS\.pulses/);
  assert.match(s,/receipt\.legs>COURTYARD_LIMITS\.legs/);
  assert.doesNotMatch(s,/setPosition|setVelocity|\.teleport\(|\.clock\.|advanceTime|__arpgCourtyardVisual\s*=\s*true|controlled-courtyard|\.hero\.(?:x|y)\s*=|\.scene\.(?:x|y)\s*=/);
  assert.doesNotMatch(s,/courtyard-native-schema|fabricateNativeCourtyard|schema-plaza-data/);
  assert.match(source('plaza-navigation.mjs'),/WAYPOINT_TOLERANCE\s*=\s*8/);
});
test('additive chord guard rejects new-wall crossing but allows the unchanged no-correction path',()=>{
  assert.equal(courtyardChordAllowed({}),true);
  assert.equal(courtyardChordAllowed({correction:{envelope:[[1440,688],[1472,688],[1472,900],[1440,900]]}}),false);
  assert.equal(courtyardChordAllowed({correction:{envelope:[[1060,400],[1100,400],[1100,720],[1060,720]]}}),true);
});
test('trace contract independently rejects old/new swept crossings with clear endpoints',()=>{
  const frame=(at,[x,y])=>({at,area:0,x,y,intent:{x:0,y:1}});
  for(const [name,a,b]of [['west',[1456,688],[1456,921.52]],['east',[1872,752],[1872,985.52]],['shop',[1664,430],[1664,630]]]){
    assert(fabricatedSweep(a,a,FABRICATED_SOLIDS[name])>38);assert(fabricatedSweep(b,b,FABRICATED_SOLIDS[name])>38);
    assert(courtyardTraceIssues([frame(1,a),frame(2,b)]).some(s=>s.includes(name)),name);
  }
});

// Regression cases found by mutating otherwise accepted inputs. Keep these
// strict; a missing assertion is a verifier bug, not a reason to weaken a test.
for(const [name,mutate] of Object.entries({
  'empty initial lifecycle history':f=>game(f,'courtyard-returned-owned').courtyardLifecycle.initial=[],
  'wrong initial lifecycle IDs':f=>game(f,'courtyard-returned-owned').courtyardLifecycle.initial.forEach(o=>o.objectId+=9000),
  'duplicate initial lifecycle IDs':f=>game(f,'courtyard-returned-owned').courtyardLifecycle.initial.forEach(o=>o.objectId=1000),
  'initial wall falsely destroyed before departure':f=>game(f,'courtyard-home').courtyardLifecycle.initial[0].destroyed=true,
  'initial wall still in world after departure':f=>game(f,'courtyard-departed').courtyardLifecycle.initial[0].inWorld=true,
  'current wall destroyed while owned':f=>game(f,'west-inner-ready').courtyardLifecycle.current[0].destroyed=true,
  'current wall missing from world':f=>game(f,'west-inner-ready').courtyardLifecycle.current[0].inWorld=false,
  'all desktop zoom values missing':f=>state(f).checkpoints.forEach(p=>delete p.scene.gameplay.viewportGeometry.camera.zoom),
  'SDK response predating request':f=>state(f).api[0].responseAt=1,
  'nonfinite SDK response timestamp':f=>state(f).api[0].responseAt=-Infinity,
  'duplicate native render timestamp':f=>state(f).plazaMotion.splice(5,0,structuredClone(state(f).plazaMotion[5])),
  'unknown native trace area':f=>state(f).plazaMotion[5].area=2,
  'premature dungeon excursion in trace':f=>state(f).plazaMotion[5].area=1,
  'unknown case index':f=>{f.index=2;f.driver.index=2;},
  'open-end walk with no observed movement intent':f=>{const a=game(f,'west-walk-inner').at,b=game(f,'west-walk-outer').at;state(f).plazaMotion.filter(p=>p.at>=a&&p.at<=b).forEach(p=>p.intent={x:0,y:0});},
  'duplicate sign request':f=>state(f).api.push(structuredClone(state(f).api[1])),
  'duplicate completion request':f=>state(f).api.push(structuredClone(state(f).api[2])),
  'duplicate player-state read':f=>state(f).api.push(structuredClone(state(f).api[3])),
  'invalid fixture signature':f=>state(f).api[2].body.signature='other',
  'extra completion stats':f=>state(f).api[2].body.stats.xp=999,
  'wrong departure cap':f=>game(f,'courtyard-departed').durationLimit=90000,
  'active expedition on return':f=>game(f,'courtyard-returned-owned').expeditionActive=true
}))negative(name,mutate);
negativeAction('dash without actual held native intent','west-inner-dash-blocked',f=>activeSamples(f).forEach(p=>p.intent={x:0,y:0}),/actual held native direction/);
test('FABRICATED free-end action uses actual engine delta rather than wall-clock frame gap',()=>{
  const f=standaloneDash({start:[1088,400],target:'west-end',blocked:false,delta:100});
  f.motion[1].at=1000;f.motion[2].at=2000;f.motion[3].at=3000;f.after.at=3001;
  verifyAction(f);
});
test('FABRICATED state accepts exact pulse and trace ceilings without expanding them',()=>{
  const f=fixture();f.driver.pulses=1200;const trace=state(f).plazaMotion,last=trace.at(-1);
  while(trace.length<12000){const next=structuredClone(last),offset=trace.length-prototypes[0].observation.state.plazaMotion.length+1;next.at=last.at+16*offset;next.courtyardFrame.frame=last.courtyardFrame.frame+offset;trace.push(next);}
  reconcileFabricatedCopies(f);verify(f);
});
negative('duplicated asset queue and decode receipts',f=>{
  for(const v of [f.observation.state,f.observation.afterCleanup]){const scene=v.scenes[0];scene.queuedKeys.push(scene.queuedKeys[0]);scene.decodedKeys.push(scene.decodedKeys[0]);}
});
negative('neutral checkpoint contradicting held matching trace frame',f=>{const g=game(f,'west-inner-ready');state(f).plazaMotion.find(p=>p.at===g.at).intent={x:0,y:1};});
negativeAction('nonfinite activation cooldown','west-inner-dash-blocked',f=>f.motion[activation(f)].dash.cd=Infinity);
test('fabricated schema generation is deterministic and does not write browser execution output',()=>{
  assert.deepEqual(fabricateNativeCourtyard(0),prototypes[0]);
  const s=readFileSync(new URL('./courtyard-native-schema.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(s,/writeFile|createWriteStream|browser-results\.json|page\.screenshot|launch\(/);
});

negative('repeated native engine frame despite fresh timestamp',f=>state(f).plazaMotion[3].courtyardFrame.frame=state(f).plazaMotion[2].courtyardFrame.frame);
negative('probe engine frame contradicts matching motion',f=>game(f,'west-inner-ready').courtyardFrame.frame++);
negative('probe hero animation contradicts matching motion',f=>game(f,'west-inner-ready').courtyardFrame.hero.frameName=999);
test('zero startup delta is valid only when it produced no movement',()=>{const f=fixture();state(f).plazaMotion[0].courtyardFrame.delta=0;state(f).checkpoints[0].scene.gameplay.courtyardFrame.delta=0;reconcileFabricatedCopies(f);verify(f);});

negativeAction('stationary held walk with a too-short actual attempted step','west-inner-walk-blocked',f=>{
  const p=activeSamples(f).find(p=>{const prev=f.motion[f.motion.indexOf(p)-1];return p.intent.y===1&&p.x===prev.x&&p.y===prev.y;});
  p.courtyardFrame.delta=.0001;
},/actually attempts the intended wall/);
negativeAction('stationary held walk with an active dash','west-inner-walk-blocked',f=>{
  const p=activeSamples(f).find(p=>{const prev=f.motion[f.motion.indexOf(p)-1];return p.intent.y===1&&p.x===prev.x&&p.y===prev.y;});p.dash.timer=10;
},/not an active dash/);
negativeAction('stationary held walk whose complete actual attempt reaches another solid','west-outer-walk-blocked',f=>{
  const p=activeSamples(f).find(p=>{const prev=f.motion[f.motion.indexOf(p)-1];return p.intent.y===-1&&p.x===prev.x&&p.y===prev.y;});p.courtyardFrame.delta=1800;
},/isolated from/);
negativeAction('stationary held walk whose complete actual attempt exits the room','west-inner-walk-blocked',f=>{
  const p=activeSamples(f).find(p=>{const prev=f.motion[f.motion.indexOf(p)-1];return p.intent.y===1&&p.x===prev.x&&p.y===prev.y;});p.courtyardFrame.delta=10000;
},/room boundary/);
test('FABRICATED cleanup tail rejects repeated engine ID despite a fresh timestamp',()=>{
  const f=fixture(),trace=f.observation.afterCleanup.plazaMotion,p=structuredClone(trace.at(-1));p.at+=16;trace.push(p);
  assert.throws(()=>verify(f),/Every observed native segment/);
});

negativeAction('walk with its first blocked frame before any actual approach','west-inner-walk-blocked',f=>{
  const p=activeSamples(f).find(p=>p.intent.y===1),previous=f.motion[f.motion.indexOf(p)-1];p.x=previous.x;p.y=previous.y;
},/approaches before its first blocked frame/);

// Bounded-region challenge examples use independent literal geometry and actual
// per-frame updates. They do not infer engine evidence from elapsed wall time.
function regionWalk({x=1472,y=624,updates=5,q=27.1326}={}){
  let pos=[x,y];const make=(at,delta,intent)=>({at,area:0,x:pos[0],y:pos[1],intent:{x:0,y:intent},dash:{cd:0,timer:0,lastDir:{x:0,y:1}},courtyardFrame:{delta}});
  const motion=[make(0,16,0)];
  for(let i=0;i<updates;i++){
    const end=[pos[0],pos[1]+q];if(Object.values(FABRICATED_SOLIDS).every(poly=>fabricatedSweep(pos,end,poly)>38))pos=end;
    motion.push(make((i+1)*625/updates,q/.22,1));
  }
  motion.push(make(700,16,0));
  return {action:{kind:'walk',key:'s',target:'west'},before:{at:1,scene:{gameplay:motion[0]}},after:{at:701,scene:{gameplay:motion.at(-1)}},motion};
}
for(const x of [1440,1472])for(const y of [624,656])for(const q of [26.7652,27.1326])test(`FABRICATED five observed held updates retain real approach/two blocks from region corner ${x},${y},q${q}`,()=>verifyAction(regionWalk({x,y,q})));
test('FABRICATED700ms hold with too few actual updates cannot manufacture blocking evidence',()=>{
  assert.throws(()=>verifyAction(regionWalk({updates:3})),/two held frames/);
  assert.throws(()=>verifyAction(regionWalk({updates:2})),/Sustained/);
});
function regionDash({leads=0,delta=123.33}={}){
  const start=[1440,638],q=27.1326,activationStart=[start[0],start[1]+leads*q];
  const f=standaloneDash({start:activationStart,delta});
  const prefix=Array.from({length:leads+1},(_,i)=>({...structuredClone(f.motion[0]),at:-100*(leads+1-i),x:start[0],y:start[1]+i*q,intent:{x:0,y:i?1:0},courtyardFrame:{delta:q/.22}}));
  f.motion=[...prefix,...f.motion];f.before={at:prefix[0].at+1,scene:{gameplay:prefix[0]}};
  return f;
}
for(const leads of [0,1,2])test(`FABRICATED dash checks actual preactivation pose after ${leads} south updates`,()=>verifyAction(regionDash({leads})));
test('FABRICATED two-lead delta250 counterexample still fails the full attempted room check',()=>assert.throws(()=>verifyAction(regionDash({leads:2,delta:250})),/original convex room boundary/));
test('FABRICATED delta250 is permitted for zero-lead activation insideR when actual full sweep is safe',()=>verifyAction(regionDash({leads:0,delta:250})));

negative('safe out-and-back native input after returned setup but before checkpoint',f=>{
  const s=state(f),r=f.driver.setups[0],settled=r.after,cut=settled.courtyardFrame.frame+1;
  // Preserve every existing record and insert truthful consecutive raw frames.
  // This is safe physical movement but unreported input after setup returned.
  const shift=v=>{if(!v||typeof v!=='object')return;if(v.courtyardFrame?.frame>=cut)v.courtyardFrame.frame+=3;for(const value of Object.values(v))shift(value);};
  shift(f);
  const extra=[{dt:4,y:640.88,intent:1},{dt:8,y:640,intent:-1},{dt:12,y:640,intent:0}].map((v,i)=>({...structuredClone(settled),at:settled.at+v.dt,y:v.y,intent:{x:0,y:v.intent},dash:{...structuredClone(settled.dash),lastDir:{x:0,y:v.intent||-1}},courtyardFrame:{...structuredClone(settled.courtyardFrame),frame:cut+i,delta:4}}));
  const at=s.plazaMotion.findIndex(p=>p.at>settled.at);s.plazaMotion.splice(at,0,...extra);
  const cp=game(f,'west-inner-ready');cp.dash.lastDir={x:0,y:-1};s.plazaMotion.find(p=>p.at===cp.at).dash.lastDir={x:0,y:-1};
},{message:/Completed setup stays at its settled pose/});
