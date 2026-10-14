// Test-only exact reversal of the bounded measured-frame perimeter correction.
// Runtime modules never import this historical preservation adapter.
import { beforeObserverScope } from './observer-scope-preservation.mjs';
import assert from 'node:assert/strict';
const changes={
  "observe-scene.ts": [
    [
      "  movementInput: { x: number; y: number }; initialized: boolean; ended: boolean; runState: string; areaEpoch: number; expedition: Expedition; expeditionActive: boolean;",
      "  movementInput: { x: number; y: number }; initialized: boolean; expedition: Expedition; expeditionActive: boolean;"
    ],
    [
      "    delta:Number.isFinite(loop.delta)&&loop.delta>=0?loop.delta:null,\n    // Passive update guards and post-update velocity. Never call isCurrent or\n    // wrap update/collision; these support a source-backed reconstruction only.\n    movement: { sceneId: objectId(scene), initialized: state.initialized, ended: state.ended,\n      runState: state.runState, playerId: state.playerId, areaEpoch: state.areaEpoch,\n      sceneStatus: scene.sys.settings.status, pendingDestroy: scene.sys.game.pendingDestroy,\n      hp: state.playerId === null ? null : state.world.getHealth(state.playerId)?.current ?? null,\n      velocity: state.playerId === null ? null : structuredClone(state.world.getVelocity?.(state.playerId) ?? null) },",
      "    delta:Number.isFinite(loop.delta)&&loop.delta>=0?loop.delta:null,"
    ],
    [
      "    ...((window.__arpgPlazaFlow === true || window.__arpgCourtyardFlow === true || window.__arpgCourtyardVisualFlow === true) ? { courtyardFrame:readCourtyardFrame(scene,state) } : {}),\n    ...((window.__arpgCourtyardFlow === true || window.__arpgCourtyardVisualFlow === true) ? { courtyardLifecycle: readCourtyardLifecycle(scene, state.townCorner?.graphics.courtyard ?? [], state.worldLayer.list, objectId, state.townCorner !== null) } : {}),",
      "    ...((window.__arpgCourtyardFlow === true || window.__arpgCourtyardVisualFlow === true) ? { courtyardFrame:readCourtyardFrame(scene,state),courtyardLifecycle: readCourtyardLifecycle(scene, state.townCorner?.graphics.courtyard ?? [], state.worldLayer.list, objectId, state.townCorner !== null) } : {}),"
    ],
    [
      "      ...((window.__arpgPlazaFlow === true || window.__arpgCourtyardFlow === true || window.__arpgCourtyardVisualFlow === true) ? { courtyardFrame:readCourtyardFrame(scene,state) } : {}),",
      "      ...((window.__arpgCourtyardFlow === true || window.__arpgCourtyardVisualFlow === true) ? { courtyardFrame:readCourtyardFrame(scene,state) } : {}),"
    ],
    [
      "sceneStatus: scene.sys.settings?.status, pendingDestroy: (scene.sys.game as Phaser.Game & { readonly pendingDestroy: boolean }).pendingDestroy,",
      "sceneStatus: scene.sys.settings.status, pendingDestroy: scene.sys.game.pendingDestroy,"
    ],
    [
      "    // Passive update guards and post-update velocity, only for ordinary\n    // readiness exploration. Existing courtyard/visual payloads stay unchanged.\n    // Never call isCurrent or wrap update/collision: source reconstruction only.\n    ...((window.__arpgPlazaFlow === true && window.__arpgCourtyardFlow !== true && window.__arpgCourtyardVisualFlow !== true) ? {\n      movement: { sceneId: objectId(scene), initialized: state.initialized, ended: state.ended,\n        runState: state.runState, playerId: state.playerId, areaEpoch: state.areaEpoch,\n        sceneStatus: scene.sys.settings?.status, pendingDestroy: (scene.sys.game as Phaser.Game & { readonly pendingDestroy: boolean }).pendingDestroy,\n        hp: state.playerId === null ? null : state.world.getHealth(state.playerId)?.current ?? null,\n        velocity: state.playerId === null ? null : structuredClone(state.world.getVelocity?.(state.playerId) ?? null) }\n    } : {}),\n",
      "    // Passive update guards and post-update velocity. Never call isCurrent or\n    // wrap update/collision; these support a source-backed reconstruction only.\n    movement: { sceneId: objectId(scene), initialized: state.initialized, ended: state.ended,\n      runState: state.runState, playerId: state.playerId, areaEpoch: state.areaEpoch,\n      sceneStatus: scene.sys.settings?.status, pendingDestroy: (scene.sys.game as Phaser.Game & { readonly pendingDestroy: boolean }).pendingDestroy,\n      hp: state.playerId === null ? null : state.world.getHealth(state.playerId)?.current ?? null,\n      velocity: state.playerId === null ? null : structuredClone(state.world.getVelocity?.(state.playerId) ?? null) },\n"
    ]
  ],
  "runtime.ts": [
    [
      "export type CourtyardFrame = {frame:number|null;delta:number|null;movement?: {\n  sceneId:number; initialized:boolean; ended:boolean; runState:string; playerId:EntityId|null; areaEpoch:number;\n  sceneStatus:number; pendingDestroy:boolean; hp:number|null; velocity:{vx:number;vy:number;speed:number}|null;\n};hero:",
      "export type CourtyardFrame = {frame:number|null;delta:number|null;hero:"
    ],
    [
      "import type { EntityId } from '../../../src/lib/games/arpg/ecs/components';\nimport type { observeCourtyardVisibility }",
      "import type { observeCourtyardVisibility }"
    ]
  ],
  "plaza-browser.ts": [
    [
      "import { setupPerimeter } from './perimeter-setup';\nimport { departCourtyard } from './courtyard-departure';",
      "import { departCourtyard } from './courtyard-departure';"
    ],
    [
      "await setupPerimeter(page);await save('perimeter-ready');",
      "await route(page,NAVIGATION_PHASES.perimeter);await save('perimeter-ready');"
    ]
  ],
  "plaza-contract.mjs": [
    [
      "'rear-back-cutaway':[1368,210],'rear-front-restored'",
      "'rear-back-cutaway':[1368,210],'perimeter-ready':[1368,-8],'rear-front-restored'"
    ]
  ],
  "verify-plaza.mjs": [
    [
      "import { verifyPerimeter } from './verify-perimeter.mjs';\nimport { courtyardOwnershipIssues }",
      "import { courtyardOwnershipIssues }"
    ],
    [
      "  verifyPerimeter(at(points,'rear-back-cutaway'),at(points,'perimeter-ready'),at(points,'perimeter-wall-blocked'),motion);\n",
      "  // Independent original28x18 room math. Near this edge, the cardinal\n  // y\u221238 probe reaches logical row0 at y=0.5*x\u2212706. No production helper or\n  // visual rim dimensions are consulted to establish the collision stop.\n  const ready=at(points,'perimeter-ready'), blocked=at(points,'perimeter-wall-blocked');\n  const edge=blocked.scene.gameplay, limit=.5*edge.x-706;\n  assert(blocked.at-ready.at>=600,'Perimeter walk is held long enough to hit the original wall');\n  assert(Math.abs(edge.x-1368)<=8&&edge.y>=limit-.5&&edge.y<=limit+16,'Native walk stops at original radius38 room boundary within one15fps step');\n  const held=motion.filter(t=>t.at>ready.at&&t.at<=blocked.at&&t.intent?.x===0&&t.intent?.y===-1);\n  assert(held.length>=3&&held.at(-1).at-held[0].at>=400,'Original wall blocking includes sustained observed native north intent');\n"
    ]
  ],
  "courtyard-chord-preservation.mjs": [
    [
      "\nimport { beforePerimeterCorrection } from './perimeter-preservation.mjs';\nimport assert from 'node:assert/strict';\n",
      "\nimport assert from 'node:assert/strict';\n"
    ],
    [
      "export function beforeCourtyardChordSelection(name,source) {\n  source=beforePerimeterCorrection(name,source);",
      "export function beforeCourtyardChordSelection(name,source) {"
    ]
  ],
  "plaza-departure-preservation.mjs": [
    [
      "import { beforePerimeterCorrection } from './perimeter-preservation.mjs';\nimport assert from 'node:assert/strict';",
      "import assert from 'node:assert/strict';"
    ],
    [
      "export function beforePlazaDeparture(source) {\n  source=beforePerimeterCorrection('plaza-browser.ts',source);",
      "export function beforePlazaDeparture(source) {"
    ]
  ],
  "walk-frame.test.mjs": [
    [
      "import { beforePerimeterCorrection } from './perimeter-preservation.mjs';\nimport { beforeWestInnerSetup }",
      "import { beforeWestInnerSetup }"
    ],
    [
      "const source=beforePerimeterCorrection('runtime.ts',readFileSync(resolve(here,'runtime.ts'),'utf8')).replace",
      "const source=readFileSync(resolve(here,'runtime.ts'),'utf8').replace"
    ],
    [
      "const source=beforePerimeterCorrection('observe-scene.ts',readFileSync(resolve(here,'observe-scene.ts'),'utf8')).replace",
      "const source=readFileSync(resolve(here,'observe-scene.ts'),'utf8').replace"
    ]
  ],
  "courtyard-visibility.test.mjs": [
    [
      "test('all plaza motion reads native game.loop.delta including ordinary readiness'",
      "test('courtyard motion reads native game.loop.delta only when flag is true'"
    ],
    [
      "assert.deepEqual(Object.keys(old).sort(), ['area', 'at', 'courtyardFrame', 'dash', 'intent', 'x', 'y']);\n  assert.equal(old.courtyardFrame.frame,7);",
      "assert.deepEqual(Object.keys(old).sort(), ['area', 'at', 'dash', 'intent', 'x', 'y']);"
    ],
    [
      "\ntest('readiness frame records passive live update guards and cloned velocity without callback invocation',()=>{\n window.__arpgPlazaFlow=true;window.__arpgCourtyardFlow=false;window.__arpgCourtyardVisualFlow=false;fixture.plazaProbeRequest=null;\n const m=make();wire(m);const velocity={vx:0,vy:-193.6,speed:220};\n Object.assign(m.scene,{ended:false,runState:'running',areaEpoch:3,handlers:{isCurrent:()=>{throw Error('Observer must never call ownership handler');}}});\n m.scene.sys.settings={status:5};m.game.pendingDestroy=false;m.scene.world.getVelocity=()=>velocity;\n m.game.events.emit('postrender');const first=fixture.plazaLatestMotion.courtyardFrame.movement;\n assert.equal(first.initialized,true);assert.equal(first.ended,false);assert.equal(first.runState,'running');assert.equal(first.areaEpoch,3);\n assert.equal(first.sceneStatus,5);assert.equal(first.pendingDestroy,false);assert(first.hp>0);assert(first.playerId>0);assert(first.sceneId>0);\n assert.deepEqual(first.velocity,velocity);velocity.vy=0;assert.equal(first.velocity.vy,-193.6);\n m.game.pendingDestroy=true;m.scene.runState='paused';m.game.events.emit('postrender');const changed=fixture.plazaLatestMotion.courtyardFrame.movement;\n assert.equal(changed.pendingDestroy,true);assert.equal(changed.runState,'paused');assert.equal(changed.sceneId,first.sceneId);assert.equal(changed.velocity.vy,0);\n window.__arpgCourtyardFlow=true;m.game.events.emit('postrender');assert.equal(Object.hasOwn(fixture.plazaLatestMotion.courtyardFrame,'movement'),false);\n window.__arpgCourtyardFlow=false;window.__arpgCourtyardVisualFlow=true;m.game.events.emit('postrender');assert.equal(Object.hasOwn(fixture.plazaLatestMotion.courtyardFrame,'movement'),false);\n window.__arpgCourtyardVisualFlow=false;\n});\n",
      ""
    ],
    [
      "const m=make(),observed=wire(m);const velocity={vx:0,vy:-193.6,speed:220};",
      "const m=make();wire(m);const velocity={vx:0,vy:-193.6,speed:220};"
    ],
    [
      "assert.deepEqual(first.velocity,velocity);assert.deepEqual(observed.gameplay.courtyardFrame.movement,first);\n velocity.vy=0;assert.equal(first.velocity.vy,-193.6);assert.equal(observed.gameplay.courtyardFrame.movement.velocity.vy,-193.6);\n fixture.plazaProbeRequest={id:1,requestedAt:0};m.game.events.emit('postrender');\n assert.equal(observed.gameplay.plazaProbe.id,1);assert.deepEqual(observed.gameplay.courtyardFrame,fixture.plazaLatestMotion.courtyardFrame);\n assert.equal(observed.gameplay.courtyardFrame.movement.velocity.vy,0);fixture.plazaProbeRequest=null;",
      "assert.deepEqual(first.velocity,velocity);velocity.vy=0;assert.equal(first.velocity.vy,-193.6);"
    ]
  ],
  "schema-plaza-data.mjs": [
    [
      "import { fabricatePerimeterFrames } from './perimeter-schema-data.mjs';\nimport { fabricateCourtyardSchema }",
      "import { fabricateCourtyardSchema }"
    ],
    [
      "  move([1368,26]);checkpoint('perimeter-ready');move([1368,-18]);idle(700);checkpoint('perimeter-wall-blocked','perimeter-edge-feet');move([1368,210]);",
      "  move([1368,-8]);checkpoint('perimeter-ready');move([1368,-22]);idle(700);checkpoint('perimeter-wall-blocked','perimeter-edge-feet');move([1368,210]);"
    ],
    [
      "  fabricatePerimeterFrames(state);\n  scene.gameplay=structuredClone(returned.scene.gameplay);",
      "  scene.gameplay=structuredClone(returned.scene.gameplay);"
    ]
  ],
  "README.md": [
    [
      "At each viewport, the perimeter setup starts behind the rear facade at\n(1368,210), keeps its actual x within1368\u00b18, and reaches a released north-gap\nstrip32..64px above y=0.5*x\u2212706. Only this incidental ready-y target changes.\nThe unchanged native W hold is700ms, followed by the original return route.\nComplete consecutive engine frames must prove at least8px genuine approach\nbefore the first of at least two attempted north-room collisions: reconstruct\n220\u00d7actual loop.delta/1000, independently test the original five-point radius38\nroom probes and every facade sweep, then require unchanged position and zero\npost-update velocity on rollback. Accepted movement instead requires its exact\ncandidate and post-friction velocity\u2212193.6. Passive initialized/running/healthy,\nscene/player/area identity and pending-destroy fields reject inactive or stale\nsamples. This is source-backed reconstruction, not a recorded collision event.\nThe former upper16px \u201cone15fps step\u201d proxy is replaced; the x\u00b18 and lower0.5px\nboundary checks, held\u22653frames/400ms, total\u2265600ms,180s case budget,6.5s setup\nclock without reset, all other8px targets, sweeps and visibility remain strict.\nNo universal frame cadence or native setup convergence is assumed. Unsupported\nsteps, a skipped setup strip, insufficient approach or missing collision proof\nfail closed. Old reports cannot supply missing new frame evidence.\n",
      "At each viewport, the added perimeter leg starts behind the rear facade at\n(1368,210), approaches(1368,-8), holds native W for700ms, and returns to the\nprevious route. The independent original room/radius38 formula requires the\nsettled center to stop at y=0.5*x\u2212706 within one15fps movement step. Sustained\npost-render north intent must be observed. The case retains its180s budget,\n6.5s waypoint deadline,8px target, full swept checks and strict hero/UI visibility.\n"
    ],
    [
      "strip32..64px inside the boundary y=0.5*x\u2212706.",
      "strip32..64px above y=0.5*x\u2212706."
    ]
  ],
  "verify-results.test.mjs": [
    [
      "\n// Measured-frame perimeter integration regressions. Fabricated shapes only.\nimport { sourceNorthFrames } from './perimeter-source-model.mjs';\nfunction measuredPerimeter(o,mode='valid') {\n const s=o.state,ready=s.checkpoints.find(p=>p.label==='perimeter-ready'),blocked=s.checkpoints.find(p=>p.label==='perimeter-wall-blocked');\n const first=s.plazaMotion.findIndex(p=>p.at===ready.scene.gameplay.at),last=s.plazaMotion.findIndex(p=>p.at===blocked.scene.gameplay.at);\n const start=s.plazaMotion[first],prior=s.plazaMotion[first-1];start.y=25.5;prior.y=start.y;\n prior.courtyardFrame.delta=(s.plazaMotion[first-2].y-prior.y)/220*1000;\n const count=last-first-1,quanta=Array(count).fill(24);if(mode==='variable')quanta[2]=8;\n if(mode==='no-contact'){quanta[0]=34;quanta.fill(.22,1);}\n const modeled=sourceNorthFrames(start.x,start.y,quanta);\n for(let i=0;i<count;i++){\n  const p=s.plazaMotion[first+1+i],f=modeled[i];p.y=mode==='no-contact'&&i?modeled[0].after.y:f.after.y;\n  p.courtyardFrame.delta=f.delta;p.courtyardFrame.movement.velocity={vx:0,vy:mode==='no-contact'&&i?0:f.velocity.vy,speed:220};\n }\n s.plazaMotion[last].y=s.plazaMotion[last-1].y;\n const sync=()=>{\n  for(const checkpoint of[ready,blocked]){\n   const raw=s.plazaMotion.find(p=>p.at===checkpoint.scene.gameplay.at),g=checkpoint.scene.gameplay;\n   for(const k of['x','y','intent','dash','courtyardFrame'])g[k]=structuredClone(raw[k]);\n   Object.assign(g.townArt.hero,{x:g.x,y:g.y,depth:g.y+20});\n   for(const visual of s.visuals)if(visual.scene.gameplay.at===g.at)visual.scene.gameplay=structuredClone(g);\n  }\n  o.afterCleanup.plazaMotion=structuredClone(s.plazaMotion);\n };\n sync();return {first,last,s,sync};\n}\nfor(const mode of['valid','variable'])test(`full readiness verifier accepts measured ${mode} perimeter collision beyond old16`,()=>{\n const r=report();coherentObservation(r,o=>measuredPerimeter(o,mode),12);assert.match(verify(r,'execution'),/14 executed/);\n});\nfor(const[name,mutate,pattern]of[\n ['positive approach followed by stationary no-contact',(o)=>measuredPerimeter(o,'no-contact'),/Unblocked north step/],\n ['missing intermediate frame',o=>{const f=measuredPerimeter(o);f.s.plazaMotion.splice(f.first+3,1);f.sync();},/contiguous/],\n ['forged rollback velocity',o=>{const f=measuredPerimeter(o);f.s.plazaMotion[f.first+2].courtyardFrame.movement.velocity.vy=-193.6;f.sync();},/rollback velocity/],\n ['stale owner after real collision',o=>{const f=measuredPerimeter(o);f.s.plazaMotion[f.first+3].courtyardFrame.movement.pendingDestroy=true;f.sync();},/live healthy/],\n ['forged delta',o=>{const f=measuredPerimeter(o);f.s.plazaMotion[f.first+2].courtyardFrame.delta=1;f.sync();},/Unblocked north step/]\n])test(`full readiness verifier rejects ${name}`,()=>{const r=report();coherentObservation(r,mutate,13);assert.throws(()=>verify(r,'execution'),pattern);});\n",
      ""
    ]
  ]
};
export function beforePerimeterCorrection(name,source) {
  source=beforeObserverScope(name,source);
  name=name.split('/').at(-1);
  if(!changes[name])return source;
  source=String(source);
  for(const [added,original]of [...changes[name]].reverse()){
    assert(added.length>0);assert.equal(source.split(added).length,2,`Exact measured-frame perimeter delta required in ${name}`);
    source=source.replace(added,original);
  }
  return source;
}
