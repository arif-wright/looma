// Source simulation, mocked native calls and strict historical bytes. No hosted proof.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {beforeEndcapStaging} from './endcap-staging-preservation.mjs';
import * as nav from './plaza-navigation.mjs';
import * as staging from './endcap-staging.mjs';
import {replay,measuredQuantum,simulateEndcap,stagedTail,throughGate,motion,envelopeDistances} from './endcap-staging-model.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8'),sha=s=>createHash('sha256').update(s).digest('hex');
const ts=createRequire(import.meta.url)('typescript'),error=()=>new Error(staging.ENDCAP_REFUSAL);
const pins={
  "courtyard-navigation.test.mjs": "6397738a862d5db5d53c57ed5951fe57188e54639d8a39a5df0edea4ead688db",
  "plaza-browser.ts": "fac0a9c77e487dad3be88deecc1a052d47f929b634c55ba86b1d1932a329ca71",
  "town-masonry-preservation.mjs": "8405e8570788e44759301c38b477b969d15e9982f25f57dbd441dcc3dfbe6339",
  "prompt-timing-preservation.test.mjs": "eb2e2c046974133595cc1829cf73b178e1983bcb2c44fa0890c53e1a6dbdb6cf",
  "courtyard-chord-selection.test.mjs": "8f71f498e490344112ea210fdfad50b3c902329c2933f517e13a09f51f22180f",
  "plaza-navigation.mjs": "90abe039ab357d017514100e9ccbab20cf06e2608226bb09d80e6ed35a39ba5c",
  "schema-plaza-data.mjs": "e9d0ece071268e21f263fde2d92878a95317c6d172f6916e9b8a3528e0f77c20",
  "plaza-contract.mjs": "67dca46cfcf8e356ccf3ec2af754b0744358d8d678c59a15dbf44c8b1a56bfbf",
  "cases.mjs": "b11aea766a2497ea2e0682b0d9cc43854d99724d4848891ee822137f8a126196",
  "screenshots.mjs": "ef3c40e44fc363ef3dc65982684753685b692dad853a75e28e8f490726170e26",
  "verify-plaza.mjs": "d793c4730068da80a008e2a5631a1a2dc3714c4f64b47036c5f6adde2ccae91f"
};
for(const [name,digest]of Object.entries(pins))test(`exact 118eb3a8 bytes outside explicit recovery delta: ${name}`,()=>assert.equal(sha(beforeEndcapStaging(name,read('./'+name))),digest));
test('original route, targets and default controller remain entirely unchanged',()=>{
 assert.deepEqual(nav.NAVIGATION_PHASES.endcapSide,[[1856,432],[1700,432],[1700,420],[1680,420],[1660,400],[1610,400],[1610,260],[1640,260]]);
 assert.equal(nav.WAYPOINT_TOLERANCE,8);assert.equal(nav.WAYPOINT_DEADLINE_MS,6500);
 assert.throws(()=>nav.waypointStep(replay.releasedPosition,...replay.target,replay.observedLegIntervalMs,0,replay.history),/No independently safe native chord envelope near 1610,400/);
});
test('plan accepts only independently reproduced original refusal with safe north envelope',()=>{
 const p=replay.releasedPosition,plan=staging.endcapRecoveryPlan(error(),p,1610,400,964,replay.history);assert(plan);assert.equal(plan.bound,24);assert.deepEqual(plan.north,{key:'w',delay:16});
 for(const args of [[Error('unrelated'),p,1610,400,0,replay.history],[error(),p,1610,401,0,replay.history],[error(),p,1610,400,6500,replay.history],[error(),p,1610,400,0,[]],[error(),{...p,x:1600},1610,400,0,replay.history]])assert.equal(staging.endcapRecoveryPlan(...args),null);
 const q={x:p.x,y:p.y-measuredQuantum},pulse=staging.endcapStagingChord(q,plan);assert(nav.safeChordEnvelope(pulse.correction.envelope));assert(Math.min(...Object.values(envelopeDistances(pulse.correction.envelope)))>44);
 assert.throws(()=>staging.endcapStagingChord(p,plan),/no independently safe full chord envelope/);
});
for(const origin of ['failed-pose','approach'])for(const northFrames of[1,2])for(const lead of[0,1,2])for(const trailing of[0,1,2])test(`${origin} north=${northFrames} chord=${lead}/1/${trailing} retains original arrivals and return route`,()=>{
 const start=origin==='failed-pose'?replay.releasedPosition:replay.approachPosition,seedHistory=origin==='failed-pose'?replay.history:[];
 const baseline=simulateEndcap({start,seedHistory,points:throughGate(),phases:[lead,1,trailing],northFrames});
 assert.equal(baseline.passed,false);
 const r=simulateEndcap({start,seedHistory,points:throughGate(),recover:true,phases:[lead,1,trailing],northFrames,initialElapsed:origin==='failed-pose'?replay.observedLegIntervalMs:0});
 assert(r.passed,r.error);assert.equal(r.recoveries.length,1);assert(r.minimum>38&&r.envelopeMinimum>38);assert(r.maxLeg<6500);assert.deepEqual(r.arrivals.map(a=>a.target),throughGate());
});
test('every previously successful cadence/endpoint path has identical commands and results',()=>{
 let successful=0,repaired=0,refused=0;
 for(const q of[220/60,220/30,220/15,16,17,18,19,measuredQuantum,19.8,20,21,22,23,24])for(const dx of[-8,0,8])for(const dy of[-8,0,8])for(const lead of[0,1,2])for(const tail of[0,1,2]){
  const options={start:{x:1660+dx,y:400+dy},quanta:[q],phases:[lead,1,tail],keepTrace:true},a=simulateEndcap(options),b=simulateEndcap({...options,recover:true});
  if(a.error?.startsWith('Unsafe proposed sweep')){assert.deepEqual(b,a);assert.equal(b.recoveries.length,0);continue;}
  if(a.passed){successful++;assert.deepEqual(b,a);}else if(b.passed)repaired++;else{refused++;assert.match(b.error,/No independently safe native chord envelope|Native route stalled|Endcap staging rejected|6500ms/);}
  assert(b.minimum>38,b.error);
 }
 assert(successful>1000);assert(repaired>0);assert(refused>0);
});
for(const options of [{northFrames:0},{northFrames:3},{phases:[1,0,1]},{phases:[1,2,1]},{initialElapsed:6000},{quanta:[25]}])test(`unsupported recovery stays a failure: ${JSON.stringify(options)}`,()=>{
 const r=simulateEndcap({...options,recover:true,seedHistory:replay.history,points:throughGate()});assert.equal(r.passed,false);assert.match(r.error,/Endcap staging rejected|6500ms|No independently safe native chord envelope|Unmodeled native fine-step/);
});
const example=simulateEndcap({recover:true,seedHistory:replay.history,keepTrace:true}),north=example.trace[0],chord=example.trace[1],plan=example.recoveries[0].plan;
for(const [label,event]of [['north',north],['chord',chord]]){
 test(`full ${label} frame history passes strict source, geometry, quantum and envelope checks`,()=>assert(staging.verifyEndcapStagingFrames(event.frames,event.frames[0],event.frames.at(-1),plan,event.pulse).moving>0));
 for(const [name,mutate]of [
  ['missing frame',f=>f.splice(1,1)],['wrong direction',f=>f[1].intent.x=1],['nonfinite position',f=>f[1].x=NaN],['unmodeled displacement',f=>f[1].x+=1],['wrong delta',f=>f[1].courtyardFrame.delta=1],['paused scene',f=>f[1].courtyardFrame.movement.runState='paused'],['wrong owner',f=>f[1].courtyardFrame.movement.playerId++],['zero scene identity',f=>f.forEach(p=>p.courtyardFrame.movement.sceneId=0)],['negative frame',f=>f[1].courtyardFrame.frame=-1],['wrong area',f=>f[1].area=1],['active dash',f=>f[1].dash.timer=1],['wrong speed',f=>f[1].courtyardFrame.movement.velocity.speed=221],['wrong native velocity',f=>f[1].courtyardFrame.movement.velocity.vx=999],['nonneutral endpoint',f=>f.at(-1).intent.y=-1],['noncontiguous frame',f=>f[1].courtyardFrame.frame++],['reordered time',f=>f[1].at=f[0].at]
 ])test(`${label} rejects ${name}`,()=>{const f=structuredClone(event.frames);mutate(f);assert.throws(()=>staging.verifyEndcapStagingFrames(f,f[0],f.at(-1),plan,event.pulse));});
}
const helperJS=ts.transpileModule(read('./endcap-staging.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function helperModel({pressError=null,readError=null,neutralError=null,overflow=false,attachmentError=null,advance=0,mutate=null}={}){
 let index=-1,now=0;const events=[],records=[],module={exports:{}},entries=[north,chord];
 const page={keyboard:{press:async(key,{delay})=>{events.push(['press',key,delay]);index++;now+=advance;if(pressError)throw pressError;}},evaluate:async(fn,args)=>{events.push(['trace']);now+=advance;if(readError)throw readError;if(overflow)throw Error('Endcap staging motion overflow');let f=structuredClone(entries[index].frames.slice(1));if(mutate)mutate(f);return f;}};
 const info={attach:async(name,{body})=>{events.push(['attach',name]);records.push(JSON.parse(body.toString()));if(attachmentError)throw attachmentError;}};
 vm.runInNewContext(helperJS,{module,exports:module.exports,require:n=>n==='./endcap-staging.mjs'?staging:n==='./plaza-navigation.mjs'?nav:(()=>{throw Error(n);})(),Buffer,Error,AggregateError,structuredClone});
 const initial=structuredClone(north.frames[0]);
 return {events,records,run:()=>module.exports.recoverEndcapSide(page,info,error(),initial,1610,400,structuredClone(replay.history),()=>now,async()=>{events.push(['neutral']);now+=advance;if(neutralError)throw neutralError;return structuredClone(entries[index].frames.at(-1));})};
}
test('actual helper emits exactly north then safe chord and records refusal without declaring original arrival',async()=>{
 const m=helperModel();const r=await m.run();assert.deepEqual(m.events.filter(e=>e[0]==='press'),[['press','w',16],['press','w+a',16]]);assert.equal(r.history.length,2);assert.equal(m.records.length,1);assert.equal(m.records[0].originalRefusal,staging.ENDCAP_REFUSAL);assert.equal(m.records[0].status,'staged-original-arrival-still-required');assert.deepEqual(m.records[0].originalTarget,[1610,400]);
});
for(const [name,options,pattern]of [['press',{pressError:Error('press failed')},/press failed/],['neutral',{neutralError:Error('neutral watchdog')},/neutral watchdog/],['trace',{readError:Error('trace failed')},/trace failed/],['overflow',{overflow:true},/overflow/],['corrupted motion',{mutate:f=>f[0].x+=1},/displacement disagrees/],['original deadline',{advance:2200},/6500ms/]])test(`actual helper preserves ${name} failure and records it`,async()=>{
 const m=helperModel(options);await assert.rejects(m.run(),pattern);assert.equal(m.records.length,1);assert.equal(m.records[0].status,'failed');assert.equal(m.events.filter(e=>e[0]==='press').length,1);
});
test('attachment failure cannot hide a preexisting recovery failure',async()=>{const first=Error('press failed'),second=Error('attach failed'),m=helperModel({pressError:first,attachmentError:second});await assert.rejects(m.run(),e=>e instanceof AggregateError&&e.errors[0]===first&&e.errors[1]===second);});
// Execute the actual move body, including its outer exhaustive cleanup. The
// optional recovery must not alter any successful baseline native-call trace.
const driver=read('./plaza-browser.ts');
function mover(source,{frames=[],pulses=[],recover=async()=>{throw Error('unexpected recovery');},now=()=>0}={}){
 const ast=ts.createSourceFile('plaza-browser.ts',source,ts.ScriptTarget.Latest,true),node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='move');
 const js=ts.transpileModule(node.getText(ast)+'\nexports.run=move;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 let frameIndex=0,pulseIndex=0;const module={exports:{}},events=[],page={keyboard:{press:async(key,{delay})=>events.push(['press',key,delay])}};
 vm.runInNewContext(js,{module,exports:module.exports,Date:{now},Math,waypointStep:(...args)=>{events.push(['choose',args[0].x,args[0].y,args[1],args[2],args[3]]);const p=pulses[pulseIndex++];if(p instanceof Error)throw p;return p;},releasedFrame:async()=>{events.push(['neutral']);return frames[frameIndex++];},chordEndpointAllowed:()=>true,release:async()=>events.push(['release']),recoverEndcapSide:async(...args)=>{events.push(['recovery']);return recover(...args);}});
 return {run:(info)=>module.exports.run(page,1610,400,info),events};
}
test('actual successful mover dispatches exactly historical native calls with recovery enabled or omitted',async()=>{
 const options={frames:[motion({x:1620,y:400},1,1),motion({x:1610,y:400},2,2)],pulses:[{key:'a',delay:16},null]};
 const baseline=mover(beforeEndcapStaging('plaza-browser.ts',driver),options),defaulted=mover(driver,options),enabled=mover(driver,options);
 await baseline.run();await defaulted.run();await enabled.run({});assert.deepEqual(defaulted.events,baseline.events);assert.deepEqual(enabled.events,baseline.events);
});
test('actual mover retains target and clock after one recovery, then requires original arrival',async()=>{
 let time=100;const p=motion(replay.releasedPosition,1,1),staged=motion({x:1606,y:336},2,2),arrival=motion({x:1606,y:400},3,3);
 const m=mover(driver,{frames:[p,arrival],pulses:[error(),{key:'s',delay:200},null],now:()=>time,recover:async(_page,_info,_error,_p,x,y,_history,elapsed)=>{assert.deepEqual([x,y],[1610,400]);time=2000;assert.equal(elapsed(),1900);return {position:staged,history:[{key:'w',delay:16,before:p,after:staged},{key:'w+a',delay:16,before:p,after:staged}]};}});
 await m.run({});assert.equal(m.events.filter(e=>e[0]==='recovery').length,1);assert(m.events.filter(e=>e[0]==='choose').slice(1).every(e=>e[3]===1610&&e[4]===400&&e[5]===1900));assert.deepEqual(m.events.filter(e=>e[0]==='press'),[['press','s',200]]);
});
for(const [name,pulses,recover,enabled]of [
 ['unrelated error',[Error('unrelated')],async(...a)=>{throw a[2];},true],
 ['disabled recovery',[error()],async()=>{throw Error('must not run');},false],
 ['failed recovery',[error()],async()=>{throw Error('staging failed');},true],
 ['repeat original refusal',[error(),error()],async()=>({position:motion(replay.releasedPosition,2,2),history:[]}),true]
])test(`actual mover ${name} remains failed with exhaustive cleanup`,async()=>{
 const m=mover(driver,{frames:[motion(replay.releasedPosition,1,1)],pulses,recover});await assert.rejects(m.run(enabled?{}:undefined));assert.deepEqual(m.events.at(-1),['release']);assert(m.events.filter(e=>e[0]==='recovery').length<=1);
});
test('recovery capability is passed only to original endcapSide invocation and original target',()=>{
 assert.equal((driver.match(/NAVIGATION_PHASES\.endcapSide,info/g)||[]).length,1);assert.equal((driver.match(/NAVIGATION_PHASES\.[a-zA-Z]+,info/g)||[]).length,1);
 assert.match(driver,/x===1610&&y===400\?endcapInfo:undefined/);assert.match(driver,/if\(!endcapInfo\|\|recoveryUsed\)throw error/);
 assert.equal((driver.match(/const startedAt=Date\.now\(\)/g)||[]).length,1);
 for(const file of ['endcap-staging.ts','endcap-staging.mjs'])assert.doesNotMatch(read('./'+file),/setPosition|setVelocity|dispatchEvent|setTimeout|setInterval|waitForTimeout|\.emit\(/);
});
test('return permission requires original x band and conservative strict-clear return lane',()=>{
 assert(staging.verifyEndcapReturnLane({x:1606,y:336},plan));
 assert.throws(()=>staging.verifyEndcapReturnLane({x:1592,y:336},plan),/unchanged original x arrival band/);
 assert.throws(()=>staging.verifyEndcapReturnLane({x:1610,y:550},plan),/no strict clear lane/);
});
test('full frame validator rejects a 24px-plus native quantum even inside a larger geometry envelope',()=>{
 const p=motion(replay.releasedPosition,1,1),q=24.0001,d=q/.22,next=motion({x:p.x,y:p.y-q},1+d,2,{x:0,y:-1},d),last=motion(next,2+d,3);
 assert.throws(()=>staging.verifyEndcapStagingFrames([p,next,last],p,last,plan,plan.north),/unchanged 24px cap/);
});
test('exact historical reversal rejects missing and duplicated recovery deltas',()=>{
 for(const name of ['plaza-browser.ts','town-masonry-preservation.mjs','prompt-timing-preservation.test.mjs','courtyard-chord-selection.test.mjs','courtyard-navigation.test.mjs']){
  const s=read('./'+name);assert.throws(()=>beforeEndcapStaging(name,s+s),/Exact endcap staging delta/);assert.throws(()=>beforeEndcapStaging(name,beforeEndcapStaging(name,s)),/Exact endcap staging delta/);
 }
});
