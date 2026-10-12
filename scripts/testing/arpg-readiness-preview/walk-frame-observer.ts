import Phaser from 'phaser';
import { GameScene } from '../../../src/lib/games/arpg/scenes/GameScene';
import type { World, EntityId, Transform } from '../../../src/lib/games/arpg/ecs/components';
import { fixture, type SceneObservation, type GameplayObservation } from './runtime';
import { decodedPixels, readCourtyardFrame, readCourtyardVisibility } from './observe-scene';
import { visualClearance, visualCameraStable, VISUAL_CAMERA_KEYS } from './visual-contract.mjs';
import { WALK_MODE, WALK_POSE, WALK_FRAME, WALK_LIMITS, walkScreenshot } from './walk-frame-contract.mjs';

type RenderCamera=Phaser.Cameras.Scene2D.Camera & {readonly matrix:Phaser.GameObjects.Components.TransformMatrix};
type Key={isDown:boolean;_justDown:boolean};
type State={initialized:boolean;ended:boolean;runState:string;townStatus:string;handlers:{isCurrent():boolean};
  playerId:EntityId|null;world:World;expedition:{area:number;returned:boolean;outcome:string};expeditionActive:boolean;
  movementInput:{x:number;y:number};pendingDash:boolean;pointerAttack:boolean;heroAttacking:boolean;heroFacing:string;
  wasd:Record<'w'|'a'|'s'|'d',Key>;cursors:Record<'up'|'down'|'left'|'right',Key>;interactKey:Key;dashKeys:Key[];
  playerSprite:Phaser.GameObjects.Sprite;worldLayer:Phaser.GameObjects.Layer;
  townCorner:{graphics:{courtyard:readonly Phaser.GameObjects.Graphics[]}}|null;updateHeroAnimation():void};
type RenderFrame={nativeFrame:number;at:number;observerAt:number;publicationFrame:number;transform:Transform;intent:{x:number;y:number};velocity:{vx:number;vy:number};dashTimer:number;
  sprite:{x:number;y:number;depth:number;texture:string;frame:string|number;animation:string;playing:boolean;paused:boolean;animationFrameIndex:number;scaleX:number;scaleY:number;originX:number;originY:number;rotation:number;flipX:boolean;flipY:boolean};
  camera:{x:number;y:number;width:number;height:number;zoom:number;scrollX:number;scrollY:number;matrix:number[]}};
type Receipt={evidenceMode:typeof WALK_MODE;nativeMovementEvidence:false;controlledFrameAssignment:true;assignment:'actual-ecs-transform-and-paused-animation-frame';
  animationSelection:'instance-only-production-selection-suppressed';sequence:1;poseId:string;sceneId:number;playerId:EntityId;prior:Transform;assigned:Transform;
  assignedAt:number;assignedNativeFrame:number;assignedFrameCounter:number;clearance:ReturnType<typeof visualClearance>;frames:RenderFrame[];stableComparisons:number;
  cameraTolerance:number;settled:Transform|null;settledNativeFrame:number|null;settledAt:number|null};
type Source={textureKey:string;frameName:string|number;width:number;height:number;frameX:number;frameY:number;displayOriginX:number;displayOriginY:number;flipX:boolean;flipY:boolean;
  pixel:number[];rgba:number[];neighbor:{pixel:number[];rgba:number[]}};
type Capture={evidenceMode:typeof WALK_MODE;nativeMovementEvidence:false;controlledFrameAssignment:true;poseReceipt:Receipt;nativeFrame:number;heroFrame:unknown;label:string;probeId:number;
  at:number;capturedAt:number;consumedAt:number|null;viewport:{width:number;height:number};documentWidth:number;css:{x:number;y:number;width:number;height:number};
  backing:{width:number;height:number};logical:{width:number;height:number};base64Chars:number;gameplay:GameplayObservation;source:Source;suppressedSelections:number};

// Only this explicitly enabled fixture may assign the exact pose and select a
// paused real animation frame. It does not claim a walk, input or timing result.
export function createWalkFrameController(){
  let binding:{scene:GameScene;observation:SceneObservation;playerId:EntityId|null;game:Phaser.Game;gameEvents:Phaser.Events.EventEmitter;sceneEvents:Phaser.Events.EventEmitter}|null=null,closed=false;
  let receipt:Receipt|null=null,pending=false,lastRenderedNativeFrame:number|null=null,selectedFrames=0,suppressedSelections=0;
  let originalDescriptor:PropertyDescriptor|undefined,originalMethod:State['updateHeroAnimation']|null=null,wrapper:State['updateHeroAnimation']|null=null,methodRestored=false;
  let boundWorld:World|null=null,boundPlayer:unknown=null,boundSprite:Phaser.GameObjects.Sprite|null=null,boundCamera:Phaser.Cameras.Scene2D.Camera|null=null;
  let requested:{id:number;label:string;requestedAt:number;nativeFrame:number}|null=null,captured:{metadata:Capture;base64:string}|null=null,requests=0;
  let prePublication:{frame:number;motion:typeof fixture.plazaLatestMotion}|null=null,lastMotion:typeof fixture.plazaLatestMotion=null;
  const errors:string[]=[],history:Capture[]=[],owned:Phaser.GameObjects.Graphics[]=[];
  function fail(message:string):never{errors.push(message);throw Error(message);}
  const mode=()=>{
    if(window.__arpgWalkFrameFlow!==true||window.__arpgPlazaFlow!==true||window.__arpgCourtyardFlow===true||window.__arpgCourtyardVisualFlow===true||window.__arpgReturnFlow===true||window.__arpgCourtyardVisual!==undefined)fail('Walking-frame visual mode must be exclusive');
    if(errors.length)throw Error(errors[0]);
  };
  const checkLiveBinding=()=>{
    if(binding&&!closed&&(binding.scene.sys?.game!==binding.game||binding.game.events!==binding.gameEvents||binding.scene.events!==binding.sceneEvents))fail('Active scene/game event ownership changed');
  };
  const state=()=>{
    mode();checkLiveBinding();if(!binding||closed)fail('Walking-frame scene unavailable or closed');
    const {scene,observation}=binding!,s=scene as unknown as State,live=fixture.scenes.filter(v=>!v.destroyed);
    if(live.length!==1||live[0]!==observation||observation.pageId!==1||observation.createAt===null||observation.framesAfterCreate<1||!observation.loadComplete||observation.totalFailed!==0||observation.loadErrors.length||observation.missingKeys.length||!s.initialized||s.ended||s.runState!=='running'||s.townStatus!=='ready'||!s.handlers.isCurrent()||s.expedition.area!==0||s.expeditionActive||s.expedition.returned||s.expedition.outcome!=='preparing')fail('One current ready initial town scene required');
    if(s.playerId===null||!s.world.getPlayer(s.playerId)||s.world.getPlayers().length!==1||(binding!.playerId!==null&&s.playerId!==binding!.playerId))fail('Walking-frame player identity changed');
    if(receipt&&(s.world!==boundWorld||s.world.getPlayer(s.playerId!)!==boundPlayer||s.playerSprite!==boundSprite||scene.cameras.main!==boundCamera||s.townCorner?.graphics.courtyard.length!==4||owned.some((w,i)=>s.townCorner?.graphics.courtyard[i]!==w)))fail('Assigned world, player, sprite, camera or wall ownership replaced');
    const position=s.world.getTransform(s.playerId!),velocity=s.world.getVelocity(s.playerId!),dash=s.world.getDash(s.playerId!);
    if(!position||!Object.values(position).every(Number.isFinite)||!velocity||velocity.vx!==0||velocity.vy!==0||s.movementInput.x!==0||s.movementInput.y!==0||!dash||dash.timer!==0||s.pendingDash!==false||s.pointerAttack!==false||s.heroAttacking!==false||s.heroFacing!=='S')fail('Neutral South-facing actual input and state required');
    const keys=[...['w','a','s','d'].map(k=>s.wasd[k as keyof State['wasd']]),...['up','down','left','right'].map(k=>s.cursors[k as keyof State['cursors']]),s.interactKey,...s.dashKeys];
    if(keys.length!==11||keys.some(k=>!k||k.isDown!==false||k._justDown!==false)||scene.input.activePointer.isDown!==false)fail('Released actual keyboard and pointer required');
    if(fixture.api.some(c=>c.path!=='/api/leaderboard/arpg/alltime'||c.method!=='GET')||fixture.rewardMutations.length||fixture.navigations.length||fixture.blocked.length)fail('Walking-frame isolation side effect');
    return{scene,observation,s,position:position!,velocity:velocity!,dash:dash!};
  };
  const selected=()=>{
    const {s}=state(),p=s.playerSprite,a=p?.anims;
    if(!p?.active||!p.visible||p.alpha!==1||p.texture?.key!==WALK_FRAME.textureKey||p.frame?.name!==WALK_FRAME.frameName||p.frame.cutWidth!==256||p.frame.cutHeight!==256||p.frame.x!==0||p.frame.y!==0||p.displayOriginX!==128||p.displayOriginY!==128||p.scaleX!==1||p.scaleY!==1||p.rotation!==0||p.flipX||p.flipY||a.currentAnim?.key!==WALK_FRAME.animation||a.currentAnim.frames.length!==8||a.currentFrame!==a.currentAnim.frames[WALK_FRAME.arrayIndex]||a.currentFrame.index!==WALK_FRAME.animationFrameIndex||a.isPlaying!==false||a.isPaused!==true)fail('Actual rendered paused S4 identity or transform changed');
    if(wrapper&&s.updateHeroAnimation!==wrapper)fail('Animation-selection wrapper ownership changed');
    return p;
  };
  const readFrame=():RenderFrame=>{
    const {scene,s,position,velocity,dash}=state(),p=selected(),c=scene.cameras.main as RenderCamera;
    const nativeFrame=scene.sys.game.loop.frame,fields=Object.fromEntries(VISUAL_CAMERA_KEYS.map(k=>[k,c[k as keyof typeof c]]));
    const matrix=[c.matrix.a,c.matrix.b,c.matrix.c,c.matrix.d,c.matrix.e,c.matrix.f],motion=fixture.plazaLatestMotion;
    if(!Number.isSafeInteger(nativeFrame)||nativeFrame<0||![...Object.values(fields),...matrix].every(Number.isFinite)||!motion||motion.area!==0||motion.x!==position.x||motion.y!==position.y||motion.intent.x!==0||motion.intent.y!==0)fail('Current native observer publication required');
    if(!prePublication||prePublication.frame!==nativeFrame||motion===prePublication.motion||motion===lastMotion||!Number.isFinite(motion.at)||motion.at<=Math.max(receipt!.assignedAt,lastMotion?.at??-Infinity))fail('Fresh same-frame observer publication required');
    lastMotion=motion;
    return{nativeFrame,at:performance.now(),observerAt:motion!.at,publicationFrame:prePublication.frame,transform:{...position},intent:{x:s.movementInput.x,y:s.movementInput.y},velocity:{vx:velocity.vx,vy:velocity.vy},dashTimer:dash.timer,
      sprite:{x:p.x,y:p.y,depth:p.depth,texture:p.texture.key,frame:p.frame.name,animation:p.anims.currentAnim!.key,playing:p.anims.isPlaying,paused:p.anims.isPaused,animationFrameIndex:p.anims.currentFrame!.index,scaleX:p.scaleX,scaleY:p.scaleY,originX:p.originX,originY:p.originY,rotation:p.rotation,flipX:p.flipX,flipY:p.flipY},camera:{...fields,matrix} as RenderFrame['camera']};
  };
  const currentReceipt=()=>{
    const {position}=state();selected();
    if(!receipt||pending||!receipt.settled||position.x!==WALK_POSE.x||position.y!==WALK_POSE.y||position.rot!==receipt.assigned.rot)fail('Settled exact controlled pose required');
    const p=binding!.scene as unknown as State,c=binding!.scene.cameras.main as RenderCamera;
    const camera={...Object.fromEntries(VISUAL_CAMERA_KEYS.map(k=>[k,c[k as keyof typeof c]])),matrix:[c.matrix.a,c.matrix.b,c.matrix.c,c.matrix.d,c.matrix.e,c.matrix.f]};
    if(p.playerSprite.x!==position.x||p.playerSprite.y!==position.y||p.playerSprite.depth!==position.y+20||!visualCameraStable(receipt!.frames.at(-1)!.camera,camera))fail('Current sprite/camera drifted after settlement');
    return structuredClone(receipt!);
  };
  const fulfill=(frame:RenderFrame)=>{
    if(!requested||binding!.observation.gameplay?.plazaProbe?.id!==requested.id)return;
    const {scene,s}=state(),g=structuredClone(binding!.observation.gameplay!);
    if(frame.nativeFrame<=requested.nativeFrame||g.at<=requested.requestedAt||g.at!==frame.observerAt||g.intent.x!==0||g.intent.y!==0)fail('Capture requires the genuinely later neutral probe render');
    const p=selected(),pixels=decodedPixels(p.frame),offset=(135*256+132)*4,neighborOffset=(135*256+131)*4;
    if(pixels.width!==256||pixels.height!==256||pixels.data.length!==256*256*4)fail('Unexpected S4 source dimensions');
    const source:Source={textureKey:p.texture.key,frameName:p.frame.name,width:pixels.width,height:pixels.height,frameX:p.frame.x,frameY:p.frame.y,displayOriginX:p.displayOriginX,displayOriginY:p.displayOriginY,flipX:p.flipX,flipY:p.flipY,pixel:[132,135],rgba:[...pixels.data.slice(offset,offset+4)],neighbor:{pixel:[131,135],rgba:[...pixels.data.slice(neighborOffset,neighborOffset+4)]}};
    g.courtyardFrame=readCourtyardFrame(scene,scene as unknown as Parameters<typeof readCourtyardFrame>[1]);
    g.courtyardVisibility=readCourtyardVisibility(scene,scene as unknown as Parameters<typeof readCourtyardVisibility>[1]);
    if(g.courtyardFrame.frame!==frame.nativeFrame||!g.courtyardVisibility.valid)fail('Same-frame actual source/vector observation required');
    const {canvas}=scene.sys.game,w=canvas.width,h=canvas.height,css=canvas.getBoundingClientRect();
    if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w>WALK_LIMITS.width||h>WALK_LIMITS.height||w*h>WALK_LIMITS.pixels||![css.x,css.y,css.width,css.height,scene.scale.width,scene.scale.height].every(Number.isFinite)||css.width<=0||css.height<=0||scene.scale.width<=0||scene.scale.height<=0)fail('Bounded real canvas transforms required');
    const url=canvas.toDataURL('image/png'),prefix='data:image/png;base64,';
    if(!url.startsWith(prefix))fail('Actual native PNG unavailable');
    const base64=url.slice(prefix.length);if(base64.length<136||base64.length>WALK_LIMITS.base64Chars||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))fail('Bounded complete PNG required');
    const metadata:Capture={evidenceMode:WALK_MODE,nativeMovementEvidence:false,controlledFrameAssignment:true,poseReceipt:currentReceipt(),nativeFrame:frame.nativeFrame,heroFrame:structuredClone(g.courtyardFrame.hero),label:requested.label,probeId:requested.id,at:g.at,capturedAt:performance.now(),consumedAt:null,viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,css:{x:css.x,y:css.y,width:css.width,height:css.height},backing:{width:w,height:h},logical:{width:scene.scale.width,height:scene.scale.height},base64Chars:base64.length,gameplay:g,source,suppressedSelections};
    history.push(metadata);captured={metadata,base64};requested=null;
  };
  const beforeRender=()=>{if(binding&&!closed)prePublication={frame:binding.scene.sys.game.loop.frame,motion:fixture.plazaLatestMotion};};
  const onRender=()=>{
    if(!binding||closed||errors.length||binding.observation.createAt===null)return;
    const frame=binding.scene.sys.game.loop.frame;
    if(!receipt){lastRenderedNativeFrame=frame;return;}
    try{
      const value=readFrame();if(value.nativeFrame<=(lastRenderedNativeFrame??-1))fail('Repeated or stale native render');lastRenderedNativeFrame=value.nativeFrame;
      if(++selectedFrames>WALK_LIMITS.maxSelectedFrames)fail('Selected-frame observation budget exceeded');
      if(value.transform.x!==WALK_POSE.x||value.transform.y!==WALK_POSE.y||value.transform.rot!==receipt.assigned.rot)fail('Exact controlled pose drifted');
      if(pending){const previous=receipt.frames.at(-1);receipt.frames.push(value);
        const synced=value.sprite.x===value.transform.x&&value.sprite.y===value.transform.y&&value.sprite.depth===value.transform.y+20;
        receipt.stableComparisons=synced&&previous&&visualCameraStable(previous.camera,value.camera)?receipt.stableComparisons+1:0;
        if(receipt.stableComparisons>=WALK_LIMITS.stableComparisons){receipt.settled={...value.transform};receipt.settledAt=value.at;receipt.settledNativeFrame=value.nativeFrame;pending=false;}
        else if(receipt.frames.length>=WALK_LIMITS.framesPerPose)fail('Camera did not settle within64 native frames');
      }
      if(!pending)fulfill(value);
    }catch(error){if(!errors.length)errors.push(String(error));pending=false;}
  };
  const release=()=>{
    if(!binding||closed)return;closed=true;
    const {scene,gameEvents,sceneEvents}=binding,s=scene as unknown as State;
    gameEvents.off(Phaser.Core.Events.PRE_RENDER,beforeRender);gameEvents.off(Phaser.Core.Events.POST_RENDER,onRender);sceneEvents.off(Phaser.Scenes.Events.SHUTDOWN,release);sceneEvents.off(Phaser.Scenes.Events.DESTROY,release);gameEvents.off(Phaser.Core.Events.DESTROY,release);
    if(wrapper){if(s.updateHeroAnimation!==wrapper)errors.push('Cannot restore animation method owned by another writer');else{if(originalDescriptor)Object.defineProperty(s,'updateHeroAnimation',originalDescriptor);else delete (s as Partial<State>).updateHeroAnimation;methodRestored=s.updateHeroAnimation===originalMethod;}}
    if(pending||requested||captured)errors.push('Scene closed with pending observation or unconsumed capture');pending=false;requested=null;captured=null;
  };
  return{
    bind(scene:GameScene,observation:SceneObservation){mode();if(binding||closed||!fixture.scenes.includes(observation))fail('Exactly one observed scene binding permitted');const game=scene.sys.game,gameEvents=game.events,sceneEvents=scene.events;binding={scene,observation,playerId:null,game,gameEvents,sceneEvents};gameEvents.on(Phaser.Core.Events.PRE_RENDER,beforeRender);gameEvents.on(Phaser.Core.Events.POST_RENDER,onRender);sceneEvents.once(Phaser.Scenes.Events.SHUTDOWN,release);sceneEvents.once(Phaser.Scenes.Events.DESTROY,release);gameEvents.once(Phaser.Core.Events.DESTROY,release);},
    assign(id:string){const {scene,s,position,observation}=state();
      if(receipt||id!==WALK_POSE.id||lastRenderedNativeFrame===null)fail('Only one enumerated pose/frame assignment permitted after a real render');
      if(position.x!==1472||position.y!==536||position.rot!==0)fail('Original town spawn required before controlled discontinuity');
      const clearance=visualClearance(WALK_POSE);if(!clearance.valid)fail('Exact controlled pose violates radius38');
      const animation=scene.anims.get(WALK_FRAME.animation),animationFrame=animation?.frames[WALK_FRAME.arrayIndex];
      if(!animation||animation.frames.length!==8||!animationFrame||animationFrame.index!==5||animationFrame.textureKey!==WALK_FRAME.textureKey||animationFrame.textureFrame!==0||animationFrame.frame.name!==WALK_FRAME.frameName)fail('Exact real S4 animation frame missing');
      originalDescriptor=Object.getOwnPropertyDescriptor(s,'updateHeroAnimation');originalMethod=s.updateHeroAnimation;
      if(typeof originalMethod!=='function'||(originalDescriptor&&(!('value'in originalDescriptor)||!originalDescriptor.configurable)))fail('Animation method cannot be safely shadowed/restored');
      const frameCounter=scene.sys.game.loop.frame;if(!Number.isSafeInteger(frameCounter)||frameCounter<lastRenderedNativeFrame||frameCounter>lastRenderedNativeFrame+1)fail('Invalid assignment/render-frame ordering');
      receipt={evidenceMode:WALK_MODE,nativeMovementEvidence:false,controlledFrameAssignment:true,assignment:'actual-ecs-transform-and-paused-animation-frame',animationSelection:'instance-only-production-selection-suppressed',sequence:1,poseId:id,sceneId:observation.id,playerId:s.playerId!,prior:{...position},assigned:{...position,x:WALK_POSE.x,y:WALK_POSE.y},assignedAt:performance.now(),assignedNativeFrame:lastRenderedNativeFrame,assignedFrameCounter:frameCounter,clearance,frames:[],stableComparisons:0,cameraTolerance:WALK_LIMITS.cameraTolerance,settled:null,settledAt:null,settledNativeFrame:null};
      binding!.playerId=s.playerId;boundWorld=s.world;boundPlayer=s.world.getPlayer(s.playerId!);boundSprite=s.playerSprite;boundCamera=scene.cameras.main;owned.push(...(s.townCorner?.graphics.courtyard??[]));if(owned.length!==4)fail('Four current owned wall Graphics required');
      wrapper=function(this:State){if(this!==s)fail('Animation wrapper receiver changed');selected();suppressedSelections++;};
      Object.defineProperty(s,'updateHeroAnimation',{value:wrapper,configurable:true,writable:true,enumerable:originalDescriptor?.enumerable??false});
      position.x=WALK_POSE.x;position.y=WALK_POSE.y;s.playerSprite.play(WALK_FRAME.animation);s.playerSprite.anims.pause(animationFrame);selected();pending=true;
      return structuredClone(receipt);
    },
    currentReceipt,
    request(label:string){currentReceipt();if(requested||captured||history.length||++requests>WALK_LIMITS.requests||![0,1].some(i=>label===walkScreenshot(i)))fail('One bounded capture request permitted');const request=fixture.requestPlazaProbe();requested={id:request.id,label,requestedAt:request.requestedAt,nativeFrame:lastRenderedNativeFrame!};return request;},
    take(id:number){mode();if(!captured||captured.metadata.probeId!==id)fail('Matching same-frame capture missing');captured!.metadata.consumedAt=performance.now();const result=structuredClone(captured!);captured=null;return result;},
    snapshot(){checkLiveBinding();return structuredClone({evidenceMode:WALK_MODE,nativeMovementEvidence:false,controlledFrameAssignment:true,animationSelection:'instance-only-production-selection-suppressed',enabled:window.__arpgWalkFrameFlow===true,bound:binding!==null,closed,pending,lastRenderedNativeFrame,selectedFrames,suppressedSelections,methodRestored,methodOwned:!!wrapper&&!!binding&&(binding.scene as unknown as State).updateHeroAnimation===wrapper,preRenderAttached:!!binding&&binding.gameEvents.listeners(Phaser.Core.Events.PRE_RENDER).includes(beforeRender),postRenderAttached:!!binding&&binding.gameEvents.listeners(Phaser.Core.Events.POST_RENDER).includes(onRender),complete:receipt!==null&&!pending&&history.length===1&&!requested&&!captured&&!errors.length,receipt,requests,captureCount:history.length,requested:requested!==null,captured:captured!==null,history,errors,ownedWalls:owned.map(w=>({name:w.name,destroyed:w.scene===undefined&&w.active===false,inWorld:binding?(binding.scene as unknown as State).worldLayer?.list?.includes(w)===true:false}))});}
  };
}
export type WalkFrameController=ReturnType<typeof createWalkFrameController>;
declare global{interface Window{__arpgWalkFrameFlow?:boolean;__arpgWalkFrame?:WalkFrameController;}}
if(window.__arpgWalkFrameFlow===true){
  const controller=createWalkFrameController();window.__arpgWalkFrame=controller;
  const preload=GameScene.prototype.preload;
  GameScene.prototype.preload=function(...args:Parameters<typeof preload>){const before=fixture.scenes.length,result=preload.apply(this,args);if(fixture.scenes.length!==before+1)throw Error('Real observation lifecycle required');controller.bind(this,fixture.scenes[before]!);return result;};
}
