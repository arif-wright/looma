// Fabricated/offline source cases only; never native browser evidence.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sourceNorthFrames} from './perimeter-source-model.mjs';
import {perimeterTraceIssues,perimeterPositionIssues,perimeterGap,perimeterLimit,northRoomAttempt,inPerimeterSetup,perimeterSetupStep} from './perimeter-contract.mjs';
import {verifyPerimeter} from './verify-perimeter.mjs';
import {roomAllows,sweptDistance} from './plaza-contract.mjs';
import {COURTYARD_SOLIDS} from './courtyard-contract.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const frozen=JSON.parse(read('./perimeter-regression-evidence.json'));
const state=()=>({sceneId:1,initialized:true,ended:false,runState:'running',playerId:1,areaEpoch:1,sceneStatus:5,pendingDestroy:false,hp:140,velocity:{vx:0,vy:0,speed:220}});
export const sample=(x,y,at,frame,intent=0,delta=16,vy=0)=>({at,area:0,x,y,intent:{x:0,y:intent},dash:{cd:0,timer:0,lastDir:{x:0,y:-1}},courtyardFrame:{frame,delta,hero:{textureKey:'hero-idle',frameName:0,animation:null,playing:false},movement:{...state(),velocity:{vx:0,vy,speed:220}}}});
export function challenge({x=1368,gap=47.5,quanta=Array(7).fill(24)}={}) {
  const trace=[sample(x,perimeterLimit(x)+gap,1000,10)];
  for(const[f,i]of sourceNorthFrames(x,trace[0].y,quanta).map((f,i)=>[f,i]))trace.push(sample(f.after.x,f.after.y,1100+i*100,11+i,-1,f.delta,f.velocity.vy));
  const last=trace.at(-1);trace.push(sample(last.x,last.y,last.at+10,last.courtyardFrame.frame+1));return trace;
}
const issues=t=>perimeterTraceIssues(t,{challenge:true});
const checkpoint=(label,p)=>({label,at:p.at+1,scene:{id:1,gameplay:structuredClone(p)}});
function verification(trace=challenge()) {
  const first=trace[0],rear=sample(first.x,210,900,8),approach=sample(first.x,first.y,950,9,-1,(210-first.y)/220*1000,-193.6);
  const ready=checkpoint('perimeter-ready',first),blocked=checkpoint('perimeter-wall-blocked',trace.at(-1));
  return {rear:checkpoint('rear-back-cutaway',rear),ready,blocked,motion:[rear,approach,...trace]};
}
const verify=f=>verifyPerimeter(f.rear,f.ready,f.blocked,f.motion);
test('source-extracted q24 collision passes semantic proof and violates historical upper16',()=>{
  const t=challenge();assert.deepEqual(issues(t),[]);assert(Math.abs(perimeterGap(t.at(-1))-23.5)<1e-9);assert(perimeterGap(t.at(-1))>16);verify(verification(t));
  const modeled=sourceNorthFrames(1368,25.5,Array(7).fill(24));
  assert.equal(modeled.filter(f=>f.blocked).length,6);assert.equal(modeled[0].velocity.vy,-193.6);assert(modeled.slice(1).every(f=>f.velocity.vy===0));
});
test('variable delta may advance again after an earlier true rollback',()=>{
  const t=challenge({quanta:[24,24,8,24,24,24,24]});assert.deepEqual(issues(t),[]);verify(verification(t));assert(t[3].y<t[2].y);
});
test('retained independent review evidence pins the exact original false positive',()=>{
  assert.equal(frozen.commit,'c33ddefa22a5a2d0f1aeac437b3465c39b2da8fd');
  assert.equal(frozen.corruption.fullVerifyObservationIndex13Accepts,true);assert.equal(frozen.corruption.approach,0);assert.equal(frozen.corruption.heldFrames,21);
  assert.equal(frozen.inputHashes.browserReport,'1ff9a6162bf2c6bffba0499b4db7dc297af47024246501cc577f6a5cfae82806');
  const {pose}=frozen.corruption,trace=[sample(pose.x,pose.y,1000,0)];
  for(let i=1;i<=21;i++)trace.push(sample(pose.x,pose.y,1000+35*i,i,-1,1));
  trace.push(sample(pose.x,pose.y,1740,22));
  assert(perimeterGap(pose)>=0&&perimeterGap(pose)<=16);assert(roomAllows(northRoomAttempt(pose,1).end));
  assert(issues(trace).some(s=>s.includes('Unblocked north step')));assert(issues(trace).some(s=>s.includes('at least two')));
});
test('stationary no-contact after an earlier valid approach still fails',()=>{
  const t=challenge();t.slice(2,-1).forEach(p=>p.courtyardFrame.delta=1);assert(issues(t).some(s=>s.includes('Unblocked north step')));
});
const mutations={
 'no visible approach':t=>{const y=t[1].y;t.forEach(p=>p.y=y);t[1].courtyardFrame.movement.velocity.vy=0;},
 'approach under8':t=>{const changed=challenge({gap:30,quanta:[7,24,24,24,24,24,24]});t.splice(0,t.length,...changed);},
 'block before approach':t=>{const p=structuredClone(t[0]);p.at+=10;p.courtyardFrame.frame++;p.intent.y=-1;p.courtyardFrame.delta=60/.22;t.slice(1).forEach(q=>q.courtyardFrame.frame++);t.splice(1,0,p);},
 'only one collision':t=>t.splice(3,t.length-4),
 'missing delta':t=>delete t[2].courtyardFrame.delta,
 'NaN delta':t=>t[2].courtyardFrame.delta=NaN,
 'infinite delta':t=>t[2].courtyardFrame.delta=Infinity,
 'zero delta':t=>t[2].courtyardFrame.delta=0,
 'negative delta':t=>t[2].courtyardFrame.delta=-1,
 'timestamp delta substituted':t=>t[2].courtyardFrame.delta=1,
 'missing frame':t=>t.splice(2,1),
 'duplicated frame':t=>t[2].courtyardFrame.frame=t[1].courtyardFrame.frame,
 'fractional frame':t=>t[2].courtyardFrame.frame+=.5,
 'nonchronological frame':t=>t[2].at=t[1].at,
 'missing frame state':t=>delete t[2].courtyardFrame.movement,
 'paused':t=>t[2].courtyardFrame.movement.runState='paused',
 'uninitialized':t=>t[2].courtyardFrame.movement.initialized=false,
 'ended':t=>t[2].courtyardFrame.movement.ended=true,
 'scene paused':t=>t[2].courtyardFrame.movement.sceneStatus=6,
 'stale owner after collision':t=>t[3].courtyardFrame.movement.pendingDestroy=true,
 'missing pending-destroy state':t=>delete t[3].courtyardFrame.movement.pendingDestroy,
 'dead hero':t=>t[2].courtyardFrame.movement.hp=0,
 'scene replaced':t=>t[2].courtyardFrame.movement.sceneId=2,
 'player replaced':t=>t[2].courtyardFrame.movement.playerId=2,
 'area epoch changed':t=>t[2].courtyardFrame.movement.areaEpoch++,
 'dungeon area':t=>t[2].area=1,
 'wrong speed':t=>t[2].courtyardFrame.movement.velocity.speed=221,
 'missing velocity':t=>delete t[2].courtyardFrame.movement.velocity,
 'forged approach velocity':t=>t[1].courtyardFrame.movement.velocity.vy=0,
 'forged rollback velocity':t=>t[2].courtyardFrame.movement.velocity.vy=-193.6,
 'initial neutral velocity stale':t=>t[0].courtyardFrame.movement.velocity.vy=-193.6,
 'actual penetration':t=>t[2].y=-22.01,
 'rollback moves position':t=>t[2].y-=1,
 'neutral movement':t=>t.at(-1).y--,
 'wrong axis intent':t=>t[2].intent.x=1,
 'contrary intent':t=>t[2].intent.y=1,
 'lateral displacement':t=>t[2].x++,
 'outside x band':t=>t.forEach(p=>p.x=1380),
 'active dash':t=>t[2].dash.timer=1,
 'dash activation cooldown':t=>t[2].dash.cd=700,
 'too-deep wrong border attempt':t=>t[2].courtyardFrame.delta=10000,
 'released gap within held input':t=>t[2].intent.y=0,
 'NaN position':t=>t[2].x=NaN
};
for(const[name,mutate]of Object.entries(mutations))test(`reject ${name}`,()=>{const t=challenge();mutate(t);assert(issues(t).length,name);});
for(const[name,mutate]of Object.entries({
 'short hold':f=>f.blocked.at=f.ready.at+599,
 'short sustained span':f=>{const start=f.motion[2].at;f.motion.slice(3).forEach((p,i)=>p.at=start+20+i*20);f.blocked.scene.gameplay=structuredClone(f.motion.at(-1));},
 'stale ready velocity':f=>f.ready.scene.gameplay.courtyardFrame.movement.velocity.vy=1,
 'missing anchor':f=>f.motion.shift(),
 'duplicate anchor':f=>f.motion.push(structuredClone(f.motion.at(-1))),
 'scene change':f=>f.blocked.scene.id=2,
 'wrong setup region':f=>{f.ready.scene.gameplay.y=-8;f.motion.find(p=>p.at===f.ready.scene.gameplay.at).y=-8;}
}))test(`independent perimeter verification rejects ${name}`,()=>{const f=verification();mutate(f);assert.throws(()=>verify(f));});
test('continuous setup strip and full fixed-x approach corridor clear every solid and original room',()=>{
  const strip=[[1360,6],[1376,14],[1376,46],[1360,38]],lane=[[1360,6],[1376,14],[1376,218],[1360,218]];
  for(const poly of[strip,lane]){
    assert(poly.every(roomAllows));
    for(const solid of Object.values(COURTYARD_SOLIDS))assert(Math.min(...poly.map((p,i)=>sweptDistance(p,poly[(i+1)%poly.length],solid)),...solid.map(p=>sweptDistance(p,p,poly)))>38);
  }
  for(const x of[1360,1368,1376])for(const gap of[32,64])assert(inPerimeterSetup(sample(x,perimeterLimit(x)+gap,0,0)));
});
test('bounded model q<=24 reaches32px strip with arbitrary phase; no runtime guarantee',()=>{
  for(const x of[1360,1368,1376])for(const initialY of[202,210,218])for(let q=1;q<=24;q+=.5){
    let p=sample(x,initialY,0,0);while(perimeterGap(p)>64)p.y-=q;assert(inPerimeterSetup(p));
  }
});
test('perimeter setup uses original native pulse sizing at fixed x and unchanged6500 deadline',()=>{
  const p=sample(1367,210,0,0);assert.deepEqual(perimeterSetupStep(p,0),{key:'w',delay:240});
  assert.throws(()=>perimeterSetupStep(p,6500),/stalled/);assert.equal(perimeterSetupStep(sample(1367,25,0,0),6500),null);
  assert.throws(()=>perimeterSetupStep(sample(1367,0,0,0),1),/overshot/);
});
test('all unchanged production collision, motion and ownership sources retain reviewed pins',()=>{
  for(const pin of frozen.sources.filter(p=>p.path.startsWith('src/'))){assert.equal(createHash('sha256').update(read('../../../'+pin.path)).digest('hex'),pin.sha256);}
});
test('source evidence does not replace native callbacks or movement clocks',()=>{
  const observer=read('./observe-scene.ts');const a=observer.indexOf('function readCourtyardFrame('),b=observer.indexOf('function readGameplay(',a),body=observer.slice(a,b);
  assert.doesNotMatch(body,/handlers\.|\.update\(|isBlocked\(|resolveCollisions\(|\.emit\(|\.set\(|Date\.now|performance\.now/);
  assert.match(body,/loop\.delta/);assert.match(body,/pendingDestroy/);assert.match(body,/getVelocity/);
  const driver=read('./plaza-browser.ts');assert.match(driver,/await page\.keyboard\.down\(key\);\n  try \{ await page\.waitForTimeout\(700\); \} finally \{ await page\.keyboard\.up\(key\); \}/);
});
test('room classifier isolates north probes and rejects other borders or exterior center',()=>{
 assert.equal(northRoomAttempt({x:1368,y:1.5},24/.22).isolatedNorth,true);
 assert.equal(northRoomAttempt({x:1368,y:1.5},1000/.22).isolatedNorth,false);
 assert.equal(northRoomAttempt({x:1152,y:-80},100/.22).isolatedNorth,false);
});
test('all old and new facade sweeps remain part of attempted-motion rejection',()=>{
 const t=challenge({gap:452,quanta:[100,100,100,100,100,100,100]});
 assert(issues(t).some(s=>s.includes('facade')||s.includes('sweep intersects')));
});
test('passive active fields use one exclusive ordinary-readiness predicate at all three producers',()=>{
 const source=read('./observe-scene.ts');
 assert.match(source,/window\.__arpgPlazaFlow === true && window\.__arpgReturnFlow === true/);
 assert.match(source,/window\.__arpgCourtyardFlow !== true && window\.__arpgCourtyardVisualFlow !== true && window\.__arpgWalkFrameFlow !== true/);
 assert.equal((source.match(/readinessPlazaFlow\(\)/g)||[]).length,3);
 assert.equal((source.match(/readinessPlazaFlow\(\) \|\| window\.__arpgCourtyardFlow === true \|\| window\.__arpgCourtyardVisualFlow === true/g)||[]).length,2);
});
test('pinned no-FPS-limiter source forwards native delta once per consecutive engine frame',()=>{
 const main=read('../../../src/lib/games/arpg/main.ts');assert.doesNotMatch(main,/\bfps\s*:/);
 const timestep=read('../../../node_modules/phaser/src/core/TimeStep.js');
 assert(timestep.includes("this.fpsLimit = GetValue(config, 'limit', 0)"));
 assert(timestep.includes('var step = (this.hasFpsLimit) ? this.stepLimitFPS.bind(this) : this.step.bind(this)'));
 const step=timestep.slice(timestep.indexOf('    step: function (time)'),timestep.indexOf('    tick: function'));
 assert(step.indexOf('this.callback(time, delta)')>=0);assert(step.indexOf('this.frame++')>step.indexOf('this.callback(time, delta)'));
 const game=read('../../../node_modules/phaser/src/core/Game.js'),systems=read('../../../node_modules/phaser/src/scene/Systems.js');
 assert(game.includes('this.scene.update(time, delta)'));assert(game.includes('eventEmitter.emit(Events.POST_RENDER, renderer, time, delta)'));
 assert(game.includes('this.pendingDestroy = true'));assert(systems.includes('this.sceneUpdate.call(this.scene, time, delta)'));
 assert.match(read('../../../node_modules/phaser/src/scene/const.js'),/RUNNING:\s*5/);
});
