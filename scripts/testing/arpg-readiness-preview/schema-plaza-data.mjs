// Fabricated verifier unit-test data ONLY. Never imported by browser code or
// emitted as hosted evidence. Its role is to exercise acceptance/rejection.
import { PLAZA_VIEWS, plazaScreenshot } from './screenshots.mjs';
import { EXPECTED_REWARD_MUTATIONS, FLOW_CAP_MS, SIGNATURE } from './protocol.mjs';
export function fabricatePlazaSchema(state,scene,game,index){
  let time=1000,pos=[1472,536],cd=0,nextId=1;
  state.profile='return-flow';state.rewardMutations=structuredClone(EXPECTED_REWARD_MUTATIONS);
  state.plazaMotion=[];state.plazaMotionOverflow=false;
  let ids=Object.fromEntries(['shop','rear-foundation','rear-upper','endcap-foundation','endcap-upper'].map(n=>[n,nextId++]));
  const layers=()=>Object.entries(ids).map(([id,objectId])=>{
    const shop=id==='shop',rear=id.startsWith('rear'),foundation=id.endsWith('foundation');
    const alpha=(id.startsWith('rear-')&&pos[1]<300&&pos[0]>1250&&pos[0]<1500)||(id.startsWith('endcap-')&&pos[0]>=1660&&pos[1]<300)?.28:1;
    const y=shop?568:rear?432:376;
    return {name:`town-plaza-${id}`,objectId,key:shop?'town_corner_shop_v1':`town_plaza_${id.replace('-','_')}_v1`,x:shop?1664:rear?1496:1728,y,depth:alpha===.28?y+20:Math.min(y+20,pos[1]+19),alpha:foundation?1:alpha,active:true,visible:true,originX:shop?618/1254:(rear?520:136)/656,originY:shop?1175/1254:rear?536/544:472/480,scaleX:shop?.24:.5,scaleY:shop?.24:.5,displayWidth:shop?301:328,displayHeight:shop?301:rear?272:240};
  });
  const push=(area=0,dir=[0,1])=>state.plazaMotion.push({at:time,area,x:pos[0],y:pos[1],intent:{x:0,y:-1},dash:{cd,timer:cd>500?100:0,lastDir:{x:dir[0],y:dir[1]}}});
  const idle=ms=>{for(let i=0;i<ms;i+=50){time+=50;cd=Math.max(0,cd-50);push();}};
  const move=target=>{const from=[...pos],steps=Math.max(1,Math.ceil(Math.hypot(target[0]-pos[0],target[1]-pos[1])/10));for(let i=1;i<=steps;i++){pos=from.map((n,j)=>n+(target[j]-n)*i/steps);time+=50;cd=Math.max(0,cd-50);push();}};
  const route=points=>points.forEach(move);
  const getGame=(area=0,returned=false)=>{
    const g=structuredClone(game);Object.assign(g,{at:time,area,x:pos[0],y:pos[1],elapsed:returned?1100:0,returned,outcome:returned?'retreated':'preparing',expeditionActive:area===1,durationLimit:FLOW_CAP_MS,plazaVisibility:{samples:100,readable:100,meanTransmission:.72,occluders:[]},plaza:area?[]:layers(),dash:structuredClone(state.plazaMotion.at(-1).dash)});
    g.townArt.hero.x=g.x;g.townArt.hero.y=g.y;g.townArt.hero.depth=g.y+20;
    g.viewportGeometry.heroGround.x=g.viewportGeometry.canvas.width/2;
    return g;
  };
  const checkpoint=(label,view,returned=false,area=0)=>{
    const g=getGame(area,returned),p={label,at:time+1,starts:returned||area?1:0,scene:{...structuredClone(scene),gameplay:g}};state.checkpoints.push(p);
    if(view){const viewport=index===13?{width:390,height:844}:{width:1280,height:900};state.visuals.push({label:plazaScreenshot(index,view),at:time+2,starts:p.starts,viewport,documentWidth:viewport.width,canvas:{x:8,y:100,width:viewport.width-16,height:500,pixelWidth:viewport.width-16,pixelHeight:500},scene:structuredClone(p.scene)});}
    return p;
  };
  const dash=dir=>{time+=16;cd=684;push(0,dir);time+=200;cd=484;push(0,dir);};
  push();checkpoint('plaza-home');route([[1368,536],[1368,430]]);checkpoint('rear-front-ready','rear-front');move([1368,411]);idle(700);checkpoint('rear-front-walk-blocked');dash([0,-1]);checkpoint('rear-front-dash-blocked');
  route([[1368,430],[1160,430],[1160,210],[1200,210],[1200,260]]);checkpoint('rear-side-ready');dash([1,0]);checkpoint('rear-side-dash-blocked');route([[1200,210],[1368,210]]);checkpoint('rear-back-cutaway','rear-back-cutaway');
  route([[1200,210],[1160,210],[1160,430],[1368,430]]);checkpoint('rear-front-restored');
  route([[1160,430],[1160,210],[1368,210],[1610,210],[1610,400],[1660,400],[1680,420],[1700,420],[1700,432],[1856,432],[1856,380]]);checkpoint('endcap-front-ready');move([1856,355]);idle(700);checkpoint('endcap-front-walk-blocked');
  route([[1856,432],[1700,432],[1700,420],[1680,420],[1660,400],[1610,400],[1610,260],[1640,260]]);checkpoint('endcap-side-ready');dash([Math.SQRT1_2,Math.SQRT1_2]);checkpoint('endcap-side-dash-blocked');move([1680,260]);checkpoint('endcap-roof-cutaway','endcap-side-cutaway');
  route([[1640,260],[1610,260],[1610,400],[1660,400],[1680,420],[1700,420],[1700,432],[1856,432],[1856,380]]);checkpoint('endcap-front-restored');route([[1856,432],[2000,432],[2000,600],[1800,600]]);checkpoint('gate-east-approach','gate-east-approach');route([[1800,760],[1728,760]]);checkpoint('gate-south-approach');move([1728,664]);const arrived=checkpoint('gate-arrived');
  time+=100;push(1);const departed=checkpoint('plaza-departed',null,false,1);time+=1100;push(1);time+=100;pos=[1472,536];ids=Object.fromEntries(Object.keys(ids).map(n=>[n,nextId++]));push();const returned=checkpoint('plaza-returned-owned','returned-owned',true);
  scene.gameplay=structuredClone(returned.scene.gameplay);state.pages[0].status='Result saved. Town is untimed; depart again whenever you’re ready.';
  state.api[0].at=arrived.at+10;state.api[0].responseAt=departed.at-10;
  const signed={sessionId:'fixture-arpg-1',slug:'arpg',nonce:'nonce-fixture-arpg-1',score:0,durationMs:1100,clientVersion:'1.0.0'};
  const {slug:_,...complete}=signed;
  state.api.push({path:'/api/games/sign',method:'POST',at:time-30,body:signed},{path:'/api/games/session/complete',method:'POST',at:time-20,body:{...complete,signature:SIGNATURE,success:true,stats:{mode:'standard',expeditionDurationMs:1100}}},{path:'/api/games/player/state',method:'GET',at:time-10});
}
