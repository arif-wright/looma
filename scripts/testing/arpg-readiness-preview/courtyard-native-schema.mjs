/**
 * FABRICATED UNIT-TEST DATA ONLY. This is not a browser run, native engine
 * observation, screenshot, execution receipt, or evidence of runtime success.
 * It deliberately manufactures JSON inputs to exercise verifier acceptance and
 * rejection. Never import it from browser code or save it as runtime evidence.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const SOURCE_URL = existsSync(new URL('./courtyard-contract.mjs', import.meta.url))
  ? new URL('./', import.meta.url)
  : new URL('../candidate/scripts/testing/arpg-readiness-preview/', import.meta.url);
export const SOURCE_DIR = fileURLToPath(SOURCE_URL);
export const loadContract = name => import(new URL(name, SOURCE_URL));
const {COURTYARD_ACTIONS,COURTYARD_VIEWS,courtyardScreenshot} = await loadContract('courtyard-contract.mjs');
const {fabricateCourtyardSchema} = await loadContract('courtyard-schema-data.mjs');
const {expectedBackdropCommands} = await loadContract('town-ground.mjs');
const {PLAZA_KEYS} = await loadContract('plaza-contract.mjs');
const {EXPECTED_REWARD_MUTATIONS,expectedStart,FLOW_CAP_MS,SIGNATURE} = await loadContract('protocol.mjs');

// Independent geometry literal and distance implementation. The fabricated
// simulator imports neither production geometry/collision nor verifier sweeps.
export const FABRICATED_SOLIDS = {
  rear:[[1240,304],[1304,272],[1560,400],[1496,432]],
  endcap:[[1728,376],[1984,248],[1920,216],[1664,344]],
  shop:[[1558,524],[1663,474],[1769,517],[1664,568]],
  west:[[1180.4222912360003,623.1554175279994],[1724.4222912360003,895.1554175279994],[1731.5777087639997,880.8445824720006],[1187.5777087639997,608.8445824720006]],
  east:[[1731.5777087639997,895.1554175279994],[2019.5777087639997,751.1554175279994],[2012.4222912360003,736.8445824720006],[1724.4222912360003,880.8445824720006]]
};
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function segmentDistance(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function inPolygon(p,poly){
  const turns=poly.map((a,i)=>cross(a,poly[(i+1)%poly.length],p));
  return turns.every(t=>t>=0)||turns.every(t=>t<=0);
}
function segmentsIntersect(a,b,c,d){
  const overlap=(a,b,c,d)=>Math.max(a,b)>=Math.min(c,d)&&Math.max(c,d)>=Math.min(a,b);
  return overlap(a[0],b[0],c[0],d[0])&&overlap(a[1],b[1],c[1],d[1])&&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
}
export function fabricatedSweep(a,b,poly){
  if(inPolygon(a,poly)||inPolygon(b,poly))return 0;
  return Math.min(...poly.map((c,i)=>{const d=poly[(i+1)%poly.length];return segmentsIntersect(a,b,c,d)?0:Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b));}));
}
export function fabricatedRoomAllows([px,py]){
  return [[0,0],[38,0],[-38,0],[0,38],[0,-38]].every(([dx,dy])=>{
    const a=(px+dx-1152)/64,b=(py+dy+200)/32;
    return Math.round((a+b)/2)>=1&&Math.round((a+b)/2)<=26&&Math.round((b-a)/2)>=1&&Math.round((b-a)/2)<=16;
  });
}
const mayMove=(a,b)=>fabricatedRoomAllows(b)&&Object.values(FABRICATED_SOLIDS).every(poly=>fabricatedSweep(a,b,poly)>=38);
const direction=key=>[Number(key==='d')-Number(key==='a'),Number(key==='s')-Number(key==='w')];
const copy=v=>structuredClone(v);

function viewportGeometry(){
  const g={canvas:{width:358,height:500},camera:{x:0,y:0,width:358,height:500,zoom:.7,scrollX:1000,scrollY:300,matrix:[.3,0,0,.3,125.3,70]},hud:{x:8,y:8,width:342,height:44},controls:{x:8,y:438,width:342,height:54},
    hudItems:[{name:'score',bounds:{x:16,y:13,width:100,height:14}},{name:'hp',bounds:{x:16,y:33,width:60,height:12}},{name:'area',bounds:{x:148,y:33,width:80,height:12}}],
    controlItems:[{name:'status',bounds:{x:16,y:443,width:160,height:13}},{name:'primary',bounds:{x:16,y:463,width:90,height:20}}],
    heroGround:{x:120,y:250},shop:{x:180,y:100,width:120,height:120},entrance:{x:240,y:240,width:100,height:100},entranceLabel:{x:245,y:345,width:94,height:20},
    heroVisible:{textureKey:'hero-idle',alphaThreshold:32,frameWidth:256,frameHeight:256,sourceBounds:{x:110,y:100,width:30,height:50,opaquePixels:700},screenBounds:{x:110,y:220,width:18,height:32}},
    entranceVisible:{textureKey:'town_ruins_entrance_v1',alphaThreshold:32,frameWidth:1536,frameHeight:1024,sourceBounds:{x:395,y:155,width:819,height:781,opaquePixels:200000},screenBounds:{x:250,y:250,width:80,height:80}}};
  g.entrancePrompt={text:'E · Enter ruins',visible:true,active:true,alpha:1,screenBounds:copy(g.entranceLabel)};
  return g;
}
function townArt(x,y,recreated){
  const object=(key,x,y,depth)=>({key,x,y,depth,originX:.5,originY:.5,scaleX:1,scaleY:1,displayWidth:100,displayHeight:100});
  const graphic=(objectId,depth)=>({objectId,depth,x:0,y:0,scaleX:1,scaleY:1,rotation:0,alpha:1,active:true,visible:true,scrollFactorX:1,scrollFactorY:1});
  const commands=expectedBackdropCommands();
  return {hero:object('hero-idle',x,y,y+20),objects:[
    {...object('town_ground_plane_v1',128,-168,-161),originX:0,originY:0,scaleX:2,scaleY:2,displayWidth:2688,displayHeight:1344},
    {...object('town_corner_shop_v1',1664,568,588),originX:618/1254,originY:1175/1254},
    object('town_corner_lantern_v1',100,600,620),
    {...object('town_ruins_entrance_v1',1728,664,684),originX:666/1536,originY:826/1024,scaleX:110/780,scaleY:110/780,alpha:1}
  ],ground:{legacyFloorCount:0,legacyWallCount:0,worldGraphicsCount:6,largeMarkerCount:0,textureWidth:1344,textureHeight:672,filterMode:0,
    perimeter:[graphic(recreated?200:100,-160)],backdrop:[{...graphic(recreated?201:101,-162),commandCount:commands.length,commands}],
    samples:Array.from({length:5},(_,i)=>{const worldX=x+(1728-x)*i/4,worldY=y+(664-y)*i/4;return {worldX,worldY,pixelX:Math.floor((worldX-128)/2),pixelY:Math.floor((worldY+168)/2),alpha:255};})}};
}
function plazaLayers(y,recreated){
  return ['shop','rear-foundation','rear-upper','endcap-foundation','endcap-upper'].map((id,i)=>{
    const shop=id==='shop',rear=id.startsWith('rear'),anchor=shop?568:rear?432:376;
    return {name:`town-plaza-${id}`,objectId:(recreated?110:10)+i,key:shop?'town_corner_shop_v1':`town_plaza_${id.replace('-','_')}_v1`,x:shop?1664:rear?1496:1728,y:anchor,depth:Math.min(anchor+20,y+19),alpha:1,active:true,visible:true,originX:shop?618/1254:(rear?520:136)/656,originY:shop?1175/1254:rear?536/544:472/480,scaleX:shop?.24:.5,scaleY:shop?.24:.5,displayWidth:shop?301:328,displayHeight:shop?301:rear?272:240};
  });
}

export function fabricateNativeCourtyard(index=0){
  if(![0,1].includes(index))throw Error('Only the two known fabricated viewport schemas are supported');
  const keys=[...Array.from({length:249},(_,i)=>`fabricated-key-${i}`),'town_cobble_material_v1','town_corner_shop_v1','town_corner_lantern_v1','town_ruins_entrance_v1',...PLAZA_KEYS];
  const scene={id:1,queuedKeys:keys,decodedKeys:copy(keys),missingKeys:[],preloadAt:0,createAt:1,framesAfterCreate:1,destroyed:false,loadErrors:[],loadComplete:true,totalFailed:0};
  const state={courtyardEvidence:{evidenceMode:'native-courtyard',nativeMovementEvidence:true,visualEnabled:false,visual:null},ready:true,profile:'return-flow',blocked:[],rewardMutations:copy(EXPECTED_REWARD_MUTATIONS),api:[],scenes:[scene],checkpoints:[],visuals:[],pages:[{status:'Result saved. Town is untimed; depart again whenever you’re ready.'}],plazaMotion:[],plazaMotionOverflow:false};
  let time=1000,pos=[1472,536],cd=0,lastDir=[0,1],area=0,recreated=false;
  const push=(delta,intent=[0,0])=>{
    time+=delta;cd=Math.max(0,cd-delta);
    state.plazaMotion.push({at:time,area,x:pos[0],y:pos[1],intent:{x:intent[0],y:intent[1]},dash:{cd,timer:cd>500?100:0,lastDir:{x:lastDir[0],y:lastDir[1]}},courtyardFrame:{frame:state.plazaMotion.length,delta,hero:{textureKey:'hero-idle',frameName:0,animation:'hero-idle',playing:true}}});
  };
  const step=(dir,delta,dash=false)=>{
    lastDir=[...dir];const distance=220*delta/1000+(dash?230:0),next=pos.map((v,i)=>v+dir[i]*distance);
    if(mayMove(pos,next))pos=next;
    if(dash)cd=700;push(delta,dir);
  };
  const move=target=>{
    for(let axis=0;axis<2;axis++){
      let safety=0;
      while(Math.abs(pos[axis]-target[axis])>1e-8){
        if(++safety>1000)throw Error(`Fabricated route blocked at ${pos}, target ${target}`);
        const dir=[0,0];dir[axis]=Math.sign(target[axis]-pos[axis]);
        step(dir,Math.min(16,Math.abs(target[axis]-pos[axis])/220*1000));
      }
    }
  };
  const gameplay=()=>{
    const g={courtyardFrame:copy(state.plazaMotion.at(-1).courtyardFrame),at:time,area,x:pos[0],y:pos[1],elapsed:recreated?1100:0,returned:recreated,outcome:recreated?'retreated':'preparing',durationLimit:FLOW_CAP_MS,expeditionActive:area===1,hp:140,kills:0,intent:copy(state.plazaMotion.at(-1).intent),dash:copy(state.plazaMotion.at(-1).dash),
      viewportGeometry:viewportGeometry(),townArt:area?null:townArt(...pos,recreated),plaza:area?[]:plazaLayers(pos[1],recreated),
      plazaVisibility:{samples:100,readable:100,meanTransmission:.72,occluders:[]},
      courtyardVisibility:{method:'analytic-source-transmission',nativePixels:false,valid:true,issues:[],alphaThreshold:128,sampleStep:3,samples:100,readable:100,meanTransmission:.72},
      courtyardLifecycle:{ownerPresent:area===0,current:[],initial:Array.from({length:4},(_,i)=>({objectId:1000+i,destroyed:recreated||area===1,inWorld:!recreated&&area===0}))}};
    if(!area){fabricateCourtyardSchema(g,recreated?2000:1000);g.courtyardLifecycle.current=g.townArt.ground.courtyard.map(o=>({name:o.name,objectId:o.objectId,destroyed:false,inWorld:true}));}
    return g;
  };
  for(const action of COURTYARD_ACTIONS){
    if(action.kind==='move')action.points.forEach(move);
    if(action.kind==='walk')for(let i=0;i<44;i++)step(direction(action.key),16);
    if(action.kind==='dash'){
      while(cd>0)push(Math.min(16,cd));
      step(direction(action.key),16,true);
      for(let i=0;i<16;i++)step(direction(action.key),16);
    }
    if(action.kind==='depart'){area=1;push(100);}
    if(action.kind==='return'){push(1100);area=0;recreated=true;pos=[1472,536];push(100);}
    push(16);
    const g=gameplay();g.plazaProbe={id:state.checkpoints.length+1,requestedAt:time-8,respondedAt:time};
    const p={label:action.label,at:time+1,starts:area||recreated?1:0,scene:{...copy(scene),gameplay:g}};state.checkpoints.push(p);
    if(action.view){const viewport=index===1?{width:390,height:844}:{width:1280,height:900};state.visuals.push({label:courtyardScreenshot(index,action.view),at:time+2,starts:p.starts,viewport,documentWidth:viewport.width,canvas:{x:8,y:100,width:viewport.width-16,height:500,pixelWidth:358,pixelHeight:500},scene:copy(p.scene)});}
  }
  const point=label=>state.checkpoints.find(p=>p.label===label),arrived=point('gate-arrived'),departed=point('courtyard-departed'),returned=point('courtyard-returned-owned');
  const signed={sessionId:'fixture-arpg-1',slug:'arpg',nonce:'nonce-fixture-arpg-1',score:0,durationMs:1100,clientVersion:'1.0.0'}, {slug:_,...completion}=signed;
  state.api=[{path:'/api/games/session/start',method:'POST',at:arrived.at+10,responseAt:departed.at-10,body:copy(expectedStart)},
    {path:'/api/games/sign',method:'POST',at:returned.at-30,body:signed},
    {path:'/api/games/session/complete',method:'POST',at:returned.at-20,body:{...completion,signature:SIGNATURE,success:true,stats:{mode:'standard',expeditionDurationMs:1100}}},
    {path:'/api/games/player/state',method:'GET',at:returned.at-10}];
  scene.gameplay=copy(returned.scene.gameplay);
  const observation={fabricatedForVerifierUnitTests:true,notNativeEvidence:true,browserVersion:'FABRICATED-NOT-EXECUTED',blocked:[],errors:[],unexpectedConsoleErrors:[],cleanupErrors:[],consoleErrors:[],state,afterCleanup:{...copy(state),scenes:[{...copy(scene),destroyed:true}],canvasCount:0,authCallbacks:0,mountedPages:[]}};
  const driver={kind:'native-courtyard-driver',index,legs:COURTYARD_ACTIONS.reduce((n,a)=>n+(a.points?.length??0),0),pulses:800,completed:true,completedActions:COURTYARD_ACTIONS.map(a=>a.label)};
  return {fabricated:true,warning:'FABRICATED schema input; never native browser, engine, pixel or visual proof.',observation,driver,index};
}

// Keep dependent copies coherent so one negative test targets the intended
// invariant, rather than incidentally failing snapshot equality first.
export function reconcileFabricatedCopies(fixture){
  const s=fixture.observation.state,c=fixture.observation.afterCleanup;
  for(const visual of s.visuals){
    const action=COURTYARD_ACTIONS.find(a=>a.view&&courtyardScreenshot(fixture.index,a.view)===visual.label);
    const p=s.checkpoints.find(p=>p.label===action?.label);if(p)visual.scene=copy(p.scene);
  }
  for(const key of ['api','checkpoints','visuals','rewardMutations','plazaMotion','plazaMotionOverflow'])c[key]=copy(s[key]);
  return fixture;
}
