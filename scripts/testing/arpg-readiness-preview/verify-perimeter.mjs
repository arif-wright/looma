import assert from 'node:assert/strict';
import { inPerimeterSetup, perimeterLimit, perimeterTraceIssues } from './perimeter-contract.mjs';
const fields=['at','area','x','y','intent','dash','courtyardFrame'];
function anchoredSlice(before,after,motion) {
  const a=before.scene.gameplay,b=after.scene.gameplay;
  assert.equal(before.scene.id,after.scene.id,'Perimeter retains its original scene');
  const start=motion.findIndex(p=>p.at===a.at),end=motion.findIndex(p=>p.at===b.at);
  assert(start>=0&&end>start,'Perimeter needs complete start and end frame anchors');
  assert.equal(motion.filter(p=>p.at===a.at).length,1,'Start frame anchor must be unique');
  assert.equal(motion.filter(p=>p.at===b.at).length,1,'End frame anchor must be unique');
  for(const[g,p]of [[a,motion[start]],[b,motion[end]]])for(const key of fields)assert.deepEqual(g[key],p[key],`Perimeter checkpoint ${key} must equal its complete native frame`);
  assert.deepEqual(a.intent,{x:0,y:0});assert.deepEqual(b.intent,{x:0,y:0});
  return motion.slice(start,end+1);
}
export function verifyPerimeter(rear,ready,blocked,motion) {
  const setup=anchoredSlice(rear,ready,motion),trace=anchoredSlice(ready,blocked,motion);
  assert(Math.abs(setup[0].x-1368)<=8&&Math.abs(setup[0].y-210)<=8,'Perimeter setup starts at the unchanged rear-back checkpoint');
  assert.deepEqual(perimeterTraceIssues(setup,{setup:true}),[],'Complete native setup must stay safe and reconstruct its measured motion');
  assert(inPerimeterSetup(ready.scene.gameplay),'Released perimeter setup must be inside the bounded gap32..64 strip');
  assert(blocked.at-ready.at>=600,'Perimeter walk is held long enough to hit the original wall');
  const edge=blocked.scene.gameplay;
  assert(Math.abs(edge.x-1368)<=8&&edge.y>=perimeterLimit(edge.x)-.5,'Original perimeter x band and lower boundary tolerance remain strict');
  const held=trace.filter(t=>t.at>ready.at&&t.at<=blocked.at&&t.intent?.x===0&&t.intent?.y===-1);
  assert(held.length>=3&&held.at(-1).at-held[0].at>=400,'Original wall blocking includes sustained observed native north intent');
  assert.deepEqual(perimeterTraceIssues(trace,{challenge:true}),[],'Every measured native step must prove approach or isolated north-room collision with observed rollback');
}
