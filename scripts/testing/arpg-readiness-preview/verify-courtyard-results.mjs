import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COURTYARD_TITLES, COURTYARD_VIEWS, COURTYARD_ACTIONS, courtyardScreenshot } from './courtyard-contract.mjs';
import { decodeNativeObservation } from './courtyard-observation-wire.mjs';
import { verifyCourtyardState } from './verify-courtyard.mjs';
import { verifyCapturedPNG } from './courtyard-capture-contract.mjs';
const FILE='courtyard.browser.spec.ts',PROJECT='chromium-arpg-courtyard',empty=v=>assert.deepEqual(v,[]);
export function verifyCourtyardResults(report,mode){
  assert(['discovery','execution'].includes(mode));const execute=mode==='execution';
  empty(report.errors);assert.equal(report.config.version,'1.57.0');assert.equal(report.config.forbidOnly,true);assert.equal(report.config.workers,1);assert.equal(report.config.shard,null);assert.equal(report.config.projects.length,1);
  const project=report.config.projects[0];assert.equal(project.name,PROJECT);assert.equal(project.id,PROJECT);assert.equal(project.repeatEach,1);assert.equal(project.retries,0);assert.deepEqual(project.testMatch,[FILE]);
  assert.equal(report.suites.length,1);const file=report.suites[0];assert.equal(file.file,FILE);assert.equal(file.title,FILE);empty(file.suites??[]);assert.equal(file.specs.length,2);
  const ids=new Set(),titles=new Set(),results=[];
  for(const spec of file.specs){
    const index=COURTYARD_TITLES.indexOf(spec.title);assert(index>=0&&!titles.has(spec.title));titles.add(spec.title);assert(typeof spec.id==='string'&&spec.id&&!ids.has(spec.id));ids.add(spec.id);
    assert.equal(spec.file,FILE);assert.equal(spec.ok,true);assert.equal(spec.tests.length,1);const test=spec.tests[0];assert.equal(test.projectId,PROJECT);assert.equal(test.projectName,PROJECT);assert.equal(test.expectedStatus,'passed');empty(test.annotations);assert.equal(test.results.length,execute?1:0);assert.equal(test.status,execute?'expected':'skipped');
    if(!execute)continue;const result=test.results[0];assert.equal(result.status,'passed');assert.equal(result.retry,0);assert.equal(result.error,undefined);empty(result.errors);empty(result.annotations);assert(Number.isSafeInteger(result.workerIndex)&&result.workerIndex>=0);assert(Number.isFinite(Date.parse(result.startTime)));assert(result.duration>0&&result.duration<=600000);
    const names=['arpg-real-engine-observations','courtyard-native-driver','courtyard-native-captures',...COURTYARD_VIEWS.map(v=>courtyardScreenshot(index,v))];
    assert.deepEqual(result.attachments.map(a=>a.name).sort(),names.sort(),'Exact bounded native evidence attachments');
    const attachment=name=>{const a=result.attachments.filter(a=>a.name===name);assert.equal(a.length,1);assert.equal(typeof a[0].body,'string');return a[0];};
    const json=name=>{const a=attachment(name);assert.equal(a.contentType,'application/json');assert(a.body.length<30000000);return name==='arpg-real-engine-observations'?decodeNativeObservation(a.body,index):JSON.parse(Buffer.from(a.body,'base64').toString('utf8'));};
    const observation=json('arpg-real-engine-observations');assert.equal(observation.browserVersion,'143.0.7499.4');for(const key of['blocked','errors','consoleErrors','unexpectedConsoleErrors','cleanupErrors'])empty(observation[key]);
    const driver=json('courtyard-native-driver'),captures=json('courtyard-native-captures');verifyCourtyardState(observation,driver,index);
    assert.equal(captures.evidenceMode,'native-courtyard');assert.equal(captures.nativeMovementEvidence,true);assert.equal(captures.requests,COURTYARD_ACTIONS.length);assert.equal(captures.captureCount,18);assert.equal(captures.pending,false);assert.equal(captures.requested,false);assert.equal(captures.history.length,18);
    assert.equal(driver.captures.length,18);const images=[];
    for(const[i,view]of COURTYARD_VIEWS.entries()){
      const label=courtyardScreenshot(index,view),a=attachment(label);assert.equal(a.contentType,'image/png');
      const action=COURTYARD_ACTIONS.find(a=>a.view===view),g=observation.state.checkpoints.find(p=>p.label===action.label).scene.gameplay;
      assert.deepEqual(driver.captures[i],{label,probeId:captures.history[i].probeId,nativeFrame:captures.history[i].nativeFrame,pngSHA256:createHash('sha256').update(Buffer.from(a.body,'base64')).digest('hex')});
      images.push(verifyCapturedPNG(captures.history[i],a.body,{label,gameplay:g,index}));
    }
    results.push({title:spec.title,evidenceMode:'native-courtyard',nativeMovementEvidence:true,images,
      sourceVisibility:observation.state.checkpoints.filter(p=>p.scene.gameplay.area===0).map(p=>({label:p.label,samples:p.scene.gameplay.courtyardVisibility.samples,readable:p.scene.gameplay.courtyardVisibility.readable,meanTransmission:p.scene.gameplay.courtyardVisibility.meanTransmission,
        wallContributions:p.scene.gameplay.courtyardVisibility.walls.map(w=>({name:w.name,intersectedSamples:w.intersectedSamples,contributingSamples:w.contributingSamples})),
        heroThroughWallExercised:p.scene.gameplay.courtyardVisibility.walls.some(w=>w.contributingSamples>0)}))});
  }
  assert.equal(report.stats.expected,execute?2:0);assert.equal(report.stats.skipped,execute?0:2);assert.equal(report.stats.unexpected,0);assert.equal(report.stats.flaky,0);
  return {status:execute?'Two native wall cases verified; manual pixel review remains required':'Two native wall cases discovered; ZERO executed',originalAcceptanceIncluded:false,results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const[mode,path,...extra]=process.argv.slice(2);assert(path&&!extra.length,'Usage: node verify-courtyard-results.mjs discovery|execution report.json');console.log(JSON.stringify(verifyCourtyardResults(JSON.parse(readFileSync(path,'utf8')),mode),null,2));}
