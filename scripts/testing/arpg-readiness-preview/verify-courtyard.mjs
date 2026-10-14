import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { COURTYARD_ACTIONS, COURTYARD_LIMITS, COURTYARD_VIEWS, COURTYARD_SOLIDS, WEST_INNER_SETUP, courtyardDirection, courtyardTraceIssues, courtyardScreenshot } from './courtyard-contract.mjs';
import { courtyardGraphicsIssues, courtyardOwnershipIssues } from './courtyard-graphics.mjs';
import { sweptDistance, roomAllows, plazaObjectsIssues, plazaGeometryIssues, PLAZA_KEYS } from './plaza-contract.mjs';
import { townGroundIssues, townBoundaryIssues, townBackdropIssues } from './town-ground.mjs';
import { phoneGeometryIssues } from './phone-geometry.mjs';
import { expectedStart, validSign, validComplete, FLOW_CAP_MS, EXPECTED_REWARD_MUTATIONS } from './protocol.mjs';
const empty=(v,m)=>assert.deepEqual(v,[],m),xy=p=>[p.x,p.y];
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
const targetNames=target=>target==='elbow'?['west','east']:[target];
export function verifyCourtyardAction(action,before,after,motion){
  if(!['walk','dash'].includes(action.kind))return;
  const a=before.scene.gameplay,b=after.scene.gameplay,dir=courtyardDirection(action.key);
  const samples=motion.filter(p=>p.at>a.at&&p.at<=b.at&&p.area===0);
  assert(samples.length>=3,'Physical attempt needs multiple native frames');
  if(action.kind==='walk'){
    assert(after.at-before.at>=600,'Original 700ms held walk remains bounded and observed');
    const held=samples.filter(p=>p.intent.x===dir[0]&&p.intent.y===dir[1]);
    assert(held.length>=3&&held.at(-1).at-held[0].at>=400,'Sustained observed native walk intent required');
    const pairs=held.flatMap(p=>{const i=motion.indexOf(p);return i?[{p,prev:motion[i-1]}]:[];});
    assert(pairs.some(({p,prev})=>Math.hypot(p.x-prev.x,p.y-prev.y)>0),'Walk genuinely approaches the wall');
    const blocked=pairs.filter(({p,prev})=>p.x===prev.x&&p.y===prev.y);
    assert(blocked.length>=2,'At least two held frames are blocked');
    assert(pairs.some(({p,prev})=>p.at<blocked[0].p.at&&Math.hypot(p.x-prev.x,p.y-prev.y)>0),'Walk genuinely approaches before its first blocked frame');
    for(const p of held)assert(Number.isFinite(p.courtyardFrame?.delta)&&p.courtyardFrame.delta>0,'Actual engine delta required');
    const targets=targetNames(action.target);
    for(const{p,prev}of blocked){
      assert.equal(p.dash.timer,0,'A held walk is not an active dash');
      const start=xy(prev),end=[prev.x+dir[0]*220*p.courtyardFrame.delta/1000,prev.y+dir[1]*220*p.courtyardFrame.delta/1000];
      assert(roomAllows(start)&&roomAllows(end),'Every blocked walk attempt stays within original convex room boundary');
      for(const[name,poly]of Object.entries(COURTYARD_SOLIDS)){
        assert(sweptDistance(start,start,poly)>=37.5,'Blocked walk starts clear of every solid');
        if(!targets.includes(name))assert(sweptDistance(start,end,poly)>38,`Blocked walk attempt is isolated from ${name}`);
      }
      assert(targets.some(n=>sweptDistance(start,end,COURTYARD_SOLIDS[n])<38),'Every stationary held walk frame actually attempts the intended wall union');
    }
    const maxStep=Math.max(...held.map(p=>220*p.courtyardFrame.delta/1000));
    const distance=Math.min(...targetNames(action.target).map(n=>sweptDistance(xy(b),xy(b),COURTYARD_SOLIDS[n])));
    assert(distance>=37.5&&distance<=38+maxStep+.5,'Walk stops within one actual engine movement step of the unchanged radius');
    return;
  }
  const activations=motion.flatMap((p,i)=>i&&p.at>a.at&&p.at<=b.at&&p.area===0&&p.dash?.cd>=200&&motion[i-1].dash?.cd<=50?[{p,prev:motion[i-1]}]:[]);
  assert.equal(activations.length,1,'Exactly one real cooldown activation per dash');
  const{p,prev}=activations[0],delta=p.courtyardFrame?.delta;
  assert([p.dash.cd,p.dash.timer,prev.dash.cd,prev.dash.timer].every(Number.isFinite),'Finite actual dash cooldown/timer receipt');
  assert.deepEqual(p.intent,{x:dir[0],y:dir[1]},'Dash activation includes actual held native direction');
  assert(Number.isFinite(delta)&&delta>0,'Dash uses observed engine delta, never wall-clock gaps');
  assert(near(p.dash.lastDir.x,dir[0])&&near(p.dash.lastDir.y,dir[1]),'Actual dash direction matches native attempt');
  const start=xy(prev),end=[prev.x+dir[0]*(230+220*delta/1000),prev.y+dir[1]*(230+220*delta/1000)];
  assert(roomAllows(start)&&roomAllows(end),'Full dash plus same-frame movement stays within original convex room boundary');
  const free=action.target.endsWith('-end'),targets=free?[]:targetNames(action.target);
  for(const[name,poly]of Object.entries(COURTYARD_SOLIDS)){
    if(targets.includes(name))continue;
    assert(sweptDistance(start,end,poly)>38,`Full attempted sweep is isolated from ${name}`);
  }
  if(free){
    assert(near(p.x,end[0])&&near(p.y,end[1]),'Free-end dash includes the complete actual normal-movement term');
    const west=action.target==='west-end',y=west?616:744;
    assert((start[1]-y)*(end[1]-y)<0,'Dash really crosses the endpoint level');
    assert(west?Math.max(start[0],end[0])<1180.4222912360003-38:Math.min(start[0],end[0])>2019.5777087639997+38,'Dash passes outside the entire endpoint footprint');
  }else{
    assert(targets.some(n=>sweptDistance(start,end,COURTYARD_SOLIDS[n])<38),'The full attempted ray crosses the intended wall union');
    for(const n of targets){assert(sweptDistance(start,start,COURTYARD_SOLIDS[n])>=37.5);assert(sweptDistance(end,end,COURTYARD_SOLIDS[n])>38,'Full attempted endpoint lies beyond target, rejecting endpoint-only collision');}
    assert(near(p.x,prev.x)&&near(p.y,prev.y),'Collision rolls back dash AND same-frame normal movement');
  }
}
export function verifyCourtyardState(observation,driver,index){
  assert(index===0||index===1,'Exactly desktop or phone native case');
  const s=observation.state,c=observation.afterCleanup;assert(s&&c);
  for(const v of[s,c]){
    assert.deepEqual(v.courtyardEvidence,{evidenceMode:'native-courtyard',nativeMovementEvidence:true,visualEnabled:false,visual:null},'Controlled assignments are never native movement evidence');
    assert.equal(v.ready,true);assert.equal(v.profile,'return-flow');empty(v.blocked,'No forbidden transport');
    assert.deepEqual(v.rewardMutations,EXPECTED_REWARD_MUTATIONS);assert.equal(v.plazaMotionOverflow,false);
    assert.equal(v.scenes.length,1);const scene=v.scenes[0];
    assert.equal(scene.queuedKeys.length,257);assert.equal(scene.decodedKeys.length,257);assert.equal(new Set(scene.queuedKeys).size,257);assert.deepEqual([...scene.decodedKeys].sort(),[...scene.queuedKeys].sort());
    for(const key of['town_cobble_material_v1','town_corner_shop_v1','town_corner_lantern_v1','town_ruins_entrance_v1',...PLAZA_KEYS])assert(scene.queuedKeys.includes(key));
    empty(scene.missingKeys);empty(scene.loadErrors);assert.equal(scene.loadComplete,true);assert.equal(scene.totalFailed,0);assert(scene.createAt>=scene.preloadAt&&scene.framesAfterCreate>0);
    empty(courtyardTraceIssues(v.plazaMotion),'Every observed native segment clears old and new solids');
    for(const p of v.plazaMotion)assert(Number.isFinite(p.courtyardFrame?.delta)&&p.courtyardFrame.delta>=0,'Dedicated trace preserves the real movement delta');
  }
  assert.equal(s.scenes[0].destroyed,false);assert.equal(c.scenes[0].destroyed,true);assert.equal(c.authCallbacks,0);assert.equal(c.canvasCount,0);empty(c.mountedPages);
  assert.deepEqual(c.api,s.api);assert(isDeepStrictEqual(c.checkpoints,s.checkpoints),'Cleanup must retain every complete checkpoint');assert(isDeepStrictEqual(c.visuals,s.visuals),'Cleanup must retain every complete visual snapshot');assert.deepEqual(c.plazaMotion.slice(0,s.plazaMotion.length),s.plazaMotion);
  assert.equal(driver.kind,'native-courtyard-driver');assert.equal(driver.index,index);assert.equal(driver.completed,true);
  assert.deepEqual(driver.completedActions,COURTYARD_ACTIONS.map(a=>a.label));
  assert.equal(driver.legs,COURTYARD_ACTIONS.reduce((n,a)=>n+(a.points?.length??0)+(a.kind==='setup'?1:0),0));assert(driver.legs<=COURTYARD_LIMITS.legs);
  assert(Number.isSafeInteger(driver.pulses)&&driver.pulses>0&&driver.pulses<=COURTYARD_LIMITS.pulses);
  assert.deepEqual(driver.setups?.map(r=>r.label),COURTYARD_ACTIONS.filter(a=>a.kind==='setup').map(a=>a.label),'Exactly one complete receipt per setup action');
  const points=s.checkpoints;assert.deepEqual(points.map(p=>p.label),COURTYARD_ACTIONS.map(a=>a.label));
  const at=label=>points.find(p=>p.label===label),home=points[0].scene.gameplay,zoom=home.viewportGeometry.camera.zoom;
  assert(Number.isFinite(zoom)&&zoom>0,'Original fixed hero zoom must be observed');
  const initialIds=home.townArt.ground.courtyard.map(o=>o.objectId);
  for(const[i,p]of points.entries()){
    const g=p.scene?.gameplay,a=COURTYARD_ACTIONS[i];assert(g&&p.scene.id===s.scenes[0].id);
    const probe=g.plazaProbe;assert(probe&&Number.isSafeInteger(probe.id)&&probe.id>0&&probe.requestedAt<=g.at&&probe.respondedAt===g.at);
    if(i)assert(probe.id>points[i-1].scene.gameplay.plazaProbe.id&&probe.requestedAt>points[i-1].at);
    assert(p.at>=g.at&&p.at-g.at<1000);const matching=s.plazaMotion.find(t=>t.at===g.at&&t.x===g.x&&t.y===g.y&&t.area===g.area);assert(matching);assert.deepEqual(matching.intent,g.intent,'Probe and native frame share the same input state');assert.deepEqual(matching.dash,g.dash,'Probe and native frame share the same dash state');assert.deepEqual(matching.courtyardFrame,g.courtyardFrame,'Probe retains the same engine frame and hero animation as motion');
    assert.deepEqual(g.intent,{x:0,y:0});
    assert.deepEqual(g.courtyardLifecycle?.initial.map(o=>o.objectId),initialIds,'All four original owned references remain identified');
    assert.equal(new Set(g.courtyardLifecycle.initial.map(o=>o.objectId)).size,4);
    const destroyed=a.kind==='depart'||a.kind==='return';
    assert(g.courtyardLifecycle.initial.every(o=>o.destroyed===destroyed&&o.inWorld===!destroyed),'Original wall lifecycle must match real departure/return');
    if(a.kind==='depart'){assert.equal(g.area,1);assert.equal(g.expeditionActive,true);assert.equal(g.townArt,null);empty(g.plaza);assert.equal(g.courtyardLifecycle.ownerPresent,false);empty(g.courtyardLifecycle.current);continue;}
    assert.equal(g.area,0);assert.equal(g.expeditionActive,false);assert.equal(g.viewportGeometry.camera.zoom,zoom);
    empty(courtyardGraphicsIssues(g));empty(courtyardOwnershipIssues(home,g,a.kind==='return'));
    empty(townBoundaryIssues(g));empty(townBackdropIssues(g));empty(plazaObjectsIssues(g));empty(plazaGeometryIssues(g,a.label.startsWith('gate-')));
    const vis=g.courtyardVisibility;assert.equal(vis?.method,'analytic-source-transmission');assert.equal(vis.nativePixels,false);assert.equal(vis.valid,true);empty(vis.issues);
    assert.equal(vis.alphaThreshold,128);assert.equal(vis.sampleStep,3);assert(Number.isInteger(vis.samples)&&vis.samples>=20&&vis.samples<=16384);
    assert(Number.isInteger(vis.readable)&&vis.readable>=vis.samples/2&&vis.readable<=vis.samples);assert(Number.isFinite(vis.meanTransmission)&&vis.meanTransmission>=.4&&vis.meanTransmission<=1);
    assert.equal(g.courtyardLifecycle.ownerPresent,true);assert.equal(g.courtyardLifecycle.current.length,4);
    assert(g.courtyardLifecycle.current.every(o=>o.destroyed===false&&o.inWorld===true),'All current walls are live world objects');
    assert.deepEqual(g.courtyardLifecycle.current.map(o=>o.objectId),g.townArt.ground.courtyard.map(o=>o.objectId));
    if(a.kind==='move'){const target=a.points.at(-1);assert(Math.abs(g.x-target[0])<=8&&Math.abs(g.y-target[1])<=8,'Unchanged native target band');}
    if(a.kind!=='return'){assert.equal(p.starts,0);assert.equal(g.elapsed,0);}else{assert.equal(p.starts,1);assert.equal(g.returned,true);assert.equal(g.outcome,'retreated');assert(g.elapsed>0&&g.elapsed<FLOW_CAP_MS);assert(Math.hypot(g.x-1472,g.y-536)<1);empty(townGroundIssues(g));assert(g.courtyardLifecycle.initial.every(o=>o.destroyed),'Every original wall object was destroyed');}
    if(a.kind==='setup')verifyWestInnerSetup(a,points[i-1],p,s.plazaMotion,driver.setups.find(r=>r.label===a.label));
    else if(i)verifyCourtyardAction(a,points[i-1],p,s.plazaMotion);
  }
  if(index===1)for(const p of[points[0],points.at(-1)])empty(phoneGeometryIssues(p.scene.gameplay.viewportGeometry));
  for(const[before,after,west]of[['west-walk-inner','west-walk-outer',true],['west-walk-outer','west-walk-inner-return',true],['east-walk-outer','east-walk-inner',false],['east-walk-inner','east-walk-outer-return',false]]){
    const a=at(before),b=at(after),line=west?616:744;
    assert((a.scene.gameplay.y-line)*(b.scene.gameplay.y-line)<0,'Real walking crosses each open end both ways');
    const trace=s.plazaMotion.filter(t=>t.at>=a.scene.gameplay.at&&t.at<=b.at);
    assert(trace.length>=3&&trace.some(t=>t.intent.y!==0));
    assert(trace.every(t=>west?t.x<1180.4222912360003-38:t.x>2019.5777087639997+38),'Walking stays outside endpoint');
  }
  for(const[label,front]of[['west-elbow-witness','west'],['east-elbow-witness','east']]){
    const g=at(label).scene.gameplay,w=g.townArt.ground.courtyard;
    assert(w.find(o=>o.name===`town-courtyard-${front}-upper`).depth<w.find(o=>o.name===`town-courtyard-${front==='west'?'east':'west'}-upper`).depth,'Witness uses actual diverging upper order');
  }
  for(const side of['west','east','elbow'])for(const position of['inner','outer']){
    const g=at(`${side}-${position}-walk-blocked`).scene.gameplay;
    const names=side==='elbow'?['west','east']:[side];
    for(const name of names)assert.equal(g.townArt.ground.courtyard.find(o=>o.name===`town-courtyard-${name}-upper`).alpha,position==='inner'?.28:1,'Observed per-pose cutaway state');
  }
  const arrived=at('gate-arrived'),departed=at('courtyard-departed'),returned=at('courtyard-returned-owned');
  assert.deepEqual(s.scenes[0].gameplay,returned.scene.gameplay,'Current scene is the actual returned checkpoint');
  assert.deepEqual(c.scenes[0].gameplay,s.scenes[0].gameplay,'Cleanup preserves final gameplay');
  for(const v of[s,c]){
    const transitions=v.plazaMotion.flatMap((p,i)=>i&&p.area!==v.plazaMotion[i-1].area?[{from:v.plazaMotion[i-1].area,to:p.area,at:p.at}]:[]);
    assert.deepEqual(transitions.map(t=>[t.from,t.to]),[[0,1],[1,0]],'Only actual departure and return change area');
    assert(transitions[0].at>arrived.at&&transitions[0].at<=departed.scene.gameplay.at,'No predeparture dungeon excursion');
    assert(transitions[1].at>departed.at&&transitions[1].at<=returned.scene.gameplay.at,'Return occurs after actual expedition');
  }
  assert(Math.hypot(arrived.scene.gameplay.x-1728,arrived.scene.gameplay.y-664)<12);assert.equal(departed.starts,1);assert.equal(departed.scene.gameplay.durationLimit,FLOW_CAP_MS);
  const allowed=new Set(['/api/leaderboard/arpg/alltime','/api/games/session/start','/api/games/sign','/api/games/session/complete','/api/games/player/state']);
  for(const call of s.api){assert(allowed.has(call.path));assert(Number.isFinite(call.at));assert.equal(call.method,call.path.includes('leaderboard')||call.path.endsWith('/state')?'GET':'POST');}
  const calls=path=>s.api.filter(c=>c.path===path),[start]=calls('/api/games/session/start'),[sign]=calls('/api/games/sign'),[complete]=calls('/api/games/session/complete'),[player]=calls('/api/games/player/state');
  for(const path of['/api/games/session/start','/api/games/sign','/api/games/session/complete','/api/games/player/state'])assert.equal(calls(path).length,1);
  assert(Number.isFinite(start.responseAt)&&start.responseAt>=start.at,'SDK response cannot precede its request');
  assert.deepEqual(start.body,expectedStart);assert(validSign(sign.body)&&validComplete(complete.body,sign.body));
  assert.equal(complete.body.stats.expeditionDurationMs,Math.floor(returned.scene.gameplay.elapsed));
  assert(start.at>=arrived.at&&start.responseAt<=departed.at&&sign.at>=departed.at&&complete.at>=sign.at&&player.at>=complete.at&&player.at<=returned.at);
  assert.deepEqual(s.visuals.map(v=>v.label),COURTYARD_VIEWS.map(v=>courtyardScreenshot(index,v)));
  for(const visual of s.visuals){const action=COURTYARD_ACTIONS.find(a=>a.view&&courtyardScreenshot(index,a.view)===visual.label),p=at(action.label);assert.deepEqual(visual.scene.gameplay,p.scene.gameplay);assert.deepEqual(visual.viewport,index===1?{width:390,height:844}:{width:1280,height:900});}
}

// Independent receipt acceptance: the controller's success is not evidence.
// Existing probe/motion equality checks also require this final frame to be a
// fresh neutral same-frame full probe, with unchanged graphics/pixel obligations.
export function verifyWestInnerSetup(action,before,after,motion,receipt) {
  assert.equal(action.region,'west-inner');assert.equal(action.target,'west');
  assert(['west-inner-ready','west-inner-dash-ready'].includes(action.label),'Only the two explicit west-inner preparations use a region');
  const previousCheckpoint=before.scene.gameplay,b=after.scene.gameplay,r=WEST_INNER_SETUP;
  assert(receipt&&receipt.label===action.label&&receipt.before&&receipt.after,'Exact setup operation receipt required');
  assert.equal(receipt.sceneId,before.scene.id,'Setup receipt retains the same scene identity');
  const a=receipt.before,settled=receipt.after;
  assert(a.at>previousCheckpoint.at&&settled.at>=a.at&&b.at>=settled.at,'Fresh setup operation lies between its checkpoints');
  assert.deepEqual(a.intent,{x:0,y:0},'Setup receipt anchors must be neutral');assert.deepEqual(settled.intent,{x:0,y:0},'Setup receipt anchors must be neutral');
  assert.equal(settled.x,b.x);assert.equal(settled.y,b.y);
  if(action.points?.length){
    const target=action.points.at(-1);
    assert(Math.abs(a.x-target[0])<=8&&Math.abs(a.y-target[1])<=8,'Initial ordinary setup alignment retains its original target band');
  }else{assert.equal(a.x,previousCheckpoint.x);assert.equal(a.y,previousCheckpoint.y);}
  assert.equal(before.scene.id,after.scene.id,'Setup retains its original scene');
  assert(Number.isFinite(b.x)&&Number.isFinite(b.y)&&b.x>=r.minX&&b.x<=r.maxX&&b.y>=r.minY&&b.y<=r.maxY,'Fresh setup receipt must be in the bounded west-inner region');
  assert.deepEqual(b.intent,{x:0,y:0});assert.equal(b.dash.timer,0);
  assert(b.at>a.at&&b.courtyardFrame.frame>a.courtyardFrame.frame,'Setup receipt must be fresh');
  const first=motion.findIndex(p=>p.at===a.at),last=motion.findIndex(p=>p.at===b.at);
  assert(first>=0&&last>first,'Setup needs exact before/after motion anchors');
  const previousIndex=motion.findIndex(p=>p.at===previousCheckpoint.at);
  assert(previousIndex>=0&&previousIndex<first,'Setup retains its previous checkpoint anchor');
  const prefix=motion.slice(previousIndex,first+1);
  for(const [i,p] of prefix.entries()){
    const previous=i?prefix[i-1]:p;
    if(i)assert(p.courtyardFrame.frame===previous.courtyardFrame.frame+1,'Setup alignment prefix is complete');
    if(!action.points?.length){assert.equal(p.x,previousCheckpoint.x);assert.equal(p.y,previousCheckpoint.y);assert.deepEqual(p.intent,{x:0,y:0},'No unreported setup movement before the first receipt');}
  }
  const samples=motion.slice(first,last+1),settledFrame=samples.find(p=>p.at===settled.at);
  assert(settledFrame,'Exact settled setup anchor required');
  for(const key of ['at','area','x','y','intent','dash','courtyardFrame'])assert.deepEqual(settledFrame[key],settled[key],'Settled setup anchor matches the entire native receipt');
  for(const key of ['at','area','x','y','intent','dash','courtyardFrame']){
    assert.deepEqual(samples[0][key],a[key],'Setup start anchor matches the entire native receipt');
    assert.deepEqual(samples.at(-1)[key],b[key],'Setup end anchor matches the entire native receipt');
  }
  for(const [i,p] of samples.entries()) {
    assert(['x','y','at'].every(k=>Number.isFinite(p[k])),'Finite setup motion required');
    assert.equal(p.area,0,'No setup area excursion');
    assert(p.x>=r.minX&&p.x<=r.maxX&&p.y>=528&&p.y<.5*p.x+24,'Setup stays in the central north-side lane');
    assert(roomAllows(xy(p)),'Setup remains in the original room');
    assert.equal(p.dash.timer,0,'No active setup dash');assert.equal(p.intent.x,0,'No lateral setup intent');
    if(p.at>settled.at){
      assert.equal(p.x,settled.x,'Completed setup stays at its settled pose');assert.equal(p.y,settled.y,'Completed setup stays at its settled pose');
      assert.deepEqual(p.intent,{x:0,y:0},'Completed setup stays neutral until its checkpoint');
    }
    assert([-1,0,1].includes(p.intent.y));
    assert(Number.isSafeInteger(p.courtyardFrame?.frame)&&Number.isFinite(p.courtyardFrame.delta)&&p.courtyardFrame.delta>=0,'Actual setup engine frame required');
    const previous=i?samples[i-1]:p;
    if(i){
      assert(p.at>previous.at&&p.courtyardFrame.frame===previous.courtyardFrame.frame+1,'Setup frames are fresh, contiguous and chronological');
      assert.equal(p.x,previous.x,'Setup never moves laterally near the wall');
      if(p.y!==previous.y)assert(p.courtyardFrame.delta>0&&Math.sign(p.y-previous.y)===p.intent.y,'Setup displacement matches native vertical intent');
    }
    for(const [name,poly] of Object.entries(COURTYARD_SOLIDS))assert(sweptDistance(xy(previous),xy(p),poly)>38,`Every complete setup sweep clears ${name} strictly`);
  }
}
