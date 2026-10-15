import { fixture, type GameplayObservation } from './runtime';
import { COURTYARD_VIEWS, courtyardScreenshot } from './courtyard-contract.mjs';
const VISUAL_VIEWS=['home','west-inner','east-inner','inner-elbow','west-front-witness','east-front-witness'];
// Dedicated, bounded observation state. No app, clock, input or renderer option
// is replaced. PNG bytes exist in only one pending slot and leave it immediately.
export const CAPTURE_LIMITS={requests:64,captures:18,width:2048,height:2048,pixels:2500000,base64Chars:8000000} as const;
type CanvasSource={canvas:HTMLCanvasElement;scale:{width:number;height:number}};
type CaptureMeta={evidenceMode:'native-courtyard'|'controlled-scene-visual';nativeMovementEvidence:boolean;poseReceipt:unknown;nativeFrame:number;heroFrame:unknown;label:string;probeId:number;at:number;capturedAt:number;consumedAt:number|null;
  viewport:{width:number;height:number};documentWidth:number;
  css:{x:number;y:number;width:number;height:number};backing:{width:number;height:number};logical:{width:number;height:number};
  base64Chars:number;gameplay:GameplayObservation};
let requested:{id:number;label:string|null;mode:'native-courtyard'|'controlled-scene-visual';poseIdentity:{sequence:number;poseId:string}|null}|null=null,requests=0,captureCount=0;
function mode(){
  if(window.__arpgPlazaFlow!==true)throw Error('Courtyard probes need original native observation');
  if(window.__arpgCourtyardVisualFlow===true&&window.__arpgCourtyardFlow!==true&&window.__arpgReturnFlow!==true)return 'controlled-scene-visual' as const;
  if(window.__arpgCourtyardFlow===true&&window.__arpgCourtyardVisualFlow!==true&&window.__arpgReturnFlow===true&&window.__arpgCourtyardVisual===undefined)return 'native-courtyard' as const;
  throw Error('Conflicting or absent courtyard evidence mode');
}
let pending:{metadata:CaptureMeta;base64:string}|null=null;
const history:CaptureMeta[]=[];
export const courtyardCapture={
  request(label:string|null){
    const evidenceMode=mode(),visual=evidenceMode==='controlled-scene-visual';
    const pose=visual?window.__arpgCourtyardVisual?.currentReceipt():null;
    if(visual&&!pose)throw Error('Settled controlled pose receipt required');
    if(requested||pending)throw Error('Previous courtyard probe/capture is not consumed');
    if(++requests>(visual?6:CAPTURE_LIMITS.requests))throw Error('Courtyard probe budget exceeded');
    if(label!==null){
      if(captureCount>=(visual?6:CAPTURE_LIMITS.captures))throw Error('Courtyard capture budget exceeded');
      if(![0,1].some(i=>label===(visual?`${i===1?'phone':'desktop'}-courtyard-visual-${VISUAL_VIEWS[captureCount]}`:courtyardScreenshot(i,COURTYARD_VIEWS[captureCount]))))throw Error('Unknown or out-of-order courtyard capture');
    }
    const motion=fixture.plazaLatestMotion;
    if(!motion||motion.intent.x!==0||motion.intent.y!==0)throw Error('Courtyard full probe requires observed released input');
    const request=fixture.requestPlazaProbe();requested={id:request.id,label,mode:evidenceMode,poseIdentity:pose?{sequence:pose.sequence,poseId:pose.poseId}:null};return request;
  },
  // Called only from the existing genuine POST_RENDER full-probe branch, after
  // its returned frame identity is recorded. toDataURL reads that rendered
  // canvas synchronously before the RAF callback returns; no later-frame API.
  fulfill(source:CanvasSource,g:GameplayObservation){
    if(!requested||g.plazaProbe?.id!==requested.id)return;
    if(g.intent.x!==0||g.intent.y!==0)throw Error('Courtyard probe is not neutral');
    const evidenceMode=mode();if(evidenceMode!==requested.mode)throw Error('Courtyard mode changed during probe');
    const poseReceipt=evidenceMode==='controlled-scene-visual'?window.__arpgCourtyardVisual?.currentReceipt():null;
    if(requested.poseIdentity&&(!poseReceipt||poseReceipt.sequence!==requested.poseIdentity.sequence||poseReceipt.poseId!==requested.poseIdentity.poseId))throw Error('Controlled pose changed during capture');
    const frame=g.courtyardFrame;
    if(!frame||!Number.isSafeInteger(frame.frame)||frame.frame!<0||!frame.hero.textureKey||(typeof frame.hero.frameName!=='string'&&typeof frame.hero.frameName!=='number'))throw Error('Explicit native engine frame/hero identity required');
    const label=requested.label;requested=null;if(label===null)return;
    const {canvas,scale}=source,w=canvas.width,h=canvas.height;
    if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w>CAPTURE_LIMITS.width||h>CAPTURE_LIMITS.height||w*h>CAPTURE_LIMITS.pixels)throw Error('Courtyard backing canvas exceeds capture bound');
    const css=canvas.getBoundingClientRect();
    if(![css.x,css.y,css.width,css.height,scale.width,scale.height].every(Number.isFinite)||css.width<=0||css.height<=0||scale.width<=0||scale.height<=0)throw Error('Invalid courtyard canvas transforms');
    const url=canvas.toDataURL('image/png'),prefix='data:image/png;base64,';
    if(!url.startsWith(prefix))throw Error('Native canvas PNG unavailable');
    const base64=url.slice(prefix.length);
    if(base64.length<136||base64.length>CAPTURE_LIMITS.base64Chars||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw Error('Native canvas PNG size/encoding invalid');
    const metadata:CaptureMeta={evidenceMode,nativeMovementEvidence:evidenceMode==='native-courtyard',poseReceipt:poseReceipt??null,nativeFrame:frame.frame!,heroFrame:structuredClone(frame.hero),label,probeId:g.plazaProbe.id,at:g.at,capturedAt:performance.now(),consumedAt:null,
      viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,
      css:{x:css.x,y:css.y,width:css.width,height:css.height},backing:{width:w,height:h},logical:{width:scale.width,height:scale.height},
      base64Chars:base64.length,gameplay:structuredClone(g)};
    history.push(metadata);pending={metadata,base64};captureCount++;
  },
  take(id:number){
    if(!pending||pending.metadata.probeId!==id)throw Error('Matching native frame capture missing');
    pending.metadata.consumedAt=performance.now();const result=structuredClone(pending);pending=null;return result;
  },
  snapshot(){return {evidenceMode:mode(),nativeMovementEvidence:mode()==='native-courtyard',requests,captureCount,pending:pending!==null,requested:requested!==null,history:structuredClone(history)};}
};
declare global {interface Window {__arpgCourtyardCapture:typeof courtyardCapture;}}
window.__arpgCourtyardCapture=courtyardCapture;

const originalWalls=new WeakMap<object,readonly object[]>();
export function readCourtyardLifecycle(scene:object,owned:readonly object[],world:readonly object[],id:(object:object)=>number,ownerPresent:boolean){
  if(!originalWalls.has(scene)&&owned.length===4)originalWalls.set(scene,[...owned]);
  const read=(o:object)=>{const wall=o as {scene?:unknown;active?:boolean;visible?:boolean};return {objectId:id(o),destroyed:wall.scene===undefined&&wall.active===false,inWorld:world.includes(o)};};
  return {ownerPresent,current:owned.map(read),initial:(originalWalls.get(scene)??[]).map(read)};
}
