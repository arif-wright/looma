import { FOOTPRINTS, sweptDistance, roomAllows } from './plaza-contract.mjs';
import { COURTYARD_FOOTPRINTS } from './courtyard-graphics.mjs';
export const COURTYARD_TITLES = [
  'desktop native courtyard wall blocks shortcuts while both open ends and gate remain usable',
  'phone native courtyard wall blocks shortcuts while both open ends and gate remain usable'
];
export const COURTYARD_LIMITS = Object.freeze({caseMs:600000,legs:64,pulses:1200,motion:12000});
// This explicit goal is limited to the two west-inner challenge preparations.
export const WEST_INNER_SETUP = Object.freeze({minX:1440,maxX:1472,minY:624,maxY:656});
// Only east-inner-ready replaces its incidental near-wall walk preparation.
export const EAST_INNER_SETUP = Object.freeze({minX:1856,maxX:1888,minY:688,maxY:720});
/** @typedef {{kind:'setup',region:'west-inner'|'east-inner',target:'west'|'east',points?:number[][],label:string,view?:string}|{kind:'move',points:number[][],label:string,view?:string}|{kind:'walk'|'dash',key:string,label:string,target:string,view?:string}|{kind:'save'|'depart'|'return',label:string,view?:string}} CourtyardAction */
/** @returns {{kind:'move',points:number[][],label:string,view?:string}} */
const move=(points,label,view)=>({kind:'move',points,label,...(view?{view}: {})});
/** @returns {{kind:'walk',key:string,label:string,target:string,view?:string}} */
const walk=(key,label,target)=>({kind:'walk',key,label,target});
/** @returns {{kind:'dash',key:string,label:string,target:string,view?:string}} */
const dash=(key,label,target,view)=>({kind:'dash',key,label,target,...(view?{view}: {})});
// Ordinary cardinal staircase moves retain the original waypointStep, target
// band, watchdog and conditional correction rules. Only setup uses a region.
/** @type {CourtyardAction[]} */
export const COURTYARD_ACTIONS = [
  {kind:'save',label:'courtyard-home',view:'home'},
  {kind:'setup',region:'west-inner',target:'west',points:[[1456,536]],label:'west-inner-ready',view:'west-inner-ready'},
  walk('s','west-inner-walk-blocked','west'),
  {kind:'setup',region:'west-inner',target:'west',label:'west-inner-dash-ready'},
  dash('s','west-inner-dash-blocked','west','west-inner-blocked'),
  move([[1456,536],[1088,536],[1088,400]],'west-end-forward-ready'),
  dash('s','west-end-forward-dash','west-end','west-end-forward-dash'),
  move([[1088,740]],'west-end-reverse-ready'),
  dash('w','west-end-reverse-dash','west-end','west-end-reverse-dash'),
  move([[1088,400]],'west-walk-inner'),
  move([[1088,704]],'west-walk-outer'),
  move([[1088,400]],'west-walk-inner-return'),
  move([[1088,704],[1120,704],[1120,768],[1216,768],[1216,816],[1312,816],[1312,864],[1456,864]],'west-outer-ready'),
  walk('w','west-outer-walk-blocked','west'),
  move([[1456,864]],'west-outer-dash-ready'),
  dash('w','west-outer-dash-blocked','west','west-outer-blocked'),
  move([[1456,864],[1536,864],[1536,928],[1584,928],[1584,880]],'west-elbow-witness','west-elbow-witness'),
  move([[1584,928],[1664,928],[1664,988],[1728,988]],'elbow-outer-ready'),
  walk('w','elbow-outer-walk-blocked','elbow'),
  move([[1728,988]],'elbow-outer-dash-ready'),
  dash('w','elbow-outer-dash-blocked','elbow','elbow-outer'),
  move([[1728,988],[1872,988],[1872,912]],'east-outer-ready'),
  walk('w','east-outer-walk-blocked','east'),
  move([[1872,912]],'east-outer-dash-ready'),
  dash('w','east-outer-dash-blocked','east','east-outer-blocked'),
  move([[1872,880]],'east-elbow-witness','east-elbow-witness'),
  move([[1872,912],[2112,912]],'east-walk-outer'),
  move([[2112,600]],'east-walk-inner'),
  move([[2112,912]],'east-walk-outer-return'),
  {kind:'save',label:'east-end-reverse-ready'},
  dash('w','east-end-reverse-dash','east-end','east-end-reverse-dash'),
  move([[2112,600]],'east-end-forward-ready'),
  dash('s','east-end-forward-dash','east-end','east-end-forward-dash'),
  {kind:'setup',region:'east-inner',target:'east',points:[[2112,600],[1872,600]],label:'east-inner-ready'},
  walk('s','east-inner-walk-blocked','east'),
  move([[1872,752]],'east-inner-dash-ready'),
  dash('s','east-inner-dash-blocked','east','east-inner-blocked'),
  move([[1872,720],[1728,720],[1728,800]],'elbow-inner-ready'),
  walk('s','elbow-inner-walk-blocked','elbow'),
  move([[1728,800]],'elbow-inner-dash-ready'),
  dash('s','elbow-inner-dash-blocked','elbow','elbow-inner'),
  move([[1728,720],[1872,720],[1872,600],[1800,600]],'gate-east-approach','gate-east-approach'),
  move([[1800,664],[1728,664]],'gate-arrived','gate-arrived'),
  {kind:'depart',label:'courtyard-departed',view:'departed'},
  {kind:'return',label:'courtyard-returned-owned',view:'returned-owned'}
];
export const COURTYARD_VIEWS=COURTYARD_ACTIONS.flatMap(a=>a.view?[a.view]:[]);
export const courtyardScreenshot=(index,view)=>`${index===1?'phone':'desktop'}-courtyard-${view}`;
export const COURTYARD_SOLIDS={...FOOTPRINTS,west:COURTYARD_FOOTPRINTS[0],east:COURTYARD_FOOTPRINTS[1]};
export const courtyardDirection=key=>[Number(key==='d')-Number(key==='a'),Number(key==='s')-Number(key==='w')];
export function courtyardChordAllowed(pulse){
  if(!pulse.correction)return true;
  const hull=pulse.correction.envelope;
  return Array.isArray(hull)&&hull.length>=3&&hull.every(roomAllows)&&COURTYARD_FOOTPRINTS.every(poly=>
    hull.every((a,i)=>sweptDistance(a,hull[(i+1)%hull.length],poly)>38)&&poly.every(p=>sweptDistance(p,p,hull)>38));
}
export function courtyardTraceIssues(trace){
  const issues=[];
  if(!Array.isArray(trace)||!trace.length||trace.length>COURTYARD_LIMITS.motion)return ['Missing or excessive native motion'];
  for(let i=0;i<trace.length;i++){
    const p=trace[i],prev=trace[i-1];
    if(!['at','area','x','y'].every(k=>Number.isFinite(p?.[k]))||!Number.isFinite(p.intent?.x)||!Number.isFinite(p.intent?.y)){issues.push('Invalid native motion');continue;}
    if(prev&&prev.area===p.area&&p.courtyardFrame?.delta===0&&(p.x!==prev.x||p.y!==prev.y))issues.push('Movement cannot occur with zero engine delta');
    if(!Number.isSafeInteger(p.courtyardFrame?.frame)||p.courtyardFrame.frame<0||(prev&&p.courtyardFrame.frame<=prev.courtyardFrame?.frame))issues.push('Invalid or repeated native engine frame');
    if(!p.dash||![p.dash.cd,p.dash.timer,p.dash.lastDir?.x,p.dash.lastDir?.y].every(Number.isFinite)||p.dash.cd<0||p.dash.timer<0||Math.abs(p.dash.lastDir.x)>1||Math.abs(p.dash.lastDir.y)>1)issues.push('Invalid native dash receipt');
    if(![0,1].includes(p.area))issues.push('Unsupported area in native trace');
    if(prev&&p.at<=prev.at)issues.push('Nonchronological native motion');
    if(p.area!==0)continue;
    const b=[p.x,p.y],a=prev?.area===0?[prev.x,prev.y]:b;
    if(!roomAllows(b))issues.push('Original room boundary crossed');
    for(const[name,poly]of Object.entries(COURTYARD_SOLIDS))if(sweptDistance(a,b,poly)<37.5)issues.push(`Observed radius-38 sweep crosses ${name}`);
  }return issues;
}
