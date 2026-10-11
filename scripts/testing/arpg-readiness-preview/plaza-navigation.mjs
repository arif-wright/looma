// Fixture-only native-input steering. Eight world pixels per axis prevents
// quantized 15/30fps input from oscillating around an unreachable ±3px target.
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
export function waypointStep(position,x,y,elapsed,missedPulses=0){
  const pulse=waypointPulse(position,x,y,missedPulses);
  if(!pulse)return null;
  if(elapsed>=WAYPOINT_DEADLINE_MS)throw new Error(`Native route stalled before ${x},${y}: ${JSON.stringify(position)}`);
  return pulse;
}
