import assert from 'node:assert/strict';
import { decodeCourtyardPNG } from './courtyard-png.mjs';
import { readCourtyardFills, COURTYARD_VISIBILITY_LIMITS } from './courtyard-visibility.mjs';
export const ELBOW_WITNESSES=[[1725,858],[1731,858],[1725,873],[1731,873]];
export function verifyCapturedPNG(metadata,base64,{label,gameplay,index,mode='native-courtyard',poseId=null}){
  const m=metadata;assert.equal(m.label,label);assert.equal(m.evidenceMode,mode);assert.equal(m.nativeMovementEvidence,mode==='native-courtyard');
  if(mode==='native-courtyard')assert.equal(m.poseReceipt,null);else{assert.equal(m.poseReceipt?.poseId,poseId);assert.equal(m.poseReceipt.evidenceMode,'controlled-scene-visual');assert.equal(m.poseReceipt.nativeMovementEvidence,false);assert(m.poseReceipt.settledAt<=m.at);}
  assert.deepEqual(m.gameplay,gameplay);assert.equal(m.probeId,gameplay.plazaProbe.id);assert.equal(m.at,gameplay.at);assert(Number.isSafeInteger(m.nativeFrame)&&m.nativeFrame>=0);assert.equal(m.nativeFrame,gameplay.courtyardFrame?.frame);assert.deepEqual(m.heroFrame,gameplay.courtyardFrame.hero);
  assert(Number.isFinite(m.capturedAt)&&m.capturedAt>=m.at&&Number.isFinite(m.consumedAt)&&m.consumedAt>=m.capturedAt);
  assert.deepEqual(m.viewport,index===1?{width:390,height:844}:{width:1280,height:900});
  assert(m.documentWidth>0&&m.documentWidth<=m.viewport.width);
  for(const k of['x','y','width','height'])assert(Number.isFinite(m.css[k]));
  assert(m.css.width>0&&m.css.height>0&&m.css.x>=-1&&m.css.x+m.css.width<=m.viewport.width+1);
  for(const k of['width','height'])assert(Number.isFinite(m.logical[k])&&m.logical[k]>0);
  assert.equal(typeof base64,'string');assert.equal(base64.length,m.base64Chars);assert(base64.length<=8000000&&/^[A-Za-z0-9+/]*={0,2}$/.test(base64));
  const png=decodeCourtyardPNG(Buffer.from(base64,'base64'));assert.deepEqual(m.backing,{width:png.width,height:png.height});
  const g=m.gameplay,v=g.viewportGeometry,regions=[];
  if(g.area===0){verifyVisibilityObservation(g);assert.deepEqual(g.courtyardVisibility.viewport,{css:m.css,backing:m.backing,logical:m.logical});}
  if(v){assert.deepEqual(v.canvas,{width:m.css.width,height:m.css.height});assert(v.camera.width>0&&v.camera.height>0);}
  if(/(?:west|east)-(?:elbow-witness|front-witness)$/.test(label)){
    assert(v);const[a,b,c,d,e,f]=v.camera.matrix;
    for(const[worldX,worldY]of ELBOW_WITNESSES){
      const x=worldX-v.camera.scrollX,y=worldY-v.camera.scrollY,logicalX=a*x+c*y+e,logicalY=b*x+d*y+f;
      const cssX=logicalX*m.css.width/m.logical.width,cssY=logicalY*m.css.height/m.logical.height;
      assert(cssX>=3&&cssX<=m.css.width-3&&cssY>v.hud.y+v.hud.height+3&&cssY<v.controls.y-3,'Elbow witness must be visible in the actual unobstructed canvas band');
      const bx=Math.floor(logicalX*png.width/m.logical.width),by=Math.floor(logicalY*png.height/m.logical.height);
      assert(bx>=2&&by>=2&&bx+2<png.width&&by+2<png.height,'Bounded witness region fits backing image');
      const pixels=[];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)pixels.push({center:[bx+dx+.5,by+dy+.5],rgba:png.pixel(bx+dx,by+dy)});
      regions.push({world:[worldX,worldY],css:[cssX,cssY],nearestBackingPixelCenter:[bx+.5,by+.5],size:5,pixels,edgeMixingPossible:true,colorEqualityAsserted:false});
    }
  }
  // Nonblank evidence is required, but opaque canvas pixels are never called
  // proof of hero visibility. That comes from separate source-alpha observations
  // and manual review of these genuine, same-frame native PNGs.
  const values=new Set();for(let y=0;y<png.height;y+=Math.max(1,Math.floor(png.height/16)))for(let x=0;x<png.width;x+=Math.max(1,Math.floor(png.width/16)))values.add(png.pixel(x,y).join(','));
  assert(values.size>=4,'Native frame must contain nonblank rendered content');
  return {label,evidenceMode:mode,frameAt:m.at,witnessRegions:regions,manualPixelReviewRequired:true};
}

export function verifyVisibilityObservation(g){
  const v=g.courtyardVisibility;assert.equal(v?.valid,true);assert.deepEqual(v.issues,[]);assert.equal(v.method,'analytic-source-transmission');assert.equal(v.nativePixels,false);assert.equal(v.alphaThreshold,128);assert.equal(v.sampleStep,3);
  assert(Number.isSafeInteger(v.samples)&&v.samples>=20&&v.samples<=COURTYARD_VISIBILITY_LIMITS.sampleCandidates);assert(Number.isSafeInteger(v.readable)&&v.readable>=v.samples/2&&v.readable<=v.samples);assert(Number.isFinite(v.meanTransmission)&&v.meanTransmission>=.4&&v.meanTransmission<=1);
  assert.equal(v.hero.depth,g.townArt.hero.depth);assert(Number.isSafeInteger(v.hero.objectId));assert.deepEqual(v.camera.matrix,g.viewportGeometry.camera.matrix);assert.equal(v.camera.scrollX,g.viewportGeometry.camera.scrollX);assert.equal(v.camera.scrollY,g.viewportGeometry.camera.scrollY);assert.equal(v.camera.alpha,1);
  assert.equal(v.walls.length,4);assert(v.painterOrder.length<=256);const ids=new Set();let world=-1,paint=-1,depth=-Infinity;
  for(const o of v.painterOrder){assert(Number.isSafeInteger(o.objectId)&&!ids.has(o.objectId));ids.add(o.objectId);assert(Number.isSafeInteger(o.worldIndex)&&o.worldIndex>world&&Number.isSafeInteger(o.painterIndex)&&o.painterIndex>paint&&Number.isFinite(o.depth)&&o.depth>=depth);world=o.worldIndex;paint=o.painterIndex;depth=o.depth;}
  for(const o of[v.hero,...v.walls]){const observed=v.painterOrder.find(p=>p.objectId===o.objectId);assert(observed&&observed.depth===o.depth&&observed.worldIndex===o.worldIndex&&observed.painterIndex===o.painterIndex);}
  for(const[i,w]of v.walls.entries()){
    const actual=g.townArt.ground.courtyard[i];for(const k of['name','objectId','depth','alpha','active','visible','scrollFactorX','scrollFactorY'])assert.equal(w[k],actual[k]);
    assert.deepEqual(w.commands,actual.commands);assert.deepEqual(w.worldMatrix,[1,0,0,1,0,0]);assert.equal(w.aboveHero,w.painterIndex>v.hero.painterIndex);
    const decoded=readCourtyardFills(w.commands);assert.equal(w.fills.length,3);
    for(const key of['intersectedSamples','contributingSamples'])assert(Number.isSafeInteger(w[key])&&w[key]>=0&&w[key]<=v.samples);
    assert(w.contributingSamples<=w.intersectedSamples);if(!w.aboveHero)assert.equal(w.intersectedSamples,0);
    for(const[j,f]of w.fills.entries()){
      for(const key of['fillIndex','color','alpha','points'])assert.deepEqual(f[key],decoded[j][key]);
      for(const key of['intersectedSamples','contributingSamples'])assert(Number.isSafeInteger(f[key])&&f[key]>=0&&f[key]<=w[key]);
      assert(f.contributingSamples<=f.intersectedSamples);
    }
    assert(w.fills.reduce((n,f)=>n+f.intersectedSamples,0)>=w.intersectedSamples);
    assert(w.fills.reduce((n,f)=>n+f.contributingSamples,0)>=w.contributingSamples);
  }
  return {heroThroughWallExercised:v.walls.some(w=>w.contributingSamples>0)};
}
