import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DIAGNOSTIC_KIND,RUNS,WARMUP_FRAMES,NEUTRAL_WINDOW_MS,MAX_INPUT_CALLS,CHECKPOINTS,isNavigationGuardRejection } from './prompt-timing-plan.mjs';
const finite=(v)=>typeof v==='number'&&Number.isFinite(v);
const count=v=>Number.isSafeInteger(v)&&v>=0;
export function distribution(values){
  const sorted=values.filter(finite).sort((a,b)=>a-b),n=sorted.length;
  if(!n)return{count:0,min:null,median:null,p90:null,p95:null,p99:null,max:null,mean:null,total:0};
  const q=p=>sorted[Math.ceil(p*n)-1];const total=sorted.reduce((a,b)=>a+b,0);
  return{count:n,min:sorted[0],median:q(.5),p90:q(.9),p95:q(.95),p99:q(.99),max:sorted.at(-1),mean:total/n,total};
}
const sample=(frames,stage,start=-Infinity,end=Infinity)=>frames.filter((f,i)=>i>0&&f.stage===stage&&frames[i-1].stage===stage&&frames[i-1].at>=start&&f.at<=end);
const frameSummary=frames=>({count:frames.length,intervalMs:distribution(frames.map(f=>f.intervalMs)),
  callbackBracketMs:distribution(frames.map(f=>f.promptMs)),sceneUpdateMs:distribution(frames.map(f=>f.sceneUpdateMs)),
  renderPhaseMs:distribution(frames.map(f=>f.renderPhaseMs)),engineDeltaMs:distribution(frames.map(f=>f.engineDelta)),
  promptCalls:frames.reduce((n,f)=>n+f.promptCalls,0),promptExecutedCalls:frames.reduce((n,f)=>n+f.promptExecutedCalls,0),
  callbackCallsPerFrame:distribution(frames.map(f=>f.promptCalls)),followListeners:distribution(frames.map(f=>f.mainCameraFollowupdateListenerCount)),
  multiplicityAnomalies:frames.filter(f=>f.promptCalls!==1||f.mainCameraFollowupdateListenerCount!==1).map(f=>({sequence:f.sequence,at:f.at,promptCalls:f.promptCalls,followListeners:f.mainCameraFollowupdateListenerCount}))});
export function validateRun(result,expected){
  assert.equal(result.kind,DIAGNOSTIC_KIND);assert.equal(result.acceptance,false);assert.deepEqual(result.run,expected);
  assert(['completed','navigation_guard_rejected'].includes(result.outcome));
  assert(result.outcome==='completed'?result.failure===null:isNavigationGuardRejection(result.failure));
  assert.equal(result.droppedInputCalls,0);assert(result.inputCalls.length<=MAX_INPUT_CALLS);
  const timing=result.timing;assert.equal(timing.kind,DIAGNOSTIC_KIND);assert.equal(timing.version,1);
  assert.equal(timing.mode,expected.mode);assert.equal(timing.runId,expected.id);assert.equal(timing.counterfactual,expected.mode==='bypass');
  assert(Object.values(timing.overflow).every(v=>v===false),'Timing buffer overflow invalidates the diagnostic');
  assert.equal(timing.counts.invalidSamples,0);assert.equal(timing.counts.maxActiveScenes,1);
  assert.equal(timing.scenes.length,1);assert(count(timing.mainCameraFollowupdateListenerCount));
  assert.equal(timing.frames.length,timing.counts.framesStored);assert(timing.frames.filter(frame=>frame.stage==='warmup').length>=WARMUP_FRAMES);
  const n=result.neutral;assert(finite(n.startAt)&&finite(n.endAt)&&n.endAt-n.startAt>=NEUTRAL_WINDOW_MS-5);
  assert.deepEqual(n.before,n.after,'Neutral geometry must stay unchanged');
  assert.equal(n.before.x,1472);assert.equal(n.before.y,536);assert.deepEqual(n.before.intent,{x:0,y:0});
  assert.equal(n.before.viewport.entrancePrompt.visible,true);
  let previous=-Infinity;
  for(const frame of timing.frames){
    assert(finite(frame.at)&&frame.at>=previous);previous=frame.at;
    for(const key of ['sceneUpdateCalls','sceneUpdateMs','promptCalls','promptExecutedCalls','promptMs'])assert(finite(frame[key])&&frame[key]>=0);
    if(!['neutral','motion'].includes(frame.stage))continue;
    assert.equal(frame.stateValid,true);assert.equal(frame.documentHidden,false);assert.equal(frame.area,0);
    assert(count(frame.mainCameraFollowupdateListenerCount));assert(count(frame.promptCalls));assert(count(frame.promptExecutedCalls));
    assert.equal(frame.promptExecutedCalls,expected.mode==='candidate'?frame.promptCalls:0);
    assert(finite(frame.intervalMs)&&frame.intervalMs>=0);assert(finite(frame.renderPhaseMs)&&frame.renderPhaseMs>=0);
    if(frame.stage==='neutral'){assert.equal(frame.x,1472);assert.equal(frame.y,536);assert.equal(frame.intentX,0);assert.equal(frame.intentY,0);}
  }
  assert(sample(timing.frames,'neutral',n.startAt,n.endAt).length>=2,'A stationary comparison needs actual frame samples');
  assert(!timing.keyEvents.some(k=>k.at>=n.startAt&&k.at<=n.endAt),'No keyboard input is allowed in the neutral window');
  assert(timing.keyEvents.length>0,'Native input receipt evidence is required');
  for(const key of timing.keyEvents){assert.equal(key.isTrusted,true);assert(finite(key.at)&&finite(key.eventTimeStamp));assert(['keydown','keyup'].includes(key.type));}
  result.inputCalls.forEach((call,i)=>{assert.equal(call.sequence,i);assert(finite(call.hostStart)&&finite(call.hostEnd)&&call.hostEnd>=call.hostStart);assert.equal(call.error,null);});
  for(const sync of Object.values(result.clockSync)){assert(finite(sync.hostBefore)&&finite(sync.hostAfter)&&finite(sync.browserNow)&&sync.hostAfter>=sync.hostBefore);}
  const labels=result.state.checkpoints.map(p=>p.label);assert(labels.length>0);assert.deepEqual(labels,CHECKPOINTS.slice(0,labels.length));
  if(result.outcome==='completed')assert.deepEqual(labels,CHECKPOINTS);
  assert.equal(result.state.plazaMotionOverflow,false);assert.equal(result.cleanup.state.plazaMotionOverflow,false);
  assert.equal(result.state.profile,'readiness');assert.deepEqual(result.state.blocked,[]);assert.deepEqual(result.state.rewardMutations,[]);
  assert(!result.state.api.some(call=>call.path==='/api/games/session/start'));
  assert.equal(result.cleanup.state.canvasCount,0);assert.equal(result.cleanup.state.authCallbacks,0);
  assert.equal(result.cleanup.timing.counts.activeScenes,0);assert.equal(result.cleanup.timing.mainCameraFollowupdateListenerCount,0);
  assert(result.cleanup.timing.scenes.every(scene=>!scene.active&&finite(scene.stoppedAt)));
  return result;
}
function receiptSummary(events){
  const held=new Map(),holds=[],phases=[];let previous=null;
  for(const event of events){
    if(previous&&event.at>=previous.at)phases.push(event.at-previous.at);
    if(event.type==='keydown'&&!event.repeat&&!held.has(event.code))held.set(event.code,event.at);
    if(event.type==='keyup'&&held.has(event.code)){holds.push(event.at-held.get(event.code));held.delete(event.code);}
    previous=event;
  }
  return{nativeKeyHoldMs:distribution(holds),betweenNativeKeyReceiptsMs:distribution(phases),unreleasedCodes:[...held.keys()]};
}
export function summarizeComparison(comparison){
  assert.equal(comparison.kind,DIAGNOSTIC_KIND);assert.equal(comparison.acceptance,false);assert.deepEqual(comparison.ordering,RUNS);
  assert.equal(comparison.results.length,RUNS.length);comparison.results.forEach((r,i)=>validateRun(r,RUNS[i]));
  const measured=comparison.results.filter(r=>r.run.role==='measured');
  for(const run of measured)assert.deepEqual(run.neutral.before,measured[0].neutral.before,'Measured neutral geometry must match across both modes');
  const labels=measured[0].state.checkpoints.map(p=>p.label);
  let common=[];
  for(let index=0;index<labels.length;index++){
    if(!measured.every(run=>run.state.checkpoints[index]?.label===labels[index]))break;
    common.push(labels[index]);
  }
  const last=common.at(-1)??null;
  return{kind:DIAGNOSTIC_KIND,acceptance:false,completeCollection:true,ordering:RUNS,
    interpretation:'Descriptive diagnostic only. Callback bracket includes timer overhead/preemption. Render span is main-thread wall time, not GPU time. Bypass also changes visibility/render work. No causal or acceptance conclusion is produced.',
    sharedCheckpointPrefix:common,sharedLastCheckpoint:last,
    clockInterpretation:'Host invocation/return and trusted browser key receipts have separate clocks. Each sync gives only a browser-minus-host offset interval [browserNow-hostAfter,browserNow-hostBefore], not exact wire-send or one-way latency.',
    measured:measured.map(run=>{
      const frames=run.timing.frames,home=run.state.checkpoints[0]?.at??run.neutral.endAt;
      const end=last?run.state.checkpoints.find(p=>p.label===last).at:home;
      return{run:run.run,outcome:run.outcome,incompleteRoute:run.outcome!=='completed',failure:run.failure,browserVersion:run.browserVersion,environment:run.timing.environment,
        listenerCountAtSnapshot:run.timing.mainCameraFollowupdateListenerCount,
        neutral:frameSummary(sample(frames,'neutral',run.neutral.startAt,run.neutral.endAt)),
        sharedRoutePrefix:frameSummary(sample(frames,'motion',home,end)),
        sharedPhases:common.slice(1).map((label,index)=>({from:common[index],to:label,...frameSummary(sample(frames,'motion',run.state.checkpoints[index].at,run.state.checkpoints[index+1].at))})),
        unmatchedTail:{comparable:false,...frameSummary(sample(frames,'motion',end,Infinity))},
        keyboard:{scope:'Whole route including unmatched tail; descriptive only, not a phase-aligned A/B comparison.',apiCallMs:distribution(run.inputCalls.map(c=>c.hostEnd-c.hostStart)),...receiptSummary(run.timing.keyEvents)},
        clockOffsetIntervals:Object.fromEntries(Object.entries(run.clockSync).map(([name,c])=>[name,[c.browserNow-c.hostAfter,c.browserNow-c.hostBefore]]))};
    })};
}
export function fromPlaywrightReport(report){
  const specs=[];const walk=s=>{specs.push(...(s.specs??[]));(s.suites??[]).forEach(walk);};(report.suites??[]).forEach(walk);
  assert.equal(specs.length,1);assert.equal(specs[0].title,'ARPG prompt timing: diagnostic only, never acceptance');
  const tests=specs[0].tests;assert.equal(tests.length,1);assert.equal(tests[0].results.length,1);
  const result=tests[0].results[0];assert.equal(result.status,'passed');assert.equal(result.retry,0);
  assert.equal(report.stats.expected,1);assert.equal(report.stats.unexpected,0);assert.equal(report.stats.flaky,0);assert.equal(report.stats.skipped,0);
  const attachments=result.attachments.filter(a=>a.name==='prompt-timing-comparison');assert.equal(attachments.length,1);
  assert.equal(typeof attachments[0].body,'string','Inline native JSON evidence required');
  return summarizeComparison(JSON.parse(Buffer.from(attachments[0].body,'base64').toString('utf8')));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  assert(process.argv[2],'Pass the separate diagnostic-results.json');
  console.log(JSON.stringify(fromPlaywrightReport(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));
}
