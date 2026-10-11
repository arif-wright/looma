import assert from 'node:assert/strict';
import { FOOTPRINTS, CHECKPOINT_TARGETS, PLAZA_CHECKPOINTS, DASH_ATTEMPTS, sweptDistance, roomAllows, plazaGeometryIssues, plazaObjectsIssues } from './plaza-contract.mjs';
import { PLAZA_VIEWS, plazaScreenshot } from './screenshots.mjs';
import { phoneGeometryIssues } from './phone-geometry.mjs';
import { townGroundIssues, townBoundaryIssues } from './town-ground.mjs';
import { FLOW_CAP_MS, validSign, validComplete } from './protocol.mjs';
const xy=g=>[g.x,g.y];
const empty=(v,m)=>assert.deepEqual(v,[],m);
const at=(points,label)=>points.find(p=>p.label===label);
export function verifyPlaza(state, cleanup, index) {
  const points=state.checkpoints, motion=state.plazaMotion;
  assert.deepEqual(points.map(p=>p.label),PLAZA_CHECKPOINTS,'All native exploration checkpoints are required in order');
  assert.deepEqual(cleanup.checkpoints,points);
  assert.equal(state.plazaMotionOverflow,false);assert.equal(cleanup.plazaMotionOverflow,false);
  assert(Array.isArray(motion)&&motion.length>=80,'Native post-render movement trace required');
  assert.deepEqual(cleanup.plazaMotion.slice(0,motion.length),motion,'Cleanup preserves original movement trace');
  for(const trace of [motion,cleanup.plazaMotion])trace.forEach((p,i)=>{
    for(const key of ['at','area','x','y'])assert(Number.isFinite(p[key]));
    if(i)assert(p.at>=trace[i-1].at,'Movement observations are chronological');
    if(p.area!==0)return;
    assert(roomAllows(xy(p)),'Native hero stays inside original wall collision boundary');
    const previous=i&&trace[i-1].area===0?xy(trace[i-1]):xy(p);
    for(const polygon of Object.values(FOOTPRINTS))assert(sweptDistance(previous,xy(p),polygon)>=37.5,'Every observed movement segment clears the radius-38 solid (0.5px numeric tolerance)');
  });
  const home=points[0].scene.gameplay, zoom=home.viewportGeometry.camera.zoom;
  assert.equal(home.townArt.objects.find(o=>o.key==='town_ruins_entrance_v1').alpha,1,'Initial entrance opacity is unchanged');
  for(let i=0;i<points.length;i++){
    const p=points[i],g=p.scene?.gameplay;
    assert(g&&p.scene.id===state.scenes.find(s=>!s.destroyed).id);
    const probe=g.plazaProbe;
    assert(probe&&Number.isSafeInteger(probe.id)&&probe.id>0&&Number.isFinite(probe.requestedAt)&&probe.requestedAt<=probe.respondedAt&&probe.respondedAt===g.at,'Fresh explicit post-render probe response required');
    if(i)assert(probe.id>points[i-1].scene.gameplay.plazaProbe.id&&probe.requestedAt>points[i-1].at,'A prior checkpoint probe cannot supply current geometry');
    assert(p.scene.framesAfterCreate>0&&g.at<=p.at&&p.at-g.at<1000,'Checkpoint is a recent genuine rendered frame');
    if(i)assert(p.at>=points[i-1].at);
    assert(motion.some(t=>t.at===g.at&&t.x===g.x&&t.y===g.y&&t.area===g.area),'Checkpoint comes from the native movement trace');
    if(p.label==='plaza-departed') { assert.equal(g.area,1);assert.equal(g.expeditionActive,true);assert.deepEqual(g.plaza,[]);continue; }
    assert.equal(g.area,0);assert.equal(g.expeditionActive,false);
    assert.deepEqual(g.intent,{x:0,y:0},'Every full town probe observes confirmed released keys');
    const target=CHECKPOINT_TARGETS[p.label];
    if(target)assert(Math.abs(g.x-target[0])<=8&&Math.abs(g.y-target[1])<=8,'Settled checkpoint stays inside the unchanged8px native waypoint target');
    assert.equal(p.starts,p.label==='plaza-returned-owned'?1:0);
    if(p.starts===0)assert.equal(g.elapsed,0,'Town exploration never starts the clock');
    empty(townBoundaryIssues(g),'Flat perimeter remains below hero feet');
    empty(plazaObjectsIssues(g),'Exact owned facade transforms, solidity and actor scale');
    empty(plazaGeometryIssues(g,p.label.startsWith('gate-')),'Actual hero and approach features stay readable without zooming out');
    assert.equal(g.viewportGeometry.camera.zoom,zoom,'Exploration never reduces hero zoom to fit buildings');
  }
  if(index===13)for(const label of ['plaza-home','plaza-returned-owned'])empty(phoneGeometryIssues(at(points,label).scene.gameplay.viewportGeometry),'Original home phone containment remains strict');
  for(const [ready,blocked] of [['rear-front-ready','rear-front-walk-blocked'],['endcap-front-ready','endcap-front-walk-blocked']]){
    const a=at(points,ready),b=at(points,blocked);
    assert(b.at-a.at>=600,'Walk input is held long enough to hit a solid');
    assert(Math.hypot(b.scene.gameplay.x-a.scene.gameplay.x,b.scene.gameplay.y-a.scene.gameplay.y)<60,'Walk cannot pass through the facade');
    const target=ready.startsWith('rear')?'rear':'endcap', p=xy(b.scene.gameplay), distance=sweptDistance(p,p,FOOTPRINTS[target]);
    assert(distance>=37.5&&distance<=55,'Walk reaches the real inflated solid boundary within one15fps movement step');
    const held=motion.filter(t=>t.at>a.at&&t.at<=b.at&&t.intent?.x===0&&t.intent?.y===-1);
    assert(held.length>=3&&held.at(-1).at-held[0].at>=400,'Walk blocking includes sustained observed native movement intent');
  }
  // Independent original28x18 room math. Near this edge, the cardinal
  // y−38 probe reaches logical row0 at y=0.5*x−706. No production helper or
  // visual rim dimensions are consulted to establish the collision stop.
  const ready=at(points,'perimeter-ready'), blocked=at(points,'perimeter-wall-blocked');
  const edge=blocked.scene.gameplay, limit=.5*edge.x-706;
  assert(blocked.at-ready.at>=600,'Perimeter walk is held long enough to hit the original wall');
  assert(Math.abs(edge.x-1368)<=8&&edge.y>=limit-.5&&edge.y<=limit+16,'Native walk stops at original radius38 room boundary within one15fps step');
  const held=motion.filter(t=>t.at>ready.at&&t.at<=blocked.at&&t.intent?.x===0&&t.intent?.y===-1);
  assert(held.length>=3&&held.at(-1).at-held[0].at>=400,'Original wall blocking includes sustained observed native north intent');
  for(const attempt of DASH_ATTEMPTS){
    const before=at(points,attempt.before),after=at(points,attempt.after);
    const events=motion.flatMap((p,i)=>i&&p.at>=before.scene.gameplay.at&&p.at<=after.at&&p.dash?.cd>=200&&motion[i-1].dash?.cd<=50?[{p,prev:motion[i-1]}]:[]);
    assert.equal(events.length,1,'Exactly one actual dash cooldown activation per attempt');
    const {p,prev}=events[0],dir=p.dash.lastDir;
    assert(Math.abs(dir.x-attempt.direction[0])<.001&&Math.abs(dir.y-attempt.direction[1])<.001,'Native dash direction is the intended crossing direction');
    const start=xy(prev),end=[start[0]+230*dir.x,start[1]+230*dir.y],poly=FOOTPRINTS[attempt.target];
    assert(sweptDistance(start,end,poly)<38,'Dash ray crosses the inflated facade continuously');
    assert(sweptDistance(start,start,poly)>=37.5&&sweptDistance(end,end,poly)>38,'Both dash endpoints are outside the target, rejecting endpoint-only collision');
    assert(roomAllows(end),'Dash endpoint is not blocked by the original room wall');
    for(const [name,other]of Object.entries(FOOTPRINTS))if(name!==attempt.target)assert(sweptDistance(start,end,other)>38,'Dash isolates its target facade from other colliders');
    assert(Math.hypot(p.x-prev.x,p.y-prev.y)<15,'Dash was activated but its swept displacement was blocked');
  }
  for(const [label,id,alpha]of [['rear-back-cutaway','rear',.28],['rear-front-restored','rear',1],['endcap-roof-cutaway','endcap',.28],['endcap-front-restored','endcap',1]]){
    const g=at(points,label).scene.gameplay,upper=g.plaza.find(o=>o.name===`town-plaza-${id}-upper`);
    assert.equal(upper.alpha,alpha,'Upper layer cuts away behind and restores outside occlusion');
    if(alpha===.28)assert(upper.depth>g.townArt.hero.depth,'Behind hero remains visible through translucent upper');
    else assert(upper.depth<g.townArt.hero.depth,'Front hero sorts above overlapping facade');
  }
  for(const label of ['rear-back-cutaway','endcap-roof-cutaway']){
    const g=at(points,label).scene.gameplay,v=g.viewportGeometry;
    assert(Math.abs(v.heroGround.x-v.canvas.width/2)<2,'Far exploration follows the hero at fixed zoom');
  }
  const east=at(points,'gate-east-approach').scene.gameplay,south=at(points,'gate-south-approach').scene.gameplay;
  assert(east.x>1780&&Math.hypot(east.x-1728,east.y-664)<150,'Readability tested approaching gate from east');
  assert.equal(east.townArt.objects.find(o=>o.key==='town_ruins_entrance_v1').alpha,.28,'East approach always exercises entrance cutaway before exact threshold');
  assert(south.y>740&&Math.hypot(south.x-1728,south.y-664)<150,'Readability tested approaching gate from south');
  const arrived=at(points,'gate-arrived'),departed=at(points,'plaza-departed'),returned=at(points,'plaza-returned-owned');
  assert(Math.hypot(arrived.scene.gameplay.x-1728,arrived.scene.gameplay.y-664)<12);
  const arch=arrived.scene.gameplay.townArt.objects.find(o=>o.key==='town_ruins_entrance_v1');
  assert.equal(arch.alpha,arrived.scene.gameplay.y<=664?.28:1,'Gate upper art must cut away when the threshold hero sorts behind it');
  assert.equal(departed.starts,1);assert.equal(departed.scene.gameplay.durationLimit,FLOW_CAP_MS);
  const g=returned.scene.gameplay;assert.equal(g.returned,true);assert.equal(g.outcome,'retreated');assert(g.elapsed>0&&g.elapsed<FLOW_CAP_MS);
  empty(townGroundIssues(g),'Returned town has one owned ground and entrance');
  assert.notEqual(g.townArt.ground.perimeter[0].objectId,home.townArt.ground.perimeter[0].objectId,'Return rebuilds the owned perimeter drawing');
  assert(g.plaza.every(o=>!home.plaza.some(old=>old.objectId===o.objectId)),'Return rebuilds every town-owned image rather than reusing destroyed instances');
  assert(g.plaza.every(o=>o.alpha===1),'All returned town cutaways reset');
  assert.equal(g.townArt.objects.find(o=>o.key==='town_ruins_entrance_v1').alpha,1,'Returned entrance opacity restores');
  assert(Math.hypot(g.x-1472,g.y-536)<1,'Return preserves original spawn');
  const calls=path=>state.api.filter(c=>c.path===path),[start]=calls('/api/games/session/start'),sign=calls('/api/games/sign'),complete=calls('/api/games/session/complete'),player=calls('/api/games/player/state');
  assert.equal(sign.length,1);assert.equal(complete.length,1);assert.equal(player.length,1);
  assert(validSign(sign[0].body)&&validComplete(complete[0].body,sign[0].body));
  assert.equal(complete[0].body.stats.expeditionDurationMs,Math.floor(g.elapsed));assert.equal(complete[0].body.durationMs,Math.max(1000,Math.floor(g.elapsed)));
  assert(start.at>=arrived.at&&start.responseAt<=departed.at&&sign[0].at>=departed.at&&complete[0].at>=sign[0].at&&player[0].at>=complete[0].at&&player[0].at<=returned.at);
  assert.deepEqual(state.visuals.map(v=>v.label),PLAZA_VIEWS.map(v=>plazaScreenshot(index,v)));
  assert.deepEqual(cleanup.visuals,state.visuals);
  for(const [i,visual]of state.visuals.entries()){
    assert.deepEqual(visual.viewport,index===13?{width:390,height:844}:{width:1280,height:900});
    assert(visual.documentWidth>0&&visual.documentWidth<=visual.viewport.width);
    assert(visual.canvas.width>0&&visual.canvas.height>0&&visual.canvas.pixelWidth>0&&visual.canvas.pixelHeight>0&&visual.canvas.x>=-1&&visual.canvas.x+visual.canvas.width<=visual.viewport.width+1);
    const label=['rear-front-ready','rear-back-cutaway','perimeter-wall-blocked','endcap-roof-cutaway','gate-east-approach','gate-arrived','plaza-returned-owned'][i],checkpoint=at(points,label);
    assert.deepEqual(visual.scene.gameplay,checkpoint.scene.gameplay,'Screenshot records its actual movement checkpoint');
    assert.equal(visual.starts,checkpoint.starts);
  }
}
