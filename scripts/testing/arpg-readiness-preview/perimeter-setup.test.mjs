// Mocked native calls and fabricated frames; no browser launch or runtime proof.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {perimeterSetupStep,perimeterTraceIssues} from './perimeter-contract.mjs';
const ts=createRequire(import.meta.url)('typescript'),read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const make=(y=210,at=100,frame=1,intent=0,delta=16)=>({x:1368,y,at,area:0,intent:{x:0,y:intent},dash:{cd:0,timer:0,lastDir:{x:0,y:-1}},courtyardFrame:{frame,delta,hero:{},movement:{sceneId:1,initialized:true,ended:false,runState:'running',playerId:1,areaEpoch:1,sceneStatus:5,pendingDestroy:false,hp:140,velocity:{vx:0,vy:intent?-193.6:0,speed:220}}}});
const standard=()=>[make(),make(26,200,2,-1,184/.22),make(26,201,3)];
const js=ts.transpileModule(read('./perimeter-setup.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function mocked({trace=standard(),frames=[trace[0],trace.at(-1)],times=[0,1,2],overflow=false,reset=false,pressError=null,readError=null,neutralError=null}={}) {
 const events=[],fixture={plazaMotion:[],plazaMotionOverflow:overflow,scenes:[{id:1,pageId:1,destroyed:false}]};let fi=0,ti=0,reads=0;
 const page={keyboard:{press:async(key,{delay})=>{events.push(['press',key,delay]);if(pressError)throw pressError;}},evaluate:async(fn,args)=>{
  events.push(['trace']);if(readError)throw readError;if(reset&&reads++)fixture.scenes[0].id++;
  return vm.runInNewContext(`(${fn.toString()})(args)`,{window:{__arpgFixture:fixture},args});
 }};
 const module={exports:{}},require=name=>name==='./plaza-browser'?{
  release:async()=>events.push(['release']),releasedFrame:async()=>{
   events.push(['neutral']);if(neutralError&&fi>0)throw neutralError;const p=frames[fi++];if(!p)throw Error('No next mocked receipt');fixture.plazaMotion=trace.filter(t=>t.at<=p.at);return p;
  }
 }:name==='./perimeter-contract.mjs'?{perimeterSetupStep,perimeterTraceIssues}:(()=>{throw Error('Unexpected import');})();
 vm.runInNewContext(js,{module,exports:module.exports,require,Date:{now:()=>{const t=times[Math.min(ti++,times.length-1)];events.push(['clock',t]);return t;}}});
 return {run:()=>module.exports.setupPerimeter(page),events};
}
test('actual helper issues only original bounded north pulse and waits for neutral receipt',async()=>{
 const m=mocked();await m.run();assert.deepEqual(m.events.filter(e=>e[0]==='press'),[['press','w',240]]);assert.equal(m.events.filter(e=>e[0]==='neutral').length,2);assert(!m.events.some(e=>e[0]==='release'));
});
test('setup clock starts before initial reads and never resets after positive progress',async()=>{
 const trace=[make(),make(100,200,2,-1,110/.22),make(100,201,3)];const m=mocked({trace,times:[100,101,6600]});await assert.rejects(m.run(),/stalled/);assert.deepEqual(m.events[0],['clock',100]);assert.equal(m.events.filter(e=>e[0]==='press').length,1);assert.deepEqual(m.events.at(-1),['release']);
});
test('arrival at6500 succeeds; outside region at6500 emits no new input',async()=>{
 const accepted=mocked({trace:[make(26)],times:[100,6600]});await accepted.run();assert(!accepted.events.some(e=>e[0]==='press'));
 const denied=mocked({trace:[make()],times:[100,6600]});await assert.rejects(denied.run(),/stalled/);assert(!denied.events.some(e=>e[0]==='press'));
});
for(const[name,options,pattern]of[
 ['native press',{pressError:Error('press failed')},/press failed/],['trace read',{readError:Error('trace failed')},/trace failed/],
 ['fresh neutral watchdog',{neutralError:Error('watchdog')},/watchdog/],['overflow',{overflow:true},/overflowed/],['scene reset',{reset:true},/identity changed/]
])test(`setup ${name} failure performs exhaustive cleanup`,async()=>{const m=mocked(options);await assert.rejects(m.run(),pattern);assert.deepEqual(m.events.at(-1),['release']);});
for(const[name,mutate,pattern]of[
 ['missing intermediate frame',t=>t.splice(1,1),/contiguous/],
 ['overshot strip',t=>{t[1].y=0;t[1].courtyardFrame.delta=210/.22;t[2].y=0;},/overshot/],
 ['wrong native direction',t=>t[1].intent.y=1,/north or neutral/],
 ['hidden excursion',t=>t[1].y=-100,/original town|setup/],
 ['unmodeled motion',t=>t[1].courtyardFrame.delta=1,/Unblocked/],
 ['paused state',t=>t[1].courtyardFrame.movement.runState='paused',/live healthy/]
])test(`setup rejects ${name} before success or another pulse`,async()=>{const trace=standard();mutate(trace);const m=mocked({trace});await assert.rejects(m.run(),pattern);assert.equal(m.events.filter(e=>e[0]==='press').length,1);assert.deepEqual(m.events.at(-1),['release']);});
test('only perimeter invocation changes; native move/hold/release helpers stay literal-preserved',()=>{
 const driver=read('./plaza-browser.ts'),helper=read('./perimeter-setup.ts');assert.equal((driver.match(/await setupPerimeter\(page\)/g)||[]).length,1);
 assert.match(driver,/await setupPerimeter\(page\);await save\('perimeter-ready'\);\n    await walkInto\(page,'w'\);await save\('perimeter-wall-blocked','perimeter-edge-feet'\);\n    await route\(page,NAVIGATION_PHASES.perimeterReturn\);/);
 assert.equal((helper.match(/const startedAt=Date\.now\(\)/g)||[]).length,1);assert.doesNotMatch(helper,/keyboard\.(down|up)|waitForTimeout|setPosition|world\.getTransform|setTimeout|\.emit\(/);
 assert.match(driver,/No fresh neutral native frame within 3000 ms/);
});
