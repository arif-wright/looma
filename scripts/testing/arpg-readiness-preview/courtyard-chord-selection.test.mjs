// Captured anchors plus deterministic offline selection/model checks.
// These tests never launch a browser and do not establish native convergence.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {WAYPOINT_TOLERANCE,WAYPOINT_DEADLINE_MS,waypointStep,waypointCorrection,chordEnvelope,safeChordEnvelope,chordEndpointAllowed} from './plaza-navigation.mjs';
import {COURTYARD_ACTIONS,COURTYARD_SOLIDS,courtyardChordAllowed} from './courtyard-contract.mjs';
import {roomAllows,sweptDistance} from './plaza-contract.mjs';
import {beforeCourtyardChordSelection} from './courtyard-chord-preservation.mjs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const seed=JSON.parse(read('./courtyard-chord-refusal-933f.json'));
const select=(allowed)=>waypointCorrection(seed.from,...seed.target,seed.history,allowed);
const q=Math.max(...seed.history.map(h=>Math.abs(h.after.x-h.before.x)));
const bound=Math.max(24,q*1.25);
const candidate=lateral=>({key:`${lateral}+d`,delay:16,correction:{bound,envelope:chordEnvelope(seed.from,lateral,'d',bound)}});
const clearance=(e,solid)=>Math.min(...e.map((a,i)=>sweptDistance(a,e[(i+1)%e.length],solid)),...solid.map(v=>sweptDistance(v,v,e)));
const translate=(x,y)=>{const dx=x-seed.from.x,dy=y-seed.from.y;return {position:{x,y},target:[seed.target[0]+dx,seed.target[1]+dy],history:seed.history.map(h=>({...h,before:{x:h.before.x+dx,y:h.before.y+dy},after:{x:h.after.x+dx,y:h.after.y+dy}}))};};

test('captured 933f refusal reproduces the original first-safe selection and exact hull',()=>{
 assert.equal(seed.provenance.commit,'933f5b9f08e264768e17c78b78806e18e11651da');
 assert.equal(q,20.532600000000002);assert.equal(bound,25.665750000000003);
 assert.deepEqual(select(),seed.candidate);assert.deepEqual(candidate('w'),seed.candidate);
 assert.equal(safeChordEnvelope(seed.candidate.correction.envelope),true);
 assert.equal(courtyardChordAllowed(seed.candidate),false);
 assert.equal(clearance(seed.candidate.correction.envelope,COURTYARD_SOLIDS.west),0);
});
test('all existing guards during enumeration select the independently safe second candidate',()=>{
 const seen=[],pulse=select(p=>{seen.push(p.key);return courtyardChordAllowed(p);});
 assert.deepEqual(seen,['w+d','s+d']);assert.deepEqual(pulse,candidate('s'));
 assert.deepEqual(pulse.correction.envelope,[[1524.7771031918116,866.3151900954881],[1561.073954930289,902.6120418339653],[1561.073954930289,1005.2750418339654],[1524.7771031918116,968.9781900954881]]);
 assert(pulse.correction.envelope.every(roomAllows));assert(safeChordEnvelope(pulse.correction.envelope));assert(courtyardChordAllowed(pulse));
 const values=Object.fromEntries(Object.entries(COURTYARD_SOLIDS).map(([k,p])=>[k,clearance(pulse.correction.envelope,p)]));
 assert.deepEqual(values,{rear:435.2675108663546,endcap:530.7622174057666,shop:328.89637268512615,west:63.48855875924707,east:164.79229733491366});
 assert(Object.values(values).every(d=>d>38));
 assert.deepEqual(waypointStep(seed.from,...seed.target,1,0,seed.history,courtyardChordAllowed),pulse);
});
test('a first candidate that clears the original and courtyard guards is retained',()=>{
 const c=translate(1076.7771031918116,400),seen=[];
 const pulse=waypointCorrection(c.position,...c.target,c.history,p=>{seen.push(p.key);return courtyardChordAllowed(p);});
 assert.equal(pulse.key,'w+d');assert.deepEqual(seen,['w+d']);
 assert.deepEqual(pulse,waypointCorrection(c.position,...c.target,c.history));
});
test('two original-safe but courtyard-unsafe candidates fail without pressing or widening anything',()=>{
 const c=translate(1150,600),seen=[];
 for(const l of ['w','s']){const envelope=chordEnvelope(c.position,l,'d',bound);assert(safeChordEnvelope(envelope));assert(!courtyardChordAllowed({correction:{envelope}}));}
 assert.throws(()=>waypointCorrection(c.position,...c.target,c.history,p=>{seen.push(p.key);return courtyardChordAllowed(p);}),/No independently safe native chord envelope/);
 assert.deepEqual(seen,['w+d','s+d']);
});
test('a permissive additional predicate never admits a candidate rejected by original geometry',()=>{
 const a={key:'a',delay:16,before:{x:1708.1,y:425},after:{x:1687.2,y:425}},b={key:'d',delay:16,before:a.after,after:a.before};let calls=0;
 assert.throws(()=>waypointCorrection(a.after,1700,420,[b,a],()=>{calls++;return true;}),/No independently safe native chord envelope/);assert.equal(calls,0);
 const c=translate(1600,720),seen=[];
 assert.throws(()=>waypointCorrection(c.position,...c.target,c.history,p=>{seen.push(p.key);return courtyardChordAllowed(p);}),/No independently safe native chord envelope/);
 assert.deepEqual(seen,['s+d'],'The original-unsafe northern candidate never reaches the added predicate');
});
for(const [name,value] of [['false',false],['undefined',undefined],['null',null],['zero',0],['one',1],['text','true'],['object',{}],['promise',Promise.resolve(true)]])test(`additional predicate fails closed for ${name} instead of literal true`,()=>{
 assert.throws(()=>select(()=>value),/No independently safe native chord envelope/);
});
for(const value of [null,0,1,true,{},'true'])test(`nonfunction additional predicate ${JSON.stringify(value)} fails closed`,()=>assert.throws(()=>select(value),TypeError));
test('additional predicate exception propagates without retry or fallback',()=>{
 const expected=Error('predicate rejected'),seen=[];assert.throws(()=>select(p=>{seen.push(p.key);throw expected;}),e=>e===expected);assert.deepEqual(seen,['w+d']);
});
test('predicate receives an isolated candidate and cannot mutate the selected pulse or inputs',()=>{
 const saved=structuredClone(seed);const expected=select();
 const actual=select(p=>{p.key='bad';p.delay=999;p.correction.bound=0;p.correction.envelope[0][0]=0;p.correction.envelope.length=0;return true;});
 assert.deepEqual(actual,expected);assert.deepEqual(seed,saved);
});
test('no-correction and already-arrived paths never call the additional predicate',()=>{
 const forbidden=()=>assert.fail('No correction predicate should run');
 assert.equal(waypointStep({x:1536,y:864},1536,864,7000,0,seed.history,forbidden),null);
 assert.deepEqual(waypointStep(seed.from,...seed.target,0,0,[],forbidden),{key:'d',delay:16});
 assert.equal(waypointCorrection(seed.from,...seed.target,[],forbidden),null);
});
test('unchanged target, deadline and measured quantum bounds remain enforced',()=>{
 assert.equal(WAYPOINT_TOLERANCE,8);assert.equal(WAYPOINT_DEADLINE_MS,6500);
 assert.throws(()=>waypointStep(seed.from,...seed.target,6500,0,seed.history,courtyardChordAllowed),/Native route stalled/);
 for(const amount of [24,24.0001,25]){const position={x:1076,y:400},other={x:1076+amount,y:400},target=[1076+amount/2,400],history=[{key:'d',delay:16,before:position,after:other},{key:'a',delay:16,before:other,after:position}];
  if(amount===24)assert.equal(waypointCorrection(position,...target,history,courtyardChordAllowed).correction.bound,30);
  else assert.throws(()=>waypointCorrection(position,...target,history,courtyardChordAllowed),/Unmodeled native fine-step quantum/);
 }
});
test('existing courtyard guard never approves malformed correction envelopes',()=>{
 for(const envelope of [undefined,null,{},[],[[1,2],[3,4]],[[NaN,1],[2,3],[4,5]],[[Infinity,1],[2,3],[4,5]],[[1524,866],null,[1560,900]],[[1524,866],[1524,866],[1524,866]]]){
  let result;try{result=courtyardChordAllowed({correction:{envelope}});}catch{result=false;}assert.notEqual(result,true);
 }
});
test('safe southern hull bounds every sequential 0..2-frame phase and each modeled movement segment',()=>{
 const pulse=select(courtyardChordAllowed),solids=Object.values(COURTYARD_SOLIDS);let phases=0,segments=0;
 for(const leading of [0,1,2])for(const diagonal of [0,1,2])for(const trailing of [0,1,2])for(const profile of ['observed','bound','alternating']){
  const p={...seed.from};let i=0;
  for(const [vector,count] of [[[0,1],leading],[[Math.SQRT1_2,Math.SQRT1_2],diagonal],[[0,1],trailing]])for(let frame=0;frame<count;frame++){
   const a=[p.x,p.y],step=profile==='observed'?q:profile==='bound'?bound:(i++%2?q:bound);p.x+=vector[0]*step;p.y+=vector[1]*step;
   assert(chordEndpointAllowed(p,pulse));assert(roomAllows([p.x,p.y]));assert(solids.every(s=>sweptDistance(a,[p.x,p.y],s)>38));segments++;
  }
  assert(chordEndpointAllowed(p,pulse));phases++;
 }
 assert.equal(phases,81);assert.equal(segments,243);
 for(const p of [{x:seed.from.x-1,y:seed.from.y},{x:seed.from.x,y:seed.from.y-1},{x:1562,y:1006},{x:NaN,y:0}])assert.equal(chordEndpointAllowed(p,pulse),false);
});
test('routing points, terminal witness and guard call sites remain unchanged',()=>{
 assert.deepEqual(COURTYARD_ACTIONS.find(a=>a.label==='west-elbow-witness'),seed.checkpoint_action);
 const native=read('./courtyard-navigation.ts'),driver=read('./courtyard-browser.ts');
 assert.equal((native.match(/history,courtyardChordAllowed\);/g)||[]).length,1);
 assert.match(driver,/if\(!courtyardChordAllowed\(pulse\)\)throw Error/);
 assert(native.indexOf('guard(p,pulse)')<native.indexOf('page.keyboard.press'));
 for(const caller of ['./plaza-browser.ts','./prompt-timing-driver.ts']){const s=read(caller);assert.match(s,/waypointStep\(p,x,y,Date.now\(\)-startedAt,missedPulses,history\)/);assert.doesNotMatch(s,/courtyardChordAllowed/);}
});

const baselineHashes={
  "plaza-navigation.mjs": "3236281de80be869dbbf0319a73c90aa9c39d057c22b7e8bb347b3c2dde9b322",
  "courtyard-navigation.ts": "92a9e52a9a9bc9f2b88f94b9b601925378d9bc5060851ff14dbb67953b74f709",
  "courtyard-navigation.test.mjs": "f332bcb8bbd18ce9e3e7511eb12064a3715e0f0797deee377414ed5f178decd3",
  "courtyard-east-setup-preservation.mjs": "3214085bd304dc6428825d8460cf1a1d168b50936460a87f78f489e62ec2ab30",
  "courtyard-native.test.mjs": "5102173cec40b400b9ad1f160e0fc11a73df0138e21a18bdf1b506da723c2a4b",
  "courtyard-source-bundle.test.mjs": "2146d259194e612818d7c2ded63c3ff4a537e0b35e5645dfc756bb8e9d313036",
  "prompt-timing-preservation.test.mjs": "5035527cd1451a7e67d888f0931d6bf7b705974641e2c866dfe9c0ef36a94a6e",
  "prompt-timing-source-guard.mjs": "8f01829b74087c6f4c7d64682029a16f31e140197e9d8962d3c7fb622257faed",
  "frame-gap-source-guard.mjs": "894515cdcbf151a00b163f2494925e06da0e5f69f19cdf4768f93a9b61293595",
  "courtyard-runtime.md": "686dce9c8276435c499d471c58e423de0196adb7797417bdfe9c101f11edf077"
};
for(const [name,hash] of Object.entries(baselineHashes))test(`exact 933f baseline bytes outside explicit chord-selection delta: ${name}`,()=>{
 const s=read('./'+name);assert.equal(createHash('sha256').update(beforeCourtyardChordSelection(name,s)).digest('hex'),hash);
 assert.throws(()=>beforeCourtyardChordSelection(name,s+s),/Exact (endcap staging|courtyard chord-selection) delta/);
});

test('default omitted-predicate behavior equals exact-hash historical module across deterministic inputs',async()=>{
 const source=beforeCourtyardChordSelection('plaza-navigation.mjs',read('./plaza-navigation.mjs'));
 assert.equal(createHash('sha256').update(source).digest('hex'),'3236281de80be869dbbf0319a73c90aa9c39d057c22b7e8bb347b3c2dde9b322');
 const original=await import('data:text/javascript;base64,'+Buffer.from(source.replace("'./plaza-contract.mjs'",JSON.stringify(new URL('./plaza-contract.mjs',import.meta.url).href))).toString('base64'));
 const outcome=run=>{try{return {value:run()};}catch(e){return {error:e.constructor.name,message:e.message};}};
 let compared=0;
 for(const x of [1088,1200,1368,1536,1700,1872])for(const y of [210,425,600,720,864])for(const amount of [16,20.5326,24,25]){
  const position={x:x-amount/2,y},other={x:x+amount/2,y},history=[{key:'d',delay:16,before:position,after:other},{key:'a',delay:16,before:other,after:position}];
  for(const h of [[],history,[{...history[0],delay:48},history[1]]])for(const elapsed of [0,6499,6500]){
   assert.deepEqual(outcome(()=>waypointStep(position,x,y,elapsed,0,h)),outcome(()=>original.waypointStep(position,x,y,elapsed,0,h)));compared++;
  }
  assert.deepEqual(outcome(()=>waypointCorrection(position,x,y,history)),outcome(()=>original.waypointCorrection(position,x,y,history)));compared++;
 }
 assert.equal(compared,1200);
});

test('actual courtyard mover selects and presses the safe alternative with final guard and endpoint checks',async()=>{
 const {createRequire}=await import('node:module'),vm=await import('node:vm'),ts=createRequire(import.meta.url)('typescript');
 const endpoint={x:seed.from.x+q*Math.SQRT1_2,y:seed.from.y+q*Math.SQRT1_2};
 const frames=[seed.history[0].before,seed.history[0].after,seed.history[1].after,endpoint,{x:endpoint.x,y:endpoint.y-q}];
 const events=[],module={exports:{}};let frame=0;
 const page={keyboard:{press:async(key,{delay})=>{events.push(['press',key,delay]);}}};
 const require=name=>name==='./plaza-navigation.mjs'?{waypointStep,chordEndpointAllowed:(p,pulse)=>{events.push(['endpoint',pulse.key]);return chordEndpointAllowed(p,pulse);}}:
  name==='./courtyard-contract.mjs'?{courtyardChordAllowed}:name==='./plaza-browser'?{releasedFrame:async()=>{events.push(['neutral']);assert(frame<frames.length);return {...frames[frame++]};},release:async()=>{events.push(['release']);}}:(()=>{throw Error(`Unexpected import ${name}`);})();
 const js=ts.transpileModule(read('./courtyard-navigation.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,require,Date:{now:()=>0}});
 await module.exports.moveCourtyard(page,...seed.target,(_p,pulse)=>{events.push(['guard',pulse.key]);assert(courtyardChordAllowed(pulse));});
 assert.deepEqual(events.filter(e=>e[0]==='press'),[['press','d',16],['press','a',16],['press','s+d',16],['press','w',16]]);
 assert.equal(events.filter(e=>e[0]==='guard').length,4);assert.equal(events.filter(e=>e[0]==='endpoint').length,4);assert.equal(frame,5);
 for(let i=1;i<frames.length;i++)for(const s of Object.values(COURTYARD_SOLIDS))assert(sweptDistance([frames[i-1].x,frames[i-1].y],[frames[i].x,frames[i].y],s)>38);
});
