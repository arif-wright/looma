export const KIND='arpg-frame-gap-diagnostic';
export const EARLY_FRAMES=30,SETTLE_FRAMES=10,SETTLED_MS=10_000,COLLECTION_TIMEOUT_MS=45_000,FRAME_CAPACITY=8000;
export const RUNS=[{id:1,mode:'light',role:'warmup'},{id:2,mode:'detailed',role:'warmup'},
  {id:3,mode:'light',role:'measured'},{id:4,mode:'detailed',role:'measured'},
  {id:5,mode:'detailed',role:'measured'},{id:6,mode:'light',role:'measured'}];
export const PHASES=['early','settling','settled'];
export function parseHash(hash){const p=new URLSearchParams(hash.replace(/^#/,'')),mode=p.get('frameMode'),id=p.get('frameRun');
  if(!['light','detailed'].includes(mode)||id===null||!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id)))throw new Error('Explicit frame diagnostic mode/run required');
  return{mode,runId:Number(id)};
}
export function instrumentMain(source){if(source.includes("import './frame-gap-observer'"))throw new Error('Duplicate diagnostic entry');return `import './frame-gap-observer';\n${source}`;}
export function instrumentFixtureObserver(source){
  const opening='  game.events.on(Phaser.Core.Events.POST_RENDER, () => {',closing='  });\n  game.events.once(Phaser.Core.Events.DESTROY';
  if(source.split(opening).length!==2||source.split(closing).length!==2)throw new Error('Exact published observer registration required');
  return source.replace(opening,'  game.events.on(Phaser.Core.Events.POST_RENDER, window.__arpgFrameGap.wrapFixtureObserver(game, () => {').replace(closing,'  }));\n  game.events.once(Phaser.Core.Events.DESTROY');
}
