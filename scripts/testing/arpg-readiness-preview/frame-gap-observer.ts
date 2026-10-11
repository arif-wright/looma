import Phaser from 'phaser';
import {GameScene} from '../../../src/lib/games/arpg/scenes/GameScene';
import type {World,EntityId} from '../../../src/lib/games/arpg/ecs/components';
import {FrameGapMetrics} from './frame-gap-metrics.mjs';
import {parseHash,COLLECTION_TIMEOUT_MS} from './frame-gap-plan.mjs';
const options=parseHash(location.hash),metrics=new FrameGapMetrics(options);
type Callback=(this:unknown,renderer:unknown,time:number,delta:number)=>unknown;
type State={initialized:boolean;world:World;playerId:EntityId|null;movementInput:{x:number;y:number};expedition:{area:number}};
type Loop={rawDelta:number;frame:number;_coolDown:number;inFocus:boolean;hasFpsLimit:boolean;fpsLimit:number;forceSetTimeOut:boolean;smoothStep:boolean;deltaSmoothingMax:number;panicMax:number;targetFps:number};
type Context={game:Phaser.Game;scene:GameScene;active:boolean;created:boolean;collecting:boolean;createdAt:number;stoppedAt:number|null;armedAt:number|null;
  preStart:number;preEnd:number;observerStart:number;observerEnd:number;preCalls:number;observerCalls:number;postCalls:number;
  recordedPostCalls:number;keyEvents:number;sceneCount:number;resolve:(()=>void)|null;reject:((error:Error)=>void)|null;timer:ReturnType<typeof setTimeout>|null;restoreRenderer:()=>void};
const contexts=new WeakMap<Phaser.Game,Context>();let last:Context|undefined;let activeContexts=0,sceneCount=0;
const nativeGameStep=Phaser.Game.prototype.step;
const scenePrototype=GameScene.prototype as unknown as {init?:(this:GameScene,data:unknown)=>unknown};
const nativeInit=scenePrototype.init;
if(window.__arpgFrameGap!==undefined)throw new Error('Frame observer already installed');
function install(scene:GameScene){
  const game=scene.sys.game;if(contexts.has(game))throw new Error('Only one real scene per diagnostic document');
  const context:Context={game,scene,active:true,created:false,collecting:false,createdAt:-1,stoppedAt:null,armedAt:null,
    preStart:-1,preEnd:-1,observerStart:-1,observerEnd:-1,preCalls:0,observerCalls:0,postCalls:0,recordedPostCalls:0,keyEvents:0,sceneCount:++sceneCount,
    resolve:null,reject:null,timer:null,restoreRenderer:()=>{}};
  contexts.set(game,context);last=context;activeContexts++;
  if(options.mode==='detailed'){
    const renderer=game.renderer,nativePre=renderer.preRender;
    renderer.preRender=function(){if(!context.collecting)return nativePre.call(this);context.preCalls++;context.preStart=performance.now();try{return nativePre.call(this);}finally{context.preEnd=performance.now();}};
    context.restoreRenderer=()=>{renderer.preRender=nativePre;};
  }
  const created=()=>{context.created=true;context.createdAt=performance.now();};
  const post=()=>{if(context.collecting){context.postCalls++;context.recordedPostCalls++;}};
  const key=(event:KeyboardEvent)=>{if(context.collecting&&event.isTrusted&&['KeyW','KeyA','KeyS','KeyD','Space'].includes(event.code))context.keyEvents++;};
  const stop=()=>{
    if(!context.active)return;context.active=false;context.collecting=false;context.stoppedAt=performance.now();activeContexts--;
    if(context.timer!==null)clearTimeout(context.timer);context.timer=null;
    context.reject?.(new Error('Scene stopped during collection'));context.resolve=context.reject=null;
    context.restoreRenderer();game.events.off(Phaser.Core.Events.POST_RENDER,post);game.events.off(Phaser.Core.Events.DESTROY,stop);
    scene.events.off(Phaser.Scenes.Events.CREATE,created);scene.events.off(Phaser.Scenes.Events.SHUTDOWN,stop);scene.events.off(Phaser.Scenes.Events.DESTROY,stop);
    window.removeEventListener('keydown',key,true);window.removeEventListener('keyup',key,true);contexts.delete(game);
  };
  scene.events.once(Phaser.Scenes.Events.CREATE,created);scene.events.once(Phaser.Scenes.Events.SHUTDOWN,stop);scene.events.once(Phaser.Scenes.Events.DESTROY,stop);
  game.events.on(Phaser.Core.Events.POST_RENDER,post);game.events.once(Phaser.Core.Events.DESTROY,stop);
  window.addEventListener('keydown',key,{capture:true,passive:true});window.addEventListener('keyup',key,{capture:true,passive:true});
}
scenePrototype.init=function(data:unknown){install(this);return nativeInit?.call(this,data);};
// Installed by the dedicated entry import BEFORE any Game is constructed.
// Game.start later binds this wrapper, so its loop.start cannot overwrite it.
Phaser.Game.prototype.step=function(time:number,delta:number){
  const context=contexts.get(this);if(!context?.collecting)return nativeGameStep.call(this,time,delta);
  context.preStart=context.preEnd=context.observerStart=context.observerEnd=-1;
  context.preCalls=context.observerCalls=context.postCalls=0;
  const started=performance.now();
  try{return nativeGameStep.call(this,time,delta);}
  finally{
    // This end timestamp includes ALL original POST_RENDER callbacks. Scalar
    // buffer writes below are outside it but inside the native loop callback.
    const ended=performance.now(),loop=this.loop as unknown as Loop,state=context.scene as unknown as State;
    const position=state.initialized&&state.playerId!==null?state.world.getTransform(state.playerId):undefined;
    const row=metrics.record(started,ended,time,delta,loop.rawDelta,loop.frame,loop._coolDown,loop.inFocus,document.hidden,
      context.preStart,context.preEnd,context.observerStart,context.observerEnd,context.preCalls,context.observerCalls,context.postCalls,
      position?.x??0,position?.y??0,state.movementInput.x,state.movementInput.y,Boolean(position)&&state.expedition.area===0);
    metrics.markHookEnd(row,performance.now());
    if(metrics.complete){context.collecting=false;if(context.timer!==null)clearTimeout(context.timer);context.timer=null;context.resolve?.();context.resolve=context.reject=null;}
  }
};
function environment(context:Context|undefined){
  const game=context?.scene.sys?.game,renderer=game?.renderer as unknown as {type?:number;gl?:WebGLRenderingContext}|undefined,gl=renderer?.gl;
  let webgl:unknown=null;if(gl){try{const e=gl.getExtension('WEBGL_debug_renderer_info');webgl={version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(gl.RENDERER),vendor:gl.getParameter(gl.VENDOR),unmaskedRenderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):null};}catch{webgl={queryFailed:true};}}
  const loop=game?.loop as unknown as Loop|undefined;
  return{phaserVersion:Phaser.VERSION,rendererType:renderer?.type??null,canvas:game?.canvas?{width:game.canvas.width,height:game.canvas.height}:null,devicePixelRatio:window.devicePixelRatio,webgl,
    loop:loop?{hasFpsLimit:loop.hasFpsLimit,fpsLimit:loop.fpsLimit,forceSetTimeOut:loop.forceSetTimeOut,smoothStep:loop.smoothStep,deltaSmoothingMax:loop.deltaSmoothingMax,panicMax:loop.panicMax,targetFps:loop.targetFps}:null};
}
const api={
  mode:options.mode,runId:options.runId,
  wrapFixtureObserver(game:Phaser.Game,callback:Callback):Callback{
    // The plugin changes registration syntax only; the entire existing callback
    // body is preserved. Light returns that exact callback without a wrapper.
    if(options.mode==='light')return callback;
    return function(renderer:unknown,time:number,delta:number){const c=contexts.get(game);if(!c?.collecting)return callback.call(this,renderer,time,delta);
      c.observerCalls++;c.observerStart=performance.now();try{return callback.call(this,renderer,time,delta);}finally{c.observerEnd=performance.now();}};
  },
  collect(){
    const context=last;if(!context?.active||!context.created||metrics.total!==0||context.armedAt!==null||context.collecting)throw new Error('One collection after real scene creation required');
    context.armedAt=performance.now();context.collecting=true;
    return new Promise<void>((resolve,reject)=>{context.resolve=resolve;context.reject=reject;context.timer=setTimeout(()=>{context.collecting=false;context.timer=null;context.resolve=context.reject=null;reject(new Error('Bounded stationary collection timed out'));},COLLECTION_TIMEOUT_MS);});
  },
  snapshot(){return{...metrics.snapshot(),context:{activeContexts,sceneCount,createdAt:last?.createdAt??null,armedAt:last?.armedAt??null,stoppedAt:last?.stoppedAt??null,recordedPostCalls:last?.recordedPostCalls??0,keyEvents:last?.keyEvents??0},environment:environment(last)};}
};
declare global{interface Window{__arpgFrameGap:typeof api;}}
window.__arpgFrameGap=Object.freeze(api);
