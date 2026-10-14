// Bounded fixture-only recovery after the original guard refuses the original
// endcapSide [1610,400] waypoint. No successful controller decision is replaced.
import {waypointCorrection,chordEnvelope,safeChordEnvelope,chordEndpointAllowed,WAYPOINT_DEADLINE_MS} from './plaza-navigation.mjs';
import {sweptDistance,roomAllows} from './plaza-contract.mjs';
import {COURTYARD_SOLIDS} from './courtyard-contract.mjs';
export const ENDCAP_REFUSAL='No independently safe native chord envelope near 1610,400';
const xy=p=>[p.x,p.y],close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-7;
const clear=(a,b)=>roomAllows(a)&&roomAllows(b)&&Object.values(COURTYARD_SOLIDS).every(poly=>sweptDistance(a,b,poly)>38);
const fail=message=>{throw new Error(`Endcap staging rejected: ${message}`);};
export function endcapRecoveryPlan(error,p,x,y,elapsed,history){
 if(error?.message!==ENDCAP_REFUSAL||x!==1610||y!==400||elapsed>=WAYPOINT_DEADLINE_MS)return null;
 if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y)||p.x<=1618||Math.abs(p.y-400)>8)return null;
 // Independently establish that this exact history really hits the original
 // refusal. A matching error string by itself never authorizes movement.
 let refused=false;
 try{waypointCorrection(p,x,y,history);}catch(e){refused=e?.message===ENDCAP_REFUSAL;}
 if(!refused)return null;
 const last=history.slice(-2);if(last.length!==2||last.some(h=>!['a','d'].includes(h.key)))return null;
 const q=Math.max(...last.map(h=>Math.abs(h.after.x-h.before.x)));
 if(!Number.isFinite(q)||q<=16||q>24)return null;
 const bound=Math.max(24,q*1.25),end=[p.x,p.y-2*bound];
 if(!clear(xy(p),end))return null;
 return {target:[1610,400],quantum:q,bound,north:{key:'w',delay:16},northSegment:[xy(p),end]};
}
export function endcapStagingChord(p,plan){
 const envelope=chordEnvelope(p,'w','a',plan.bound);
 if(!safeChordEnvelope(envelope)||!Object.values(COURTYARD_SOLIDS).every(solid=>
  envelope.every((a,i)=>sweptDistance(a,envelope[(i+1)%envelope.length],solid)>38)&&solid.every(v=>sweptDistance(v,v,envelope)>38)))fail('no independently safe full chord envelope after north staging');
 return {key:'w+a',delay:16,correction:{bound:plan.bound,envelope}};
}
export function verifyEndcapStagingFrames(frames,initial,final,plan,pulse){
 if(!Array.isArray(frames)||frames.length<2||frames.length>12000)fail('missing or excessive contiguous motion');
 if(frames[0].at!==initial.at||frames[0].x!==initial.x||frames[0].y!==initial.y||frames.at(-1).at!==final.at||frames.at(-1).x!==final.x||frames.at(-1).y!==final.y)fail('motion does not cover both observed endpoints');
 if(initial.intent?.x!==0||initial.intent?.y!==0||final.intent?.x!==0||final.intent?.y!==0)fail('both endpoints must be freshly neutral');
 const identity=initial.courtyardFrame?.movement;
 let moving=0,north=0,diagonal=0,progress=0;
 for(const [index,p]of frames.entries()){
  const f=p.courtyardFrame,m=f?.movement,v=m?.velocity;
  if(!Number.isFinite(p.at)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.area!==0||!Number.isSafeInteger(f?.frame)||f.frame<0||!Number.isFinite(f.delta)||f.delta<=0)fail('invalid native frame');
  if(!m||!identity||m.sceneId<=0||m.playerId<=0||m.areaEpoch<0||m.initialized!==true||m.ended!==false||m.runState!=='running'||m.sceneStatus!==5||m.pendingDestroy!==false||!Number.isFinite(m.hp)||m.hp<=0||!v||v.speed!==220||
   ['sceneId','playerId','areaEpoch'].some(k=>!Number.isSafeInteger(m[k])||m[k]!==identity[k]))fail('native scene/player state changed');
  if(p.dash?.timer!==0||p.dash?.cd!==0)fail('staging requires an inactive dash');
  const neutral=p.intent?.x===0&&p.intent?.y===0,up=p.intent?.x===0&&p.intent?.y===-1,diag=close(p.intent?.x,-Math.SQRT1_2)&&close(p.intent?.y,-Math.SQRT1_2);
  if(!neutral&&!up&&!(pulse.correction&&diag))fail('unexpected native direction');
  if(!close(v.vx,p.intent.x*220*.88)||!close(v.vy,p.intent.y*220*.88))fail('post-update native velocity disagrees');
  if(!index)continue;
  const prev=frames[index-1];
  if(!(p.at>prev.at)||f.frame!==prev.courtyardFrame.frame+1)fail('motion must include every contiguous frame');
  const dx=p.x-prev.x,dy=p.y-prev.y,q=Math.hypot(dx,dy);
  if(!close(dx,p.intent.x*220*f.delta/1000)||!close(dy,p.intent.y*220*f.delta/1000))fail('source-based frame displacement disagrees');
  if(q>24)fail('native frame quantum exceeds unchanged 24px cap');
  if(!clear(xy(prev),xy(p)))fail('actual sweep fails strict radius38 geometry');
  if(pulse.correction){if(!chordEndpointAllowed(p,pulse))fail('intermediate motion escaped original full chord envelope');}
  else if(p.x!==initial.x||p.y>initial.y||p.y<plan.northSegment[1][1])fail('north staging escaped its independently safe segment');
  if(!neutral){moving++;if(up)north++;else diagonal++;progress+=q;}
 }
 if(!progress)fail('native pulse made no observed progress');
 if(pulse.correction?(moving>6||north>4||diagonal>2):(moving>2||diagonal!==0))fail('native held phases exceeded conservative frame count');
 return {frames:frames.length,moving,north,diagonal,progress};
}
export function verifyEndcapReturnLane(p,plan){
 if(Math.abs(p.x-plan.target[0])>8)fail('chord did not establish the unchanged original x arrival band');
 // Require a clear vertical return lane through the original target, including
 // two conservative bound-sized frames beyond it. This only rejects recovery;
 // the unchanged controller must still observe its actual ±8px final arrival.
 if(!clear(xy(p),[p.x,plan.target[1]+2*plan.bound]))fail('no strict clear lane back through original target');
 return {x:p.x,target:plan.target,lane:[xy(p),[p.x,plan.target[1]+2*plan.bound]]};
}
