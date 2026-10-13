import {sweptDistance} from '../arpg-readiness-preview/plaza-contract.mjs';
import {readTownGraphics,courtyardGraphicsIssues,COURTYARD_NAMES,expectedCourtyardCommands} from '../arpg-readiness-preview/courtyard-graphics.mjs';
import {townBackdropIssues,townBoundaryIssues} from '../arpg-readiness-preview/town-ground.mjs';
// Offline proof only: actual production scene/ECS/corner, renderer mocked.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url), ts = require('typescript');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..'), base = resolve(root, 'src/lib/games/arpg');
const fixture = JSON.parse(readFileSync(resolve(here, 'courtyard-fixtures.json')));
const phaser = { Scene: class {}, GameObjects:{Graphics:class {},Image:class {},Ellipse:class {}}, BlendModes:{NORMAL:0,MULTIPLY:1},
  Math: { Vector2: class { constructor(x=0,y=0){this.x=x;this.y=y;} lengthSq(){return this.x**2+this.y**2;} },
    Between:(a)=>a, Distance:{Between:(x,y,a,b)=>Math.hypot(x-a,y-b)} },
  Cameras:{Scene2D:{Events:{FOLLOW_UPDATE:'followupdate'}}}, Scenes:{Events:{SHUTDOWN:'shutdown',DESTROY:'destroy'}} };
const cache=new Map();
function load(path){
  if(cache.has(path))return cache.get(path).exports;
  const source=readFileSync(path,'utf8');
  const result=ts.transpileModule(source,{fileName:path,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}});
  assert.deepEqual((result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
  const module={exports:{}};cache.set(path,module);
  new Function('require','module','exports',result.outputText)(specifier=>{
    if(specifier==='phaser')return phaser;
    assert(specifier.startsWith('.'));const file=resolve(dirname(path),specifier)+'.ts';assert(existsSync(file),file);return load(file);
  },module,module.exports);return module.exports;
}
const {townCourtyardGeometry,townCourtyardSurface,createTownCourtyard,TOWN_COURTYARD}=load(resolve(base,'assets/townCourtyard.ts'));
const {createTownCorner,crossesTownShop}=load(resolve(base,'assets/townCorner.ts'));
const {TOWN_FACADES}=load(resolve(base,'assets/townFacadeData.ts'));
const baselineCrosses=(a,b,r)=>crossesTownShop(a,b,r,{x:1664,y:568})||TOWN_FACADES.some(f=>crossesTownFootprint(a,b,r,f.footprint.map(p=>({x:p.x+f.contact.x,y:p.y+f.contact.y}))));
const {crossesTownFootprint,townFrontY,TOWN_CUTAWAY_ALPHA}=load(resolve(base,'townPlaza.ts'));
const {GameScene}=load(resolve(base,'scenes/GameScene.ts'));
const {World}=load(resolve(base,'ecs/components.ts'));
const {movementSystem}=load(resolve(base,'ecs/systems.ts'));
const {enterRuins,returnToTown}=load(resolve(base,'expedition.ts'));
const point=([x,y])=>({x,y}), array=p=>[p.x,p.y];
const approx=(a,b,e=1e-9)=>assert(Math.abs(a-b)<=e,`${a} differs from ${b}`);
const geometry=townCourtyardGeometry();
function mock(){
  const objects=[],removed=[];let fills=0;
  function object(kind,x=0,y=0,key){
    const o=Object.assign(kind==='graphics'?new phaser.GameObjects.Graphics():{},{kind,x,y,key,name:'',depth:0,alpha:1,destroyed:0,faces:[],active:true,visible:true,scaleX:1,scaleY:1,rotation:0,scrollFactorX:1,scrollFactorY:1,commandBuffer:[6,1,0,0,7,0,0]});
    for(const method of ['setOrigin','setScale','setTint','setBlendMode','play','setStyle','setScrollFactor'])o[method]=()=>o;
    o.setName=v=>(o.name=v,o);o.setDepth=v=>(o.depth=v,o);o.setAlpha=v=>(o.alpha=v,o);
    o.setPosition=(x,y)=>(Object.assign(o,{x,y}),o);o.setText=v=>(o.text=v,o);o.setVisible=v=>(o.visible=v,o);
    o.fillStyle=(color,alpha)=>{o.fill={color,alpha};o.commandBuffer.push(7,color,alpha);return o;};
    o.fillPoints=(points,closed)=>{fills++;o.faces.push({points:structuredClone(points),closed,...o.fill});o.commandBuffer.push(1,5,points[0].x,points[0].y);for(const p of points.slice(1))o.commandBuffer.push(4,p.x,p.y);if(closed)o.commandBuffer.push(4,points[0].x,points[0].y);o.commandBuffer.push(8);return o;};
    o.destroy=()=>{o.destroyed++;o.active=false;};objects.push(o);return o;
  }
  const context=Object.fromEntries(['save','restore','clearRect','beginPath','moveTo','lineTo','closePath','clip','drawImage','translate','scale','transform','fillRect','fill','putImageData'].map(key=>[key,()=>{}]));
  Object.assign(context,{createPattern:()=>({}),createRadialGradient:()=>({addColorStop(){}}),
    getImageData:()=>({data:new Uint8ClampedArray(256*256*4).fill(255)}),
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})});
  const scene={add:{graphics:()=>object('graphics'),image:(x,y,k)=>object('image',x,y,k),sprite:(x,y,k)=>object('sprite',x,y,k),ellipse:(x,y)=>object('ellipse',x,y),text:(x,y,t)=>Object.assign(object('text',x,y),{text:t}),group:()=>({destroy(){}})},
    textures:{exists:()=>false,remove:key=>removed.push(key),get:()=>({getSourceImage:()=>({})}),
      createCanvas:()=>({context,canvas:{},refresh(){},setFilter(){},setSize(){}})}};
  return {scene,objects,removed,fills:()=>fills};
}
function realScene(){
  const m=mock(),s=new GameScene({isCurrent:()=>true,onReady(){},onError(){},onGameOver(){}});
  Object.assign(s,m.scene);s.world=new World();s.addToWorld=()=>{};
  s.cameras={main:{setZoom(v){this.zoom=v;},setBounds(...v){this.bounds=v;},startFollow(){}}};
  s.buildDungeonRoom();s.setupPlayer();s.buildAreaContent();
  return {s,...m};
}
function setActor(s,p){s.world.setTransform(s.playerId,{...p,rot:0});s.world.setVelocity(s.playerId,{vx:0,vy:0,speed:220});}
function dash(s,from,dir,delta){
  setActor(s,from);s.world.setDash(s.playerId,{cd:0,cdMax:700,timer:0,duration:140,power:230,lastDir:dir});
  s.lastMoveDir={...dir,lengthSq:()=>dir.x**2+dir.y**2};s.pendingDash=true;
  const previous=s.captureTransforms();assert.equal(s.handleDash(delta)?.activated,true);movementSystem(s.world,delta);
  const attempted={...s.world.getTransform(s.playerId)};s.resolveCollisions(previous);
  return {attempted,actual:{...s.world.getTransform(s.playerId)}};
}
function walkPath(s,path,delta){
  setActor(s,path[0]);let steps=0;
  for(const target of path.slice(1)){
    while(true){const p=s.world.getTransform(s.playerId),dx=target.x-p.x,dy=target.y-p.y,len=Math.hypot(dx,dy);if(len<1e-7)break;
      assert(steps++<5000,'bounded synthetic walking');const dt=Math.min(delta,len/220*1000);
      s.world.setVelocity(s.playerId,{vx:dx/len*220,vy:dy/len*220,speed:220});
      const previous=s.captureTransforms();movementSystem(s.world,dt);const attempted={...s.world.getTransform(s.playerId)};s.resolveCollisions(previous);
      assert.deepEqual(s.world.getTransform(s.playerId),attempted,`unexpected rollback at ${JSON.stringify(attempted)}`);
    }
  }return steps;
}

test('exact reviewed endpoints, width, height and two unextended study footprints',()=>{
  assert.deepEqual(TOWN_COURTYARD,{centerline:[{x:1184,y:616},{x:1728,y:888},{x:2016,y:744}],width:16,height:32,foundationHeight:8});
  assert.equal(geometry.length,2);
  geometry.forEach((g,i)=>g.footprint.forEach((p,j)=>{approx(p.x,fixture.footprints[i][j][0]);approx(p.y,fixture.footprints[i][j][1]);}));
  assert.deepEqual(geometry.map(g=>g.contact),[{x:1728,y:888},{x:1728,y:888}]);
});
test('every rendered face is the same footprint extruded by 0, 8 or 32 px; cap has no overhang',()=>{
  for(const g of geometry){
    assert.equal(g.foundation.length,3);assert.equal(g.upper.length,3);
    for(const [faces,heights]of [[g.foundation,[0,8]],[g.upper,[8,32]]])for(const f of faces)for(const p of f.points)
      assert([...g.footprint,g.contact].some(q=>q.x===p.x&&heights.some(h=>Math.abs(q.y-p.y-h)<1e-9)));
    assert.deepEqual(g.upper.at(-1).points,g.footprint.map(p=>({x:p.x,y:p.y-32})));
    assert.deepEqual(g.localFootprint,g.footprint.map(p=>({x:p.x-g.contact.x,y:p.y-g.contact.y})));
  }
});
test('shared elbow lies in both exact solids and both caps; inner/outer local corner contacts stay closed',()=>{
  for(const g of geometry){assert(crossesTownFootprint({x:1728,y:888},{x:1728,y:888},0,g.footprint));
    assert(crossesTownFootprint({x:1728,y:856},{x:1728,y:856},0,g.upper.at(-1).points));}
  for(const p of [{x:1728,y:880},{x:1728,y:896},{x:1720,y:888},{x:1736,y:888}])
    assert(geometry.some(g=>crossesTownFootprint(p,p,38,g.footprint)));
});
test('four area-owned graphics, foundations before uppers, fixed draw commands and idempotent teardown',()=>{
  const m=mock(),added=[],w=createTownCourtyard(m.scene,o=>added.push(o));
  assert.deepEqual(added.map(o=>o.name),['town-courtyard-west-foundation','town-courtyard-east-foundation','town-courtyard-west-upper','town-courtyard-east-upper']);
  assert.equal(m.fills(),192);assert(added.every(o=>o.depth===(o.name.endsWith('-foundation')?907:908)&&o.alpha===1));
  for(let i=0;i<500;i++)w.updateActor({x:1000+i,y:700});
  assert.equal(m.fills(),192);assert.equal(m.objects.length,4);assert.equal(m.removed.length,0);
  w.destroy();w.destroy();w.updateActor({x:1728,y:888});assert(added.every(o=>o.destroyed===1));assert.equal(w.blocksMovement({x:1728,y:888},{x:1728,y:888},38),false);
});
test('partial Graphics creation failure releases every owned object',()=>{
  const m=mock();let n=0;assert.throws(()=>createTownCourtyard(m.scene,()=>{if(++n===3)throw Error('injected');}),/injected/);
  assert.equal(m.objects.length,3);assert(m.objects.every(o=>o.destroyed===1));
});
for(const [i,g]of geometry.entries())test(`${g.id} signed local sides and front edge drive actual upper cutaway/depth`,()=>{
  const m=mock(),w=createTownCourtyard(m.scene,()=>{});
  const a=TOWN_COURTYARD.centerline[i],b=TOWN_COURTYARD.centerline[i+1],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  const front=townFrontY(g.footprint,mid.x),upper=m.objects.find(o=>o.name===`town-courtyard-${g.id}-upper`),foundation=m.objects.find(o=>o.name===`town-courtyard-${g.id}-foundation`);
  const behind={x:mid.x,y:front-55};w.updateActor(behind);assert.equal(upper.alpha,TOWN_CUTAWAY_ALPHA);assert.equal(foundation.alpha,1);assert.equal(upper.depth,908);
  const inFront={x:mid.x,y:front+55};w.updateActor(inFront);assert.equal(upper.alpha,1);assert(upper.depth<inFront.y+20);assert(foundation.depth<Math.min(...m.objects.filter(o=>o.name.endsWith('-upper')).map(o=>o.depth)));
  w.updateActor({x:mid.x,y:front});assert.equal(upper.alpha,1);assert(upper.depth<front+20);
  w.updateActor({x:mid.x,y:front-250});assert.equal(upper.alpha,1);
  w.updateActor({x:900,y:500});assert.equal(upper.alpha,1);w.destroy();
});
test('real scene builds the courtyard only in town; spawn, gate, shop, walls and camera unchanged',()=>{
  const {s,objects}=realScene();assert.equal(objects.filter(o=>o.name.startsWith('town-courtyard-')).length,4);
  assert.deepEqual(s.world.getTransform(s.playerId),{x:1472,y:536,rot:0});assert.equal(s.wallTiles.size,88);
  assert.deepEqual(s.cameras.main.bounds,[-140,-308,3224,1758]);assert.deepEqual(s.isoToWorld(18,9),{x:1728,y:664});
  assert.deepEqual([s.portalText.x,s.portalText.y],[1728,704]);const shop=objects.find(o=>o.name==='town-plaza-shop');assert.deepEqual([shop.x,shop.y],[1664,568]);
  assert.equal(s.isBlocked(1472,536,38),false);s.clearTownCorner();assert.equal(s.townCorner,null);
});
for(const r of fixture.runs)test(`${r.viewport}: all ${r.segments.length} retained original intervals and checkpoints clear the added walls`,()=>{
  const m=mock(),w=createTownCourtyard(m.scene,()=>{});
  for(const [x,y,a,b]of r.segments)assert.equal(w.blocksMovement({x,y},{x:a,y:b},38),false);
  for(const c of r.checkpoints)assert.equal(w.blocksMovement(c,c,38),false,c.label);
  w.destroy();
});
test('analytic gate-disc bound: exact added walls remain farther than 150+38 from gate',()=>{
  const gate={x:1728,y:664};
  // A radius-188 stationary capsule is an exact distance-to-solid query here.
  for(const g of geometry)assert.equal(crossesTownFootprint(gate,gate,188,g.footprint),false);
  for(let angle=0;angle<360;angle++){const a=angle*Math.PI/180,p={x:gate.x+150*Math.cos(a),y:gate.y+150*Math.sin(a)};
    assert(geometry.every(g=>!crossesTownFootprint(p,p,38,g.footprint)));}
});
test('new barrier is explicit: former free crossing has clear endpoints but is now blocked',()=>{
  const {s}=realScene(),[a,b]=fixture.blockedCrossing.map(point);
  assert.equal(s.isBlocked(a.x,a.y,38),false);assert.equal(s.isBlocked(b.x,b.y,38),false);assert.equal(baselineCrosses(a,b,38),false);assert(s.townCorner.blocksMovement(a,b,38));
  s.clearTownCorner();assert.equal(s.isBlocked(a.x,a.y,38),false);assert.equal(s.isBlocked(b.x,b.y,38),false);
});
for(const delta of [1000/60,1000/30,100,250])for(const reverse of [false,true])test(`cross-wall actual ECS dash rolls back with clear destination (${delta} ms, reverse=${reverse})`,()=>{
  const {s}=realScene(),[a,b]=fixture.blockedCrossing.map(point),from=reverse?b:a,to=reverse?a:b;
  const dir={x:to.x-from.x,y:to.y-from.y},len=Math.hypot(dir.x,dir.y);dir.x/=len;dir.y/=len;
  const result=dash(s,from,dir,delta);assert.equal(s.isBlocked(result.attempted.x,result.attempted.y,38),false);
  assert.deepEqual(result.actual,{...from,rot:0});assert.deepEqual(s.world.getVelocity(s.playerId),{vx:0,vy:0,speed:220});
  assert.equal(s.world.getDash(s.playerId).cd,700);s.clearTownCorner();
});
for(const delta of [1000/60,1000/30,100,250])test(`walk toward wall stops before penetration (${delta} ms)`,()=>{
  const {s}=realScene(),[a,b]=fixture.blockedCrossing.map(point);setActor(s,a);const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);let blocked=false;
  for(let i=0;i<200;i++){s.world.setVelocity(s.playerId,{vx:dx/len*220,vy:dy/len*220,speed:220});const before=s.captureTransforms();movementSystem(s.world,delta);s.resolveCollisions(before);
    const p=s.world.getTransform(s.playerId);assert.equal(s.isBlocked(p.x,p.y,38),false);if(Math.hypot(p.x-before.get(s.playerId).x,p.y-before.get(s.playerId).y)<1e-10){blocked=true;break;}}
  assert(blocked);s.clearTownCorner();
});
for(const [end,path]of Object.entries(fixture.egress))for(const reverse of [false,true])for(const delta of [1000/60,100,250])test(`${end} open-end walk route remains legal (${delta} ms, reverse=${reverse})`,()=>{
  const {s}=realScene(),points=path.map(point);if(reverse)points.reverse();assert(walkPath(s,points,delta)>0);s.clearTownCorner();
});
for(const [end,x,y]of [['west',1120,470],['east',2070,630]])for(const delta of [1000/60,1000/30,100,250])for(const reverse of [false,true])test(`${end} actual dash clears open end (${delta} ms, reverse=${reverse})`,()=>{
  const {s}=realScene(),length=230+220*delta/1000,from={x,y:y+(reverse?length:0)},dir={x:0,y:reverse?-1:1};
  const result=dash(s,from,dir,delta);assert.deepEqual(result.actual,result.attempted);approx(result.actual.y,from.y+dir.y*length);assert.equal(s.isBlocked(result.actual.x,result.actual.y,38),false);s.clearTownCorner();
});
for(const delta of [1000/60,1000/30,100,250])test(`original gate east dash remains free (${delta} ms)`,()=>{
  const {s}=realScene(),r=dash(s,{x:1728,y:664},{x:1,y:0},delta);assert.deepEqual(r.actual,r.attempted);s.clearTownCorner();
});
test('actual interaction keeps inclusive radius 150',()=>{
  const {s}=realScene();s.runState='running';let calls=0;s.handlePrimaryControl=()=>calls++;
  for(const d of [0,150,150.001]){setActor(s,{x:1728+d,y:664});s.interactWithPortal();}assert.equal(calls,2);s.clearTownCorner();
});
test('real area change destroys old courtyard, omits it in dungeon, and builds one fresh set on return',()=>{
  const {s,objects}=realScene(),old=objects.filter(o=>o.name.startsWith('town-courtyard-'));
  s.worldLayer={list:[]};s.time={removeAllEvents(){},clearPendingEvents(){}};s.tweens={killAll(){}};
  s.updateControlButtons=s.updateUIState=s.resizeVignette=s.spawnSkeletons=s.createProps=()=>{};
  s.changeArea(enterRuins(s.expedition));assert.equal(s.townCorner,null);assert(old.every(o=>o.destroyed===1));
  assert.equal(objects.filter(o=>o.name.startsWith('town-courtyard-')&&o.active).length,0);
  s.changeArea(returnToTown(s.expedition));const active=objects.filter(o=>o.name.startsWith('town-courtyard-')&&o.active);
  assert.equal(active.length,4);assert(active.every(o=>!old.includes(o)));assert.equal(s.isBlocked(1728,888,38),true);s.clearTownCorner();assert(active.every(o=>o.destroyed===1));
});

for(const [name,from,to]of [
  ['east arm',{x:1827.27864045,y:726.5572809},{x:1916.72135955,y:905.4427191}],
  ['elbow',{x:1728,y:788},{x:1728,y:988}]
])for(const reverse of [false,true])test(`${name} old-free dash crossing is swept and rolled back (reverse=${reverse})`,()=>{
  const {s}=realScene(),a=reverse?to:from,b=reverse?from:to;
  assert.equal(baselineCrosses(a,b,38),false);assert.equal(s.isBlocked(a.x,a.y,38),false);assert.equal(s.isBlocked(b.x,b.y,38),false);
  const length=Math.hypot(b.x-a.x,b.y-a.y),dir={x:(b.x-a.x)/length,y:(b.y-a.y)/length};
  const result=dash(s,a,dir,100);assert.equal(s.isBlocked(result.attempted.x,result.attempted.y,38),false);
  assert.deepEqual(result.actual,{...a,rot:0});s.clearTownCorner();
});
test('elbow inner/outer cutaway keeps the solid foundation opaque and restores both arms',()=>{
  const m=mock(),w=createTownCourtyard(m.scene,()=>{}),uppers=m.objects.filter(o=>o.name.endsWith('-upper'));
  const foundations=m.objects.filter(o=>o.name.endsWith('-foundation'));
  w.updateActor({x:1728,y:828});assert(uppers.every(o=>o.alpha===TOWN_CUTAWAY_ALPHA));assert(foundations.every(o=>o.alpha===1));
  w.updateActor({x:1728,y:948});assert(uppers.every(o=>o.alpha===1&&o.depth<968));assert(foundations.every(o=>o.alpha===1));
  w.updateActor({x:1472,y:536});assert(uppers.every(o=>o.alpha===1));w.destroy();
});
test('both exact cap endpoints remain closed, just-outside point endpoints remain open',()=>{
  for(let i=0;i<2;i++){
    const a=TOWN_COURTYARD.centerline[i],b=TOWN_COURTYARD.centerline[i+1],g=geometry[i];
    const length=Math.hypot(b.x-a.x,b.y-a.y),dx=(b.x-a.x)/length,dy=(b.y-a.y)/length;
    for(const [p,sign]of [[a,-1],[b,1]]){
      assert(crossesTownFootprint(p,p,0,g.footprint));
      const outside={x:p.x+sign*dx*0.01,y:p.y+sign*dy*0.01};assert.equal(crossesTownFootprint(outside,outside,0,g.footprint),false);
    }
  }
});
test('invalid movement fails closed and zero-radius elbow crossing does not tunnel',()=>{
  const m=mock(),w=createTownCourtyard(m.scene,()=>{});
  for(const value of [NaN,Infinity,-Infinity])assert(w.blocksMovement({x:value,y:700},{x:1728,y:888},38));
  assert(w.blocksMovement({x:1728,y:850},{x:1728,y:930},0));w.destroy();
});
test('corner-level creation failure cleans its wall and prior ground/scenery ownership',()=>{
  const m=mock();assert.throws(()=>createTownCorner(m.scene,o=>{if(o.name==='town-courtyard-west-upper')throw Error('world layer failed');},(x,y)=>({x:1152+64*(x-y),y:-200+32*(x+y)}),-161),/world layer failed/);
  assert(m.objects.every(o=>o.destroyed===1));assert(m.removed.includes('town_ground_plane_v1'));assert(m.removed.includes('town_ground_mirrored_material_v1'));
});

// Read the actual production owner through the actual compiled observer body.
// Renderer classes/commands are mocked; no fabricated "valid" ownership flag.
const observeSource=readFileSync(resolve(here,'../arpg-readiness-preview/observe-scene.ts'),'utf8');
const observeAst=ts.createSourceFile('observe-scene.ts',observeSource,ts.ScriptTarget.Latest,true);
const groundDeclaration=observeAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='readTownGround');
assert(groundDeclaration);
const observerCode=ts.transpileModule(groundDeclaration.getText(observeAst),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const observedIds=new WeakMap();let nextObservedId=1;
const observedId=o=>{if(!observedIds.has(o))observedIds.set(o,nextObservedId++);return observedIds.get(o);};
const observeGround=new Function('Phaser','readTownGraphics','objectId','HTMLCanvasElement',observerCode+';return readTownGround;')(phaser,readTownGraphics,observedId,class {});
function observedGame(s,objects){s.worldLayer={list:objects};const p=s.world.getTransform(s.playerId);return {...p,townArt:{hero:{depth:p.y+20},ground:observeGround(s,p)}};}
test('real source observer accepts exactly the owned original 2 plus wall 4, with actual drawn commands',()=>{
  const {s,objects}=realScene(),g=observedGame(s,objects);assert.equal(g.townArt.ground.worldGraphicsCount,6);assert.equal(g.townArt.ground.baseGraphicsCount,2);
  assert.deepEqual(courtyardGraphicsIssues(g),[]);assert.deepEqual(townBackdropIssues(g),[]);
  assert(Object.isFrozen(s.townCorner.graphics));assert(Object.isFrozen(s.townCorner.graphics.courtyard));
  for(const o of g.townArt.ground.courtyard)assert.deepEqual(o.commands,expectedCourtyardCommands(o.name));s.clearTownCorner();
});
const mutations={
  'missing wall':(s,a)=>a.splice(a.findIndex(o=>o.name==='town-courtyard-west-upper'),1),
  'extra unknown Graphics':(s,a)=>a.push(Object.assign(new phaser.GameObjects.Graphics(),{name:'unexpected-roof'})),
  'extra wall-named Graphics':(s,a)=>a.push(Object.assign(new phaser.GameObjects.Graphics(),{name:COURTYARD_NAMES[0]})),
  'duplicate owned world reference':(s,a)=>a.push(s.townCorner.graphics.courtyard[0]),
  'swapped wall owner refs':s=>{const c=[...s.townCorner.graphics.courtyard];[c[0],c[1]]=[c[1],c[0]];s.townCorner={...s.townCorner,graphics:{...s.townCorner.graphics,courtyard:c}};},
  'mistyped owner ref':s=>{s.townCorner={...s.townCorner,graphics:{...s.townCorner.graphics,courtyard:[{},...s.townCorner.graphics.courtyard.slice(1)]}};},
  'reused owner ref':s=>{const c=[...s.townCorner.graphics.courtyard];c[1]=c[0];s.townCorner={...s.townCorner,graphics:{...s.townCorner.graphics,courtyard:c}};},
  'missing owner':s=>s.townCorner={...s.townCorner,graphics:null},
  'swapped originals':s=>{const q=s.townCorner.graphics;s.townCorner={...s.townCorner,graphics:{...q,perimeter:q.backdrop,backdrop:q.perimeter}};},
  'changed original rim depth':s=>s.townCorner.graphics.perimeter.depth=-140,
  'changed original backdrop commands':s=>s.townCorner.graphics.backdrop.commandBuffer.push(1),
  'changed original backdrop alpha':s=>s.townCorner.graphics.backdrop.alpha=.28,
  'changed wall width':s=>s.townCorner.graphics.courtyard[0].commandBuffer[12]+=1,
  'restored internal face':s=>s.townCorner.graphics.courtyard[3].commandBuffer.push(7,0x50584f,1),
  'wall commands overflow':s=>s.townCorner.graphics.courtyard[0].commandBuffer=Array(508).fill(0),
  'wall moved':s=>s.townCorner.graphics.courtyard[0].x=1,
  'wall hidden':s=>s.townCorner.graphics.courtyard[0].visible=false,
  'wall inactive':s=>s.townCorner.graphics.courtyard[0].active=false,
  'wall scaled':s=>s.townCorner.graphics.courtyard[0].scaleX=.5,
  'wall camera scroll mismatch':s=>s.townCorner.graphics.courtyard[0].scrollFactorX=0,
  'foundation fades':s=>s.townCorner.graphics.courtyard[0].alpha=.28,
  'wrong wall depth':s=>s.townCorner.graphics.courtyard[2].depth=999
};
for(const [label,mutate]of Object.entries(mutations))test(`real observer rejects ${label}`,()=>{
  const {s,objects}=realScene();mutate(s,objects);const g=observedGame(s,objects);
  assert([...townBackdropIssues(g),...townBoundaryIssues(g)].length>0,label);s.clearTownCorner();
});
test('real observer requires the expected fade and restoration at both slopes and elbow',()=>{
  const {s,objects}=realScene();
  for(const p of [{x:1456,y:700},{x:1872,y:770},{x:1728,y:828},{x:1456,y:815},{x:1872,y:880},{x:1728,y:948}]){
    setActor(s,p);s.townCorner.updateActor(p);const g=observedGame(s,objects);assert.deepEqual(townBackdropIssues(g),[],JSON.stringify(p));
    const wall=g.townArt.ground.courtyard[2];wall.alpha=wall.alpha===1?.28:1;assert(courtyardGraphicsIssues(g).length>0);
  }s.clearTownCorner();
});
const signedArea=p=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.x*b.y-a.y*b.x;},0)/2;
function clipped(subject,clip){let out=subject;const sign=Math.sign(signedArea(clip));
  const side=(a,b,p)=>sign*((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x));
  for(let i=0;i<clip.length;i++){const a=clip[i],b=clip[(i+1)%clip.length],input=out;out=[];if(!input.length)break;
    for(let j=0;j<input.length;j++){const p=input[j],q=input[(j+1)%input.length],sp=side(a,b,p),sq=side(a,b,q);
      if(sp>=0)out.push(p);if((sp<0)!==(sq<0)){const t=sp/(sp-sq);out.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});}}
  }return out;
}
test('exposed union side faces have zero area overlap with either top cap, independent of arm depth order',()=>{
  for(const wall of geometry)for(const face of wall.upper.slice(0,-1))for(const other of geometry){
    const intersection=clipped(face.points,other.upper.at(-1).points);assert(Math.abs(signedArea(intersection))<1e-8,JSON.stringify(intersection));
  }
});
test('both independently found elbow overwrite pixels are inside a cap and outside every exposed upper side',()=>{
  for(const p of [{x:1725,y:858},{x:1731,y:858}]){
    assert(geometry.some(g=>crossesTownFootprint(p,p,0,g.upper.at(-1).points)));
    assert(geometry.every(g=>g.upper.slice(0,-1).every(f=>!crossesTownFootprint(p,p,0,f.points))));
  }
});
test('foundation art also has zero area overlap with either height-32 cap',()=>{
  for(const wall of geometry)for(const face of wall.foundation)for(const other of geometry)
    assert(Math.abs(signedArea(clipped(face.points,other.upper.at(-1).points)))<1e-8);
});
test('upper primitive interiors overlap only at the two caps, bounding cutaway accumulation',()=>{
  const faces=geometry.flatMap(g=>g.upper.map((f,i)=>({...f,cap:i===g.upper.length-1})));
  for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++){
    const area=Math.abs(signedArea(clipped(faces[i].points,faces[j].points)));
    if(area>1e-8)assert(faces[i].cap&&faces[j].cap);
  }
  approx((1-TOWN_CUTAWAY_ALPHA)**2,.5184); // Analytic transmission, not sampled pixels.
});

test('shared foundation ordering fixes both cross-layer overwrite pixels in actual draw-command order',()=>{
  for(const {actor,pixel,color}of [
    {actor:{x:1872,y:880},pixel:{x:1731,y:873},color:0x776d5b},
    {actor:{x:1456,y:815},pixel:{x:1725,y:873},color:0x7a705d}
  ]){
    assert(geometry.every(g=>!crossesTownFootprint(actor,actor,38,g.footprint)));assert.equal(baselineCrosses(actor,actor,38),false);
    const m=mock(),w=createTownCourtyard(m.scene,()=>{});w.updateActor(actor);
    const paint=()=>{let color=null;for(const o of [...m.objects].sort((a,b)=>a.depth-b.depth))for(const f of o.faces)
      if(crossesTownFootprint(pixel,pixel,0,f.points)){assert.equal(o.alpha,1);color=f.color;}return color;};
    assert.equal(paint(),color);
    // Negative control: the prior per-arm foundation depth reproduces the bug.
    for(const foundation of m.objects.filter(o=>o.name.endsWith('-foundation'))){
      foundation.depth=m.objects.find(o=>o.name===foundation.name.replace('-foundation','-upper')).depth;
    }
    assert.equal(paint(),0x746c5c);w.destroy();
  }
});
test('all sampled wall-clear actor positions keep every opaque foundation below every upper layer',()=>{
  const m=mock(),w=createTownCourtyard(m.scene,()=>{});let checked=0;
  for(let x=1000;x<=2150;x+=25)for(let y=400;y<=1100;y+=25){
    const p={x,y};if(geometry.some(g=>crossesTownFootprint(p,p,38,g.footprint)))continue;
    w.updateActor(p);const lower=m.objects.filter(o=>o.name.endsWith('-foundation')),upper=m.objects.filter(o=>o.name.endsWith('-upper'));
    assert(Math.max(...lower.map(o=>o.depth))<Math.min(...upper.map(o=>o.depth)));assert(lower.every(o=>o.alpha===1));checked++;
  }assert(checked>1000);w.destroy();
});
test('actual Vite boundary permits only exact courtyard and expedition-objective sources and retains negative guards',()=>{
  const file=resolve(here,'../arpg-readiness-preview/vite.config.mjs');
  let source=readFileSync(file,'utf8');source=source.replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href)).replace('export default defineConfig(', 'return defineConfig(');
  const config=new Function('defineConfig','svelte','fileURLToPath','readFileSync','realpathSync',source)(x=>x,()=>({name:'mock-svelte'}),fileURLToPath,()=> '[]',x=>x);
  const boundary=config.plugins.find(p=>p.name==='arpg-real-engine-boundary');assert(boundary);
  assert.doesNotThrow(()=>boundary.transform('',resolve(base,'assets/townCourtyard.ts')));
  const objectives=resolve(base,'expeditionObjectives.ts');
  assert.equal(config.server.fs.allow.filter(path=>path===objectives).length,1,'The exact objectives module must be filesystem-allowed once');
  for(const suffix of ['', '?v=fixture'])assert.doesNotThrow(()=>boundary.transform('',objectives+suffix));
  for(const path of ['expeditionObjectives.tsx','expeditionObjectives-extra.ts','expeditionObjectives.ts/extra.ts','assets/expeditionObjectives.ts']){
    assert(!config.server.fs.allow.includes(resolve(base,path)));
    for(const suffix of ['', '?v=fixture'])assert.throws(()=>boundary.transform('',resolve(base,path)+suffix),/Unexpected application module/);
  }
  for(const path of ['assets/townCourtyard.tsx','assets/townCourtyard-extra.ts','assets/not-approved.ts','scenes/ExtraScene.ts'])
    assert.throws(()=>boundary.transform('',resolve(base,path)),/Unexpected application module/);
  assert.doesNotThrow(()=>boundary.transform('',resolve(base,'scenes/GameScene.ts')));
  assert.throws(()=>boundary.transform('',resolve(root,'node_modules/@supabase/client/index.js')),/Live service dependency forbidden/);
  assert.throws(()=>boundary.transform('',resolve(root,'node_modules/stripe/index.js')),/Live service dependency forbidden/);
  assert.deepEqual(config.server.fs.deny,['**/.env*','**/*.{pem,key}','**/.git/**']);assert.equal(config.envDir,false);assert.equal(config.publicDir,false);
});

test('analytic front-side separation keeps a lowered opposite opaque plinth outside the hero envelope',()=>{
  const sqrt5=Math.sqrt(5),westBound=1728-46*sqrt5,eastBound=1728+46*sqrt5,gap=222/sqrt5;
  // Exact straight front-line clearance: y > .5*x + 24 + (8+38)*sqrt(5)/2.
  // With y<=888 this gives x<westBound; the east inequality is its reflection.
  approx(westBound,1625.1408730350097);approx(eastBound,1830.8591269649903);
  approx(geometry[1].footprint[3].x-westBound,gap);approx(eastBound-geometry[0].footprint[2].x,gap);
  assert(gap>64); // Both other foundations retain exactly their footprint x range.
  const w=geometry[0].footprint.map(array),e=geometry[1].footprint.map(array),minimumY=w[2][1];
  // The only exceptions to a long-edge projection would be the joined end or
  // up-to-64px side overlap. Each entire rectangle lies in the convex radius-38
  // expansion of one approved solid: checking its four vertices proves that.
  const boxes=[
    {poly:w,x0:w[1][0],x1:w[2][0]},
    {poly:e,x0:w[2][0],x1:w[2][0]+64},
    {poly:e,x0:e[3][0],x1:e[0][0]},
    {poly:w,x0:e[3][0]-64,x1:e[3][0]}
  ];
  for(const b of boxes)for(const p of [[b.x0,minimumY],[b.x1,minimumY],[b.x1,888],[b.x0,888]])
    assert(sweptDistance(p,p,b.poly)<38);
  // Thus a collision-safe front actor that lowers one arm at y<=888 must obey
  // the straight-side bound. The opposite foundation is >99.28px away in x,
  // beyond the conservative +/-64px envelope. Ties at y=888 are covered too.
});

// Material proof: real production surface helper, independent saved study
// polygons/colors, and UV area/coverage checks. No raster alpha is inferred.
const stoneFixture=JSON.parse(readFileSync(resolve(here,'courtyard-stone-fixtures.json')));
const baseColor=(layer,face)=>layer==='foundation'?(face===2?0x746c5c:0x605c50):(face===2?0x8b806b:0x706856);
const painted=geometry.flatMap((wall,wi)=>['foundation','upper'].flatMap(layer=>wall[layer].map((face,fi)=>
  ({wi,layer,fi,face,tiles:townCourtyardSurface(face,layer,fi,wi)}))));
const toUV=(face,p)=>{const[a,b,,d]=face.points,x=b.x-a.x,y=b.y-a.y,c=d.x-a.x,e=d.y-a.y,det=x*e-y*c;
  return {x:((p.x-a.x)*e-(p.y-a.y)*c)/det,y:(x*(p.y-a.y)-y*(p.x-a.x))/det};};
function tileBounds(face,tiles){return tiles.map(tile=>{assert.equal(tile.points.length,4);const p=tile.points.map(q=>toUV(face,q));
  approx(p[0].y,p[1].y);approx(p[1].x,p[2].x);approx(p[2].y,p[3].y);approx(p[3].x,p[0].x);
  const box=[p[0].x,p[1].x,p[0].y,p[2].y];assert(box.every(Number.isFinite));assert(box[0]>=-1e-12&&box[1]<=1+1e-12&&box[2]>=-1e-12&&box[3]<=1+1e-12);
  assert(box[1]>box[0]&&box[3]>box[2]);return box;});}
function verifyPartition(face,tiles){const boxes=tileBounds(face,tiles);let area=0;
  for(let i=0;i<boxes.length;i++){const[a,b,c,d]=boxes[i];area+=(b-a)*(d-c);
    for(let j=i+1;j<boxes.length;j++){const[e,f,g,h]=boxes[j];assert(Math.max(0,Math.min(b,f)-Math.max(a,e))*Math.max(0,Math.min(d,h)-Math.max(c,g))<1e-12,'positive-area overpainting');}}
  approx(area,1,1e-12); // containment + full area + disjoint interiors = same support up to shared boundaries
  for(const p of face.points)assert(tiles.some(t=>t.points.some(q=>q.x===p.x&&q.y===p.y)),'original physical corner changed');
  return boxes;
}
test('only the paint recipe and create-time draw loop differ from the exact bare-wall source',()=>{
  let source=readFileSync(resolve(base,'assets/townCourtyard.ts'),'utf8');
  const begin=source.indexOf('/** The reviewed coarse stone recipe'),end=source.indexOf('/** Area-owned, create-once vector art.');
  assert(begin>0&&end>begin);source=source.slice(0,begin)+source.slice(end);
  source=source.replace("      for (const [faceIndex, face] of faces.entries()) {\n        for (const paint of townCourtyardSurface(face, layer, faceIndex, wall.id === 'west' ? 0 : 1)) {\n          graphic.fillStyle(paint.color, 1).fillPoints(paint.points, true);\n        }\n      }",'      for (const face of faces) graphic.fillStyle(face.color, 1).fillPoints(face.points, true);');
  assert.equal(createHash('sha256').update(source).digest('hex'),'ad69819cf818c83feaaab5e3773436a68d757df236f0662131cfa886ef6338e3');
});
test('all 76 stones retain the independently saved study polygon/color with no underlay',()=>{
  assert.equal(stoneFixture.stones.length,76);let count=0;
  for(const {wi,layer,fi,face,tiles}of painted){
    const stones=tiles.filter(t=>t.color!==baseColor(layer,fi)),expected=stoneFixture.stones.filter(s=>s[0]===wi&&s[1]===layer&&s[2]===fi);
    assert.equal(stones.length,expected.length);count+=stones.length;
    stones.forEach((s,i)=>{assert.equal(s.color,expected[i][3]);s.points.forEach((p,j)=>{approx(p.x,expected[i][4][j][0],1e-11);approx(p.y,expected[i][4][j][1],1e-11);});});
    verifyPartition(face,tiles);
  }assert.equal(count,76);
});
for(const p of painted)test(`${p.wi?'east':'west'} ${p.layer} face ${p.fi}: strict-interior partition preserves coverage and alpha multiplicity`,()=>{
  const boxes=verifyPartition(p.face,p.tiles);
  // Split at every partition boundary. Each resulting open cell has exactly
  // one covering tile, so every off-seam interior point has baseline multiplicity.
  const distinct=v=>[...new Set(v.map(x=>Math.round(x*1e12)/1e12))].sort((a,b)=>a-b);
  const us=distinct(boxes.flatMap(b=>b.slice(0,2))),vs=distinct(boxes.flatMap(b=>b.slice(2)));
  for(let i=0;i<us.length-1;i++)for(let j=0;j<vs.length-1;j++){
    const u=(us[i]+us[i+1])/2,v=(vs[j]+vs[j+1])/2;
    assert.equal(boxes.filter(([a,b,c,d])=>u>a&&u<b&&v>c&&v<d).length,1);
  }
});
test('exact command budget is 192 quads / 768 points, bounded per object and create-once',()=>{
  const m=mock(),w=createTownCourtyard(m.scene,()=>{});
  assert.deepEqual(m.objects.map(o=>o.faces.length),[25,17,91,59]);
  assert.deepEqual(m.objects.map(o=>o.commandBuffer.length),[507,347,1827,1187]);
  assert.equal(m.objects.flatMap(o=>o.faces).reduce((n,f)=>n+f.points.length,0),768);
  assert(m.objects.flatMap(o=>o.faces).every(f=>f.alpha===1&&f.closed===true));
  const before=m.objects.map(o=>structuredClone(o.commandBuffer));
  for(const actor of [{x:1472,y:536},{x:1456,y:698},{x:1872,y:760},{x:1728,y:832},{x:1456,y:815},{x:1872,y:880}])w.updateActor(actor);
  assert.deepEqual(m.objects.map(o=>o.commandBuffer),before);assert.equal(m.fills(),192);w.destroy();
});
test('partition is deterministic and never mutates physical faces or occlusion polygons',()=>{
  const before=structuredClone(geometry);
  for(const p of painted)assert.deepEqual(townCourtyardSurface(p.face,p.layer,p.fi,p.wi),p.tiles);
  assert.deepEqual(geometry,before);assert.deepEqual(townCourtyardGeometry(),before);
});
for(const[why,change]of [
  ['underlying support overpaint',(p)=>p.tiles.unshift(structuredClone(p.face))],
  ['missing mortar',(p)=>p.tiles.splice(0,1)],
  ['duplicate stone',(p)=>p.tiles.push(structuredClone(p.tiles.find(t=>t.color!==baseColor(p.layer,p.fi))))],
  ['outside footprint',(p)=>p.tiles[0].points[0].x-=1],
  ['lost physical corner',(p)=>p.tiles[0].points[0].y+=.01]
])test(`independent partition proof rejects ${why}`,()=>{
  const p=structuredClone(painted[0]);change(p);assert.throws(()=>verifyPartition(p.face,p.tiles));
});
test('cross-face overlap areas remain exactly those of the twelve physical supports',()=>{
  // Pairwise polygon clipping sums all positive-area partition intersections.
  // Internal tile boundaries have measure zero; no support alpha is added.
  for(let i=0;i<painted.length;i++)for(let j=i+1;j<painted.length;j++){
    const a=painted[i],b=painted[j],expected=Math.abs(signedArea(clipped(a.face.points,b.face.points)));
    const actual=a.tiles.reduce((n,x)=>n+b.tiles.reduce((m,y)=>m+Math.abs(signedArea(clipped(x.points,y.points))),0),0);
    approx(actual,expected,1e-7);
  }
});
