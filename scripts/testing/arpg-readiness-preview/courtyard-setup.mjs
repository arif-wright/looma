import { WEST_INNER_SETUP, COURTYARD_SOLIDS, COURTYARD_LIMITS } from './courtyard-contract.mjs';
import { sweptDistance, roomAllows } from './plaza-contract.mjs';
import { waypointPulse, WAYPOINT_DEADLINE_MS } from './plaza-navigation.mjs';

// A separate bounded region goal, never an alternative ordinary move controller.
// The lane extends north from the wall so the same strict checks cover both the
// initial home approach and the northward retreat from actual blocked-walk poses.
export function westInnerSetupPositionIssues(p) {
  if (!p || !['x','y','at'].every(k=>Number.isFinite(p[k]))) return ['Nonfinite setup observation'];
  const issues=[],point=[p.x,p.y],r=WEST_INNER_SETUP;
  if (p.area!==0 || p.x<r.minX || p.x>r.maxX || p.y<528 || p.y>=.5*p.x+24) issues.push('Setup must stay on the north side in the central vertical lane');
  if (!roomAllows(point)) issues.push('Setup exits original room');
  for (const [name,poly] of Object.entries(COURTYARD_SOLIDS)) if (!(sweptDistance(point,point,poly)>38)) issues.push(`Setup is not strictly clear of ${name}`);
  if (p.dash?.timer!==0) issues.push('Setup cannot contain active dash');
  if (!Number.isSafeInteger(p.courtyardFrame?.frame) || p.courtyardFrame.frame<0 || !Number.isFinite(p.courtyardFrame?.delta) || p.courtyardFrame.delta<0) issues.push('Setup requires an actual native engine frame');
  if (p.intent?.x!==0 || ![-1,0,1].includes(p.intent?.y)) issues.push('Setup permits vertical native intent only');
  return issues;
}
export function inWestInnerSetup(p) {
  const r=WEST_INNER_SETUP;
  return Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=r.minX&&p.x<=r.maxX&&p.y>=r.minY&&p.y<=r.maxY;
}
export function westInnerSetupTraceIssues(trace) {
  if (!Array.isArray(trace)||!trace.length||trace.length>COURTYARD_LIMITS.motion) return ['Missing or excessive setup motion'];
  const issues=[];
  for (const [i,p] of trace.entries()) {
    issues.push(...westInnerSetupPositionIssues(p));
    if (!i) continue;
    const previous=trace[i-1];
    if (!(p.at>previous.at) || p.courtyardFrame?.frame!==previous.courtyardFrame?.frame+1) issues.push('Setup needs fresh contiguous chronological frames');
    if (p.x!==previous.x) issues.push('Setup cannot move laterally');
    if (p.y!==previous.y && (p.courtyardFrame?.delta<=0 || Math.sign(p.y-previous.y)!==p.intent?.y)) issues.push('Setup displacement contradicts observed native intent');
    for (const [name,poly] of Object.entries(COURTYARD_SOLIDS)) if (!(sweptDistance([previous.x,previous.y],[p.x,p.y],poly)>38)) issues.push(`Setup sweep is not strictly clear of ${name}`);
  }
  return issues;
}
export function westInnerSetupStep(p,elapsed,missedPulses=0) {
  const issues=westInnerSetupPositionIssues(p);
  if (p?.intent?.x!==0 || p?.intent?.y!==0) issues.push('Setup requires a fresh neutral receipt');
  if (issues.length) throw Error(issues.join('; '));
  if (inWestInnerSetup(p)) return null; // Released arrival is checked even at the unchanged deadline.
  if (!Number.isFinite(elapsed)||elapsed<0||elapsed>=WAYPOINT_DEADLINE_MS) throw Error(`Native west-inner setup stalled: ${JSON.stringify(p)}`);
  // Current x is deliberate: there is no lateral alignment, chord or correction.
  // Arbitrary frame cadence can still skip this region; such runs must time out.
  const pulse=waypointPulse(p,p.x,(WEST_INNER_SETUP.minY+WEST_INNER_SETUP.maxY)/2,missedPulses);
  if (!pulse || pulse.key!==(p.y<WEST_INNER_SETUP.minY?'s':'w')) throw Error('Unexpected west-inner setup direction');
  return pulse;
}
