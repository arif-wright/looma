// Offline doubles/fabricated schema only. These are not browser or pixel proof.
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import * as contract from './walk-frame-contract.mjs';
import * as visual from './visual-contract.mjs';
import {verifyWalkReceipt,verifyWalkFrame} from './walk-frame-verifier.mjs';
import {verifyWalkCapturedPNG,validateWalkGameplay,verifyWalkVignetteAsset} from './walk-frame-capture-contract.mjs';
import {assertExactAffineMatrix,verifyVisibilityObservation} from './courtyard-capture-contract.mjs';
import {fabricateCourtyardSchema} from './courtyard-schema-data.mjs';
import {readCourtyardFills} from './courtyard-visibility.mjs';
import {COURTYARD_NAMES} from './courtyard-graphics.mjs';
import {PLAZA_KEYS} from './plaza-contract.mjs';
import {expectedBackdropCommands} from './town-ground.mjs';
const require=createRequire(import.meta.url),ts=require('typescript'),here=dirname(fileURLToPath(import.meta.url));
const originalPerformance=globalThis.performance;after(()=>Object.defineProperty(globalThis,'performance',{value:originalPerformance,configurable:true}));
const phaser={Scenes:{Events:{SHUTDOWN:'shutdown',DESTROY:'destroy'}},Core:{Events:{PRE_RENDER:'prerender',POST_RENDER:'postrender',DESTROY:'destroy'}}};
function load(file,imports){const out=ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}});assert.deepEqual(out.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error),[]);const m={exports:{}};new Function('require','module','exports',out.outputText)(name=>{assert(Object.hasOwn(imports,name),name);return imports[name];},m,m.exports);return m.exports;}
const {World}=load(resolve(here,'../../../src/lib/games/arpg/ecs/components.ts'),{});
function harness({enabled=false,own=false}={}){
 let clock=100;Object.defineProperty(globalThis,'performance',{value:{now:()=>++clock},configurable:true});
 const observation={id:1,pageId:1,createAt:1,framesAfterCreate:1,loadComplete:true,totalFailed:0,loadErrors:[],missingKeys:[],destroyed:false,gameplay:null};
 const fixture={scenes:[],api:[],rewardMutations:[],navigations:[],blocked:[],plazaLatestMotion:null,plazaProbeRequest:null,requestPlazaProbe(){return this.plazaProbeRequest={id:1,requestedAt:performance.now()};}};
 class Scene{preload(){fixture.scenes.push(observation);}updateHeroAnimation(){this.originalCalls=(this.originalCalls??0)+1;}}
 const originalPreload=Scene.prototype.preload,originalMethod=Scene.prototype.updateHeroAnimation;
 globalThis.window=enabled?{__arpgWalkFrameFlow:true,__arpgPlazaFlow:true}:{};
 let visibility=()=>({valid:true});const bytes=new Uint8ClampedArray(256*256*4);bytes.set([26,23,27,232],(135*256+132)*4);bytes.set([36,35,43,254],(135*256+131)*4);
 const readers={decodedPixels:()=>({width:256,height:256,data:bytes}),readCourtyardVisibility:()=>visibility(),readCourtyardFrame:s=>({frame:s.sys.game.loop.frame,delta:16,hero:{textureKey:s.playerSprite.texture.key,frameName:s.playerSprite.frame.name,animation:s.playerSprite.anims.currentAnim.key,playing:s.playerSprite.anims.isPlaying}})};
 const mod=load(resolve(here,'walk-frame-observer.ts'),{phaser,'../../../src/lib/games/arpg/scenes/GameScene':{GameScene:Scene},'./runtime':{fixture},'./observe-scene':readers,'./visual-contract.mjs':visual,'./walk-frame-contract.mjs':contract});
 if(!enabled){assert.equal(Scene.prototype.preload,originalPreload);assert.equal(window.__arpgWalkFrame,undefined);}
 Object.assign(window,{__arpgWalkFrameFlow:true,__arpgPlazaFlow:true,__arpgCourtyardFlow:false,__arpgCourtyardVisualFlow:false,__arpgReturnFlow:false});
 const scene=new Scene(),world=new World(),id=world.createEntity();world.setTransform(id,{x:1472,y:536,rot:0});world.setVelocity(id,{vx:0,vy:0,speed:220});world.tagPlayer(id,{score:0});world.setDash(id,{cd:0,cdMax:700,power:230,duration:100,timer:0,lastDir:{x:0,y:1}});
 const key=()=>({isDown:false,_justDown:false}),camera={x:0,y:0,width:1068,height:600.75,zoom:1.35,scrollX:0,scrollY:0,matrix:{a:1.35,b:0,c:0,d:1.35,e:0,f:0}};
 const frames=Array.from({length:8},(_,i)=>({index:i+1,textureKey:i===4?contract.WALK_FRAME.textureKey:`walk-${i}`,textureFrame:0,frame:{name:'__BASE',cutWidth:256,cutHeight:256,x:0,y:0}}));
 const animation={key:contract.WALK_FRAME.animation,frames};
 const sprite={x:1472,y:536,depth:556,active:true,visible:true,alpha:1,scaleX:1,scaleY:1,originX:.5,originY:.5,displayOriginX:128,displayOriginY:128,rotation:0,flipX:false,flipY:false,texture:{key:'idle-S'},frame:{name:'__BASE',cutWidth:256,cutHeight:256,x:0,y:0},play(k){assert.equal(k,animation.key);this.anims.currentAnim=animation;this.anims.currentFrame=frames[0];this.anims.isPlaying=true;this.anims.isPaused=false;return this;}};
 sprite.anims={currentAnim:{key:'hero-knight_armed_idle-S'},currentFrame:null,isPlaying:true,isPaused:false,pause(frame){this.isPaused=true;this.isPlaying=false;this.currentFrame=frame;sprite.texture={key:frame.textureKey};sprite.frame=frame.frame;return sprite;}};
 const walls=COURTYARD_NAMES.map(name=>({name,scene,active:true})),layer={list:[...walls]};
 const canvas={width:1068,height:600,toDataURL:()=>`data:image/png;base64,${png(1068,600).toString('base64')}`,getBoundingClientRect:()=>({x:106,y:188.875,width:1068,height:600})};
 Object.assign(scene,{world,playerId:id,initialized:true,ended:false,runState:'running',townStatus:'ready',handlers:{isCurrent:()=>true},expedition:{area:0,returned:false,outcome:'preparing'},expeditionActive:false,movementInput:{x:0,y:0},pendingDash:false,pointerAttack:false,heroAttacking:false,heroFacing:'S',wasd:Object.fromEntries(['w','a','s','d'].map(k=>[k,key()])),cursors:Object.fromEntries(['up','down','left','right'].map(k=>[k,key()])),interactKey:key(),dashKeys:[key(),key()],input:{activePointer:{isDown:false}},playerSprite:sprite,worldLayer:layer,townCorner:{graphics:{courtyard:walls}},cameras:{main:camera},anims:{get:k=>k===animation.key?animation:undefined},events:new EventEmitter(),sys:{game:{loop:{frame:10},events:new EventEmitter(),canvas}},scale:{width:1068,height:600.75}});
 if(own)Object.defineProperty(scene,'updateHeroAnimation',{value:originalMethod,configurable:true,writable:false,enumerable:true});
 globalThis.innerWidth=1280;globalThis.innerHeight=900;globalThis.document={documentElement:{scrollWidth:1280}};
 const descriptor=Object.getOwnPropertyDescriptor(scene,'updateHeroAnimation'),controller=enabled?window.__arpgWalkFrame:mod.createWalkFrameController();
 if(enabled)scene.preload();else{fixture.scenes.push(observation);controller.bind(scene,observation);}
 const tick=({sync=true,selection=true,advance=true,publish=true,preRender=true}={})=>{
  if(preRender)scene.sys.game.events.emit('prerender');
  if(selection&&controller.snapshot().receipt)scene.updateHeroAnimation();
  if(sync)Object.assign(sprite,{...world.getTransform(id),depth:world.getTransform(id).y+20});
  const p=world.getTransform(scene.playerId),at=performance.now();if(publish)fixture.plazaLatestMotion={at,area:0,x:p?.x,y:p?.y,intent:{x:0,y:0},dash:{timer:0}};
  if(fixture.plazaProbeRequest){observation.gameplay={...fixture.plazaLatestMotion,plazaProbe:{...fixture.plazaProbeRequest,respondedAt:at}};}
  scene.sys.game.events.emit('postrender');if(advance)scene.sys.game.loop.frame++;observation.framesAfterCreate++;
 };
 tick();const settle=()=>{for(let i=0;i<4;i++)tick();return controller.currentReceipt();};
 const close=()=>{scene.events.emit('shutdown');for(const w of walls){w.scene=undefined;w.active=false;}layer.list=[];observation.destroyed=true;};
 return{scene,world,fixture,observation,camera,controller,sprite,animation,frames,bytes,walls,tick,settle,close,descriptor,originalMethod,originalPreload,Scene,setVisibility:fn=>{visibility=fn;}};
}
test('one exact S4 pose is legal and+1Y is already illegal; no ±8 target box',()=>{assert.equal(visual.visualClearance(contract.WALK_POSE).valid,true);assert.equal(visual.visualClearance({...contract.WALK_POSE,y:699.5}).valid,false);assert.deepEqual(contract.WALK_LIMITS,{caseMs:180000,framesPerPose:64,stableComparisons:3,cameraTolerance:.01,requests:1,captures:1,maxSelectedFrames:128,width:2048,height:2048,pixels:2500000,base64Chars:8000000});});
test('inactive import changes no scene prototype/controller; enabled preload binds exactly once',()=>{const a=harness();assert.equal(a.Scene.prototype.preload,a.originalPreload);const b=harness({enabled:true});assert.equal(b.scene.sys.game.events.listenerCount('postrender'),1);assert.throws(()=>b.scene.preload());});
test('exact assignment selects/pauses real frame4, only shadows one instance method and native renders settle',()=>{
 const h=harness(),keys=JSON.stringify([h.scene.wasd,h.scene.cursors,h.scene.dashKeys]),camera=JSON.stringify(h.camera),velocity=structuredClone(h.world.getVelocity(1));
 const r=h.controller.assign(contract.WALK_POSE.id);assert.equal(r.assignedNativeFrame,10);assert.equal(r.assignedFrameCounter,11);assert.equal(h.sprite.anims.currentFrame,h.frames[4]);assert.equal(h.sprite.anims.isPaused,true);assert.equal(h.sprite.anims.isPlaying,false);
 assert.deepEqual(h.world.getVelocity(1),velocity);assert.equal(JSON.stringify(h.camera),camera);assert.equal(JSON.stringify([h.scene.wasd,h.scene.cursors,h.scene.dashKeys]),keys);assert.equal(h.Scene.prototype.updateHeroAnimation,h.originalMethod);
 const settled=h.settle();verifyWalkReceipt(settled);assert.equal(settled.frames[0].nativeFrame,11);assert.equal(h.controller.snapshot().suppressedSelections,4);assert.equal(h.scene.originalCalls,undefined);
 h.close();assert.equal(Object.hasOwn(h.scene,'updateHeroAnimation'),false);assert.equal(h.scene.updateHeroAnimation,h.originalMethod);assert.equal(h.scene.sys.game.events.listenerCount('postrender'),0);assert.equal(h.controller.snapshot().methodRestored,true);
});
test('an existing own descriptor is restored exactly, including nonwritable/enumerable flags',()=>{const h=harness({own:true});h.controller.assign(contract.WALK_POSE.id);h.settle();h.close();assert.deepEqual(Object.getOwnPropertyDescriptor(h.scene,'updateHeroAnimation'),h.descriptor);});
test('two live Scene instances do not share the temporary animation selector',()=>{const h=harness(),other=new h.Scene();h.controller.assign(contract.WALK_POSE.id);other.updateHeroAnimation();assert.equal(other.originalCalls,1);assert.equal(h.Scene.prototype.updateHeroAnimation,h.originalMethod);});
test('a replacement owner is never overwritten during cleanup',()=>{const h=harness();h.controller.assign(contract.WALK_POSE.id);const other=()=>{};h.scene.updateHeroAnimation=other;h.tick({selection:false});h.close();assert.equal(h.scene.updateHeroAnimation,other);assert.equal(h.controller.snapshot().methodRestored,false);assert.match(h.controller.snapshot().errors.join(),/ownership|another writer/);});
for(const[name,change]of Object.entries({
 'mode missing':h=>delete window.__arpgWalkFrameFlow,'native mode':h=>window.__arpgCourtyardFlow=true,'idle visual mode':h=>window.__arpgCourtyardVisualFlow=true,'return mode':h=>window.__arpgReturnFlow=true,'existing idle controller':h=>window.__arpgCourtyardVisual={},
 'wrong current scene':h=>h.scene.handlers.isCurrent=()=>false,'foreign observed scene':h=>h.fixture.scenes.push({...h.observation,id:2}),'load failure':h=>h.observation.totalFailed=1,'unready':h=>h.scene.townStatus='loading','field':h=>h.scene.expedition.area=1,'active session':h=>h.scene.expeditionActive=true,
 'intent':h=>h.scene.movementInput.y=1,'velocity':h=>h.world.getVelocity(1).vy=1,'dash':h=>h.world.getDash(1).timer=1,'pending dash':h=>h.scene.pendingDash=true,'attack':h=>h.scene.heroAttacking=true,'pointer':h=>h.scene.input.activePointer.isDown=true,'key held':h=>h.scene.wasd.s.isDown=true,'key edge':h=>h.scene.wasd.s._justDown=true,'missing actual key':h=>delete h.scene.wasd.s,'wrong facing':h=>h.scene.heroFacing='E',
 'session call':h=>h.fixture.api.push({path:'/api/games/session/start',method:'POST'}),'reward':h=>h.fixture.rewardMutations.push({}),'navigation':h=>h.fixture.navigations.push('/'),'wrong start pose':h=>h.world.getTransform(1).x++,'missing frame':h=>h.frames.splice(4,1),'wrong source':h=>h.frames[4].textureKey='fake','wrong native frame index':h=>h.frames[4].index=4,'wrong texture lookup':h=>h.frames[4].textureFrame='__BASE','missing walls':h=>h.walls.pop(),
 'nonconfigurable selector':h=>Object.defineProperty(h.scene,'updateHeroAnimation',{value:h.originalMethod,configurable:false})
}))test(`assignment rejects ${name}`,()=>{const h=harness();change(h);assert.throws(()=>h.controller.assign(contract.WALK_POSE.id));});
test('unknown/repeated assignment IDs fail closed',()=>{const h=harness();assert.throws(()=>h.controller.assign('home'));const b=harness();b.controller.assign(contract.WALK_POSE.id);assert.throws(()=>b.controller.assign(contract.WALK_POSE.id));});
for(const[name,change]of Object.entries({
 'neutral idle replacement':h=>h.sprite.texture.key='idle-S','unpaused animation':h=>h.sprite.anims.isPaused=false,'playing animation':h=>h.sprite.anims.isPlaying=true,'wrong current frame':h=>h.sprite.anims.currentFrame=h.frames[3],'flipped source':h=>h.sprite.flipX=true,'source opacity':h=>h.sprite.alpha=.5,'scale':h=>h.sprite.scaleX=2,'origin':h=>h.sprite.displayOriginX=127,'pose drift':h=>h.world.getTransform(1).y++,'player component replacement':h=>h.world.tagPlayer(1,{score:0}),'sprite replacement':h=>h.scene.playerSprite={...h.sprite},'camera replacement':h=>h.scene.cameras.main={...h.camera},'wall owner replacement':h=>h.scene.townCorner={graphics:{courtyard:h.walls.map(w=>({...w}))}},'observed replacement':h=>h.fixture.scenes=[{...h.observation}],
}))test(`actual render rejects ${name}`,()=>{const h=harness();h.controller.assign(contract.WALK_POSE.id);change(h);h.tick({selection:false});assert(h.controller.snapshot().errors.length>0);});
test('stale render,unsettled timeout and selected-frame bound are finite',()=>{const h=harness();h.controller.assign(contract.WALK_POSE.id);h.tick({advance:false});h.tick({advance:false});assert.match(h.controller.snapshot().errors.join(),/Repeated/);const b=harness();b.controller.assign(contract.WALK_POSE.id);for(let i=0;i<64;i++){b.camera.scrollX++;b.tick();}assert.match(b.controller.snapshot().errors.join(),/64 native/);const c=harness();c.controller.assign(contract.WALK_POSE.id);c.settle();for(let i=0;i<125;i++)c.tick();assert.match(c.controller.snapshot().errors.join(),/budget/);});
test('settlement rejects a reused publication, repeated time and stale pre-render marker',()=>{for(const kind of ['object','time','marker']){const h=harness();h.controller.assign(contract.WALK_POSE.id);h.tick();if(kind==='object')h.tick({publish:false});if(kind==='marker')h.tick({preRender:false});if(kind==='time'){const old=h.fixture.plazaLatestMotion;h.scene.sys.game.events.emit('prerender');h.fixture.plazaLatestMotion={...old};h.scene.sys.game.events.emit('postrender');}assert.match(h.controller.snapshot().errors.join(),/Fresh same-frame/);h.close();assert.equal(h.scene.sys.game.events.listenerCount('prerender'),0);}});
test('shutdown with pending work cancels listeners and cannot rebind',()=>{const h=harness();h.controller.assign(contract.WALK_POSE.id);h.close();assert.equal(h.scene.sys.game.events.listenerCount('postrender'),0);assert.match(h.controller.snapshot().errors.join(),/pending/);assert.throws(()=>h.controller.bind(h.scene,h.observation));});
test('one capture belongs to a genuinely later probe/frame and is consumed before cleanup',()=>{const h=harness();h.controller.assign(contract.WALK_POSE.id);h.settle();const request=h.controller.request(contract.walkScreenshot(0));assert.equal(h.controller.snapshot().captured,false);h.tick();const c=h.controller.take(request.id);assert(c.metadata.nativeFrame>c.metadata.poseReceipt.settledNativeFrame);assert.equal(c.metadata.at,c.metadata.gameplay.plazaProbe.respondedAt);assert.deepEqual(c.metadata.source.rgba,[26,23,27,232]);assert.equal(c.metadata.heroFrame.playing,false);assert.equal(h.controller.snapshot().complete,true);h.close();assert.deepEqual(h.controller.snapshot().errors,[]);assert.equal(h.controller.snapshot().ownedWalls.every(w=>w.destroyed&&!w.inWorld),true);});
test('capture overflow,unknown label,premature receipt and repeated take are rejected',()=>{const h=harness();h.controller.assign(contract.WALK_POSE.id);assert.throws(()=>h.controller.request('bad'));const a=harness();a.controller.assign(contract.WALK_POSE.id);a.settle();assert.throws(()=>a.controller.request('bad'));const b=harness();b.controller.assign(contract.WALK_POSE.id);b.settle();const req=b.controller.request(contract.walkScreenshot(0));b.tick();b.controller.take(req.id);assert.throws(()=>b.controller.take(req.id));});
test('changing actual selected source or active scene after settlement rejects a capture',()=>{const h=harness();h.controller.assign(contract.WALK_POSE.id);h.settle();h.controller.request(contract.walkScreenshot(0));h.sprite.texture.key='idle';h.tick({selection:false});assert.equal(h.controller.snapshot().captureCount,0);assert(h.controller.snapshot().errors.length);});

// Synthetic PNG/schema only, deliberately never saved as runtime evidence.
const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
const chunk=(name,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(name,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;};
function png(width,height){const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const o=y*(width*4+1)+x*4+1;rows[o]=x%256;rows[o+1]=y%256;rows[o+3]=255;}return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}

function game(receipt, viewport) {
  const { x, y } = receipt.assigned;
  const hero = { key: contract.WALK_FRAME.textureKey, x, y, depth: y+20, originX: .5, originY: .5, alpha: 1, scaleX: 1, scaleY: 1, displayWidth: 100, displayHeight: 100 };
  const ground = { perimeter: [{ objectId: 100 }], backdrop: [{ objectId: 101, commands: expectedBackdropCommands() }] };
  const plaza = ['shop','rear-foundation','rear-upper','endcap-foundation','endcap-upper'].map((id, i) => {
    const shop = id === 'shop', rear = id.startsWith('rear'), py = shop ? 568 : rear ? 432 : 376;
    return { name: `town-plaza-${id}`, objectId: i+10, active: true, visible: true, alpha: 1, depth: py+20,
      key: shop ? 'town_corner_shop_v1' : `town_plaza_${id.replace('-', '_')}_v1`, x: shop ? 1664 : rear ? 1496 : 1728, y: py,
      originX: shop ? .5 : (rear ? 520 : 136)/656, originY: shop ? .5 : rear ? 536/544 : 472/480,
      scaleX: shop ? .24 : .5, scaleY: shop ? .24 : .5, displayWidth: shop ? 301 : 328, displayHeight: shop ? 301 : rear ? 272 : 240 };
  });
  const geometry = { camera: structuredClone(receipt.frames.at(-1).camera), canvas: { width: viewport.css.width, height: viewport.css.height },
    hud: { x: 8, y: 8, width: 342, height: 44 }, controls: { x: 8, y: 438, width: 342, height: 54 },
    hudItems: [{ name: 'score', bounds: { x: 16, y: 13, width: 100, height: 14 } }, { name: 'hp', bounds: { x: 16, y: 33, width: 60, height: 12 } }, { name: 'area', bounds: { x: 148, y: 33, width: 80, height: 12 } }],
    controlItems: [{ name: 'status', bounds: { x: 16, y: 443, width: 160, height: 13 } }, { name: 'primary', bounds: { x: 16, y: 463, width: 90, height: 20 } }],
    heroGround: { x: 120, y: 250 }, heroVisible: { textureKey: contract.WALK_FRAME.textureKey, alphaThreshold: 32, sourceBounds: { x: 110, y: 100, width: 30, height: 50, opaquePixels: 700 }, screenBounds: { x: 110, y: 220, width: 18, height: 32 } },
    entranceLabel: null, entrancePrompt: { text: 'E · Enter ruins', visible: false, active: true, alpha: 1, screenBounds: { x: 500, y: 100, width: 90, height: 20 } } };
  const g = { at: receipt.settledAt + 2, courtyardFrame: { frame: receipt.settledNativeFrame + 1, delta: 16, hero: { textureKey: contract.WALK_FRAME.textureKey, frameName: '__BASE', animation: contract.WALK_FRAME.animation, playing: false } }, x, y, area: 0, expeditionActive: false, returned: false, outcome: 'preparing', elapsed: 0, kills:0,
    intent: { x: 0, y: 0 }, dash: { timer: 0 }, plaza, viewportGeometry: geometry, townArt: { hero, ground },
    plazaVisibility: { samples: 100, readable: 100, meanTransmission: .72, occluders: [] },
    plazaProbe: { id: receipt.sequence, requestedAt: receipt.settledAt + 1, respondedAt: receipt.settledAt + 2 } };
  const cam=geometry.camera,project=(dx,dy)=>({x:((x+dx-cam.scrollX)*cam.matrix[0]+cam.matrix[4])*viewport.css.width/viewport.logical.width,y:((y+dy-cam.scrollY)*cam.matrix[3]+cam.matrix[5])*viewport.css.height/viewport.logical.height}),tl=project(-11,-32),br=project(40,12);
  geometry.heroVisible={textureKey:contract.WALK_FRAME.textureKey,alphaThreshold:32,frameWidth:256,frameHeight:256,sourceBounds:{x:117,y:96,width:51,height:44,opaquePixels:936},screenBounds:{...tl,width:br.x-tl.x,height:br.y-tl.y}};
  fabricateCourtyardSchema(g);
  const observedHero = {objectId:9000,name:contract.WALK_FRAME.textureKey,depth:hero.depth,alpha:1,scaleX:1,scaleY:1,rotation:0,scrollFactorX:1,scrollFactorY:1,worldMatrix:[1,0,0,1,x,y],frame:{x:0,y:0,width:256,height:256,displayOriginX:128,displayOriginY:128,flipX:false,flipY:false,sourceBounds:{x:117,y:96,width:51,height:44}}};
  const observedWalls = structuredClone(ground.courtyard);
  const scale=Math.max(viewport.logical.width/1920,viewport.logical.height/1080)*1.3*Math.max(1,1.35/cam.zoom),vignette={objectId:9500,name:'vignette',textureKey:'vignette',type:'Image',depth:2500,alpha:.25,active:true,visible:true,x:viewport.logical.width/2,y:viewport.logical.height/2,scaleX:scale,scaleY:scale,rotation:0,scrollFactorX:0,scrollFactorY:0,worldMatrix:[Math.fround(scale),0,0,Math.fround(scale),Math.fround(viewport.logical.width/2),Math.fround(viewport.logical.height/2)],frame:{x:0,y:0,width:1920,height:1080,displayOriginX:960,displayOriginY:540,flipX:false,flipY:false}};
  const painterOrder = [observedHero, ...observedWalls,vignette].sort((a, b) => a.depth - b.depth);
  painterOrder.forEach((object, index) => Object.assign(object, { worldIndex: index, painterIndex: index }));
  for (const wall of observedWalls) {
    const aboveHero = wall.painterIndex > observedHero.painterIndex, samples = wall.name==='town-courtyard-east-upper'?1:0;
    Object.assign(wall, { aboveHero, worldMatrix: [1,0,0,1,0,0], intersectedSamples: samples, contributingSamples: samples,
      fills: readCourtyardFills(wall.commands, wall.name).map(fill => ({ ...fill, intersectedSamples:samples&&fill.fillIndex===56?1:0,contributingSamples:samples&&fill.fillIndex===56?1:0 })) });
  }
  g.courtyardVisibility = { method: 'analytic-source-transmission', nativePixels: false, valid: true, issues: [], alphaThreshold: 128, sampleStep: 3,
    samples:61,readable:61,meanTransmission:(61-.28)/61*(1-.25*2/255),images:[vignette],occluders:['town-courtyard-east-upper','vignette'],viewport: structuredClone(viewport), camera: { ...receipt.frames.at(-1).camera, alpha: 1 }, hero: observedHero, walls: observedWalls, painterOrder };
  return g;
}

const shape=index=>index?{css:{x:8,y:199.875,width:374,height:498.65625},backing:{width:374,height:498},logical:{width:374,height:498.65625}}:{css:{x:106,y:188.875,width:1068,height:600.75},backing:{width:1068,height:600},logical:{width:1068,height:600.75}};
function receipt(index=0){const v=shape(index),zoom=index?.7276595744680852:1.35,camera={x:0,y:0,width:v.logical.width,height:v.logical.height,zoom,scrollX:index?1820:1473,scrollY:index?454:398,matrix:index?[0.7276595830917358,0,0,0.7276595830917358,50.92765808105469,67.5739974975586]:[1.350000023841858,0,0,1.350000023841858,-186.90000915527344,-105.50625610351562]},assigned={x:2007.5,y:698.5,rot:0};
 const frames=Array.from({length:4},(_,i)=>({nativeFrame:11+i,publicationFrame:11+i,at:101+i+.1,observerAt:101+i,transform:{...assigned},intent:{x:0,y:0},velocity:{vx:0,vy:0},dashTimer:0,sprite:{x:2007.5,y:698.5,depth:718.5,texture:contract.WALK_FRAME.textureKey,frame:'__BASE',animation:contract.WALK_FRAME.animation,playing:false,paused:true,animationFrameIndex:5,scaleX:1,scaleY:1,originX:.5,originY:.5,rotation:0,flipX:false,flipY:false},camera:structuredClone(camera)}));
 return{evidenceMode:contract.WALK_MODE,nativeMovementEvidence:false,controlledFrameAssignment:true,assignment:'actual-ecs-transform-and-paused-animation-frame',animationSelection:'instance-only-production-selection-suppressed',sequence:1,poseId:contract.WALK_POSE.id,sceneId:1,playerId:1,prior:{x:1472,y:536,rot:0},assigned,assignedAt:100,assignedNativeFrame:10,assignedFrameCounter:11,clearance:visual.visualClearance(contract.WALK_POSE),frames,stableComparisons:3,cameraTolerance:.01,settled:{...assigned},settledNativeFrame:14,settledAt:104.1};
}
function specimen(index=0){const r=receipt(index),v=shape(index),g=game(r,v),image=png(v.backing.width,v.backing.height),body=image.toString('base64');
 const source={textureKey:contract.WALK_FRAME.textureKey,frameName:'__BASE',width:256,height:256,frameX:0,frameY:0,displayOriginX:128,displayOriginY:128,flipX:false,flipY:false,pixel:[132,135],rgba:[26,23,27,232],neighbor:{pixel:[131,135],rgba:[36,35,43,254]}};
 const metadata={evidenceMode:contract.WALK_MODE,nativeMovementEvidence:false,controlledFrameAssignment:true,label:contract.walkScreenshot(index),poseReceipt:r,nativeFrame:g.courtyardFrame.frame,heroFrame:g.courtyardFrame.hero,probeId:1,at:g.at,capturedAt:g.at+.1,consumedAt:g.at+1,viewport:contract.walkViewport(index),documentWidth:contract.walkViewport(index).width,...v,base64Chars:body.length,gameplay:g,source,suppressedSelections:5};
 const capture={metadata,pngSHA256:createHash('sha256').update(image).digest('hex'),raster:verifyWalkCapturedPNG(metadata,body,index)};
 const controller={evidenceMode:contract.WALK_MODE,nativeMovementEvidence:false,controlledFrameAssignment:true,animationSelection:'instance-only-production-selection-suppressed',enabled:true,bound:true,closed:false,pending:false,complete:true,requests:1,captureCount:1,requested:false,captured:false,errors:[],receipt:r,selectedFrames:5,suppressedSelections:5,lastRenderedNativeFrame:15,history:[metadata],ownedWalls:COURTYARD_NAMES.map(name=>({name,destroyed:false,inWorld:true})),methodOwned:true,methodRestored:false,preRenderAttached:true,postRenderAttached:true};
 const keys=[...Array.from({length:248},(_,i)=>`key-${i}`),contract.WALK_FRAME.textureKey,'town_cobble_material_v1','town_corner_shop_v1','town_corner_lantern_v1','town_ruins_entrance_v1',...PLAZA_KEYS];
 const motion=(at,x=2007.5,y=698.5)=>({at,area:0,x,y,intent:{x:0,y:0},dash:{timer:0}});
 const state={ready:true,profile:'readiness',blocked:[],navigations:[],rewardMutations:[],api:[],plazaMotionOverflow:false,courtyardEvidence:null,walkFrameEvidence:controller,
 scenes:[{id:1,pageId:1,loadComplete:true,totalFailed:0,missingKeys:[],loadErrors:[],queuedKeys:keys,decodedKeys:keys,preloadAt:1,createAt:2,framesAfterCreate:100,destroyed:false}],plazaMotion:[motion(99,1472,536),...r.frames.map(f=>motion(f.observerAt)),motion(g.at)]};
 const cleanup=structuredClone(state);cleanup.scenes[0].destroyed=true;Object.assign(cleanup,{authCallbacks:0,canvasCount:0,mountedPages:[]});Object.assign(cleanup.walkFrameEvidence,{closed:true,methodOwned:false,methodRestored:true,preRenderAttached:false,postRenderAttached:false});cleanup.walkFrameEvidence.ownedWalls.forEach(w=>{w.destroyed=true;w.inWorld=false;});
 return{body,capture,observation:{browserVersion:'143.0.7499.4',blocked:[],errors:[],consoleErrors:[],unexpectedConsoleErrors:[],cleanupErrors:[],state,afterCleanup:cleanup},driver:{kind:'controlled-walking-frame-driver',evidenceMode:contract.WALK_MODE,nativeMovementEvidence:false,controlledFrameAssignment:true,index,completed:true,elapsedMs:1000,controller,capture}};
}
function report(requestedMode='execution'){const execution=requestedMode==='execution',project='chromium-arpg-walk-frame',file='walk-frame.spec.ts';const specs=contract.WALK_TITLES.map((title,index)=>{const s=specimen(index),json=(name,data)=>({name,contentType:'application/json',body:Buffer.from(JSON.stringify(data)).toString('base64')});
 return{title,id:`walk-${index}`,file,ok:true,tests:[{projectId:project,projectName:project,expectedStatus:'passed',annotations:[],status:execution?'expected':'skipped',results:execution?[{status:'passed',retry:0,annotations:[],errors:[],workerIndex:0,startTime:'2026-10-12T00:00:00Z',duration:1000,attachments:[json('arpg-real-engine-observations',s.observation),json('courtyard-controlled-walking-frame-driver',s.driver),{name:s.capture.metadata.label,contentType:'image/png',body:s.body}]}]:[]}]};});
 return{config:{version:'1.57.0',forbidOnly:true,workers:1,shard:null,projects:[{id:project,name:project,repeatEach:1,retries:0,testMatch:[file]}]},errors:[],suites:[{file,title:file,specs}],stats:{expected:execution?2:0,skipped:execution?0:2,unexpected:0,flaky:0}};
}
test('two synthetic report/capture cases pass with explicit analytic/raster limit',()=>{assert.match(verifyWalkFrame(report(),'execution'),/transmission and broad readability are NOT measured/);for(let i=0;i<2;i++){const s=specimen(i);assert.equal(s.capture.raster.raster.pixels.length,25);assert.equal(s.capture.raster.point.coloredBodyGridContributions,1);assert.equal(s.capture.raster.point.measuredPixelTransmission,null);}});
test('two-case discovery cannot be reported as execution',()=>{assert.match(verifyWalkFrame(report('discovery'),'discovery'),/ZERO execution/);assert.throws(()=>verifyWalkFrame(report('discovery'),'execution'));assert.throws(()=>verifyWalkFrame(report(),'discovery'));});
const firstResult=r=>r.suites[0].specs[0].tests[0].results[0];
function edit(r,name,fn){const a=firstResult(r).attachments.find(a=>a.name===name),v=JSON.parse(Buffer.from(a.body,'base64'));fn(v);a.body=Buffer.from(JSON.stringify(v)).toString('base64');}
const editDriver=(r,fn)=>edit(r,'courtyard-controlled-walking-frame-driver',fn),editObservation=(r,fn)=>edit(r,'arpg-real-engine-observations',fn);
// Keep every duplicated receipt coherent so these negatives reach the actual
// evidence predicate rather than failing only because one copy differs.
function coherent(r,fn){let driver;editDriver(r,d=>{fn(d);d.capture.metadata.poseReceipt=structuredClone(d.controller.receipt);d.controller.history=[structuredClone(d.capture.metadata)];driver=d;});editObservation(r,o=>{for(const snapshot of[o.state,o.afterCleanup]){const c=snapshot.walkFrameEvidence;for(const key of['receipt','history'])c[key]=structuredClone(driver.controller[key]);}});}
const cases={
 'extra case':r=>r.suites[0].specs.push(r.suites[0].specs[0]),'duplicate ID':r=>r.suites[0].specs[1].id=r.suites[0].specs[0].id,'renamed suite':r=>r.suites[0].file='visual.spec.ts','wrong project':r=>r.config.projects[0].name='old','retry permitted':r=>r.config.projects[0].retries=1,'skipped':r=>firstResult(r).annotations.push({type:'skip'}),'retry result':r=>firstResult(r).retry=1,'failed result':r=>firstResult(r).status='failed',
 'extra image':r=>firstResult(r).attachments.push(firstResult(r).attachments[2]),'missing image':r=>firstResult(r).attachments.pop(),'wrong image label':r=>firstResult(r).attachments[2].name='phone-courtyard-home','corrupt PNG':r=>firstResult(r).attachments[2].body=Buffer.alloc(140).toString('base64'),
 'native claim':r=>editDriver(r,d=>d.nativeMovementEvidence=true),'idle mode':r=>editDriver(r,d=>d.evidenceMode='controlled-scene-visual'),'driver incomplete':r=>editDriver(r,d=>d.completed=false),'no animation suppression disclosure':r=>coherent(r,d=>d.controller.receipt.animationSelection='native'),
 'unsafe+1Y':r=>coherent(r,d=>d.controller.receipt.assigned.y++),'unknown pose ID':r=>coherent(r,d=>d.controller.receipt.poseId='east-inner'),'concealed jump':r=>coherent(r,d=>d.controller.receipt.prior.x=2007.5),'one settling frame':r=>coherent(r,d=>d.controller.receipt.frames.splice(1)),'repeated engine ID':r=>coherent(r,d=>d.controller.receipt.frames[1].nativeFrame=11),'repeated publication time':r=>coherent(r,d=>d.controller.receipt.frames[1].observerAt=101),'preassignment publication':r=>coherent(r,d=>d.controller.receipt.frames[0].observerAt=100),'wrong publication frame':r=>coherent(r,d=>d.controller.receipt.frames[1].publicationFrame=11),'unsettled camera':r=>coherent(r,d=>d.controller.receipt.frames[3].camera.scrollX++),'wrong animation frame':r=>coherent(r,d=>d.controller.receipt.frames[0].sprite.animationFrameIndex=4),'playing frame':r=>coherent(r,d=>d.controller.receipt.frames[0].sprite.playing=true),
 'raw publication missing':r=>editObservation(r,o=>o.state.plazaMotion.splice(2,1)),'raw duplicate':r=>editObservation(r,o=>o.state.plazaMotion.splice(2,0,o.state.plazaMotion[2])),'raw pose drift':r=>editObservation(r,o=>o.state.plazaMotion[2].y++),'input movement':r=>editObservation(r,o=>o.state.plazaMotion[2].intent.y=1),'raw overflow':r=>editObservation(r,o=>o.state.plazaMotionOverflow=true),'old motion schema mutated':r=>editObservation(r,o=>o.state.plazaMotion[2].courtyardFrame={frame:12}),
 'session side effect':r=>editObservation(r,o=>o.state.api.push({path:'/api/games/session/start',method:'POST'})),'reward side effect':r=>editObservation(r,o=>o.state.rewardMutations.push({})),'navigation':r=>editObservation(r,o=>o.state.navigations.push('/')),'scene replaced':r=>editObservation(r,o=>o.state.scenes[0].id=2),'load failure':r=>editObservation(r,o=>o.state.scenes[0].totalFailed=1),'missing real S4 asset':r=>editObservation(r,o=>o.state.scenes[0].queuedKeys[248]='fake'),'cleanup leaked canvas':r=>editObservation(r,o=>o.afterCleanup.canvasCount=1),'cleanup selector remains':r=>editObservation(r,o=>o.afterCleanup.walkFrameEvidence.methodRestored=false),'cleanup pre-render remains':r=>editObservation(r,o=>o.afterCleanup.walkFrameEvidence.preRenderAttached=true),'cleanup wall remains':r=>editObservation(r,o=>o.afterCleanup.walkFrameEvidence.ownedWalls[0].inWorld=true),'cleanup observation lost':r=>editObservation(r,o=>o.afterCleanup.plazaMotion.splice(2,1)),
 'capture frame mismatch':r=>coherent(r,d=>d.capture.metadata.nativeFrame++),'capture precedes request':r=>coherent(r,d=>d.capture.metadata.gameplay.plazaProbe.requestedAt=d.capture.metadata.at),'source alpha wrong':r=>coherent(r,d=>d.capture.metadata.source.rgba[3]=255),'neighbor mismatch':r=>coherent(r,d=>d.capture.metadata.source.neighbor.rgba[0]++),'native hero identity mismatch':r=>coherent(r,d=>d.capture.metadata.gameplay.courtyardFrame.hero.textureKey='idle'),
 'unmatched PNG hash':r=>editDriver(r,d=>d.capture.pngSHA256='0'.repeat(64)),'raster fabricated':r=>editDriver(r,d=>d.capture.raster.raster.pixels[0].rgba[0]^=1),'false measured transmission':r=>editDriver(r,d=>d.capture.raster.point.measuredPixelTransmission=.72),'false broad readability':r=>editDriver(r,d=>d.capture.raster.point.broadReadabilityProven=true)
};
for(const[name,mutate]of Object.entries(cases))test(`complete report rejects ${name}`,()=>{const r=report();mutate(r);assert.throws(()=>verifyWalkFrame(r,'execution'));});
for(const[name,mutate]of Object.entries({
 'source texture':s=>s.capture.metadata.source.textureKey='idle','source pixel':s=>s.capture.metadata.source.pixel[0]--,'source origin':s=>s.capture.metadata.source.displayOriginY--,'hero world matrix':s=>s.capture.metadata.gameplay.courtyardVisibility.hero.worldMatrix[5]++,'hero scroll factor':s=>s.capture.metadata.gameplay.courtyardVisibility.hero.scrollFactorX=0,'hero opacity':s=>s.capture.metadata.gameplay.courtyardVisibility.hero.alpha=.5,'silhouette source':s=>s.capture.metadata.gameplay.viewportGeometry.heroVisible.textureKey='idle','silhouette alpha count':s=>s.capture.metadata.gameplay.viewportGeometry.heroVisible.sourceBounds.opaquePixels--,'silhouette projection':s=>s.capture.metadata.gameplay.viewportGeometry.heroVisible.screenBounds.x++,'zero wall contribution':s=>s.capture.metadata.gameplay.courtyardVisibility.walls[3].contributingSamples=0,'different fill contribution':s=>{const f=s.capture.metadata.gameplay.courtyardVisibility.walls[3].fills;f[56].contributingSamples=0;f[55].contributingSamples=1;},'changed fill color':s=>s.capture.metadata.gameplay.courtyardVisibility.walls[3].fills[56].color++,'changed fade':s=>s.capture.metadata.gameplay.courtyardVisibility.walls[3].alpha=1,'source sample count':s=>s.capture.metadata.gameplay.courtyardVisibility.samples=62,'claimed full alpha':s=>s.capture.metadata.source.rgba[3]=255,'PNG dimensions':s=>s.capture.metadata.backing.width++,'logical transform mismatch':s=>s.capture.metadata.logical.width++,'wrong viewport':s=>s.capture.metadata.viewport.width=390,'recorded canvas too wide':s=>s.capture.metadata.css.width=2049,'unconsumed capture':s=>s.capture.metadata.consumedAt=null
}))test(`same-frame capture rejects ${name}`,()=>{const s=specimen();mutate(s);assert.throws(()=>verifyWalkCapturedPNG(s.capture.metadata,s.body,0));});

test('real checked-in S4 PNG drives the unchanged fill observer to exactly one colored grid contribution',async()=>{
 const {decodeCourtyardPNG}=await import('./courtyard-png.mjs'),{scanAlphaBounds}=await import('./alpha-bounds.mjs'),{observeCourtyardVisibility}=await import('./courtyard-visibility.mjs');
 const path=resolve(here,'../../../static/games/arpg/characters/hero/knight/knight_armed_walk/S/knight_armed_walk_S_270.0_4.png'),bytes=readFileSync(path),git=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
 assert.equal(git,'e386dc09da706c6b7ac3e6028918e968a22a7632');const decoded=decodeCourtyardPNG(bytes),data=new Uint8ClampedArray(256*256*4);for(let y=0;y<256;y++)for(let x=0;x<256;x++)data.set(decoded.pixel(x,y),(y*256+x)*4);
 assert.deepEqual(decoded.pixel(132,135),[26,23,27,232]);assert.deepEqual(decoded.pixel(131,135),[36,35,43,254]);const bounds=scanAlphaBounds(data,256,256);assert.deepEqual(bounds,{x:117,y:96,width:51,height:44,opaquePixels:936});
 class Obj{constructor(type){Object.assign(this,{type,name:'',x:0,y:0,scaleX:1,scaleY:1,rotation:0,scrollFactorX:1,scrollFactorY:1,alpha:1,depth:0,active:true,visible:true,blendMode:0,parentContainer:null,mask:null,hasPostPipeline:false,displayOriginX:0,displayOriginY:0,flipX:false,flipY:false});}getWorldTransformMatrix(){return{a:1,b:0,c:0,d:1,e:this.x,f:this.y};}setName(v){this.name=v;return this;}setDepth(v){this.depth=v;return this;}setAlpha(v){this.alpha=v;return this;}}
 class Graphics extends Obj{constructor(){super('Graphics');this.commandBuffer=[6,1,0,0,7,0,0];}fillStyle(c,a){this.commandBuffer.push(7,c,a);return this;}fillPoints(ps,closed){this.commandBuffer.push(1,5,ps[0].x,ps[0].y);for(const p of ps.slice(1))this.commandBuffer.push(4,p.x,p.y);if(closed)this.commandBuffer.push(4,ps[0].x,ps[0].y);this.commandBuffer.push(8);return this;}}
 class Sprite extends Obj{};class Image extends Obj{};class Text extends Obj{};
 const townPlaza=load(resolve(here,'../../../src/lib/games/arpg/townPlaza.ts'),{'./viewportLayout':load(resolve(here,'../../../src/lib/games/arpg/viewportLayout.ts'),{})}),{createTownCourtyard}=load(resolve(here,'../../../src/lib/games/arpg/assets/townCourtyard.ts'),{'../townPlaza':townPlaza});
 const worldLayer={list:[],alpha:1,blendMode:-1,visible:true,parentContainer:null,mask:null},court=createTownCourtyard({add:{graphics:()=>new Graphics()}},o=>worldLayer.list.push(o));
 const hero=new Sprite('Sprite');Object.assign(hero,{x:2007.5,y:698.5,depth:718.5,displayOriginX:128,displayOriginY:128,texture:{key:contract.WALK_FRAME.textureKey},frame:{x:0,y:0,cutWidth:256,cutHeight:256,rotated:false}});court.updateActor(hero);
 const perimeter=new Graphics().setName('town-perimeter-rim').setDepth(-9000),backdrop=new Graphics().setName('town-exterior-backdrop').setDepth(-9001);worldLayer.list.push(perimeter,backdrop,hero);worldLayer.list.sort((a,b)=>a.depth-b.depth);
 const camera={scrollX:0,scrollY:0,alpha:1,matrix:{a:1,b:0,c:0,d:1,e:0,f:0},renderList:[...worldLayer.list],fadeEffect:{isRunning:false,isComplete:false,alpha:0},flashEffect:{isRunning:false,alpha:1},mask:null,hasPostPipeline:false,postPipelines:[],preFX:null,postFX:{isPost:true,enabled:false,list:[]}},ids=new Map(),objectId=o=>{if(!ids.has(o))ids.set(o,ids.size+1);return ids.get(o);};
 const v=observeCourtyardVisibility({worldLayer,owned:{perimeter,backdrop,courtyard:court.objects},hero,camera,portalText:null,viewport:shape(0),Graphics,Image,Sprite,Text,objectId,decodedPixels:()=>({width:256,height:256,data}),decodedAlphaBounds:()=>bounds});
 assert.equal(v.valid,true,v.issues.join(';'));assert.equal(v.samples,61);assert.equal(v.readable,61);assert.equal(v.walls[3].fills[56].contributingSamples,1);assert.deepEqual(v.walls.map(w=>w.contributingSamples),[0,0,0,1]);assert.deepEqual(v.walls[3].fills.filter(f=>f.contributingSamples).map(f=>f.fillIndex),[56]);assert(Math.abs(v.meanTransmission-(61-.28)/61)<1e-12);
 const g=game(receipt(),shape(0)),spec=g.courtyardVisibility.images[0],vignette=new Image('Image');Object.assign(vignette,spec,{displayOriginX:960,displayOriginY:540,flipX:false,flipY:false,texture:{key:'vignette'},frame:{x:0,y:0,cutWidth:1920,cutHeight:1080,rotated:false}});vignette.getWorldTransformMatrix=()=>Object.fromEntries(['a','b','c','d','e','f'].map((k,i)=>[k,spec.worldMatrix[i]]));worldLayer.list.push(vignette);camera.renderList.push(vignette);Object.assign(camera,g.courtyardVisibility.camera);camera.matrix=Object.fromEntries(['a','b','c','d','e','f'].map((k,i)=>[k,g.viewportGeometry.camera.matrix[i]]));
 const vb=readFileSync(resolve(here,'../../../static/games/arpg/ui/filter/filter_vignette.png'));verifyWalkVignetteAsset(vb);const vp=decodeCourtyardPNG(vb),vd=new Uint8ClampedArray(1920*1080*4);for(let y=0;y<1080;y++)for(let x=0;x<1920;x++)vd.set(vp.pixel(x,y),(y*1920+x)*4);
 const composed=observeCourtyardVisibility({worldLayer,owned:{perimeter,backdrop,courtyard:court.objects},hero,camera,portalText:null,viewport:shape(0),Graphics,Image,Sprite,Text,objectId,decodedPixels:frame=>frame===vignette.frame?{width:1920,height:1080,data:vd}:{width:256,height:256,data},decodedAlphaBounds:()=>bounds});
 assert.equal(composed.valid,true,composed.issues.join(';'));assert.deepEqual(composed.occluders,['town-courtyard-east-upper','vignette']);assert(Math.abs(composed.meanTransmission-.9934580520732896)<1e-12);g.courtyardVisibility=composed;for(let i=0;i<4;i++)g.townArt.ground.courtyard[i].objectId=composed.walls[i].objectId;validateWalkGameplay(g,specimen().capture.metadata.source);
});

const preserved={
  "guard.ts": "853558aedcab5363cba542d5401be17daf4e9675968a8288ce9d7ddc757ee173",
  "plaza-browser.ts": "cf3565826545746b4087f76102b4f58f8f08f8a957f9d0ffaf6b06321ae9dcac",
  "plaza-navigation.mjs": "3236281de80be869dbbf0319a73c90aa9c39d057c22b7e8bb347b3c2dde9b322",
  "courtyard-browser.ts": "dc3d44dca902103db9aa98d776cbf4bd3f5cc75feeafc83603fb469c411c1ad3",
  "courtyard-departure.ts": "5c733534948ce620b4018307aea19ac842c7d7c55b837441b69a81dba6ee5101",
  "courtyard-visibility.mjs": "28eee9916e3ff9ecbc0a19da3973f480691da5ff0ba42d1a0f165f61ec6abbc6",
  "courtyard-capture-contract.mjs": "2cfedf4e8788969f9bccfd12bcb8e8867a77964830f9c06f40e791d393498a11",
  "visual-observer.ts": "c25f34756c9fab3d384a9245514eb56842857e6d5d3911ca4af5a25d93e1ae25",
  "visual.test.mjs": "1add569dcd8c6daaef9068cd747e5bdfce5293ce5de0cb7fb765531611bc701e",
  "visual.spec.ts": "0101030142958f614cf9cc5fc200b23b67ce6dcb3f7de1db11802c5aaaa6d3eb",
  "visual-verifier.mjs": "de779e1820657bf9dae9131e137f61030e58cf40743d311aefdc71ab5877bafa",
  "visual.playwright.config.ts": "899200e3da76b0e81b6c1f0b2fb14961db214c3137d249e9d8c3a51b373b0742",
  "readiness.browser.spec.ts": "8afafcd3d89d1e89166993e8da51b7c6c2bb02040c945b2043650fd9c7df241d",
  "courtyard.browser.spec.ts": "e71038f2d90c7b16baf66af264d0800977ef5c7df8907cbce403b0d23c32dec7",
  "playwright.config.ts": "5ca9d83e9c0679b167c4c21b0ca7eaf6e5967ca9374a12d9d258a46a8507b28b",
  "courtyard.playwright.config.ts": "e623b1c92030f4a1b1438b0c107937eb4f54def758eea59199762b450f766c02",
  "courtyard-graphics.mjs": "9a7d52c5f3fd4351f76fab2aaad73ad4a9ee854d6bb57447754afb3322d5e663",
  "vite.config.mjs": "ea44102b9b0f7f296e9de9b3710b329c9d723c1ebe143700c07e9752acb641e6",
  "asset-paths.json": "433c30e4fbbcaf0002d2d3b06cff0facf3fbea0499f76cda7afb1ba70cc55199"
};
for(const[name,sha]of Object.entries(preserved))test(`existing contract byte preservation: ${name}`,()=>assert.equal(createHash('sha256').update(readFileSync(resolve(here,name))).digest('hex'),sha));
test('only additive walking-mode wiring: main.ts',()=>{const source=readFileSync(resolve(here,'main.ts'),'utf8').replace("import './walk-frame-observer';\n",'');assert.equal(createHash('sha256').update(source).digest('hex'),'fab9597cc4abea2ac4a81894bdfa17e44baa75f9d0380a2f81daba4944feb35e');});
test('only additive walking-mode wiring: runtime.ts',()=>{const source=readFileSync(resolve(here,'runtime.ts'),'utf8').replace("    return { ...(window.__arpgWalkFrameFlow === true ? { walkFrameEvidence: window.__arpgWalkFrame?.snapshot() ?? null } : {}), courtyardEvidence: window.__arpgCourtyardFlow === true || window.__arpgCourtyardVisualFlow === true ? {\n", "    return { courtyardEvidence: window.__arpgCourtyardFlow === true || window.__arpgCourtyardVisualFlow === true ? {\n");assert.equal(createHash('sha256').update(source).digest('hex'),'9e89294cd6811b2a44da1adba23000b85065cf41a00475c0c853508a43c8493d');});
test('only additive walking-mode wiring: observe-scene.ts',()=>{const source=readFileSync(resolve(here,'observe-scene.ts'),'utf8').replace('\n// Read-only reuse by the explicitly enabled controlled walking-frame fixture.\nexport { decodedPixels, readCourtyardFrame };\n', '');assert.equal(createHash('sha256').update(source).digest('hex'),'46360dbbd6230884c651770576aca1760162fef9962fcdb37487a4ebadcbc30a');});
test('driver/config bounds retain two explicit cases and locked existing isolation',()=>{const driver=readFileSync(resolve(here,'walk-frame-browser.ts'),'utf8'),config=readFileSync(resolve(here,'walk-frame.playwright.config.ts'),'utf8'),spec=readFileSync(resolve(here,'walk-frame.spec.ts'),'utf8');assert.match(driver,/from '\.\/guard'/);assert(!/keyboard\.|mouse\.|setPosition|setScale|setZoom|setBounds/.test(driver));assert.match(config,/workers: 1, retries: 0, timeout: 180000/);assert.match(config,/serviceWorkers: 'block'/);assert.match(config,/ARPG_READINESS_BROWSER_EXECUTABLE/);assert.match(spec,/WALK_TITLES/);for(const file of['walk-frame-observer.ts','walk-frame-browser.ts','walk-frame.spec.ts','walk-frame.playwright.config.ts']){const result=ts.transpileModule(readFileSync(resolve(here,file),'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});assert.deepEqual(result.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error),[]);}});
test('the real additive-import guard rejects absent, duplicate, altered and unrelated changes',()=>{
 const path=resolve(here,'courtyard-source-bundle.test.mjs'),source=readFileSync(path,'utf8'),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true),call=ast.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.arguments[0]?.text==='actual route entry adds only explicit visual observer imports after original observer').expression;
 const check=source=>new Function('read','hash','assert',`return (${call.arguments[1].getText(ast)})();`)(()=>source,s=>createHash('sha256').update(s).digest('hex'),assert),main=readFileSync(resolve(here,'main.ts'),'utf8'),line="import './walk-frame-observer';\n";
 check(main);for(const changed of[main.replace(line,''),line+main,main.replace(line,"import './walk-frame-observer-changed';\n"),main.replace("import './observe-scene';","import './observe-scene-changed';"),main+'\nconsole.log("unrelated");\n'])assert.throws(()=>check(changed));
});

// Exact method bodies copied from locked Phaser v3.90.0, independently hash/
// excerpt checked in the correction evidence. Dependencies are minimal doubles;
// these execute real transform math and the real destruction ordering offline.
// TransformMatrix.js blob437ffc08c7da1cd1f50ea66bc2f4b20961a0ca35
// Systems.js blobc886c7946dc90928c1cf72bacc877b8cf07a7424
// Game.js blob397fbcdbb203e6bd0f70179d835d842665ae45e9
const Events={DESTROY:'destroy'},CONST={DESTROYED:9};
function applyITRS (x, y, rotation, scaleX, scaleY)
    {
        var matrix = this.matrix;

        var radianSin = Math.sin(rotation);
        var radianCos = Math.cos(rotation);

        // Translate
        matrix[4] = x;
        matrix[5] = y;

        // Rotate and Scale
        matrix[0] = radianCos * scaleX;
        matrix[1] = radianSin * scaleX;
        matrix[2] = -radianSin * scaleY;
        matrix[3] = radianCos * scaleY;

        return this;
    }
function destroySystems ()
    {
        var events = this.events;
        var settings = this.settings;

        settings.status = CONST.DESTROYED;

        settings.active = false;
        settings.visible = false;

        events.emit(Events.DESTROY, this);

        events.removeAllListeners();

        var props = [ 'scene', 'game', 'anims', 'cache', 'plugins', 'registry', 'sound', 'textures', 'add', 'camera', 'displayList', 'events', 'make', 'scenePlugin', 'updateList' ];

        for (var i = 0; i < props.length; i++)
        {
            this[props[i]] = null;
        }
    }
function runDestroy ()
    {
        this.scene.destroy();

        this.events.emit(Events.DESTROY);

        this.events.removeAllListeners();

        if (this.renderer)
        {
            this.renderer.destroy();
        }

        if (this.removeCanvas && this.canvas)
        {
            CanvasPool.remove(this.canvas);

            if (this.canvas.parentNode)
            {
                this.canvas.parentNode.removeChild(this.canvas);
            }
        }

        if (this.domContainer && this.domContainer.parentNode)
        {
            this.domContainer.parentNode.removeChild(this.domContainer);
        }

        this.loop.destroy();

        this.pendingDestroy = false;
    }

test('real Phaser applyITRS produces in-memory signed zero, lost through JSON',()=>{
 const object={matrix:new Float32Array(9)};applyITRS.call(object,0,0,0,1,1);const m=Array.from(object.matrix.slice(0,6));
 assert(Object.is(m[2],-0));assert.throws(()=>assert.deepEqual(m,[1,0,0,1,0,0]));assert.deepEqual(JSON.parse(JSON.stringify(m)),[1,0,0,1,0,0]);
 assertExactAffineMatrix(m,[1,0,0,1,0,0]);assert(Object.is(m[2],-0),'comparison must not mutate evidence');
 applyITRS.call(object,2007.5,698.5,0,1,1);assertExactAffineMatrix(Array.from(object.matrix.slice(0,6)),[1,0,0,1,2007.5,698.5]);
});
for(let mask=0;mask<16;mask++)test(`all exact identity zero signs accepted ${mask}`,()=>{const m=[1,0,0,1,0,0];[1,2,4,5].forEach((i,n)=>{if(mask&(1<<n))m[i]=-0;});assertExactAffineMatrix(m,[1,0,0,1,0,0]);});
for(const [name,mutate] of Object.entries({
 tinySkew:m=>m[2]=Number.MIN_VALUE,negativeSkew:m=>m[1]=-Number.MIN_VALUE,translation:m=>m[4]=Number.MIN_VALUE,scale:m=>m[0]=1+Number.EPSILON,
 nan:m=>m[2]=NaN,infinite:m=>m[4]=Infinity,stringZero:m=>m[2]='0',missing:m=>delete m[2],short:m=>m.pop(),extra:m=>m.push(0),extraProperty:m=>m.unexpected=0,
 wrongHeroX:m=>m[4]=2007.5,wrongHeroY:m=>m[5]=698.5
}))test(`exact affine guard rejects ${name}`,()=>{const m=[1,0,0,1,0,0];mutate(m);assert.throws(()=>assertExactAffineMatrix(m,[1,0,0,1,0,0]));});
function realDestruction(h,{shutdown=false,game=false}={}){
 const owner=h.scene.sys.game,sceneEvents=h.scene.events;Object.assign(h.scene.sys,{events:sceneEvents,settings:{status:5,active:true,visible:true}});
 if(shutdown)sceneEvents.emit('shutdown');
 const drop=()=>{destroySystems.call(h.scene.sys);for(const wall of h.walls){wall.scene=undefined;wall.active=false;}h.scene.worldLayer.list=[];h.observation.destroyed=true;};
 if(game){owner.scene={destroy:drop};owner.loop.destroy=()=>{};runDestroy.call(owner);}else drop();
 return {owner,sceneEvents};
}
for(const shutdown of [false,true])for(const game of [false,true])test(`real Phaser destruction permits closed snapshot shutdown=${shutdown} game=${game}`,()=>{
 const h=harness({own:true});h.controller.assign(contract.WALK_POSE.id);h.settle();const request=h.controller.request(contract.walkScreenshot(0));h.tick();h.controller.take(request.id);
 const {owner,sceneEvents}=realDestruction(h,{shutdown,game});assert.equal(h.scene.sys.game,null);assert.equal(h.scene.sys.events,null);
 const snap=h.controller.snapshot();assert.equal(snap.closed,true);assert.equal(snap.preRenderAttached,false);assert.equal(snap.postRenderAttached,false);assert.equal(snap.methodRestored,true);assert.deepEqual(snap.errors,[]);assert.deepEqual(Object.getOwnPropertyDescriptor(h.scene,'updateHeroAnimation'),h.descriptor);
 assert.equal(owner.events.listenerCount('prerender'),0);assert.equal(owner.events.listenerCount('postrender'),0);assert.equal(sceneEvents.listenerCount('destroy'),0);
 h.scene.sys=null;assert.deepEqual(h.controller.snapshot(),snap);sceneEvents.emit('destroy');owner.events.emit('destroy');assert.deepEqual(h.controller.snapshot(),snap);assert.throws(()=>h.controller.assign(contract.WALK_POSE.id));
});
for(const [name,change]of Object.entries({detachedGame:h=>h.scene.sys.game=null,replacedGame:h=>h.scene.sys.game={...h.scene.sys.game},gameEvents:h=>h.scene.sys.game.events=new EventEmitter(),sceneEvents:h=>h.scene.events=new EventEmitter(),nullSystems:h=>h.scene.sys=null}))test(`active lifecycle ${name} fails closed while retained emitter cleanup survives`,()=>{
 const h=harness(),oldGame=h.scene.sys.game,oldEvents=oldGame.events,sceneEvents=h.scene.events;h.controller.assign(contract.WALK_POSE.id);change(h);
 assert.throws(()=>h.controller.snapshot(),/Active scene\/game event ownership changed/);sceneEvents.emit('destroy');assert.equal(oldEvents.listenerCount('prerender'),0);assert.equal(oldEvents.listenerCount('postrender'),0);assert(h.controller.snapshot().errors.length);assert.equal(h.controller.snapshot().methodRestored,true);
});
test('destroyed cleanup preserves another animation owner and reports the conflict',()=>{const h=harness();h.controller.assign(contract.WALK_POSE.id);const replacement=()=>{};h.scene.updateHeroAnimation=replacement;realDestruction(h);assert.equal(h.scene.updateHeroAnimation,replacement);assert.equal(h.controller.snapshot().methodRestored,false);assert.match(h.controller.snapshot().errors.join(),/another writer/);});
test('closed snapshot still detects a hook removal failure on the retained emitter',()=>{const h=harness(),events=h.scene.sys.game.events;events.off=()=>events;realDestruction(h);assert.equal(h.controller.snapshot().preRenderAttached,true);assert.equal(h.controller.snapshot().postRenderAttached,true);});

test('corrupted vignette bytes fail the exact source proof',()=>{const bytes=readFileSync(resolve(here,'../../../static/games/arpg/ui/filter/filter_vignette.png'));verifyWalkVignetteAsset(bytes);const changed=Buffer.from(bytes);changed[changed.length-20]^=1;assert.throws(()=>verifyWalkVignetteAsset(changed));});
for(const [name,change]of Object.entries({missing:v=>v.images=[],extra:v=>v.images.push({...v.images[0],objectId:9999}),identity:v=>v.images[0].textureKey='other',opacity:v=>v.images[0].alpha=.2,frame:v=>v.images[0].frame.width=1919,flip:v=>v.images[0].frame.flipX=true,skew:v=>v.images[0].worldMatrix[2]=Number.MIN_VALUE,scale:v=>v.images[0].scaleX+=.01,position:v=>v.images[0].x++,unknownOccluder:v=>v.occluders.push('other'),wallOnlyMean:v=>v.meanTransmission=(61-.28)/61,outsideRegion:v=>{v.camera.scrollX+=100;}}))test(`vignette composition rejects ${name}`,()=>{const s=specimen();change(s.capture.metadata.gameplay.courtyardVisibility);if(name==='outsideRegion'){const g=s.capture.metadata.gameplay;g.viewportGeometry.camera.scrollX+=100;g.viewportGeometry.heroVisible.screenBounds.x-=100*g.courtyardVisibility.camera.matrix[0]*s.capture.metadata.css.width/s.capture.metadata.logical.width;}assert.throws(()=>verifyWalkCapturedPNG(s.capture.metadata,s.body,0),name==='outsideRegion'?/source-verified alpha2 region/:undefined);});

test('full in-memory S4 capture accepts real Phaser signed-zero wall and hero matrices',()=>{const s=specimen(),v=s.capture.metadata.gameplay.courtyardVisibility;for(const object of [...v.walls,v.hero]){const raw={matrix:new Float32Array(9)};applyITRS.call(raw,object===v.hero?2007.5:0,object===v.hero?698.5:0,0,1,1);object.worldMatrix=Array.from(raw.matrix.slice(0,6));assert(Object.is(object.worldMatrix[2],-0));}assert.equal(verifyWalkCapturedPNG(s.capture.metadata,s.body,0).point.coloredBodyGridContributions,1);v.hero.worldMatrix[2]=Number.MIN_VALUE;assert.throws(()=>verifyWalkCapturedPNG(s.capture.metadata,s.body,0));});
