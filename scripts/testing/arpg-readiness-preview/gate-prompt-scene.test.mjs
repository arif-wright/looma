// Offline scene-wiring proof only. Phaser rendering is mocked; hosted pixels
// and the actual FOLLOW_UPDATE event still require the real-engine CI run.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const base = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/lib/games/arpg');
const phaser = { Scene: class {}, Math: { Vector2: class { constructor(x=0,y=0){this.x=x;this.y=y;} } },
  Cameras: { Scene2D: { Events: { FOLLOW_UPDATE: 'followupdate' } } },
  Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } } };
// Compile the checked-in scene and its real pure dependencies; substitute only
// Phaser's renderer-bound import. No copy of the production visibility logic.
const modules = new Map();
function loadTs(path) {
  if(modules.has(path))return modules.get(path).exports;
  const source = readFileSync(path,'utf8');
  const compiled = ts.transpileModule(source,{fileName:path,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}});
  assert.deepEqual((compiled.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
  const module = {exports:{}}; modules.set(path,module);
  new Function('require','module','exports',compiled.outputText)((specifier)=>{
    if(specifier==='phaser')return phaser;
    assert(specifier.startsWith('.'),`Unexpected external runtime dependency: ${specifier}`);
    const file=resolve(dirname(path),specifier)+'.ts';assert(existsSync(file),file);return loadTs(file);
  },module,module.exports);
  return module.exports;
}
const { GameScene } = loadTs(resolve(base,'scenes/GameScene.ts'));
const { World } = loadTs(resolve(base,'ecs/components.ts'));
const { createExpedition, enterRuins, returnToTown } = loadTs(resolve(base,'expedition.ts'));
const rect=(x,y,width=94,height=20)=>({left:x,top:y,right:x+width,bottom:y+height});
function prompt(bounds=rect(200,250)) {
  return {text:'E · Enter ruins',visible:true,active:true,alpha:1,bounds,
    getBounds(){return this.bounds;},setVisible(value){this.visible=value;return this;},
    setText(value){this.text=value;return this;},destroy(){this.active=false;}};
}
function make() {
  const scene=new GameScene({isCurrent:()=>true,onReady(){},onError(){},onGameOver(){}});
  const camera=Object.assign(new EventEmitter(),{x:0,y:0,width:374,height:498.65625,scrollX:0,scrollY:0,
    matrix:{transformPoint:(x,y)=>({x,y})},setBackgroundColor(){}});
  scene.events=new EventEmitter();scene.cameras={main:camera};scene.portalText=prompt();
  scene.viewportLayout={hud:{x:8,y:8,width:358,height:44},controls:{x:8,y:436.65625,width:358,height:54}};
  scene.world=new World();scene.playerId=scene.world.createEntity();scene.runState='running';
  scene.scoreText=scene.areaText={setText(){}};scene.updateControlButtons=()=>{};
  return scene;
}
for(const [name,bounds] of [
  ['left',rect(-1,200)],['right',rect(350,200)],['top',rect(100,-1)],['bottom',rect(100,485)],
  ['fully outside',rect(500,600)],['HUD overlap',rect(100,45)],['controls overlap',rect(100,430)],
  ['nonfinite',rect(NaN,200)]
])test(`whole town label hides at ${name}`,()=>{
  const s=make();s.portalText.bounds=bounds;s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,false);
});
test('whole-label edge padding is strict and restores without moving the label',()=>{
  const s=make();s.portalText.bounds=rect(2,200);s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,true);
  s.portalText.bounds=rect(1.999,200);s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,false);
  const inside=rect(278,200);s.portalText.bounds=inside;s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,true);
  assert.equal(s.portalText.bounds,inside);
});
test('current render matrix, scroll, zoom, and nonzero camera viewport determine containment',()=>{
  const s=make(),c=s.cameras.main;
  Object.assign(c,{x:20,y:30,width:374,height:498,scrollX:1000,scrollY:500,matrix:{transformPoint:(x,y)=>({x:20+x*.5,y:30+y*.5})}});
  s.portalText.bounds=rect(1200,850,188,40);s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,true);
  c.scrollX=1450;s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,false);
  c.scrollX=1000;s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,true);
});
for(const [state,text]of [['ready','E · Enter ruins'],['retry','E · Retry saving'],['blocked','Unavailable'],['saving','Please wait…'],['starting','Please wait…']])test(`real ${state} state keeps its text and reculls resized bounds`,()=>{
  const s=make();s.setTownStatus(state);assert.equal(s.portalText.text,text);
  s.portalText.bounds=rect(300,200,68,20);s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,true);
  s.portalText.bounds=rect(300,200,105,20);s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,false);
  s.portalText.bounds=rect(150,250,105,20);s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,true);
});
test('initializeScene installs one settled-camera hook, not a stale update-loop check',()=>{
  const s=make();s.add={layer:()=>({})};
  for(const method of ['resetState','buildDungeonRoom','registerCharacterAnimations','setupPlayer','setupInput','setupUI','buildAreaContent','createOverlays','setupUICamera','updateFixedUITransforms'])s[method]=()=>{};
  s.initializeScene();assert.equal(s.cameras.main.listenerCount('followupdate'),1);
  s.portalText.bounds=rect(350,430);s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,false);
  s.portalText.bounds=rect(34,316);s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,true);
  s.events.emit('shutdown');assert.equal(s.cameras.main.listenerCount('followupdate'),0);
  s.initializeScene();assert.equal(s.cameras.main.listenerCount('followupdate'),1);
});
test('render hook updates while paused and after a viewport resize without an update tick',()=>{
  const s=make();s.runState='paused';s.setupPortalPromptVisibility();s.portalText.bounds=rect(250,250);
  s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,true);
  s.cameras.main.width=300;s.viewportLayout=arpgViewportLayout(300,498.65625,true);
  s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,false);
  s.cameras.main.width=374;s.viewportLayout=arpgViewportLayout(374,498.65625,true);
  s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,true);
  assert.equal(s.expeditionActive,false);assert.equal(s.elapsed,0);
});
for(const event of ['shutdown','destroy'])test(`camera hook cleans up once on ${event}`,()=>{
  const s=make();s.setupPortalPromptVisibility();s.events.emit(event);s.events.emit(event);
  assert.equal(s.cameras.main.listenerCount('followupdate'),0);
  assert.equal(s.events.listenerCount('shutdown'),0);assert.equal(s.events.listenerCount('destroy'),0);
});
test('real area transition replaces the prompt and restores town visibility on return',()=>{
  const s=make();s.setupPortalPromptVisibility();s.portalText.bounds=rect(350,430);
  s.cameras.main.emit('followupdate');const old=s.portalText;assert.equal(old.visible,false);
  s.worldLayer={list:[old]};s.time={removeAllEvents(){},clearPendingEvents(){}};s.tweens={killAll(){}};
  s.setupPlayer=()=>{s.playerId=s.world.createEntity();};s.buildDungeonRoom=()=>{};
  s.buildAreaContent=()=>{s.portalText=prompt(s.expedition.area===0?rect(236,358):rect(500,600));s.worldLayer.list=[s.portalText];};
  s.drawHpBar=()=>{};s.hpText={setText(){}};s.resizeVignette=()=>{};s.updateFixedUITransforms=()=>{};
  s.changeArea(enterRuins(s.expedition));s.cameras.main.emit('followupdate');assert.equal(old.active,false);assert.equal(s.portalText.visible,true);
  s.changeArea(returnToTown(s.expedition));s.cameras.main.emit('followupdate');assert.equal(s.expedition.area,0);assert.equal(s.portalText.visible,true);
  assert.equal(s.portalText.text,'E · Enter ruins');assert.equal(s.cameras.main.listenerCount('followupdate'),1);
});
for(const area of [1,2])test(`dungeon ${area} label behavior remains unconditional`,()=>{
  const s=make();s.expedition.area=area;s.portalText.visible=false;s.portalText.bounds=rect(1000,1000);
  s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,true);
});
test('culling cannot change gate position, 150px interaction radius, or E behavior',()=>{
  const s=make();let calls=0;s.handlePrimaryControl=()=>calls++;
  const gate=s.isoToWorld(18,9);assert.deepEqual(gate,{x:1728,y:664});
  for(const visible of [false,true])for(const distance of [0,150,150.001]){
    s.portalText.visible=visible;s.world.setTransform(s.playerId,{x:gate.x+distance,y:gate.y,rot:0});s.interactWithPortal();
  }
  assert.equal(calls,4);assert.equal(s.expeditionActive,false);assert.equal(s.elapsed,0);
});
test('missing or empty prompt fails safely before content is built',()=>{
  const s=make();s.portalText.text='';s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,false);
  s.portalText=undefined;assert.doesNotThrow(()=>s.updatePortalPromptVisibility());
});
const { arpgViewportLayout } = loadTs(resolve(base,'viewportLayout.ts'));
const recorded=JSON.parse(readFileSync(new URL('./gate-prompt-geometry.json',import.meta.url),'utf8'));
for(const entry of recorded.cases)test(`pre-fix hosted geometry replay: ${entry.name}`,()=>{
  const s=make(),{camera,canvas,screenBounds:r}=entry;
  const [a,b,c,d,e,f]=camera.matrix;assert.equal(b,0);assert.equal(c,0);
  // Undo only the observer's native-to-CSS scaling and camera projection to
  // supply actual label dimensions to the real production scene method.
  const nativeX=r.x*camera.width/canvas.width,nativeY=r.y*camera.height/canvas.height;
  s.portalText.bounds=rect((nativeX-e)/a+camera.scrollX,(nativeY-f)/d+camera.scrollY,
    r.width*camera.width/canvas.width/a,r.height*camera.height/canvas.height/d);
  Object.assign(s.cameras.main,camera,{matrix:{transformPoint:(x,y)=>({x:a*x+c*y+e,y:b*x+d*y+f})}});
  s.viewportLayout=arpgViewportLayout(camera.width,camera.height,true);
  s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,entry.expectedVisible);
});
