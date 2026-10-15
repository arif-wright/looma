// Fabricated schema-test data only. Never imported by runtime/browser code or
// emitted as browser evidence. Physical challenge frames use the source model.
export function fabricatePerimeterFrames(state) {
  const rear=state.checkpoints.find(p=>p.label==='rear-back-cutaway'),ready=state.checkpoints.find(p=>p.label==='perimeter-ready'),blocked=state.checkpoints.find(p=>p.label==='perimeter-wall-blocked');
  const first=state.plazaMotion.findIndex(p=>p.at===rear.scene.gameplay.at),last=state.plazaMotion.findIndex(p=>p.at===blocked.scene.gameplay.at);
  for(let i=first;i<=last;i++){
    const p=state.plazaMotion[i],prev=state.plazaMotion[i-1],neutral=p.intent.y===0;
    // Other fabricated route segments remain deliberately schema-only; only
    // this bounded proof interval now claims actual measured-frame dynamics.
    const moved=i>first&&p.y!==prev.y;
    const delta=moved?(prev.y-p.y)/220*1000:50;
    p.dash={cd:0,timer:0,lastDir:{x:0,y:-1}};
    p.courtyardFrame={frame:i,delta,hero:{textureKey:'hero-idle',frameName:0,animation:null,playing:false},movement:{sceneId:1,initialized:true,ended:false,runState:'running',playerId:1,areaEpoch:1,sceneStatus:5,pendingDestroy:false,hp:140,velocity:{vx:0,vy:neutral||!moved?0:-193.6,speed:220}}};
  }
  for(const checkpoint of[rear,ready,blocked]){
    const sample=state.plazaMotion.find(p=>p.at===checkpoint.scene.gameplay.at);
    for(const field of['courtyardFrame','dash'])checkpoint.scene.gameplay[field]=structuredClone(sample[field]);
    for(const visual of state.visuals)if(visual.scene.gameplay.at===sample.at)visual.scene.gameplay=structuredClone(checkpoint.scene.gameplay);
  }
}
