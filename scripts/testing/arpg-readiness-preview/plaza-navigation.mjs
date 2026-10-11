import { FOOTPRINTS, sweptDistance, roomAllows } from './plaza-contract.mjs';
// Fixture-only native-input steering. The existing eight-pixel target remains
// strict; coarse hosted frames can still skip it and require a safe chord.
// Every route segment with independent ±8px endpoint error still clears the
// approved solids by at least41.14px, exceeding the actor's38px radius.
export const WAYPOINT_TOLERANCE = 8;
export const WAYPOINT_DEADLINE_MS = 6500;
export function waypointKeys(position, x, y) {
  const dx=x-position.x,dy=y-position.y,keys=[];
  if(Math.abs(dx)>WAYPOINT_TOLERANCE)keys.push(dx>0?'d':'a');
  if(Math.abs(dy)>WAYPOINT_TOLERANCE)keys.push(dy>0?'s':'w');
  return keys;
}
export const NAVIGATION_PHASES = {
  rearFront:[[1368,536],[1368,430]],
  rearSide:[[1368,430],[1160,430],[1160,210],[1200,210],[1200,260]],
  rearBack:[[1200,260],[1200,210],[1368,210]],
  perimeter:[[1368,-8]],
  perimeterReturn:[[1368,210]],
  rearRestore:[[1200,210],[1160,210],[1160,430],[1368,430]],
  endcapFront:[[1160,430],[1160,210],[1368,210],[1610,210],[1610,400],[1660,400],[1680,420],[1700,420],[1700,432],[1856,432],[1856,380]],
  endcapSide:[[1856,432],[1700,432],[1700,420],[1680,420],[1660,400],[1610,400],[1610,260],[1640,260]],
  endcapRoof:[[1640,260],[1680,260]],
  endcapRestore:[[1640,260],[1610,260],[1610,400],[1660,400],[1680,420],[1700,420],[1700,432],[1856,432],[1856,380]],
  gateEast:[[1856,432],[2000,432],[2000,600],[1800,600]],
  gateSouth:[[1800,760],[1728,760]]
};

// One native key per bounded pulse, followed by an observed key-release frame.
// No browser round-trip or geometry read occurs while a key remains held.
export function waypointPulse(position, x, y, missedPulses=0) {
  const keys=waypointKeys(position,x,y);if(!keys.length)return null;
  const dx=x-position.x,dy=y-position.y;
  const key=Math.abs(dx)>=Math.abs(dy)?(dx>0?'d':'a'):(dy>0?'s':'w');
  const remaining=Math.max(Math.abs(dx),Math.abs(dy));
  // At 220 world px/s, a far pulse reserves 16 px for frame quantization and
  // key-up quantization, and never holds longer than 240 ms. Fine pulses start
  // at 16 ms. Only an actually unchanged released position increases the next
  // pulse, capped at 48 ms and by remaining distance; no frame is guaranteed.
  const fine=Math.min(48,16*(missedPulses+1),Math.max(16,Math.floor((remaining-8)/.22)));
  const delay=remaining>32?Math.min(240,Math.floor((remaining-16)/.22)):fine;
  return { key, delay };
}

// Success is assessed from the released observation before deadline failure.
export function waypointStep(position,x,y,elapsed,missedPulses=0,history=[]){
  const pulse=waypointPulse(position,x,y,missedPulses);
  if(!pulse)return null;
  if(elapsed>=WAYPOINT_DEADLINE_MS)throw new Error(`Native route stalled before ${x},${y}: ${JSON.stringify(position)}`);
  return waypointCorrection(position,x,y,history)??pulse;
}

const direction=key=>[Number(key==='d')-Number(key==='a'),Number(key==='s')-Number(key==='w')];
const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
function hull(points){
  const sorted=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const half=items=>{const out=[];for(const p of items){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out.slice(0,-1);};
  return [...half(sorted),...half(sorted.toReversed())];
}
// Installed Playwright 1.57 presses a chord sequentially: lateral down,
// primary down, primary up, lateral up. It is not simultaneous delivery.
// This conservative model allows 0..2 rendered frames in EACH held phase.
// It bounds a candidate, not arbitrary scheduling; real motion stays observed.
export function chordEnvelope(position,lateral,primary,bound){
  const u=direction(primary),v=direction(lateral),points=[];
  for(const lead of[0,2])for(const diagonal of[0,2])for(const trail of[0,2])points.push([
    position.x+bound*(v[0]*(lead+trail)+(u[0]+v[0])*diagonal*Math.SQRT1_2),
    position.y+bound*(v[1]*(lead+trail)+(u[1]+v[1])*diagonal*Math.SQRT1_2)
  ]);
  return hull(points);
}
export function safeChordEnvelope(polygon){
  if(polygon.length<3||!polygon.every(roomAllows))return false;
  return Object.values(FOOTPRINTS).every(solid=>
    polygon.every((a,i)=>sweptDistance(a,polygon[(i+1)%polygon.length],solid)>38)&&
    solid.every(vertex=>sweptDistance(vertex,vertex,polygon)>38));
}
export function waypointCorrection(position,x,y,history){
  const [a,b]=history.slice(-2);if(!a||!b||a.delay!==16||b.delay!==16||a.key.includes('+')||b.key.includes('+'))return null;
  const axis=['a','d'].includes(b.key)?'x':'y',other=axis==='x'?'y':'x',target=axis==='x'?x:y,otherTarget=axis==='x'?y:x;
  if(a.key===b.key||!(['a','d'].includes(a.key)===['a','d'].includes(b.key))||Math.abs(position[other]-otherTarget)>8)return null;
  if(b.after.x!==position.x||b.after.y!==position.y||a.after.x!==b.before.x||a.after.y!==b.before.y)return null;
  const skipped=p=>(p.before[axis]-target)*(p.after[axis]-target)<0&&Math.abs(p.before[axis]-target)>8&&Math.abs(p.after[axis]-target)>8;
  if(!skipped(a)||!skipped(b))return null;
  // Start at the farther bracket endpoint. One diagonal component then enters
  // the unchanged band for the measured 21..23px quanta; feedback handles the
  // sequential chord's lateral displacement rather than assuming cancellation.
  if(Math.abs(position[axis]-target)<Math.abs(b.before[axis]-target))return null;
  const q=Math.max(...[a,b].map(p=>Math.abs(p.after[axis]-p.before[axis])));
  if(q<=16||q>24)throw new Error(`Unmodeled native fine-step quantum: ${q}`);
  const primary=axis==='x'?(x>position.x?'d':'a'):(y>position.y?'s':'w');
  const bound=Math.max(24,q*1.25);
  for(const lateral of(axis==='x'?['w','s']:['a','d'])){
    const envelope=chordEnvelope(position,lateral,primary,bound);
    if(safeChordEnvelope(envelope))return {key:`${lateral}+${primary}`,delay:16,correction:{bound,envelope}};
  }
  throw new Error(`No independently safe native chord envelope near ${x},${y}`);
}
export function chordEndpointAllowed(position,pulse){
  if(!pulse.correction)return true;
  if(!Number.isFinite(position.x)||!Number.isFinite(position.y))return false;
  // Numerical hull-boundary roundoff only, not a gameplay/target tolerance.
  return sweptDistance([position.x,position.y],[position.x,position.y],pulse.correction.envelope)<1e-7;
}
