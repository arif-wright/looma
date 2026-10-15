// Deliberately fabricated schema data only. These tests produce no hosted
// observations, screenshots, performance result, or browser-acceptance claim.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {distribution,validateRun,summarizeComparison,fromPlaywrightReport} from './prompt-timing-report.mjs';
import {RUNS,CHECKPOINTS,DIAGNOSTIC_KIND,isNavigationGuardRejection} from './prompt-timing-plan.mjs';
function runData(run){
  const before={x:1472,y:536,intent:{x:0,y:0},viewport:{entrancePrompt:{visible:true}}};
  let sequence=0,previous=0;
  const frame=(at,stage)=>{const f={sequence:++sequence,sceneId:1,stage,at,intervalMs:at-previous,sceneUpdateCalls:1,sceneUpdateMs:1,promptCalls:1,promptExecutedCalls:run.mode==='candidate'?1:0,promptMs:run.mode==='candidate'?.02:.001,renderPhaseMs:2,stateValid:true,x:1472,y:536,intentX:0,intentY:0,area:0,mainCameraFollowupdateListenerCount:1,documentHidden:false,engineDelta:at-previous};previous=at;return f;};
  const frames=[...Array.from({length:120},(_,i)=>frame((i+1)*10,'warmup')),...[1400,2000,4000,6000,8000,10000,11200].map(at=>frame(at,'neutral')),...[12100,12500,13000,13500,14000,14500,15000].map(at=>frame(at,'motion'))];
  const keyEvents=[{at:12100,eventTimeStamp:12100,type:'keydown',code:'KeyD',repeat:false,isTrusted:true},{at:12200,eventTimeStamp:12200,type:'keyup',code:'KeyD',repeat:false,isTrusted:true}];
  return {kind:DIAGNOSTIC_KIND,acceptance:false,run:structuredClone(run),outcome:'completed',failure:null,droppedInputCalls:0,
    neutral:{startAt:1300,endAt:11300,before,after:structuredClone(before)},
    inputCalls:[{sequence:0,method:'press',key:'d',hostStart:20000,hostEnd:20100,requestedDelay:100,error:null}],
    clockSync:{before:{hostBefore:10000,browserNow:1300,hostAfter:10002},after:{hostBefore:24000,browserNow:15300,hostAfter:24002}},
    timing:{kind:DIAGNOSTIC_KIND,version:1,mode:run.mode,runId:run.id,counterfactual:run.mode==='bypass',overflow:{frames:false,keyEvents:false,stageEvents:false,scenes:false},counts:{invalidSamples:0,maxActiveScenes:1,framesStored:frames.length},scenes:[{sceneId:1}],mainCameraFollowupdateListenerCount:1,frames,keyEvents,environment:{phaserVersion:'mock'}},
    state:{plazaMotionOverflow:false,profile:'readiness',blocked:[],rewardMutations:[],api:[],checkpoints:CHECKPOINTS.map((label,i)=>({label,at:12000+i*200}))},
    cleanup:{state:{plazaMotionOverflow:false,canvasCount:0,authCallbacks:0},timing:{counts:{activeScenes:0},mainCameraFollowupdateListenerCount:0,scenes:[{active:false,stoppedAt:15500}]}}
  };
}
const comparison=()=>({kind:DIAGNOSTIC_KIND,acceptance:false,ordering:structuredClone(RUNS),results:RUNS.map(runData)});
test('six-run schema keeps warmed ABBA and descriptive long-tail output',()=>{const s=summarizeComparison(comparison());assert.equal(s.acceptance,false);assert.equal(s.measured.length,4);assert.equal(s.measured[0].neutral.intervalMs.count,6);assert.equal(s.sharedLastCheckpoint,'endcap-front-ready');assert(s.interpretation.includes('No causal'));assert('p99'in s.measured[0].neutral.intervalMs);});
test('distribution exposes max and tail rather than only an average',()=>{assert.deepEqual(distribution([1,1,1,100]).max,100);assert.equal(distribution([1,1,1,100]).p99,100);assert.equal(distribution([]).count,0);});
test('guard-rejected run remains incomplete and matched prefix excludes its unequal tail',()=>{const c=comparison();c.results[2].outcome='navigation_guard_rejected';c.results[2].failure='No independently safe native chord envelope near 1700,432';c.results[2].state.checkpoints=c.results[2].state.checkpoints.slice(0,2);const s=summarizeComparison(c);assert.equal(s.sharedLastCheckpoint,'rear-front-ready');assert.equal(s.measured[0].incompleteRoute,true);assert.equal(s.measured[0].unmatchedTail.comparable,false);assert.equal(s.measured[0].sharedRoutePrefix.count,0);});
for(const [name,mutate]of Object.entries({
  'acceptance claim':r=>r.acceptance=true,
  'buffer overflow':r=>r.timing.overflow.frames=true,
  'published fixture motion overflow':r=>r.state.plazaMotionOverflow=true,
  'published fixture cleanup motion overflow':r=>r.cleanup.state.plazaMotionOverflow=true,
  'missing candidate execution':r=>r.timing.frames.at(-1).promptExecutedCalls=0,
  'unrecorded samples':r=>r.timing.counts.invalidSamples=1,
  'hidden document':r=>r.timing.frames.at(-1).documentHidden=true,
  'neutral camera changed':r=>r.neutral.after.viewport.extra=true,
  'neutral input':r=>r.timing.keyEvents[0].at=2000,
  'synthetic receipt':r=>r.timing.keyEvents[0].isTrusted=false,
  'leaked canvas':r=>r.cleanup.state.canvasCount=1,
  'leaked listener':r=>r.cleanup.timing.mainCameraFollowupdateListenerCount=1,
  'real session start':r=>r.state.api.push({path:'/api/games/session/start'}),
  'reward activity':r=>r.state.rewardMutations.push({}),
  'altered route labels':r=>r.state.checkpoints[0].label='teleported',
  'short neutral window':r=>r.neutral.endAt=2000,
  'input log overflow':r=>r.droppedInputCalls=1,
  'unknown swallowed error':r=>{r.outcome='navigation_guard_rejected';r.failure='some arbitrary error';}
}))test(`reject ${name}`,()=>{const r=runData(RUNS[2]);mutate(r);assert.throws(()=>validateRun(r,RUNS[2]));});
test('bypass cannot claim it executed the unchanged callback',()=>{const r=runData(RUNS[3]);r.timing.frames.at(-1).promptExecutedCalls=1;assert.throws(()=>validateRun(r,RUNS[3]));});
test('only explicit original driver guard messages are classified as route incompleteness',()=>{assert(isNavigationGuardRejection('Unmodeled native fine-step quantum: 24.5674'));assert(isNavigationGuardRejection('No independently safe native chord envelope near 1700,432'));assert(!isNavigationGuardRejection('Timeout waiting for real input'));});
test('first-attempt dedicated report extracts inline comparison only',()=>{const payload=comparison();const report={suites:[{specs:[{title:'ARPG prompt timing: diagnostic only, never acceptance',tests:[{results:[{status:'passed',retry:0,attachments:[{name:'prompt-timing-comparison',body:Buffer.from(JSON.stringify(payload)).toString('base64')}]}]}]}]}],stats:{expected:1,unexpected:0,flaky:0,skipped:0}};assert.equal(fromPlaywrightReport(report).measured.length,4);report.suites[0].specs[0].tests[0].results[0].retry=1;assert.throws(()=>fromPlaywrightReport(report));});

test('multiplicity remains visible as an anomaly rather than discarding evidence',()=>{const c=comparison(),r=c.results[2];r.timing.mainCameraFollowupdateListenerCount=2;const f=r.timing.frames.find(f=>f.stage==='neutral'&&f.at===4000);f.promptCalls=f.promptExecutedCalls=f.mainCameraFollowupdateListenerCount=2;const s=summarizeComparison(c);assert.equal(s.measured[0].listenerCountAtSnapshot,2);assert.equal(s.measured[0].neutral.multiplicityAnomalies.length,1);assert(s.measured[0].keyboard.scope.includes('unmatched tail'));});
