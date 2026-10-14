// Offline native-call mocks and fabricated geometry cases, never native evidence.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {WEST_INNER_SETUP,COURTYARD_ACTIONS,COURTYARD_SOLIDS,COURTYARD_LIMITS} from './courtyard-contract.mjs';
import {westInnerSetupStep,westInnerSetupPositionIssues,westInnerSetupTraceIssues,inWestInnerSetup} from './courtyard-setup.mjs';
import {verifyWestInnerSetup} from './verify-courtyard.mjs';
import {sweptDistance,roomAllows} from './plaza-contract.mjs';
const ts=createRequire(import.meta.url)('typescript'),read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const point=(x=1472,y=536,at=100,intent=0)=>({x,y,at,area:0,intent:{x:0,y:intent},dash:{cd:0,timer:0,lastDir:{x:0,y:1}},courtyardFrame:{frame:at,delta:16}});
const sequence=trace=>trace.map((p,i)=>({...p,courtyardFrame:{...p.courtyardFrame,frame:i}}));
const action=COURTYARD_ACTIONS.find(a=>a.label==='west-inner-dash-ready');
const receipt=motion=>({label:action.label,sceneId:1,before:motion[0],after:motion.at(-1)});
const before=motion=>({scene:{id:1,gameplay:{...motion[0],at:motion[0].at-1,courtyardFrame:{...motion[0].courtyardFrame,frame:motion[0].courtyardFrame.frame-1}}}});
const after=motion=>({scene:{id:1,gameplay:motion.at(-1)}});
const check=(motion,label=action.label)=>verifyWestInnerSetup({...action,label},before(motion),after(motion),[before(motion).scene.gameplay,...motion],{...receipt(motion),label});
const js=ts.transpileModule(read('./courtyard-setup.ts'),{fileName:'courtyard-setup.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function mocked({frames=[point(),point(1472,640,200)],trace=frames,times=[0,1,2],traceError=null,pressError=null,frameError=null,changeScene=false,overflow=false}={}) {
  const ordered=sequence(trace);
  frames=frames.map(p=>({...p,courtyardFrame:{...p.courtyardFrame,frame:ordered.find(q=>q.at===p.at)?.courtyardFrame.frame??p.courtyardFrame.frame}}));trace=ordered;
  const events=[],fixture={plazaMotion:[],plazaMotionOverflow:overflow,scenes:[{id:1,pageId:1,destroyed:false}]},module={exports:{}};
  let frameIndex=0,nowIndex=0,reads=0;
  const page={keyboard:{press:async(key,{delay})=>{events.push(['press',key,delay]);if(pressError)throw pressError;}},evaluate:async(fn,args)=>{
    events.push(['trace']);if(traceError)throw traceError;
    if(changeScene&&reads++)fixture.scenes[0].id++;
    return vm.runInNewContext(`(${fn.toString()})(args)`,{window:{__arpgFixture:fixture},args});
  }};
  const require=name=>name==='./plaza-browser'?{
    release:async()=>events.push(['release']),
    releasedFrame:async()=>{
      events.push(['neutral']);if(frameError&&frameIndex>0)throw frameError;
      const p=frames[frameIndex++];if(!p)throw Error('No mocked frame');
      fixture.plazaMotion=trace.filter(t=>t.at<=p.at);return p;
    }
  }:name==='./courtyard-setup.mjs'?{westInnerSetupStep,westInnerSetupTraceIssues}:(()=>{throw Error(`Unexpected import ${name}`);})();
  vm.runInNewContext(js,{module,exports:module.exports,require,Date:{now:()=>{const now=times[Math.min(nowIndex++,times.length-1)];events.push(['clock',now]);return now;}}});
  let pulses=0;
  return {run:(guard=()=>{events.push(['guard']);pulses++;})=>module.exports.setupWestInner(page,guard),events,get pulses(){return pulses;}};
}
test('only two explicit west setup actions replace their incidental coordinate goals',()=>{
  assert.deepEqual(WEST_INNER_SETUP,{minX:1440,maxX:1472,minY:624,maxY:656});
  assert.deepEqual(COURTYARD_ACTIONS.filter(a=>a.kind==='setup'&&a.region==='west-inner'),[
    {kind:'setup',region:'west-inner',target:'west',points:[[1456,536]],label:'west-inner-ready',view:'west-inner-ready'},
    {kind:'setup',region:'west-inner',target:'west',label:'west-inner-dash-ready'}]);
  assert.equal(COURTYARD_ACTIONS.reduce((n,a)=>n+(a.points?.length??0)+(a.kind==='setup'?1:0),0),53);
  assert.equal(COURTYARD_ACTIONS[5].points[0][0],1456); // Every subsequent ordinary route remains exact.
});
test('continuous region rectangle clears all solids and the original convex room',()=>{
  const r=[[1440,624],[1472,624],[1472,656],[1440,656]];
  assert(r.every(roomAllows));
  for(const poly of Object.values(COURTYARD_SOLIDS)){
    assert(r.every((p,i)=>sweptDistance(p,r[(i+1)%4],poly)>38));
    assert(poly.every(p=>sweptDistance(p,p,r)>38));
  }
});
for(const x of [1440,1472])for(const y of [624,656])test(`closed region boundary ${x},${y} is valid with a fresh neutral receipt`,()=>{
  const p=point(x,y);assert(inWestInnerSetup(p));assert.equal(westInnerSetupStep(p,6500),null);
  const previous=point(x,y,99);check([previous,p]);
});
for(const [name,p] of Object.entries({left:point(1439.999,640),right:point(1472.001,640),north:point(1456,623.999),south:point(1456,656.001),nan:point(NaN,640),infinity:point(1456,Infinity)}))test(`setup receipt rejects ${name} outside the exact region`,()=>{
  assert(!inWestInnerSetup(p));assert.throws(()=>check([point(1456,536,99),p]),/bounded west-inner region/);
});
test('step preserves native pulse sizing and uses current x, never lateral alignment',()=>{
  assert.deepEqual(westInnerSetupStep(point(),0),{key:'s',delay:240});
  assert.deepEqual(westInnerSetupStep(point(1461,679.3674),0),{key:'w',delay:106});
  assert.deepEqual(westInnerSetupStep(point(1461,660),0,0),{key:'w',delay:16});
  assert.deepEqual(westInnerSetupStep(point(1461,660),0,1),{key:'w',delay:32});
  assert.deepEqual(westInnerSetupStep(point(1461,660),0,2),{key:'w',delay:48});
});
for(const [name,change] of Object.entries({wrongside:p=>p.y=864,wall:p=>p.y=752,room:p=>p.y=-999,lateral:p=>p.intent.x=1,held:p=>p.intent.y=1,dash:p=>p.dash.timer=1,area:p=>p.area=1,frame:p=>p.courtyardFrame.frame=NaN}))test(`setup admission rejects ${name}`,()=>{
  const p=point(1456,640);change(p);assert.throws(()=>westInnerSetupStep(p,0));
});
test('restage validates the actual strictly clear vertical sweep from near the wall',()=>{
  const trace=sequence([point(1461,679.3674,100),point(1461,652.2348,200,-1),point(1461,652.2348,201)]);
  assert.deepEqual(westInnerSetupTraceIssues(trace),[]);check(trace,'west-inner-dash-ready');
  assert.equal(westInnerSetupStep(trace.at(-1),1),null); // 27.1326 is not a universal forbidden quantum.
});
for(const [name,change] of Object.entries({lateral:t=>t[1].x++,wrongside:t=>t[1].y=864,wallcrossing:t=>t[1].y=800,shop:t=>{t[1].x=1664;t[1].y=536;},area:t=>t[1].area=1,zerodelta:t=>t[1].courtyardFrame.delta=0,repeatedframe:t=>t[1].courtyardFrame.frame=t[0].courtyardFrame.frame,stale:t=>t[1].at=t[0].at,wrongintent:t=>t[1].intent.y=-1}))test(`every intermediate setup sample rejects ${name}`,()=>{
  const trace=sequence([point(),point(1472,620,200,1),point(1472,640,300,1),point(1472,640,400)]);change(trace);
  assert(westInnerSetupTraceIssues(trace).length);assert.throws(()=>check(trace));
});
test('neutral intermediate motion may not hide an excursion out and back',()=>{
  const trace=sequence([point(),point(1472,800,200),point(1472,640,300)]);assert(westInnerSetupTraceIssues(trace).length);assert.throws(()=>check(trace));
});
test('independent receipt rejects wrong target, wrong setup label, stale frame and missing anchors',()=>{
  const a=point(),b=point(1472,640,200),before={scene:{id:1,gameplay:{...a,at:a.at-1}}},after={scene:{id:1,gameplay:b}},r=receipt([a,b]);
  for(const altered of [{...action,target:'east'},{...action,region:'east-inner'},{...action,label:'gate-arrived'}])assert.throws(()=>verifyWestInnerSetup(altered,before,after,[a,b],r));
  assert.throws(()=>verifyWestInnerSetup(action,before,after,[b],r),/anchors/);
  assert.throws(()=>verifyWestInnerSetup(action,before,{scene:{id:2,gameplay:b}},[a,b],r),/original scene/);
  assert.throws(()=>check([a,{...b,at:a.at}]),/fresh/);
});
test('mocked helper records neutral arrival, counts one pulse and performs no lateral input',async()=>{
  const m=mocked({trace:[point(),point(1472,640,190,1),point(1472,640,200)]});await m.run();assert.equal(m.pulses,1);
  assert.deepEqual(m.events.filter(e=>['guard','press','release'].includes(e[0])),[['guard'],['press','s',240]]);
  assert.equal(m.events.filter(e=>e[0]==='neutral').length,2);
  assert.equal(m.events.filter(e=>e[0]==='trace').length,2);
});
test('clock begins before initial neutral/trace reads and never resets on progress',async()=>{
  const m=mocked({frames:[point(),point(1472,600,200,0)],trace:[point(),point(1472,600,190,1),point(1472,600,200)],times:[100,101,6600]});
  await assert.rejects(m.run(),/setup stalled/);assert.equal(m.pulses,1);assert.deepEqual(m.events[0],['clock',100]);assert.deepEqual(m.events.at(-1),['release']);
});
test('deadline refuses new input at6500 but accepts an observed neutral region arrival at6500',async()=>{
  const blocked=mocked({frames:[point()],times:[100,6600]});await assert.rejects(blocked.run(),/setup stalled/);assert.equal(blocked.pulses,0);
  const arrived=mocked({frames:[point(1472,640)],times:[100,6600]});await arrived.run();assert.equal(arrived.pulses,0);
});
test('fresh neutral watchdog remains the unchanged3000ms shared primitive',()=>{
  assert.match(read('./plaza-browser.ts'),/No fresh neutral native frame within 3000 ms/);
  assert.match(read('./plaza-browser.ts'),/reject\(new Error\('No fresh neutral native frame within 3000 ms'\)\);\},3000\)/);
  assert(!read('./courtyard-setup.ts').includes('waitForTimeout'));
});
for(const [name,options,pattern] of [
  ['budget guard',{},/budget/],['native press',{pressError:Error('press failed')},/press failed/],
  ['neutral watchdog',{frameError:Error('neutral watchdog')},/neutral watchdog/],['trace read',{traceError:Error('trace read')},/trace read/],
  ['overflow',{overflow:true},/overflowed/],['scene change',{changeScene:true,trace:[point(),point(1472,640,190,1),point(1472,640,200)]},/identity changed/]
])test(`helper failure ${name} preserves exhaustive release and original error`,async()=>{
  const m=mocked(options);await assert.rejects(m.run(name==='budget guard'?()=>{throw Error('budget');}:undefined),pattern);assert.deepEqual(m.events.at(-1),['release']);
});
test('helper rejects unsafe intermediate movement before another pulse or success',async()=>{
  const m=mocked({trace:[point(),point(1472,800,150,1),point(1472,640,200)]});await assert.rejects(m.run(),/Setup/);assert.equal(m.pulses,1);assert.deepEqual(m.events.at(-1),['release']);
});
test('helper refuses an unrequested north intent during a south pulse',async()=>{
  const m=mocked({trace:[point(),point(1472,530,150,-1),point(1472,640,190,1),point(1472,640,200)]});await assert.rejects(m.run(),/Unexpected native setup direction/);
});
test('omitting the mandatory budget callback fails before native input',async()=>{
  const m=mocked();await assert.rejects(m.run(null),/guard is not a function/);assert(!m.events.some(e=>e[0]==='press'));assert.deepEqual(m.events.at(-1),['release']);
});
// Extract the actual driver adapter rather than fabricate different accounting.
const driver=read('./courtyard-browser.ts'),adapter=driver.slice(driver.indexOf('  const guardedSetup=async(label:string)=>{'),driver.indexOf('  const save=async'));
function accounting(legs,pulses,calls=1){
  const receipt={legs,pulses,setups:[]},events=[],context={receipt,COURTYARD_LIMITS,page:{},setupWestInner:async(_page,guard)=>{events.push('setup');for(let i=0;i<calls;i++)guard();}};
  vm.runInNewContext(ts.transpileModule(`${adapter}\nthis.run=guardedSetup;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);return{receipt,events,run:context.run};
}
test('actual driver adapter counts setup as one leg and each requested pulse, including exact ceilings',async()=>{
  const m=accounting(63,1199);await m.run();assert.deepEqual([m.receipt.legs,m.receipt.pulses,m.receipt.setups.length],[64,1200,1]);
  const noPulse=accounting(0,10,0);await noPulse.run();assert.deepEqual([noPulse.receipt.legs,noPulse.receipt.pulses,noPulse.receipt.setups.length],[1,10,1]);
});
test('actual driver adapter rejects leg or pulse overflow without enlarging caps',async()=>{
  const leg=accounting(64,1199);await assert.rejects(leg.run(),/waypoint budget/);assert.deepEqual(leg.events,[]);
  const pulse=accounting(63,1200);await assert.rejects(pulse.run(),/pulse budget/);assert.deepEqual([pulse.receipt.legs,pulse.receipt.pulses,pulse.receipt.setups.length],[64,1201,0]);
});

test('removed intermediate engine frame is rejected even when all retained endpoints are safe',()=>{
  const trace=sequence([point(),point(1472,600,200,1),point(1472,640,300,1),point(1472,640,400)]);trace.splice(1,1);
  assert(westInnerSetupTraceIssues(trace).some(s=>s.includes('contiguous')));assert.throws(()=>check(trace),/contiguous/);
});
for(const key of ['area','intent','dash','courtyardFrame'])test(`independent setup receipt rejects contradictory ${key} anchor`,()=>{
  const trace=sequence([point(),point(1472,640,200,1),point(1472,640,300)]),a=structuredClone(trace[0]),b=structuredClone(trace.at(-1));
  if(key==='area')a.area=1;else if(key==='intent')a.intent.y=1;else if(key==='dash')a.dash.cd=1;else a.courtyardFrame.delta=17;
  assert.throws(()=>verifyWestInnerSetup(action,before(trace),{scene:{id:1,gameplay:b}},[before(trace).scene.gameplay,...trace],{...receipt(trace),before:a}),/entire native receipt|anchors must be neutral/);
});

for(const variant of ['neutral','safe excursion','held intent'])test(`settled-to-checkpoint suffix ${variant} is checked in full`,()=>{
  const trace=sequence([point(1472,640,100),point(1472,640,104),point(1472,variant==='safe excursion'?640.88:640,108,variant==='neutral'?0:1),point(1472,640,112,variant==='safe excursion'?-1:0),point(1472,640,116)]);
  const r={...receipt(trace),after:trace[1]};
  const run=()=>verifyWestInnerSetup(action,before(trace),after(trace),[before(trace).scene.gameplay,...trace],r);
  if(variant==='neutral')run();else assert.throws(run,/Completed setup stays/);
});
