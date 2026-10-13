// Fabricated report/schema checks only; never emit these as browser evidence.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {verifyCourtyardState} from './verify-courtyard.mjs';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {crc32} from './courtyard-png.mjs';
import {readCourtyardFills} from './courtyard-visibility.mjs';
import {verifyCourtyardResults} from './verify-courtyard-results.mjs';
import {serializeNativeObservation,decodeNativeObservation} from './courtyard-observation-wire.mjs';
import {fabricateNativeCourtyard,reconcileFabricatedCopies} from './courtyard-native-schema.mjs';
import {COURTYARD_ACTIONS,COURTYARD_TITLES,COURTYARD_VIEWS,courtyardScreenshot} from './courtyard-contract.mjs';
const FILE='courtyard.browser.spec.ts',PROJECT='chromium-arpg-courtyard';
function chunk(name,b){const n=Buffer.alloc(4),c=Buffer.alloc(4),v=Buffer.concat([Buffer.from(name),b]);n.writeUInt32BE(b.length);c.writeUInt32BE(crc32(v));return Buffer.concat([n,v,c]);}
const header=Buffer.alloc(13);header.writeUInt32BE(358);header.writeUInt32BE(500,4);header[8]=8;header[9]=6;
const raw=Buffer.alloc(500*(358*4+1));for(let y=0;y<500;y++)for(let x=0;x<358;x++){const i=y*(358*4+1)+1+x*4;raw[i]=x%256;raw[i+1]=y%256;raw[i+2]=(x+y)%256;raw[i+3]=255;}
const image=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
const json=(name,value)=>({name,contentType:'application/json',body:Buffer.from(JSON.stringify(value)).toString('base64')});
function executionCase(index){
 const f=fabricateNativeCourtyard(index),s=f.observation.state;
 const viewport={css:{x:8,y:100,width:358,height:500},backing:{width:358,height:500},logical:{width:358,height:500}};
 for(const p of s.checkpoints){const g=p.scene.gameplay;if(g.area)continue;
  const hero={objectId:9000,depth:g.y+20,alpha:1,name:'hero-idle',worldMatrix:[1,0,0,1,g.x,g.y]};
  const walls=g.townArt.ground.courtyard.map(o=>({...structuredClone(o),worldMatrix:[1,0,0,1,0,0],intersectedSamples:0,contributingSamples:0,fills:readCourtyardFills(o.commands,o.name).map(f=>({...f,intersectedSamples:0,contributingSamples:0}))}));
  const order=[...walls,hero].sort((a,b)=>a.depth-b.depth);order.forEach((o,i)=>{o.worldIndex=i;o.painterIndex=i;});walls.forEach(w=>w.aboveHero=w.painterIndex>hero.painterIndex);
  g.courtyardVisibility={method:'analytic-source-transmission',nativePixels:false,valid:true,issues:[],alphaThreshold:128,sampleStep:3,samples:100,readable:100,meanTransmission:1,occluders:[],hero,walls,images:[],excludedText:[],viewport:structuredClone(viewport),camera:{...g.viewportGeometry.camera,alpha:1},painterOrder:order.map(o=>({objectId:o.objectId,name:o.name,depth:o.depth,worldIndex:o.worldIndex,painterIndex:o.painterIndex}))};
 }
 s.scenes[0].gameplay=structuredClone(s.checkpoints.at(-1).scene.gameplay);f.observation.afterCleanup.scenes[0].gameplay=structuredClone(s.scenes[0].gameplay);reconcileFabricatedCopies(f);
 const history=COURTYARD_VIEWS.map(view=>{const a=COURTYARD_ACTIONS.find(a=>a.view===view),g=s.checkpoints.find(p=>p.label===a.label).scene.gameplay;return {evidenceMode:'native-courtyard',nativeMovementEvidence:true,poseReceipt:null,nativeFrame:g.courtyardFrame.frame,heroFrame:structuredClone(g.courtyardFrame.hero),label:courtyardScreenshot(index,view),probeId:g.plazaProbe.id,at:g.at,capturedAt:g.at+.25,consumedAt:g.at+.5,viewport:index?{width:390,height:844}:{width:1280,height:900},documentWidth:index?390:1280,...structuredClone(viewport),base64Chars:image.length,gameplay:structuredClone(g)};});
 f.driver.captures=history.map(m=>({label:m.label,probeId:m.probeId,nativeFrame:m.nativeFrame,pngSHA256:createHash('sha256').update(Buffer.from(image,'base64')).digest('hex')}));
 f.observation.browserVersion='143.0.7499.4';
 return [json('arpg-real-engine-observations',f.observation),json('courtyard-native-driver',f.driver),json('courtyard-native-captures',{evidenceMode:'native-courtyard',nativeMovementEvidence:true,requests:45,captureCount:18,pending:false,requested:false,history}),...history.map(m=>({name:m.label,contentType:'image/png',body:image}))];
}
function report(execute=false){return {errors:[],config:{version:'1.57.0',forbidOnly:true,workers:1,shard:null,projects:[{name:PROJECT,id:PROJECT,repeatEach:1,retries:0,testMatch:[FILE]}]},suites:[{file:FILE,title:FILE,suites:[],specs:COURTYARD_TITLES.map((title,i)=>({title,id:`fabricated-${i}`,file:FILE,ok:true,tests:[{projectId:PROJECT,projectName:PROJECT,expectedStatus:'passed',annotations:[],status:execute?'expected':'skipped',results:execute?[{status:'passed',retry:0,errors:[],annotations:[],workerIndex:0,startTime:'2026-10-11T00:00:00Z',duration:100000,attachments:executionCase(i)}]:[]}]}))}],stats:{expected:execute?2:0,skipped:execute?0:2,unexpected:0,flaky:0}};}
test('fabricated discovery verifies exactly two cases and explicitly zero execution',()=>assert.match(verifyCourtyardResults(report(),'discovery').status,/ZERO executed/));
test('fabricated complete native report composes strict state, same-frame PNG and vector contracts',()=>{const r=verifyCourtyardResults(report(true),'execution');assert.equal(r.results.length,2);assert.equal(r.originalAcceptanceIncluded,false);assert.equal(r.results.flatMap(r=>r.images).length,36);assert(r.results.every(r=>r.images.filter(i=>i.witnessRegions.length).length===2));});
for(const[name,change]of Object.entries({unknownMode:r=>{},wrongVersion:r=>r.config.version='x',workers:r=>r.config.workers=2,retry:r=>r.config.projects[0].retries=1,missingCase:r=>r.suites[0].specs.pop(),duplicateTitle:r=>r.suites[0].specs[1].title=r.suites[0].specs[0].title,skippedStats:r=>r.stats.skipped=0,extraProject:r=>r.config.projects.push(r.config.projects[0]),expectedFailure:r=>r.suites[0].specs[0].tests[0].expectedStatus='failed'}))test(`discovery rejects ${name}`,()=>{const r=report();change(r);assert.throws(()=>verifyCourtyardResults(r,name==='unknownMode'?'unknown':'discovery'));});
for(const[name,change]of Object.entries({failure:r=>r.suites[0].specs[0].tests[0].results[0].status='failed',retry:r=>r.suites[0].specs[0].tests[0].results[0].retry=1,missingPNG:r=>r.suites[0].specs[0].tests[0].results[0].attachments.pop(),extraPNG:r=>r.suites[0].specs[0].tests[0].results[0].attachments.push({name:'unplanned',contentType:'image/png',body:image}),nativeBudget:r=>r.suites[0].specs[0].tests[0].results[0].duration=600001}))test(`execution report rejects ${name}`,()=>{const r=report(true);change(r);assert.throws(()=>verifyCourtyardResults(r,'execution'));});

// Complete equality is preserved; only unbounded assertion-diff formatting is
// avoided at the three large snapshot comparisons. No input is truncated.
for(const [file,hash,replacements]of [
 ['verify-courtyard.mjs','1a9394fe3d20b6932bf8e2063bd02bdb9b2e49eafbd0049013aeec7977b43ff5',[
  ["assert(isDeepStrictEqual(c.checkpoints,s.checkpoints),'Cleanup must retain every complete checkpoint')",'assert.deepEqual(c.checkpoints,s.checkpoints)'],
  ["assert(isDeepStrictEqual(c.visuals,s.visuals),'Cleanup must retain every complete visual snapshot')",'assert.deepEqual(c.visuals,s.visuals)']]],
 ['visual-verifier.mjs','e0e3d92ffbdab63139d209c07fd6e97659a2906417f816cef8faeee24b24539b',[
  ["assert(isDeepStrictEqual(history.history, driver.captures.map(capture => capture.metadata)), 'Capture history must retain every complete metadata snapshot')",'assert.deepEqual(history.history, driver.captures.map(capture => capture.metadata))']]]
])test(`only bounded diagnostic formatting changes the existing ${file} equality guards`,()=>{
 let source=readFileSync(new URL(file,import.meta.url),'utf8');
 source=source.replace("import { isDeepStrictEqual } from 'node:util';\n",'');
 for(const [updated,original]of replacements){assert.equal(source.split(updated).length,2);source=source.replace(updated,original);}
 assert.equal(createHash('sha256').update(source).digest('hex'),hash);
});
test('bounded boolean assertion preserves strict deep-equality defaults across positive and negative structures',()=>{
 const cycle={};cycle.self=cycle;const otherCycle={};otherCycle.self=otherCycle;
 const values=[null,undefined,0,-0,NaN,1,'1',false,[],[undefined],Array(1),{},Object.create(null),{x:1},{x:undefined},
  new Date(0),new Set([1]),new Map([['x',1]]),new Uint8Array([1]),cycle,otherCycle];
 let pairs=0;
 for(const a of values)for(const b of values){let original=true,bounded=true;
  try{assert.deepEqual(a,b);}catch(error){assert.equal(error.code,'ERR_ASSERTION');original=false;}
  try{assert(isDeepStrictEqual(a,b),'Complete snapshots differ');}catch(error){assert.equal(error.code,'ERR_ASSERTION');assert.equal(error.message,'Complete snapshots differ');bounded=false;}
  assert.equal(bounded,original);pairs++;
 }assert.equal(pairs,441);
});
for(const [key,message]of [['checkpoints','Cleanup must retain every complete checkpoint'],['visuals','Cleanup must retain every complete visual snapshot']])
 test(`full ${key} equality rejects a last-command mismatch with a bounded diagnostic`,()=>{
  const f=fabricateNativeCourtyard(0),snapshot=f.observation.afterCleanup[key].at(-1).scene.gameplay;
  snapshot.townArt.ground.courtyard.at(-1).commands[snapshot.townArt.ground.courtyard.at(-1).commands.length-2]+=.001;
  assert.throws(()=>verifyCourtyardState(f.observation,f.driver,0),error=>error.code==='ERR_ASSERTION'&&error.message===message);
 });

// Transport-only replay of the same fabricated complete report.
test('fabricated shared native report reconstructs exact objects before unchanged state and PNG checks',()=>{
 const r=report(true);
 for(const[index,spec]of r.suites[0].specs.entries()){
  const attachments=spec.tests[0].results[0].attachments, a=attachments.find(a=>a.name==='arpg-real-engine-observations');
  const original=JSON.parse(Buffer.from(a.body,'base64').toString('utf8')),other=structuredClone(attachments.filter(v=>v!==a));
  a.body=Buffer.from(serializeNativeObservation(original,index)).toString('base64');
  assert.deepEqual(decodeNativeObservation(a.body,index),original);
  assert.deepEqual(attachments.filter(v=>v!==a),other);
 }
 const result=verifyCourtyardResults(r,'execution');assert.equal(result.results.length,2);assert.equal(result.results.flatMap(r=>r.images).length,36);
});
for(const key of ['checkpoints','visuals'])test(`shared transport retains cleanup-only ${key} corruption for the original semantic equality guard`,()=>{
 const f=fabricateNativeCourtyard(0);f.observation.afterCleanup[key].at(-1).scene.gameplay.townArt.ground.courtyard.at(-1).commands[1]+=.25;
 const original=f.observation,wire=serializeNativeObservation(original,0),encoded=JSON.parse(wire);
 assert(!encoded.cleanupReferences.includes(key));
 const restored=decodeNativeObservation(Buffer.from(wire).toString('base64'),0);assert.deepEqual(restored,original);
 assert.throws(()=>verifyCourtyardState(restored,f.driver,0),/Cleanup must retain every complete/);
});
