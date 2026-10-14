// OFFLINE mock/controller and fabricated receipt checks; never native evidence.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {EAST_INNER_SETUP,COURTYARD_ACTIONS,COURTYARD_SOLIDS,COURTYARD_LIMITS} from './courtyard-contract.mjs';
import {eastInnerSetupStep,eastInnerSetupPositionIssues,eastInnerSetupTraceIssues,inEastInnerSetup} from './courtyard-east-setup.mjs';
import {verifyEastInnerSetup} from './verify-courtyard.mjs';
import {beforeEastInnerSetup} from './courtyard-east-setup-preservation.mjs';
import {sweptDistance,roomAllows} from './plaza-contract.mjs';
const ts=createRequire(import.meta.url)('typescript'),read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const point=(x=1872,y=600,at=100,intent=0)=>({x,y,at,area:0,intent:{x:0,y:intent},dash:{cd:0,timer:0,lastDir:{x:0,y:1}},courtyardFrame:{frame:at,delta:16}});
const sequence=t=>t.map((p,i)=>({...p,courtyardFrame:{...p.courtyardFrame,frame:i+1}}));
const action=COURTYARD_ACTIONS.find(a=>a.label==='east-inner-ready');
const prior=t=>({...t[0],at:t[0].at-1,courtyardFrame:{...t[0].courtyardFrame,frame:t[0].courtyardFrame.frame-1}});
const before=t=>({scene:{id:1,gameplay:prior(t)}}),after=t=>({scene:{id:1,gameplay:t.at(-1)}});
const receipt=t=>({label:action.label,sceneId:1,before:t[0],after:t.at(-1)});
const check=(t,r=receipt(t),a=action)=>verifyEastInnerSetup(a,before(t),after(t),[prior(t),...t],r);
const trace=(x=1872,y=704)=>sequence([point(x,600,100),point(x,y,190,1),point(x,y,200)]);
const js=ts.transpileModule(read('./courtyard-east-setup.ts'),{fileName:'courtyard-east-setup.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function mocked({frames=[point(),point(1872,704,200)],trace=frames,times=[0,1,2],traceError=null,pressError=null,frameError=null,changeScene=false,overflow=false}={}) {
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
  }:name==='./courtyard-east-setup.mjs'?{eastInnerSetupStep,eastInnerSetupTraceIssues}:(()=>{throw Error(`Unexpected import ${name}`);})();
  vm.runInNewContext(js,{module,exports:module.exports,require,Date:{now:()=>{const now=times[Math.min(nowIndex++,times.length-1)];events.push(['clock',now]);return now;}}});
  let pulses=0;
  return {run:(guard=()=>{events.push(['guard']);pulses++;})=>module.exports.setupEastInner(page,guard),events,get pulses(){return pulses;}};
}

test('only the east walk preparation changes; its two ordinary alignments and existing dash goal remain exact',()=>{
 assert.deepEqual(EAST_INNER_SETUP,{minX:1856,maxX:1888,minY:688,maxY:720});
 assert.deepEqual(action,{kind:'setup',region:'east-inner',target:'east',points:[[2112,600],[1872,600]],label:'east-inner-ready'});
 assert.deepEqual(COURTYARD_ACTIONS.find(a=>a.label==='east-inner-dash-ready'),{kind:'move',points:[[1872,752]],label:'east-inner-dash-ready'});
 assert.deepEqual(COURTYARD_ACTIONS.filter(a=>a.kind==='setup').map(a=>a.label),['west-inner-ready','west-inner-dash-ready','east-inner-ready']);
 assert.equal(COURTYARD_ACTIONS.reduce((n,a)=>n+(a.points?.length??0)+(a.kind==='setup'?1:0),0),53);
 assert.equal(COURTYARD_ACTIONS.length,45);assert.equal(COURTYARD_ACTIONS.filter(a=>a.view).length,18);
});
test('continuous closed rectangle and initial vertical corridor clear every solid and the room',()=>{
 for(const minY of [592,688]){const r=[[1856,minY],[1888,minY],[1888,720],[1856,720]];assert(r.every(roomAllows));for(const p of Object.values(COURTYARD_SOLIDS)){assert(r.every((a,i)=>sweptDistance(a,r[(i+1)%4],p)>38));assert(p.every(a=>sweptDistance(a,a,r)>38));}}
});
for(const x of [1856,1888])for(const y of [688,720])test(`closed east region admission ${x},${y}`,()=>{const p=point(x,y);assert(inEastInnerSetup(p));assert.equal(eastInnerSetupStep(p,6500),null);});
for(const x of [1864,1872,1880])for(const y of [688,704,720])test(`complete east receipt retains ordinary alignment and closed arrival ${x},${y}`,()=>check(trace(x,y)));
for(const[name,p]of Object.entries({left:point(1855.999,704),right:point(1888.001,704),north:point(1872,687.999),south:point(1872,720.001),nan:point(NaN,704),infinity:point(1872,Infinity)}))test(`exact east region rejects ${name}`,()=>{assert(!inEastInnerSetup(p));const t=trace();Object.assign(t.at(-1),p,{at:200});assert.throws(()=>check(t));});
test('east step preserves original pulse sizing, current x and vertical input',()=>{
 assert.deepEqual(eastInnerSetupStep(point(),0),{key:'s',delay:240});
 assert.deepEqual(eastInnerSetupStep(point(1874.952,749.763733333333),0),{key:'w',delay:135});
 assert.deepEqual(eastInnerSetupStep(point(1872,724),0,0),{key:'w',delay:16});
 assert.deepEqual(eastInnerSetupStep(point(1872,724),0,1),{key:'w',delay:32});
});
for(const[name,change]of Object.entries({wrongside:p=>p.y=912,wall:p=>p.y=800,lane:p=>p.y=591.999,lateral:p=>p.intent.x=1,held:p=>p.intent.y=1,dash:p=>p.dash.timer=1,area:p=>p.area=1,frame:p=>p.courtyardFrame.frame=NaN}))test(`east controller admission rejects ${name}`,()=>{const p=point(1872,704);change(p);assert.throws(()=>eastInnerSetupStep(p,0));});
for(const[name,change]of Object.entries({lateral:t=>t[1].x++,wrongside:t=>t[1].y=912,wallcrossing:t=>t[1].y=840,area:t=>t[1].area=1,zerodelta:t=>t[1].courtyardFrame.delta=0,repeatedframe:t=>t[1].courtyardFrame.frame=t[0].courtyardFrame.frame,stale:t=>t[1].at=t[0].at,wrongintent:t=>t[1].intent.y=-1}))test(`east full trace rejects ${name}`,()=>{const t=trace();change(t);assert(eastInnerSetupTraceIssues(t).length);assert.throws(()=>check(t));});
test('east receipt rejects omitted alignment, changed alignment, wrong target and every other label',()=>{
 const t=trace();for(const a of [{...action,points:[]},{...action,points:[[1872,600]]},{...action,target:'west'},{...action,region:'west-inner'},{...action,label:'east-inner-dash-ready'}])assert.throws(()=>check(t,receipt(t),a),/explicit east walk/);
 const misaligned=trace(1880.001);assert.throws(()=>check(misaligned),/original target band/);
});
for(const key of ['area','intent','dash','courtyardFrame'])test(`east receipt rejects contradictory ${key} anchor`,()=>{const t=trace(),r=receipt(t);r.before=structuredClone(r.before);if(key==='area')r.before.area=1;else if(key==='intent')r.before.intent.y=1;else if(key==='dash')r.before.dash.cd=1;else r.before.courtyardFrame.delta=17;assert.throws(()=>check(t,r),/entire native receipt|anchors must be neutral/);});
test('east receipt rejects a missing native intermediate frame and hidden excursion',()=>{const t=sequence([point(),point(1872,650,150,1),point(1872,704,190,1),point(1872,704,200)]);t.splice(1,1);assert(eastInnerSetupTraceIssues(t).length);assert.throws(()=>check(t),/contiguous/);const hidden=trace();hidden.splice(1,0,point(1872,840,150,1));assert(eastInnerSetupTraceIssues(hidden).length);assert.throws(()=>check(hidden));});
for(const variant of ['neutral','excursion','held'])test(`east settled suffix checks ${variant}`,()=>{const t=sequence([point(),point(1872,704,180,1),point(1872,704,190),point(1872,variant==='excursion'?704.88:704,194,variant==='neutral'?0:1),point(1872,704,198,variant==='excursion'?-1:0),point(1872,704,202)]),r={...receipt(t),after:t[2]};if(variant==='neutral')check(t,r);else assert.throws(()=>check(t,r),/Completed setup stays/);});
test('mocked east helper counts one pulse, observes complete slice and neutral arrival',async()=>{const m=mocked({trace:[point(),point(1872,704,190,1),point(1872,704,200)]});await m.run();assert.equal(m.pulses,1);assert.deepEqual(m.events.filter(e=>['guard','press','release'].includes(e[0])),[['guard'],['press','s',240]]);assert.equal(m.events.filter(e=>e[0]==='neutral').length,2);});
test('east deadline starts before reads and never resets on progress',async()=>{const m=mocked({frames:[point(),point(1872,650,200)],trace:[point(),point(1872,650,190,1),point(1872,650,200)],times:[100,101,6600]});await assert.rejects(m.run(),/setup stalled/);assert.equal(m.pulses,1);assert.deepEqual(m.events[0],['clock',100]);assert.deepEqual(m.events.at(-1),['release']);});
test('east deadline refuses input at6500 but accepts an already observed neutral arrival at6500',async()=>{const blocked=mocked({frames:[point()],times:[100,6600]});await assert.rejects(blocked.run(),/setup stalled/);assert.equal(blocked.pulses,0);const arrived=mocked({frames:[point(1872,704)],times:[100,6600]});await arrived.run();assert.equal(arrived.pulses,0);});
for(const[name,options,pattern]of [['budget guard',{},/budget/],['press',{pressError:Error('press failed')},/press failed/],['neutral watchdog',{frameError:Error('neutral watchdog')},/neutral watchdog/],['trace read',{traceError:Error('trace read')},/trace read/],['overflow',{overflow:true},/overflowed/],['scene change',{changeScene:true,trace:[point(),point(1872,704,190,1),point(1872,704,200)]},/identity changed/]])test(`east failure ${name} releases all input and preserves original error`,async()=>{const m=mocked(options);await assert.rejects(m.run(name==='budget guard'?()=>{throw Error('budget');}:undefined),pattern);assert.deepEqual(m.events.at(-1),['release']);});
test('east helper rejects unsafe intermediate movement and unrequested direction',async()=>{for(const t of [[point(),point(1872,840,150,1),point(1872,704,200)],[point(),point(1872,598,150,-1),point(1872,704,190,1),point(1872,704,200)]]){const m=mocked({trace:t});await assert.rejects(m.run(),/Setup|Unexpected native/);assert.deepEqual(m.events.at(-1),['release']);}});
test('east helper requires the mandatory budget callback before native input',async()=>{const m=mocked();await assert.rejects(m.run(null),/guard is not a function/);assert(!m.events.some(e=>e[0]==='press'));});
test('east shares unchanged neutral watchdog and introduces no sleeps or corrections',()=>{assert.match(read('./plaza-browser.ts'),/No fresh neutral native frame within 3000 ms/);assert.doesNotMatch(read('./courtyard-east-setup.ts'),/waitForTimeout|waypointCorrection|\.keyboard\.(?:down|up)/);assert.doesNotMatch(read('./courtyard-east-setup.mjs'),/waypointCorrection/);});

const originalHashes={
  "courtyard-contract.mjs": "565f4d6131f8ecea74b5ad8503dde07d87c3e7ae80a85d40836b370b974bdb60",
  "courtyard-browser.ts": "c7d38298df11375352f5e3d30322f7e24d67708549d2f8314384ee75890944f9",
  "verify-courtyard.mjs": "5699aade61108c3312975066a1ed1ed401faafce5edd025579a16d4a0fff3a3d",
  "courtyard-native-schema.mjs": "2c49302a38c007455439636151e2dd770325d03d2a4815d9194d87ef45a0790f",
  "courtyard-native.test.mjs": "a277e4c3aea1c6ca22160a2e7ab8c21621dd81474f76e1e3cc3f9332419c1705",
  "courtyard-setup.test.mjs": "45ed40607a1698d8cbf03ec59449599e1e3b4a550e3f90d1c1be051a244e7897",
  "courtyard-source-bundle.test.mjs": "7560aace9a62864b8a7b97538832f012fdea98bd5cb895a7c730516b88859976",
  "courtyard-setup-preservation.mjs": "bfcee69d8678a6175cbda2fa5dcc2f920a329aee91fc40a2d9cba172c6f09d67",
  "courtyard-runtime.md": "f688d5291c6674ec4c868e375cd427eee630b3992b6f06da6945beb700295855"
};
for(const [name,hash]of Object.entries(originalHashes))test(`exact ff4f source preserved outside explicit east setup delta: ${name}`,()=>assert.equal(createHash('sha256').update(beforeEastInnerSetup(name,read('./'+name))).digest('hex'),hash));

test('proven west controller and helper stay byte-identical',()=>{for(const [name,hash]of Object.entries({'courtyard-setup.mjs':'89261ef66289f4b898b67384156c6c38631be3bdff516ec312162ac000dfd672','courtyard-setup.ts':'1d5ea2f292cf2bb43785702abf1380ff76a919b2fda311d300eb18524c476f8a'}))assert.equal(createHash('sha256').update(read('./'+name)).digest('hex'),hash);});

// Independent literal-geometry fabricated walks, not captured runtime evidence.
const {FABRICATED_SOLIDS,fabricatedSweep}=await import('./courtyard-native-schema.mjs');
const {verifyCourtyardAction}=await import('./verify-courtyard.mjs');
function fabricatedEastWalk({x=1856,y=688,deltas=Array(13).fill(55),span=661}={}){
 let p=[x,y];const frame=(at,delta,intent)=>({at,area:0,x:p[0],y:p[1],intent:{x:0,y:intent},dash:{cd:0,timer:0,lastDir:{x:0,y:1}},courtyardFrame:{delta}}),motion=[frame(0,16,0)];
 for(const [i,delta]of deltas.entries()){const e=[p[0],p[1]+.22*delta];if(Object.values(FABRICATED_SOLIDS).every(poly=>fabricatedSweep(p,e,poly)>38))p=e;motion.push(frame(10+i*span/(deltas.length-1),delta,1));}
 motion.push(frame(700,16,0));return{fabricated:true,notNativeEvidence:true,action:{kind:'walk',key:'s',target:'east'},before:{at:0,scene:{gameplay:motion[0]}},after:{at:700,scene:{gameplay:motion.at(-1)}},motion};
}
const verifyWalk=f=>verifyCourtyardAction(f.action,f.before,f.after,f.motion);
for(const x of [1856,1888])for(const y of [688,720])for(const [label,count,delta,span]of [['desktop minimum',13,55,661],['desktop maximum',13,63.33,661],['phone minimum',38,16.66,686],['phone maximum',38,25,686]])test(`FABRICATED east region ${x},${y} ${label} retains actual approach and intended blocks`,()=>verifyWalk(fabricatedEastWalk({x,y,deltas:Array(count).fill(delta),span})));
test('east region does not excuse insufficient frames, timestamp span or out-of-bracket first block',()=>{
 assert.throws(()=>verifyWalk(fabricatedEastWalk({deltas:Array(7).fill(55)})),/two held frames/);
 assert.throws(()=>verifyWalk(fabricatedEastWalk({deltas:Array(8).fill(55),span:386.6})),/Sustained/);
 assert.throws(()=>verifyWalk(fabricatedEastWalk({x:1888,y:720,deltas:[200,...Array(12).fill(55)]})),/approaches before its first blocked frame/);
});
test('original failed east pose and delta order remains rejected for approach after first block',()=>assert.throws(()=>verifyWalk(fabricatedEastWalk({x:1874.952,y:749.763733333333,deltas:[63.33,61.66,61.66,61.67,61.67,61.66,59.99,58.33,56.66,55,55,55,55]})),/approaches before its first blocked frame/));
const driver=read('./courtyard-browser.ts'),adapter=driver.slice(driver.indexOf('  const guardedSetup=async(label:string)=>{'),driver.indexOf('  const save=async'));
function accounting(legs,pulses,calls=1){const receipt={legs,pulses,setups:[]},events=[],context={receipt,COURTYARD_LIMITS,page:{},setupWestInner:async()=>{throw Error('Unexpected west dispatch');},setupEastInner:async(_page,guard)=>{events.push('east');for(let i=0;i<calls;i++)guard();}};vm.runInNewContext(ts.transpileModule(`${adapter}\nthis.run=guardedSetup;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);return{receipt,events,run:()=>context.run('east-inner-ready')};}
test('actual adapter dispatches only east walk setup and counts exact original ceilings',async()=>{const m=accounting(63,1199);await m.run();assert.deepEqual(m.events,['east']);assert.deepEqual([m.receipt.legs,m.receipt.pulses,m.receipt.setups.length,m.receipt.setups[0].label],[64,1200,1,'east-inner-ready']);const noPulse=accounting(0,10,0);await noPulse.run();assert.deepEqual([noPulse.receipt.legs,noPulse.receipt.pulses],[1,10]);});
test('east adapter cannot increase original leg or pulse budgets',async()=>{const leg=accounting(64,1199);await assert.rejects(leg.run(),/waypoint budget/);assert.deepEqual(leg.events,[]);const pulse=accounting(63,1200);await assert.rejects(pulse.run(),/pulse budget/);assert.deepEqual([pulse.receipt.legs,pulse.receipt.pulses,pulse.receipt.setups.length],[64,1201,0]);});

const {fabricateNativeCourtyard}=await import('./courtyard-native-schema.mjs');
const {verifyCourtyardState}=await import('./verify-courtyard.mjs');
// The whole-case verifier must reject every forged receipt list before it can
// treat the new setup as accepted. Reuse read-only observations, clone receipts.
const receiptCase=fabricateNativeCourtyard(0);
for(const[name,mutate]of Object.entries({
 'missing east':s=>s.filter(r=>r.label!=='east-inner-ready'),
 'duplicate east':s=>[...s,structuredClone(s.find(r=>r.label==='east-inner-ready'))],
 'relabeled east':s=>s.map(r=>r.label==='east-inner-ready'?{...r,label:'east-inner-dash-ready'}:r),
 'reordered east':s=>[s[2],s[0],s[1]]
}))test(`FABRICATED whole-case rejects ${name} setup receipt`,()=>{
 const driver={...receiptCase.driver,setups:mutate(structuredClone(receiptCase.driver.setups))};
 assert.throws(()=>verifyCourtyardState(receiptCase.observation,driver,0),/Exactly one complete receipt per setup action/);
});
