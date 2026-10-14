// OFFLINE source model only. No browser, clock injection, fixture observation,
// collision modification, synthetic acceptance receipt or hosted proof.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {waypointStep,chordEndpointAllowed,NAVIGATION_PHASES} from './plaza-navigation.mjs';
import {FOOTPRINTS,sweptDistance,roomAllows} from './plaza-contract.mjs';
import {COURTYARD_SOLIDS} from './courtyard-contract.mjs';
import {endcapRecoveryPlan,endcapStagingChord,verifyEndcapStagingFrames,verifyEndcapReturnLane} from './endcap-staging.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const ts=createRequire(import.meta.url)('typescript');
const sourceRoot='../../../src/lib/games/arpg/';
function compile(source){
 const module={exports:{}};
 const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(output,{module,exports:module.exports,require:name=>{throw Error(`Unexpected source-model import: ${name}`);}});
 return module.exports;
}
// Execute actual pure production movement and swept-circle code. Rendering,
// Phaser scheduling, cutaways, challenges and settlement are outside this model.
const {movementSystem}=compile(read(sourceRoot+'ecs/systems.ts'));
const {crossesTownFootprint}=compile(read(sourceRoot+'townPlaza.ts').split('export const TOWN_CUTAWAY_ALPHA')[0].replace(/^import .*\n/gm,''));
const {TOWN_FACADES}=compile(read(sourceRoot+'assets/townFacadeData.ts'));
const cornerAST=ts.createSourceFile('townCorner.ts',read(sourceRoot+'assets/townCorner.ts'),ts.ScriptTarget.Latest,true);
const layout=cornerAST.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(cornerAST)==='TOWN_CORNER_LAYOUT'));
const {TOWN_CORNER_LAYOUT}=compile(layout.getText(cornerAST));
export const sourceFootprints=Object.fromEntries(TOWN_FACADES.map(f=>[f.id,f.footprint.map(p=>[p.x+f.contact.x,p.y+f.contact.y])]));
sourceFootprints.shop=TOWN_CORNER_LAYOUT.shopFootprint.map(p=>[p.x+1664,p.y+568]);
assert.deepEqual(JSON.parse(JSON.stringify(sourceFootprints)),FOOTPRINTS);
export const replay=JSON.parse(read('./endcap-staging-replay.json'));
export const measuredQuantum=Math.max(...replay.history.map(h=>Math.abs(h.after.x-h.before.x)));
export const stagedTail=()=>NAVIGATION_PHASES.endcapSide.slice(5);
export const throughGate=()=>[...stagedTail(),...NAVIGATION_PHASES.endcapRoof,...NAVIGATION_PHASES.endcapRestore,...NAVIGATION_PHASES.gateEast,...NAVIGATION_PHASES.gateSouth,[1728,664]];
const direction=k=>[Number(k==='d')-Number(k==='a'),Number(k==='s')-Number(k==='w')];
const solids=Object.entries(COURTYARD_SOLIDS);
export function envelopeDistances(polygon){
 return Object.fromEntries(solids.map(([name,solid])=>[name,Math.min(...polygon.map((a,i)=>sweptDistance(a,polygon[(i+1)%polygon.length],solid)),...solid.map(p=>sweptDistance(p,p,polygon)))]));
}
export function motion(position,at,frame,intent={x:0,y:0},delta=measuredQuantum/.22){
 return {x:position.x,y:position.y,at,area:0,intent,dash:{cd:0,timer:0},courtyardFrame:{frame,delta,hero:{},movement:{sceneId:1,playerId:1,areaEpoch:0,initialized:true,ended:false,runState:'running',sceneStatus:5,pendingDestroy:false,hp:140,velocity:{vx:intent.x*220*.88,vy:intent.y*220*.88,speed:220}}}};
}
export function simulateEndcap({start=replay.releasedPosition,points=stagedTail(),quanta=[measuredQuantum],phases=[1,1,1],recover=false,northFrames=1,readLag=0,seedHistory=[],overshootFrames=0,initialElapsed=0,keepTrace=false}={}){
 const p={x:start.x,y:start.y},arrivals=[],trace=[],recoveries=[];
 let quantumIndex=0,frame=1,at=0,commands=0,corrections=0,minimum=Infinity,envelopeMinimum=Infinity,maxLeg=0,activeTarget=null,current=motion(p,at,frame);
 const summary=()=>({position:{...p},arrivals,commands,corrections,minimum,envelopeMinimum,maxLeg,recoveries,...(keepTrace?{trace}:{})});
 try{
 for(const [leg,[x,y]]of points.entries()){
  activeTarget=[x,y];let elapsed=leg===0?initialElapsed:0,misses=0,recoveryUsed=false;const history=leg===0?structuredClone(seedHistory):[];
  const dispatch=(pulse,stage=null,plan=null)=>{
   const before={...p},initial=current,frames=[current],event={leg,target:[x,y],before,pulse,stage,updates:[]};if(keepTrace)trace.push(event);
   commands++;assert(commands<2000);const dt=quanta[quantumIndex%quanta.length]/.22;elapsed+=dt+readLag;
   const update=(keys,count)=>{
    const vector=keys.map(direction).reduce((a,b)=>[a[0]+b[0],a[1]+b[1]],[0,0]),length=Math.hypot(...vector),intent={x:vector[0]/length,y:vector[1]/length};
    for(let n=0;n<count;n++){
     const q=quanta[quantumIndex++%quanta.length],a=[p.x,p.y],velocity={vx:intent.x*220,vy:intent.y*220,speed:220};
     movementSystem({forEachMovement:fn=>fn(1,p,velocity)},q/.22);
     const b=[p.x,p.y],distances=Object.fromEntries(solids.map(([name,poly])=>[name,sweptDistance(a,b,poly)]));
     elapsed+=q/.22;at+=q/.22;current=motion(p,at,++frame,intent,q/.22);frames.push(current);minimum=Math.min(minimum,...Object.values(distances));
     for(const [name,poly]of solids)assert.equal(crossesTownFootprint({x:a[0],y:a[1]},p,38,poly.map(([x,y])=>({x,y}))),distances[name]<=38);
     if(keepTrace)event.updates.push({keys,before:a,after:b,q,distances});
     assert(minimum>38,`Unsafe proposed sweep at ${x},${y}: ${JSON.stringify(distances)}`);assert(roomAllows(b));
    }
   };
   if(pulse.correction){
    corrections++;envelopeMinimum=Math.min(envelopeMinimum,...Object.values(envelopeDistances(pulse.correction.envelope)));assert(envelopeMinimum>38);
    const [lateral,primary]=pulse.key.split('+');update([lateral],phases[0]);update([lateral,primary],phases[1]);update([lateral],phases[2]);elapsed+=400+pulse.delay;
   }else update([pulse.key],stage==='north'?northFrames:Math.max(1,Math.round(pulse.delay/dt))+overshootFrames);
   assert(chordEndpointAllowed(p,pulse));elapsed+=dt+readLag;at+=dt;current=motion(p,at,++frame);frames.push(current);
   if(stage){elapsed+=dt+readLag;assert(elapsed<6500,'Endcap staging exhausted original 6500ms waypoint deadline');verifyEndcapStagingFrames(frames,initial,current,plan,pulse);}
   misses=p.x===before.x&&p.y===before.y?misses+1:0;history.push({key:pulse.key,delay:pulse.delay,before,after:{...p}});if(history.length>2)history.shift();
   if(keepTrace){event.after={...p};event.elapsed=elapsed;event.frames=frames;}
  };
  for(;;){
   let pulse;
   try{pulse=waypointStep(p,x,y,elapsed,misses,history);}
   catch(error){
    if(!recover||leg!==0||recoveryUsed)throw error;
    recoveryUsed=true;const plan=endcapRecoveryPlan(error,p,x,y,elapsed,history);if(!plan)throw error;
    const record={originalRefusal:error.message,originalTarget:[x,y],position:{...p},elapsedBefore:elapsed,plan};recoveries.push(record);
    dispatch(plan.north,'north',plan);dispatch(endcapStagingChord(p,plan),'chord',plan);record.returnLane=verifyEndcapReturnLane(p,plan);record.elapsedAfter=elapsed;continue;
   }
   if(!pulse){assert(Math.abs(p.x-x)<=8&&Math.abs(p.y-y)<=8);arrivals.push({target:[x,y],position:{...p},elapsed});maxLeg=Math.max(maxLeg,elapsed);break;}
   dispatch(pulse);
  }
 }
 return {passed:true,...summary()};
 }catch(error){return {passed:false,error:error.message,target:activeTarget,...summary()};}
}
