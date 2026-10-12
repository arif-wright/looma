import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WALK_MODE,WALK_POSE,WALK_FRAME,WALK_LIMITS,WALK_TITLES,walkScreenshot } from './walk-frame-contract.mjs';
import { visualClearance,visualCameraStable } from './visual-contract.mjs';
import { COURTYARD_NAMES } from './courtyard-graphics.mjs';
import { PLAZA_KEYS } from './plaza-contract.mjs';
import { verifyWalkCapturedPNG } from './walk-frame-capture-contract.mjs';
const FILE='walk-frame.spec.ts',PROJECT='chromium-arpg-walk-frame';
const empty=value=>assert.deepEqual(value,[]),finite=Number.isFinite;
const identical=(a,b,message)=>assert(isDeepStrictEqual(a,b),message);
const mode=v=>{assert.equal(v.evidenceMode,WALK_MODE);assert.equal(v.nativeMovementEvidence,false);assert.equal(v.controlledFrameAssignment,true);};
export function verifyWalkReceipt(r){
  mode(r);assert.equal(r.assignment,'actual-ecs-transform-and-paused-animation-frame');assert.equal(r.animationSelection,'instance-only-production-selection-suppressed');assert.equal(r.sequence,1);assert.equal(r.poseId,WALK_POSE.id);
  assert(Number.isSafeInteger(r.sceneId)&&r.sceneId>0&&Number.isSafeInteger(r.playerId)&&r.playerId>0);
  assert.deepEqual(r.prior,{x:1472,y:536,rot:0});assert.deepEqual(r.assigned,{x:2007.5,y:698.5,rot:0});assert.deepEqual(r.settled,r.assigned);
  assert.deepEqual(r.clearance,visualClearance(WALK_POSE));assert.equal(r.clearance.valid,true);
  assert(finite(r.assignedAt));assert(Number.isSafeInteger(r.assignedNativeFrame)&&r.assignedNativeFrame>=0);assert(Number.isSafeInteger(r.assignedFrameCounter)&&r.assignedFrameCounter>=r.assignedNativeFrame&&r.assignedFrameCounter<=r.assignedNativeFrame+1);
  assert.equal(r.cameraTolerance,.01);assert.equal(r.stableComparisons,3);assert(Array.isArray(r.frames)&&r.frames.length>=4&&r.frames.length<=64);
  let stable=0;
  r.frames.forEach((f,i)=>{const previous=r.frames[i-1];assert(Number.isSafeInteger(f.nativeFrame)&&f.nativeFrame>(previous?.nativeFrame??r.assignedNativeFrame));assert(finite(f.at)&&f.at>=(previous?.at??r.assignedAt)&&finite(f.observerAt)&&f.observerAt<=f.at&&f.at-f.observerAt<1000);assert.equal(f.publicationFrame,f.nativeFrame);assert(f.observerAt>(previous?.observerAt??r.assignedAt),'A fresh existing observer publication is required for every selected frame');
    assert.deepEqual(f.transform,r.assigned);assert.deepEqual(f.intent,{x:0,y:0});assert.deepEqual(f.velocity,{vx:0,vy:0});assert.equal(f.dashTimer,0);
    assert.deepEqual(f.sprite,{x:2007.5,y:698.5,depth:718.5,texture:WALK_FRAME.textureKey,frame:'__BASE',animation:WALK_FRAME.animation,playing:false,paused:true,animationFrameIndex:5,scaleX:1,scaleY:1,originX:.5,originY:.5,rotation:0,flipX:false,flipY:false});
    assert(Object.values(f.camera).filter(v=>typeof v!=='object').every(finite));assert.equal(f.camera.matrix.length,6);assert(f.camera.matrix.every(finite));
    stable=previous&&visualCameraStable(previous.camera,f.camera)?stable+1:0;if(i<r.frames.length-1)assert(stable<3,'Stop recording at first stable pose');
  });assert.equal(stable,3);assert.equal(r.settledNativeFrame,r.frames.at(-1).nativeFrame);assert.equal(r.settledAt,r.frames.at(-1).at);
}
export function verifyWalkState(observation,driver,index,attachments){
  mode(driver);assert.equal(driver.kind,'controlled-walking-frame-driver');assert.equal(driver.index,index);assert.equal(driver.completed,true);assert(finite(driver.elapsedMs)&&driver.elapsedMs>0&&driver.elapsedMs<=WALK_LIMITS.caseMs);
  const primary=observation.state,cleanup=observation.afterCleanup,c=driver.controller;assert(primary&&cleanup&&c);mode(c);verifyWalkReceipt(c.receipt);
  for(const v of [c,primary.walkFrameEvidence,cleanup.walkFrameEvidence]){
    mode(v);assert.equal(v.animationSelection,'instance-only-production-selection-suppressed');assert.equal(v.enabled,true);assert.equal(v.bound,true);assert.equal(v.pending,false);assert.equal(v.complete,true);assert.equal(v.requests,1);assert.equal(v.captureCount,1);assert.equal(v.requested,false);assert.equal(v.captured,false);empty(v.errors);identical(v.receipt,c.receipt,'Complete controlled receipt must survive cleanup');
    assert(Number.isSafeInteger(v.selectedFrames)&&v.selectedFrames>=4&&v.selectedFrames<=128);assert(Number.isSafeInteger(v.suppressedSelections)&&v.suppressedSelections>0&&v.suppressedSelections<=128);assert(Number.isSafeInteger(v.lastRenderedNativeFrame)&&v.lastRenderedNativeFrame>=v.receipt.settledNativeFrame);
    assert.equal(v.history.length,1);identical(v.history,[driver.capture.metadata],'Complete capture history must survive every snapshot');
    assert.deepEqual(v.ownedWalls.map(w=>w.name),COURTYARD_NAMES);
  }
  for(const v of [c,primary.walkFrameEvidence]){assert.equal(v.closed,false);assert.equal(v.methodOwned,true);assert.equal(v.methodRestored,false);assert.equal(v.postRenderAttached,true);assert.equal(v.preRenderAttached,true);assert(v.ownedWalls.every(w=>!w.destroyed&&w.inWorld));}
  assert.equal(cleanup.walkFrameEvidence.closed,true);assert.equal(cleanup.walkFrameEvidence.methodOwned,false);assert.equal(cleanup.walkFrameEvidence.methodRestored,true);assert.equal(cleanup.walkFrameEvidence.postRenderAttached,false);assert.equal(cleanup.walkFrameEvidence.preRenderAttached,false);assert(cleanup.walkFrameEvidence.ownedWalls.every(w=>w.destroyed&&!w.inWorld));
  assert(primary.walkFrameEvidence.selectedFrames>=c.selectedFrames);assert(cleanup.walkFrameEvidence.selectedFrames>=primary.walkFrameEvidence.selectedFrames);
  for(const snapshot of [primary,cleanup]){
    assert.equal(snapshot.ready,true);assert.equal(snapshot.profile,'readiness');assert.equal(snapshot.courtyardEvidence,null);assert.equal(snapshot.plazaMotionOverflow,false);empty(snapshot.blocked);empty(snapshot.rewardMutations);empty(snapshot.navigations);
    assert(Array.isArray(snapshot.api)&&snapshot.api.every(a=>a.path==='/api/leaderboard/arpg/alltime'&&a.method==='GET'));
    assert.equal(snapshot.scenes.length,1);const scene=snapshot.scenes[0];assert.equal(scene.id,c.receipt.sceneId);assert.equal(scene.pageId,1);assert.equal(scene.loadComplete,true);assert.equal(scene.totalFailed,0);empty(scene.loadErrors);empty(scene.missingKeys);assert.equal(scene.queuedKeys.length,257);assert.equal(new Set(scene.queuedKeys).size,257);assert.deepEqual([...scene.decodedKeys].sort(),[...scene.queuedKeys].sort());for(const key of [WALK_FRAME.textureKey,'town_cobble_material_v1','town_corner_shop_v1','town_corner_lantern_v1','town_ruins_entrance_v1',...PLAZA_KEYS])assert(scene.queuedKeys.includes(key));
    assert(finite(scene.preloadAt)&&finite(scene.createAt)&&scene.createAt>=scene.preloadAt&&scene.framesAfterCreate>0);
    assert(Array.isArray(snapshot.plazaMotion)&&snapshot.plazaMotion.length>0&&snapshot.plazaMotion.length<=12000);
    const byAt=new Map();for(const[i,m]of snapshot.plazaMotion.entries()){
      assert(finite(m.at)&&(!i||m.at>snapshot.plazaMotion[i-1].at));assert.equal(m.area,0);assert.deepEqual(m.intent,{x:0,y:0});assert.equal(m.dash?.timer,0);assert.equal(m.courtyardFrame,undefined,'Old motion contract stays untouched in this new mode');
      assert.deepEqual([m.x,m.y],m.at<c.receipt.assignedAt?[1472,536]:[WALK_POSE.x,WALK_POSE.y]);assert(!byAt.has(m.at));byAt.set(m.at,m);
    }
    for(const f of c.receipt.frames){const m=byAt.get(f.observerAt);assert(m&&m.x===f.transform.x&&m.y===f.transform.y,'Every selected-frame receipt links to its exact existing observer sample');}
    const m=byAt.get(driver.capture.metadata.at);assert(m&&m.x===WALK_POSE.x&&m.y===WALK_POSE.y,'Same-frame capture sample must survive cleanup');
  }
  assert.equal(primary.scenes[0].destroyed,false);assert.equal(cleanup.scenes[0].destroyed,true);assert.equal(cleanup.authCallbacks,0);assert.equal(cleanup.canvasCount,0);empty(cleanup.mountedPages);identical(cleanup.api,primary.api,'Cleanup cannot add external calls');identical(cleanup.plazaMotion.slice(0,primary.plazaMotion.length),primary.plazaMotion,'Cleanup retains complete motion prefix');
  const m=driver.capture.metadata;identical(m.poseReceipt,c.receipt,'Captured assignment is exact settled receipt');assert.equal(m.gameplay.plazaProbe.respondedAt,m.at);assert(m.gameplay.plazaProbe.requestedAt>c.receipt.settledAt&&m.at>m.gameplay.plazaProbe.requestedAt);assert(visualCameraStable(c.receipt.frames.at(-1).camera,m.gameplay.viewportGeometry.camera));
  const pngs=attachments.filter(a=>a.contentType==='image/png');assert.equal(pngs.length,1);const image=pngs[0];assert.equal(image.name,walkScreenshot(index));assert.equal(typeof image.body,'string');const bytes=Buffer.from(image.body,'base64');assert.equal(createHash('sha256').update(bytes).digest('hex'),driver.capture.pngSHA256);
  identical(driver.capture.raster,verifyWalkCapturedPNG(m,image.body,index),'Raster record must come from the exact full PNG and same-frame metadata');
}
export function verifyWalkFrame(report,requestedMode){
  assert(['discovery','execution'].includes(requestedMode));const execution=requestedMode==='execution';empty(report.errors);assert.equal(report.config.version,'1.57.0');assert.equal(report.config.forbidOnly,true);assert.equal(report.config.workers,1);assert.equal(report.config.shard,null);assert.equal(report.config.projects.length,1);const project=report.config.projects[0];assert.equal(project.id,PROJECT);assert.equal(project.name,PROJECT);assert.equal(project.repeatEach,1);assert.equal(project.retries,0);assert.deepEqual(project.testMatch,[FILE]);
  assert.equal(report.suites.length,1);const suite=report.suites[0];assert.equal(suite.file,FILE);assert.equal(suite.title,FILE);empty(suite.suites??[]);assert.equal(suite.specs.length,2);const ids=new Set();
  suite.specs.forEach((spec,index)=>{assert.equal(spec.title,WALK_TITLES[index]);assert.equal(spec.file,FILE);assert.equal(spec.ok,true);assert(typeof spec.id==='string'&&spec.id&&!ids.has(spec.id));ids.add(spec.id);assert.equal(spec.tests.length,1);const test=spec.tests[0];assert.equal(test.projectId,PROJECT);assert.equal(test.projectName,PROJECT);assert.equal(test.expectedStatus,'passed');empty(test.annotations);assert.equal(test.status,execution?'expected':'skipped');assert.equal(test.results.length,execution?1:0);if(!execution)return;
    const result=test.results[0];assert.equal(result.status,'passed');assert.equal(result.retry,0);assert.equal(result.error,undefined);empty(result.errors);empty(result.annotations);assert(Number.isInteger(result.workerIndex)&&result.workerIndex>=0);assert(finite(Date.parse(result.startTime))&&finite(result.duration)&&result.duration>0&&result.duration<=180000);
    const json=name=>{const items=result.attachments.filter(a=>a.name===name);assert.equal(items.length,1);assert.equal(items[0].contentType,'application/json');assert.equal(typeof items[0].body,'string');assert(items[0].body.length<=16000000,'Bounded complete JSON attachment required');return JSON.parse(Buffer.from(items[0].body,'base64').toString('utf8'));};
    const observation=json('arpg-real-engine-observations');assert.equal(observation.browserVersion,'143.0.7499.4');for(const k of ['blocked','errors','consoleErrors','unexpectedConsoleErrors','cleanupErrors'])empty(observation[k]);
    assert.equal(result.attachments.length,3,'Exactly observation, driver and one PNG per case');verifyWalkState(observation,json('courtyard-controlled-walking-frame-driver'),index,result.attachments);
  });
  assert.equal(report.stats.expected,execution?2:0);assert.equal(report.stats.skipped,execution?0:2);assert.equal(report.stats.unexpected,0);assert.equal(report.stats.flaky,0);
  return execution?'Verified2 controlled S4 body-edge cases and2 same-frame PNG regions. Analytic source contribution plus recorded raster values; composited transmission and broad readability are NOT measured. Native movement/old acceptance remains separate.':'Verified discovery of2 controlled walking-frame cases; ZERO execution.';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const[mode,file,...extra]=process.argv.slice(2);assert(file&&!extra.length,'Usage: node walk-frame-verifier.mjs discovery|execution report.json');console.log(verifyWalkFrame(JSON.parse(readFileSync(file,'utf8')),mode));}
