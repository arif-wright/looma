import { roomAllows, sweptDistance } from './plaza-contract.mjs';
import { COURTYARD_SOLIDS } from './courtyard-contract.mjs';
import { waypointPulse, WAYPOINT_DEADLINE_MS } from './plaza-navigation.mjs';

// Independent fixture math. The original room uses five cardinal sample
// points, rounded to 28x18 tiles; this is not a Euclidean circle half-plane.
export const PERIMETER_SETUP = Object.freeze({minX:1360,maxX:1376,minGap:32,maxGap:64});
export const perimeterLimit = x => .5*x-706;
export const perimeterGap = p => p.y-perimeterLimit(p.x);
export const inPerimeterSetup = p => Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&
  p.x>=PERIMETER_SETUP.minX&&p.x<=PERIMETER_SETUP.maxX&&perimeterGap(p)>=32&&perimeterGap(p)<=64;
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-7;
const xy=p=>[p.x,p.y];
const tile=([x,y])=>({tx:Math.round(((x-1152)/64+(y+200)/32)/2),ty:Math.round(((y+200)/32-(x-1152)/64)/2)});
const interior=t=>t.tx>=1&&t.tx<=26&&t.ty>=1&&t.ty<=16;
export function northRoomAttempt(start,delta) {
  const end=[start.x,start.y-220*(delta/1000)];
  const probes=[[0,0],[38,0],[-38,0],[0,38],[0,-38]].map(([dx,dy])=>tile([end[0]+dx,end[1]+dy]));
  return {end,isolatedNorth:interior(probes[0])&&probes[4].ty===0&&probes.every(t=>interior(t)||(t.tx>=1&&t.tx<=26&&t.ty===0))};
}
export function perimeterPositionIssues(p,setup=false) {
  const issues=[];
  if(!p||!['at','x','y'].every(k=>Number.isFinite(p[k])))return ['Nonfinite perimeter sample'];
  const f=p.courtyardFrame,m=f?.movement,v=m?.velocity;
  if(!Number.isSafeInteger(f?.frame)||f.frame<0||!Number.isFinite(f?.delta)||f.delta<=0)issues.push('Perimeter requires actual positive engine delta and frame');
  if(!m||m.initialized!==true||m.ended!==false||m.runState!=='running'||m.sceneStatus!==5||m.pendingDestroy!==false||
    !Number.isSafeInteger(m.playerId)||m.playerId<=0||!Number.isSafeInteger(m.sceneId)||m.sceneId<=0||!Number.isSafeInteger(m.areaEpoch)||m.areaEpoch<0||!Number.isFinite(m.hp)||m.hp<=0)issues.push('Perimeter requires a live healthy initialized running scene');
  if(!v||v.speed!==220||!Number.isFinite(v.vx)||!Number.isFinite(v.vy))issues.push('Perimeter requires actual speed220 and post-update velocity');
  if(p.area!==0||Math.abs(p.x-1368)>8||!roomAllows(xy(p)))issues.push('Perimeter leaves original town / radius38 room / x band');
  if(p.intent?.x!==0||![-1,0].includes(p.intent?.y))issues.push('Perimeter permits native north or neutral intent only');
  if(p.dash?.timer!==0||p.dash?.cd!==0)issues.push('Perimeter requires no dash activation or active cooldown');
  if(setup&&(p.y>218||perimeterGap(p)<32))issues.push('Perimeter setup left the strictly clear north-only lane or overshot its region');
  for(const[name,poly]of Object.entries(COURTYARD_SOLIDS))if(!(sweptDistance(xy(p),xy(p),poly)>38))issues.push(`Perimeter is not strictly clear of ${name}`);
  return issues;
}
// Complete contiguous slices only. Nothing filters away neutral frames, skipped
// updates, lifecycle transitions, contrary input, or intermediate excursions.
export function perimeterTraceIssues(trace,{setup=false,challenge=false}={}) {
  if(!Array.isArray(trace)||!trace.length||trace.length>12000)return ['Missing or excessive perimeter trace'];
  const issues=[],first=trace[0],identity=first.courtyardFrame?.movement;
  let approach=0,blocks=0,holding=false,released=false;
  for(const[pIndex,p]of trace.entries()){
    issues.push(...perimeterPositionIssues(p,setup));
    const m=p.courtyardFrame?.movement,v=m?.velocity;
    if(identity&&m&&['sceneId','playerId','areaEpoch'].some(k=>m[k]!==identity[k]))issues.push('Perimeter scene/player/area identity changed');
    if(!pIndex){
      if(p.intent?.x!==0||p.intent?.y!==0||v?.vx!==0||v?.vy!==0)issues.push('Initial perimeter anchor must be released with zero velocity');
      continue;
    }
    const prev=trace[pIndex-1];
    if(!(p.at>prev.at)||p.courtyardFrame?.frame!==prev.courtyardFrame?.frame+1)issues.push('Perimeter needs every contiguous chronological engine frame');
    if(p.x!==prev.x)issues.push('Perimeter cannot move laterally');
    for(const[name,poly]of Object.entries(COURTYARD_SOLIDS))if(!(sweptDistance(xy(prev),xy(p),poly)>38))issues.push(`Perimeter actual sweep intersects ${name}`);
    if(p.intent?.y===0){
      if(p.x!==prev.x||p.y!==prev.y||v?.vx!==0||v?.vy!==0)issues.push('Released perimeter frame must retain position and zero velocity');
      if(holding)released=true;
      continue;
    }
    if(p.intent?.y!==-1)continue;
    if(challenge&&released)issues.push('Perimeter hold must be one uninterrupted native north interval');
    holding=true;
    const {end,isolatedNorth}=northRoomAttempt(prev,p.courtyardFrame?.delta);
    const clearSolids=Object.values(COURTYARD_SOLIDS).every(poly=>sweptDistance(xy(prev),end,poly)>38);
    if(!clearSolids)issues.push('Perimeter attempted sweep must isolate the room from every facade');
    if(roomAllows(end)){
      if(!close(p.y,end[1])||p.x!==end[0]||!close(v?.vx,0)||!close(v?.vy,-193.6))issues.push('Unblocked north step contradicts measured delta / post-friction velocity');
      approach+=prev.y-p.y;
    }else{
      if(setup)issues.push('Perimeter setup must arrive before any room collision');
      if(!isolatedNorth)issues.push('Attempt must hit only the original north row0 border with its center still interior');
      if(p.x!==prev.x||p.y!==prev.y||v?.vx!==0||v?.vy!==0)issues.push('Blocked north step must record unchanged position and zero rollback velocity');
      if(challenge&&blocks===0&&approach<8)issues.push('Perimeter requires at least8px genuine approach before first block');
      blocks++;
    }
  }
  if(challenge&&blocks<2)issues.push('Perimeter requires at least two actual attempted north collisions');
  return issues;
}
export function perimeterSetupStep(p,elapsed,missedPulses=0) {
  const issues=perimeterPositionIssues(p,true);
  if(p?.intent?.x!==0||p?.intent?.y!==0)issues.push('Perimeter setup requires a fresh neutral receipt');
  if(issues.length)throw Error(issues.join('; '));
  if(inPerimeterSetup(p))return null;
  if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=WAYPOINT_DEADLINE_MS)throw Error(`Native perimeter setup stalled: ${JSON.stringify(p)}`);
  // The old incidental exact y is replaced only here. Current x is fixed;
  // ordinary target bands, steering, chords and all other routes are unchanged.
  const pulse=waypointPulse(p,p.x,perimeterLimit(p.x)+48,missedPulses);
  if(!pulse||pulse.key!=='w')throw Error('Unexpected perimeter setup direction');
  return pulse;
}
