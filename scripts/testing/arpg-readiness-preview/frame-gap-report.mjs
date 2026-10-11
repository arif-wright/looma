import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {KIND,RUNS,EARLY_FRAMES,SETTLE_FRAMES,SETTLED_MS,FRAME_CAPACITY} from './frame-gap-plan.mjs';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function distribution(values){const a=values.filter(finite).sort((x,y)=>x-y),n=a.length;if(!n)return{count:0,min:null,median:null,p90:null,p95:null,p99:null,max:null,mean:null};const total=a.reduce((x,y)=>x+y,0),q=p=>a[Math.ceil(p*n)-1];return{count:n,min:a[0],median:q(.5),p90:q(.9),p95:q(.95),p99:q(.99),max:a.at(-1),mean:total/n};}
export function validateRun(run,expected){
  assert.equal(run.kind,KIND);assert.equal(run.acceptance,false);assert.deepEqual(run.run,expected);assert.equal(run.failure,null);assert.deepEqual(run.before,run.after);
  assert.equal(run.before.x,1472);assert.equal(run.before.y,536);assert.equal(run.before.area,0);assert.deepEqual(run.before.intent,{x:0,y:0});assert.equal(run.before.viewport.entrancePrompt.visible,true);
  const t=run.timing;assert.equal(t.kind,KIND);assert.equal(t.version,1);assert.equal(t.acceptance,false);assert.equal(t.mode,expected.mode);assert.equal(t.runId,expected.id);assert.equal(t.complete,true);assert.equal(t.overflow,false);assert.equal(t.invalid,0);
  assert.equal(t.capacity,FRAME_CAPACITY);assert.equal(t.count,t.frames.length);assert.equal(t.total,t.count);assert(t.count<=FRAME_CAPACITY);
  assert.equal(t.context.activeContexts,1);assert.equal(t.context.sceneCount,1);assert.equal(t.context.keyEvents,0);assert.equal(t.context.recordedPostCalls,t.count);assert(finite(t.context.createdAt)&&t.context.createdAt<=t.context.armedAt&&t.context.armedAt<=t.startedAt);
  assert.equal(t.environment.phaserVersion,'3.90.0');assert.deepEqual(t.environment.loop,{hasFpsLimit:false,fpsLimit:0,forceSetTimeOut:false,smoothStep:true,deltaSmoothingMax:10,panicMax:120,targetFps:60});
  let previous=null;
  for(const [index,f]of t.frames.entries()){
    assert.equal(f.sequence,index+1);assert(['early','settling','settled'].includes(f.phase));
    for(const key of ['start','end','hookEnd','engineTime','engineDelta','rawDelta','engineFrame','coolDown'])assert(finite(f[key]),key);
    assert(f.start<=f.end&&f.end<=f.hookEnd);assert(f.engineDelta>=0&&f.rawDelta>=0);assert(Number.isSafeInteger(f.engineFrame));
    if(previous){assert(f.start>=previous.hookEnd);assert.equal(f.engineFrame,previous.engineFrame+1);assert(f.engineTime>=previous.engineTime);}previous=f;
    assert.equal(f.stateValid,true);assert.equal(f.hidden,false);assert.equal(f.inFocus,true);assert.equal(f.x,1472);assert.equal(f.y,536);assert.equal(f.intentX,0);assert.equal(f.intentY,0);assert.equal(f.postCalls,1);
    if(expected.mode==='detailed'){assert.equal(f.preCalls,1);assert.equal(f.observerCalls,1);for(const key of ['preStart','preEnd','observerStart','observerEnd'])assert(finite(f[key]));assert(f.start<=f.preStart&&f.preStart<=f.preEnd&&f.preEnd<=f.observerStart&&f.observerStart<=f.observerEnd&&f.observerEnd<=f.end);}
    else{assert.equal(f.preCalls,0);assert.equal(f.observerCalls,0);for(const key of ['preStart','preEnd','observerStart','observerEnd'])assert.equal(f[key],null);}
  }
  const early=t.frames.filter(f=>f.phase==='early'),settling=t.frames.filter(f=>f.phase==='settling'),settled=t.frames.filter(f=>f.phase==='settled');
  assert.equal(early.length,EARLY_FRAMES);assert(settling.length>=SETTLE_FRAMES);assert(settled.length>=2);
  assert.deepEqual(t.frames.map(f=>f.phase),[...early,...settling,...settled].map(f=>f.phase));
  assert(settling.slice(-SETTLE_FRAMES).every(f=>f.coolDown===0));assert(settled.every(f=>f.coolDown===0));
  for(const [name,frames]of Object.entries({early,settling,settled})){assert.equal(t.windows[name].start,frames[0].start);assert.equal(t.windows[name].end,frames.at(-1).end);}
  assert(t.windows.settled.end-t.windows.settled.start>=SETTLED_MS);assert.equal(t.startedAt,t.windows.early.start);assert.equal(t.finishedAt,t.windows.settled.end);
  const s=run.state,c=run.cleanup;assert.equal(s.profile,'readiness');assert.equal(s.plazaMotionOverflow,false);assert.deepEqual(s.blocked,[]);assert.deepEqual(s.rewardMutations,[]);assert(!s.api.some(a=>a.path==='/api/games/session/start'));
  assert.equal(c.state.plazaMotionOverflow,false);assert.equal(c.state.authCallbacks,0);assert.equal(c.state.canvasCount,0);assert.equal(c.timing.context.activeContexts,0);assert(finite(c.timing.context.stoppedAt));
  return run;
}
function phaseSummary(frames,phase){const selected=frames.filter(f=>f.phase===phase),pairs=frames.slice(1).map((f,i)=>[frames[i],f]).filter(([p,f])=>p.phase===phase&&f.phase===phase);
  return{frames:selected.length,positiveCooldownFrames:selected.filter(f=>f.coolDown>0).length,firstEngineFrame:selected[0]?.engineFrame??null,lastEngineFrame:selected.at(-1)?.engineFrame??null,
    nativeFrameIntervalMs:distribution(pairs.map(([p,f])=>f.engineTime-p.engineTime)),callbackEntryIntervalMs:distribution(pairs.map(([p,f])=>f.start-p.start)),
    originalGameStepMs:distribution(selected.map(f=>f.end-f.start)),metricWriteTailMs:distribution(selected.map(f=>f.hookEnd-f.end)),
    interCallbackGapMs:distribution(pairs.map(([p,f])=>f.start-p.hookEnd)),nativeTimestampToEntryMs:distribution(selected.map(f=>f.start-f.engineTime)),
    preRenderMs:distribution(selected.filter(f=>f.preStart!==null).map(f=>f.preEnd-f.preStart)),fixtureObserverMs:distribution(selected.filter(f=>f.observerStart!==null).map(f=>f.observerEnd-f.observerStart)),
    rawDeltaMs:distribution(selected.map(f=>f.rawDelta)),smoothedDeltaMs:distribution(selected.map(f=>f.engineDelta))};}
export function summarize(comparison){assert.equal(comparison.kind,KIND);assert.equal(comparison.acceptance,false);assert.deepEqual(comparison.ordering,RUNS);assert.equal(comparison.results.length,RUNS.length);comparison.results.forEach((r,i)=>validateRun(r,RUNS[i]));
  const measured=comparison.results.filter(r=>r.run.role==='measured');for(const r of measured)assert.deepEqual(r.before,measured[0].before);
  return{kind:KIND,acceptance:false,completeCollection:true,ordering:RUNS,interpretation:'Descriptive stationary diagnostic only. Game.step spans include synchronous original observer/render work; detailed brackets are nested, not additive. Inter-callback gaps can include browser/compositor/process work, TimeStep housekeeping and remaining instrumentation; no GPU or scheduler causality follows.',
    startupInterpretation:'Thirty post-create collection frames, not engine frame zero. Cooldown is sampled after smoothing/decrement; positive values indicate remaining cooldown, while zero alone does not prove that tick was unclamped. Settled window follows ten focused visible zero-cooldown frames. No input route is exercised.',
    measured:measured.map(r=>({run:r.run,browserVersion:r.browserVersion,environment:r.timing.environment,windows:r.timing.windows,early:phaseSummary(r.timing.frames,'early'),settling:phaseSummary(r.timing.frames,'settling'),settled:phaseSummary(r.timing.frames,'settled')}))};
}
export function fromPlaywrightReport(report){const specs=[];const walk=s=>{specs.push(...(s.specs??[]));(s.suites??[]).forEach(walk);};(report.suites??[]).forEach(walk);assert.equal(specs.length,1);assert.equal(specs[0].title,'ARPG stationary frame gap: diagnostic only, never acceptance');assert.equal(specs[0].tests.length,1);const results=specs[0].tests[0].results;assert.equal(results.length,1);assert.equal(results[0].status,'passed');assert.equal(results[0].retry,0);assert.equal(report.stats.expected,1);assert.equal(report.stats.unexpected,0);assert.equal(report.stats.flaky,0);assert.equal(report.stats.skipped,0);
  const a=results[0].attachments.filter(a=>a.name==='frame-gap-comparison');assert.equal(a.length,1);assert.equal(typeof a[0].body,'string');return summarize(JSON.parse(Buffer.from(a[0].body,'base64').toString('utf8')));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){assert(process.argv[2]);console.log(JSON.stringify(fromPlaywrightReport(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));}
