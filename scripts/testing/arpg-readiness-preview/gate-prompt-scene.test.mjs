// Offline scene-wiring proof only. Phaser rendering is mocked; hosted pixels
// and the actual FOLLOW_UPDATE event still require the real-engine CI run.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
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
  s.changeArea(enterRuins(s.expedition));s.cameras.main.emit('followupdate');assert.equal(old.active,false);assert.equal(s.portalText.visible,false);
  s.portalText.bounds=rect(120,200,190,40);s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,true);
  s.changeArea(returnToTown(s.expedition));s.cameras.main.emit('followupdate');assert.equal(s.expedition.area,0);assert.equal(s.portalText.visible,true);
  assert.equal(s.portalText.text,'E · Enter ruins');assert.equal(s.cameras.main.listenerCount('followupdate'),1);
});
for(const area of [1,2])test(`dungeon ${area} label restores only when completely contained`,()=>{
  const s=make();s.expedition.area=area;s.portalText.visible=false;s.portalText.bounds=rect(1000,1000);
  s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,false);
  const inside=rect(120,200,190,40);s.portalText.bounds=inside;s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,true);
  assert.equal(s.portalText.bounds,inside);
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


// Field-only extension. These execute the real scene method, but synthetic
// Text bounds remain mocked geometry, not native font or pixel measurements.
test('production delta only adds field canvas containment while preserving field HUD behavior',()=>{
  const current=readFileSync(resolve(base,'scenes/GameScene.ts'),'utf8');
  const anchor='    if (!prompt) return;\n';
  const removed='    if (this.expedition.area !== 0) {\n      prompt.setVisible(true);\n      return;\n    }\n';
  assert.equal(current.split(anchor).length,2);
  const uiComment='    // Keep the existing field HUD overlap behavior; only town excludes fixed UI.\n';
  const uiCondition='const clearOfUI = this.expedition.area !== 0 || this.viewportLayout &&';
  assert.equal(current.split(uiComment).length,2);assert.equal(current.split(uiCondition).length,2);
  const preimage=current.replace(anchor,anchor+removed).replace(uiComment,'').replace(uiCondition,'const clearOfUI = this.viewportLayout &&')
    .replace('// viewport edge, or in town behind fixed UI.','// viewport edge or behind fixed UI.');
  assert.equal(createHash('sha256').update(preimage).digest('hex'),'bcba58bb65e044e1ba2e6300c54ff25d0ba046e2852230f48b5ee05a7735817c');
});
for(const area of [1,2])for(const [name,bounds,expected=false] of [
  ['left',rect(-1,200,190,40)],['right',rect(321,270,126,34)],
  ['top',rect(100,-1,190,40)],['bottom',rect(100,480,190,40)],
  ['HUD overlap',rect(100,45,190,40),true],['controls overlap',rect(100,430,190,40),true],
  ['nonfinite',rect(NaN,200,190,40)]
])test(`field ${area} whole label ${expected?'retains prior behavior':'hides'} at ${name}`,()=>{
  const s=make();s.expedition.area=area;s.viewportLayout=arpgViewportLayout(374,498.65625,false);
  s.portalText.bounds=bounds;s.setupPortalPromptVisibility();s.cameras.main.emit('followupdate');
  assert.equal(s.portalText.visible,expected);assert.equal(s.portalText.bounds,bounds);
});
for(const [area,kills,text]of [
  [1,0,'Mossgate Ruins\nWardens 0/4'],[1,2,'Mossgate Ruins\nWardens 2/4'],[1,4,'STAIR TO EMBER VAULT\nE · Descend'],
  [2,0,'Ember Vault\nWardens 0/6'],[2,3,'Ember Vault\nWardens 3/6'],[2,6,'WAY HOME\nE · Return victorious']
])test(`field ${area} phase ${kills} retains exact caption and remeasures before drawing`,()=>{
  const s=make();s.expedition={...createExpedition(),area,floorKills:kills};s.setupPortalPromptVisibility();
  s.portalText.bounds=rect(340,200,20,40);s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,true);
  // A real Phaser setText refreshes the bounds synchronously. The mock changes
  // bounds on that call to prove the hook uses the current text dimensions.
  s.portalText.setText=function(value){this.text=value;this.bounds=rect(280,200,190,40);return this;};
  s.updateUIState();assert.equal(s.portalText.text,text);s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,false);
  s.portalText.bounds=rect(100,200,190,40);s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,true);
  assert.equal(s.portalText.text,text);assert.equal(s.expedition.floorKills,kills);
});
for(const area of [1,2])test(`field ${area} empty text hides and canvas containment does not require a town UI layout`,()=>{
  const s=make();s.expedition.area=area;s.portalText.text='';s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,false);
  s.portalText.text='E · Descend';s.viewportLayout=undefined;s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,true);
  s.portalText.bounds=rect(1000,1000);s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,false);
  s.portalText=undefined;assert.doesNotThrow(()=>s.updatePortalPromptVisibility());
});
for(const area of [1,2])test(`field ${area} camera movement and resize recull while paused without a gameplay update`,()=>{
  const s=make();s.expedition.area=area;s.runState='paused';s.setupPortalPromptVisibility();
  s.portalText.bounds=rect(321,270,126,34);s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,false);
  s.cameras.main.scrollX=150;s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,true);
  s.cameras.main.width=280;s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,false);
  s.cameras.main.width=374;s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,true);
  assert.equal(s.elapsed,0);assert.equal(s.expeditionActive,false);assert.equal(s.runState,'paused');
});
for(const area of [1,2])test(`field ${area} prompt culling leaves the exact interaction radius and E dispatch unchanged`,()=>{
  const s=make();s.expedition.area=area;const gate=s.isoToWorld(18,9);let calls=0;s.handlePrimaryControl=()=>calls++;
  for(const cleared of [false,true]){
    s.expedition.floorKills=cleared?6:0;
    for(const visible of [false,true])for(const distance of [0,149.999,150,150.001]){
      s.portalText.visible=visible;s.world.setTransform(s.playerId,{x:gate.x+distance,y:gate.y,rot:0});s.interactWithPortal();
    }
    assert.equal(calls,cleared?6:0);
  }
  assert.equal(calls,6);assert.equal(s.expedition.area,area);assert.equal(s.elapsed,0);
});
test('field return/reentry replaces prompt objects but retains one camera hook until destruction',()=>{
  const s=make();s.setupPortalPromptVisibility();s.worldLayer={list:[s.portalText]};
  s.time={removeAllEvents(){},clearPendingEvents(){}};s.tweens={killAll(){}};
  s.setupPlayer=()=>{s.playerId=s.world.createEntity();};s.buildDungeonRoom=()=>{};
  s.buildAreaContent=()=>{s.portalText=prompt(rect(100,200,190,40));s.worldLayer.list=[s.portalText];};
  s.drawHpBar=()=>{};s.hpText={setText(){}};s.resizeVignette=()=>{};s.updateFixedUITransforms=()=>{};
  for(const next of [enterRuins(createExpedition()),returnToTown(enterRuins(createExpedition())),enterRuins(createExpedition()),{...createExpedition(),area:2}]){
    const old=s.portalText;s.changeArea(next);s.cameras.main.emit('followupdate');
    assert.equal(old.active,false);assert.equal(s.portalText.visible,true);assert.equal(s.cameras.main.listenerCount('followupdate'),1);
    s.portalText.bounds=rect(500,600);s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,false);
  }
  s.events.emit('destroy');assert.equal(s.cameras.main.listenerCount('followupdate'),0);
  assert.equal(s.events.listenerCount('shutdown'),0);assert.equal(s.events.listenerCount('destroy'),0);
});

// Near-gate fit is analytic with a generous mocked 337x64 world-pixel envelope,
// not a native text measurement. 337 is 21 longest-line characters * 16 + 1;
// neither Courier fallback metrics nor the actual renderer are measured here.
for(const [width,height]of [[374,498.65625],[374,600],[300,498.65625]])for(const area of [1,2])test(`compact field ${area} ${width}x${height} keeps a generous label fully visible at and within 50px of the gate`,()=>{
  const s=make(),gate=s.isoToWorld(18,9),layout=arpgViewportLayout(width,height,false),z=layout.camera.zoom,c=s.cameras.main;
  assert.equal(layout.compact,true);s.expedition.area=area;s.viewportLayout=layout;
  Object.assign(c,{width,height,matrix:{transformPoint:(x,y)=>({x:z*x+(1-z)*width/2,y:z*y+(1-z)*height/2})}});
  s.portalText.bounds=rect(gate.x-337/2,gate.y-75-64/2,337,64);
  for(const [dx,dy]of [[0,0],[50,0],[-50,0],[0,50],[0,-50],[Math.sqrt(1250),Math.sqrt(1250)],[-Math.sqrt(1250),-Math.sqrt(1250)]]){
    c.scrollX=gate.x+dx-width/2-layout.camera.offsetX;
    c.scrollY=gate.y+dy-height/2-layout.camera.offsetY;
    s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,true,JSON.stringify({width,height,area,dx,dy}));
    const b=s.portalText.bounds,p0=c.matrix.transformPoint(b.left-c.scrollX,b.top-c.scrollY),p1=c.matrix.transformPoint(b.right-c.scrollX,b.bottom-c.scrollY);
    assert([layout.hud,layout.controls].every(panel=>p1.x<=panel.x-2||p0.x>=panel.x+panel.width+2||p1.y<=panel.y-2||p0.y>=panel.y+panel.height+2),'The compact near-gate envelope must also be clear of fixed UI');
  }
});
test('departed phone layout-derived projection hides the distant field label and restores it after camera approach',()=>{
  const s=make(),width=374,height=498.65625,layout=arpgViewportLayout(width,height,false),z=layout.camera.zoom,c=s.cameras.main;
  s.expedition.area=1;s.viewportLayout=layout;s.portalText.text='Mossgate Ruins\nWardens 0/4';
  // Saved native receipt supplies the viewport and player1472,536. Portal
  // position/offset/layout come from source; 126x34 is synthetic text geometry.
  const gate=s.isoToWorld(18,9);s.portalText.bounds=rect(gate.x-63,gate.y-75-17,126,34);
  Object.assign(c,{width,height,scrollX:1472-width/2-layout.camera.offsetX,scrollY:536-height/2-layout.camera.offsetY,
    matrix:{transformPoint:(x,y)=>({x:z*x+(1-z)*width/2,y:z*y+(1-z)*height/2})}});
  s.setupPortalPromptVisibility();s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,false);
  c.scrollX=gate.x-width/2-layout.camera.offsetX;c.scrollY=gate.y-height/2-layout.camera.offsetY;
  s.cameras.main.emit('followupdate');assert.equal(s.portalText.visible,true);
});

for(const area of [1,2])test(`desktop field ${area} exact-gate caption remains visible with its pre-existing HUD overlap`,()=>{
  const s=make(),width=1068,height=600.75,layout=arpgViewportLayout(width,height,false),z=layout.camera.zoom,c=s.cameras.main,gate=s.isoToWorld(18,9);
  s.expedition.area=area;s.viewportLayout=layout;assert.equal(layout.compact,false);
  // Synthetic136x34 size is representative, not a saved native text bound.
  s.portalText.bounds=rect(gate.x-68,gate.y-75-17,136,34);
  Object.assign(c,{width,height,scrollX:gate.x-width/2,scrollY:gate.y-height/2,matrix:{transformPoint:(x,y)=>({x:z*x+(1-z)*width/2,y:z*y+(1-z)*height/2})}});
  const left=width/2-68*z,top=height/2-92*z,right=left+136*z,bottom=top+34*z;
  assert(left<layout.hud.x+layout.hud.width&&right>layout.hud.x&&top<layout.hud.y+layout.hud.height&&bottom>layout.hud.y);
  s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,true);
  s.expedition.area=0;s.updatePortalPromptVisibility();assert.equal(s.portalText.visible,false,'The original town UI exclusion must remain');
});
