// Fabricated report/schema checks only; never emit these as browser evidence.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {crc32} from './courtyard-png.mjs';
import {readCourtyardFills} from './courtyard-visibility.mjs';
import {verifyCourtyardResults} from './verify-courtyard-results.mjs';
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
  const walls=g.townArt.ground.courtyard.map(o=>({...structuredClone(o),worldMatrix:[1,0,0,1,0,0],intersectedSamples:0,contributingSamples:0,fills:readCourtyardFills(o.commands).map(f=>({...f,intersectedSamples:0,contributingSamples:0}))}));
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
