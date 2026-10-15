import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodeCourtyardPNG } from './courtyard-png.mjs';
import { verifyVisibilityObservation, assertExactAffineMatrix } from './courtyard-capture-contract.mjs';
import { courtyardGraphicsIssues } from './courtyard-graphics.mjs';
import { plazaObjectsIssues, plazaGeometryIssues } from './plaza-contract.mjs';
import { WALK_MODE, WALK_POSE, WALK_FRAME, WALK_LIMITS, walkViewport, walkScreenshot } from './walk-frame-contract.mjs';
const finite=Number.isFinite;
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const inside=(p,poly)=>{const sides=poly.map((a,i)=>cross(a,poly[(i+1)%poly.length],p));return sides.every(v=>v>0)||sides.every(v=>v<0);};
const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
const transform=(m,p)=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
const VIGNETTE_SHA256='01cb2193841bb3fcfde2d96ecfc28a6c793488d629ae2285fab2988258203556';
const VIGNETTE_REGION={left:946,top:496,right:1012,bottom:554};
let vignetteVerified=false;
export function verifyWalkVignetteAsset(bytes){
  assert.equal(createHash('sha256').update(bytes).digest('hex'),VIGNETTE_SHA256);
  const image=decodeCourtyardPNG(bytes);assert.deepEqual([image.width,image.height],[1920,1080]);
  for(let y=VIGNETTE_REGION.top;y<=VIGNETTE_REGION.bottom;y++)for(let x=VIGNETTE_REGION.left;x<=VIGNETTE_REGION.right;x++)assert.equal(image.pixel(x,y)[3],2);
}
function vignetteTransmission(g){
  if(!vignetteVerified){verifyWalkVignetteAsset(readFileSync(new URL('../../../static/games/arpg/ui/filter/filter_vignette.png',import.meta.url)));vignetteVerified=true;}
  const v=g.courtyardVisibility;assert.equal(v.images.length,1);const image=v.images[0],width=v.viewport.logical.width,height=v.viewport.logical.height;
  const scale=Math.max(width/1920,height/1080)*1.3*Math.max(1,1.35/g.viewportGeometry.camera.zoom);
  for(const [key,value]of Object.entries({name:'vignette',textureKey:'vignette',type:'Image',depth:2500,alpha:.25,active:true,visible:true,x:width/2,y:height/2,scaleX:scale,scaleY:scale,rotation:0,scrollFactorX:0,scrollFactorY:0}))assert.equal(image[key],value,key);
  assert.deepEqual(image.frame,{x:0,y:0,width:1920,height:1080,displayOriginX:960,displayOriginY:540,flipX:false,flipY:false});
  assertExactAffineMatrix(image.worldMatrix,[Math.fround(scale),0,0,Math.fround(scale),Math.fround(width/2),Math.fround(height/2)]);
  const order=v.painterOrder.find(o=>o.objectId===image.objectId);assert(order&&order.name==='vignette'&&order.type==='Image'&&order.depth===2500&&order.worldIndex===image.worldIndex&&order.painterIndex===image.painterIndex&&image.painterIndex>v.hero.painterIndex);
  assert.deepEqual(v.occluders,['town-courtyard-east-upper','vignette']);
  const [a,, ,d,e,f]=image.worldMatrix,bounds=v.hero.frame.sourceBounds;
  // Conservatively map every lattice candidate, including transparent texels.
  // The exact pinned PNG proves all mapped texels have alpha2; no wall-only
  // aggregate or measured framebuffer transmission is inferred.
  for(let y=bounds.y;y<bounds.y+bounds.height;y+=3)for(let x=bounds.x;x<bounds.x+bounds.width;x+=3){
    const world=transform(v.hero.worldMatrix,[x+.5-128,y+.5-128]);
    const ix=Math.floor((world[0]-v.camera.scrollX-e)/a+960),iy=Math.floor((world[1]-v.camera.scrollY-f)/d+540);
    assert(ix>=VIGNETTE_REGION.left&&ix<=VIGNETTE_REGION.right&&iy>=VIGNETTE_REGION.top&&iy<=VIGNETTE_REGION.bottom,'Actual vignette samples must remain inside the source-verified alpha2 region');
  }
  return {textureKey:'vignette',assetSHA256:VIGNETTE_SHA256,sourceAlpha:2/255,objectAlpha:.25,sourceRegion:VIGNETTE_REGION,foregroundTransmission:1-.25*2/255};
}
export function validateWalkGameplay(g,source){
  for(const [k,v]of Object.entries({area:0,x:WALK_POSE.x,y:WALK_POSE.y,elapsed:0,expeditionActive:false,returned:false,outcome:'preparing',kills:0}))assert.equal(g[k],v,k);
  assert.deepEqual(g.intent,{x:0,y:0});assert.equal(g.dash?.timer,0);
  assert.deepEqual(courtyardGraphicsIssues(g),[]);assert.deepEqual(plazaObjectsIssues(g),[]);assert.deepEqual(plazaGeometryIssues(g),[]);
  verifyVisibilityObservation(g);
  assert.deepEqual(source,{textureKey:WALK_FRAME.textureKey,frameName:'__BASE',width:256,height:256,frameX:0,frameY:0,displayOriginX:128,displayOriginY:128,flipX:false,flipY:false,pixel:[132,135],rgba:[26,23,27,232],neighbor:{pixel:[131,135],rgba:[36,35,43,254]}});
  const v=g.courtyardVisibility,h=v.hero;
  assert.equal(h.name,WALK_FRAME.textureKey);assertExactAffineMatrix(h.worldMatrix,[1,0,0,1,2007.5,698.5]);
  assert.equal(h.depth,718.5);assert.equal(h.alpha,1);assert.equal(h.scaleX,1);assert.equal(h.scaleY,1);assert.equal(h.rotation,0);assert.equal(h.scrollFactorX,1);assert.equal(h.scrollFactorY,1);
  assert.deepEqual(h.frame,{x:0,y:0,width:256,height:256,displayOriginX:128,displayOriginY:128,flipX:false,flipY:false,sourceBounds:{x:117,y:96,width:51,height:44}});
  const visible=g.viewportGeometry.heroVisible;assert.equal(visible.textureKey,WALK_FRAME.textureKey);assert.equal(visible.frameWidth,256);assert.equal(visible.frameHeight,256);assert.equal(visible.alphaThreshold,32);
  assert.deepEqual(visible.sourceBounds,{x:117,y:96,width:51,height:44,opaquePixels:936});
  const project=p=>{const world=transform(h.worldMatrix,p),q=transform(v.camera.matrix,[world[0]-v.camera.scrollX,world[1]-v.camera.scrollY]);return[q[0]*v.viewport.css.width/v.viewport.logical.width,q[1]*v.viewport.css.height/v.viewport.logical.height];};
  const corners=[[-11,-32],[40,-32],[-11,12],[40,12]].map(project),left=Math.min(...corners.map(p=>p[0])),top=Math.min(...corners.map(p=>p[1]));
  for(const[k,value]of Object.entries({x:left,y:top,width:Math.max(...corners.map(p=>p[0]))-left,height:Math.max(...corners.map(p=>p[1]))-top}))assert(Math.abs(visible.screenBounds[k]-value)<1e-7,'Same-frame source silhouette projection differs');
  assert.equal(v.samples,61);assert.equal(v.readable,61);const vignette=vignetteTransmission(g);assert(Math.abs(v.meanTransmission-(61-.28)/61*vignette.foregroundTransmission)<1e-12);
  assert(Number.isSafeInteger(g.courtyardFrame?.frame)&&g.courtyardFrame.frame>=0);assert(finite(g.courtyardFrame.delta)&&g.courtyardFrame.delta>=0);
  assert.deepEqual(g.courtyardFrame.hero,{textureKey:WALK_FRAME.textureKey,frameName:'__BASE',animation:WALK_FRAME.animation,playing:false});
  const world=transform(h.worldMatrix,[source.pixel[0]+.5-source.displayOriginX,source.pixel[1]+.5-source.displayOriginY]);assert.deepEqual(world,[2012,706]);
  let contributing=0;const hits=[];
  for(const w of v.walls){
    const expected=w.name==='town-courtyard-east-upper'?1:0;
    assert.equal(w.intersectedSamples,expected);assert.equal(w.contributingSamples,expected);contributing+=w.contributingSamples;
    for(const f of w.fills){const count=w.name==='town-courtyard-east-upper'&&f.fillIndex===95?1:0;assert.equal(f.intersectedSamples,count);assert.equal(f.contributingSamples,count);
      if(w.aboveHero&&inside(world,f.points))hits.push({wall:w.name,objectId:w.objectId,painterIndex:w.painterIndex,depth:w.depth,objectAlpha:w.alpha,fillIndex:f.fillIndex,color:f.color,fillAlpha:f.alpha,points:f.points,edgeMargin:Math.min(...f.points.map((p,i)=>distance(world,p,f.points[(i+1)%f.points.length])))});
    }
  }
  assert.equal(contributing,1);assert.equal(hits.length,1);const hit=hits[0];assert.equal(hit.wall,'town-courtyard-east-upper');assert.equal(hit.fillIndex,95);assert.equal(hit.color,0x92866f);assert.equal(hit.depth,908);assert.equal(hit.objectAlpha,.28);assert.equal(hit.fillAlpha,1);assert(hit.painterIndex>h.painterIndex);assert(Math.abs(hit.edgeMargin-.5245824720008054)<1e-9);
  return {sourcePixel:source.pixel,sourceRGBA:source.rgba,sourceAlpha:232/255,world,actualObservedFill:hit,analyticForegroundTransmission:.72,vignette,analyticCombinedSampleTransmission:.72*vignette.foregroundTransmission,measuredPixelTransmission:null,samples:61,coloredBodyGridContributions:1,broadReadabilityProven:false};
}
export function verifyWalkCapturedPNG(m,base64,index){
  assert([0,1].includes(index));assert.equal(m.evidenceMode,WALK_MODE);assert.equal(m.nativeMovementEvidence,false);assert.equal(m.controlledFrameAssignment,true);assert.equal(m.label,walkScreenshot(index));
  const g=m.gameplay,point=validateWalkGameplay(g,m.source);assert.equal(m.probeId,g.plazaProbe?.id);assert.equal(m.at,g.at);assert.equal(m.nativeFrame,g.courtyardFrame.frame);assert.deepEqual(m.heroFrame,g.courtyardFrame.hero);
  assert.equal(m.poseReceipt?.evidenceMode,WALK_MODE);assert.equal(m.poseReceipt.poseId,WALK_POSE.id);assert.equal(m.poseReceipt.nativeMovementEvidence,false);assert.equal(m.poseReceipt.controlledFrameAssignment,true);assert(m.poseReceipt.settledNativeFrame<m.nativeFrame);assert(m.poseReceipt.settledAt<m.at);
  assert(finite(m.capturedAt)&&m.capturedAt>=m.at&&finite(m.consumedAt)&&m.consumedAt>=m.capturedAt);assert(Number.isSafeInteger(m.suppressedSelections)&&m.suppressedSelections>0&&m.suppressedSelections<=128);
  assert.deepEqual(m.viewport,walkViewport(index));assert(m.documentWidth>0&&m.documentWidth<=m.viewport.width);
  for(const k of ['x','y','width','height'])assert(finite(m.css[k]));assert(m.css.width>0&&m.css.height>0&&m.css.x>=-1&&m.css.x+m.css.width<=m.viewport.width+1);
  for(const k of ['width','height'])assert(finite(m.logical[k])&&m.logical[k]>0);
  assert.equal(typeof base64,'string');assert(base64.length===m.base64Chars&&base64.length>=136&&base64.length<=WALK_LIMITS.base64Chars&&/^[A-Za-z0-9+/]*={0,2}$/.test(base64));
  const png=decodeCourtyardPNG(Buffer.from(base64,'base64'));assert(png.width<=WALK_LIMITS.width&&png.height<=WALK_LIMITS.height&&png.width*png.height<=WALK_LIMITS.pixels);assert.deepEqual(m.backing,{width:png.width,height:png.height});assert.deepEqual(g.courtyardVisibility.viewport,{css:m.css,backing:m.backing,logical:m.logical});
  const camera=g.courtyardVisibility.camera,logical=transform(camera.matrix,[point.world[0]-camera.scrollX,point.world[1]-camera.scrollY]);
  const css=[logical[0]*m.css.width/m.logical.width,logical[1]*m.css.height/m.logical.height];
  assert(css[0]>=3&&css[0]<=m.css.width-3&&css[1]>=3&&css[1]<=m.css.height-3);
  for(const panel of [g.viewportGeometry.hud,g.viewportGeometry.controls])assert(css[0]<panel.x||css[0]>panel.x+panel.width||css[1]<panel.y||css[1]>panel.y+panel.height,'Body witness must be outside actual UI panels');
  const bx=Math.floor(logical[0]*png.width/m.logical.width),by=Math.floor(logical[1]*png.height/m.logical.height);assert(bx>=2&&by>=2&&bx+2<png.width&&by+2<png.height);
  const pixels=[];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)pixels.push({center:[bx+dx+.5,by+dy+.5],rgba:png.pixel(bx+dx,by+dy)});
  const values=new Set();for(let y=0;y<png.height;y+=Math.max(1,Math.floor(png.height/16)))for(let x=0;x<png.width;x+=Math.max(1,Math.floor(png.width/16)))values.add(png.pixel(x,y).join(','));assert(values.size>=4,'Native frame must be nonblank');
  return {label:m.label,evidenceMode:WALK_MODE,nativeFrame:m.nativeFrame,frameAt:m.at,point,logical,css,nearestBackingPixelCenter:[bx+.5,by+.5],raster:{source:'decoded same-frame native PNG',size:5,pixels,edgeMixingPossible:true,colorEqualityAsserted:false,transmissionMeasured:false},manualPixelReviewRequired:true};
}
