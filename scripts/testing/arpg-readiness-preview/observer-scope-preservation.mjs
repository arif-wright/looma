// Test-only exact reversal of ordinary-readiness observer scoping.
// No runtime module imports this historical adapter.
import assert from 'node:assert/strict';
const changes={
  "observe-scene.ts": [
    [
      "// Plaza alone is also enabled by walking-frame and diagnostic modes. Only the\n// existing Return+Plaza readiness combination receives the additive evidence;\n// legacy courtyard/visual frame branches remain independent and unchanged.\nconst readinessPlazaFlow = () => window.__arpgPlazaFlow === true && window.__arpgReturnFlow === true &&\n  window.__arpgCourtyardFlow !== true && window.__arpgCourtyardVisualFlow !== true && window.__arpgWalkFrameFlow !== true;\nfunction readCourtyardFrame(scene: GameScene, state: ObservedState) {",
      "function readCourtyardFrame(scene: GameScene, state: ObservedState) {"
    ],
    [
      "...(readinessPlazaFlow() ? {",
      "...((window.__arpgPlazaFlow === true && window.__arpgCourtyardFlow !== true && window.__arpgCourtyardVisualFlow !== true) ? {"
    ],
    [
      "\n    ...((readinessPlazaFlow() || window.__arpgCourtyardFlow === true || window.__arpgCourtyardVisualFlow === true) ? { courtyardFrame:readCourtyardFrame(scene,state) } : {}),",
      "\n    ...((window.__arpgPlazaFlow === true || window.__arpgCourtyardFlow === true || window.__arpgCourtyardVisualFlow === true) ? { courtyardFrame:readCourtyardFrame(scene,state) } : {}),"
    ],
    [
      "\n      ...((readinessPlazaFlow() || window.__arpgCourtyardFlow === true || window.__arpgCourtyardVisualFlow === true) ? { courtyardFrame:readCourtyardFrame(scene,state) } : {}),",
      "\n      ...((window.__arpgPlazaFlow === true || window.__arpgCourtyardFlow === true || window.__arpgCourtyardVisualFlow === true) ? { courtyardFrame:readCourtyardFrame(scene,state) } : {}),"
    ]
  ],
  "perimeter-preservation.mjs": [
    [
      "\nimport { beforeObserverScope } from './observer-scope-preservation.mjs';\nimport assert from 'node:assert/strict';\n",
      "\nimport assert from 'node:assert/strict';\n"
    ],
    [
      "export function beforePerimeterCorrection(name,source) {\n  source=beforeObserverScope(name,source);\n",
      "export function beforePerimeterCorrection(name,source) {\n"
    ]
  ],
  "courtyard-visibility.test.mjs": [
    [
      "import { beforeObserverScope } from './observer-scope-preservation.mjs';\nimport assert from 'node:assert/strict';",
      "import assert from 'node:assert/strict';"
    ],
    [
      "const { readCourtyardVisibility, readCourtyardFrame } = loadTs",
      "const { readCourtyardVisibility } = loadTs"
    ],
    [
      "test('ordinary readiness motion reads native game.loop.delta', () => {\n  window.__arpgReturnFlow = true; window.__arpgWalkFrameFlow = false;\n  window.__arpgPlazaFlow = true;",
      "test('all plaza motion reads native game.loop.delta including ordinary readiness', () => {\n  window.__arpgPlazaFlow = true;"
    ],
    [
      "test('readiness frame records passive live update guards and cloned velocity without callback invocation',()=>{\n window.__arpgReturnFlow=true;window.__arpgWalkFrameFlow=false;\n window.__arpgPlazaFlow=true;",
      "test('readiness frame records passive live update guards and cloned velocity without callback invocation',()=>{\n window.__arpgPlazaFlow=true;"
    ],
    [
      "\n// Observer producer truth table, not fabricated wire/schema data. Execute the\n// registered callback and direct reader from the actual transpiled source.\nconst modeFlags=['__arpgPlazaFlow','__arpgReturnFlow','__arpgCourtyardFlow','__arpgCourtyardVisualFlow','__arpgWalkFrameFlow'];\nfunction producedMode(flags) {\n const previous=globalThis.window;\n globalThis.window={...flags};fixture.scenes=[];fixture.plazaMotion=[];fixture.plazaLatestMotion=null;fixture.plazaProbeRequest=null;\n try{\n  const m=make(),observed=wire(m),velocity={vx:0,vy:0,speed:220};\n  Object.assign(m.scene,{ended:false,runState:'running',areaEpoch:3,handlers:{isCurrent:()=>{throw Error('Producer must not invoke owner callback');}}});\n  m.scene.sys.settings={status:5};m.game.pendingDestroy=false;m.scene.world.getVelocity=()=>velocity;\n  const frame=flags.__arpgCourtyardFlow===true||flags.__arpgCourtyardVisualFlow===true||\n   (flags.__arpgPlazaFlow===true&&flags.__arpgReturnFlow===true&&flags.__arpgCourtyardFlow!==true&&flags.__arpgCourtyardVisualFlow!==true&&flags.__arpgWalkFrameFlow!==true);\n  const movement=flags.__arpgPlazaFlow===true&&flags.__arpgReturnFlow===true&&flags.__arpgCourtyardFlow!==true&&flags.__arpgCourtyardVisualFlow!==true&&flags.__arpgWalkFrameFlow!==true;\n  const check=()=>{\n   const direct=readCourtyardFrame(m.scene,m.scene),g=observed.gameplay;\n   assert.deepEqual(Object.keys(direct).sort(),movement?['delta','frame','hero','movement']:['delta','frame','hero']);\n   assert.equal(Object.hasOwn(g,'courtyardFrame'),frame);\n   if(frame)assert.deepEqual(g.courtyardFrame,direct);\n   if(flags.__arpgPlazaFlow===true){\n    const motion=fixture.plazaLatestMotion;\n    assert.deepEqual(Object.keys(motion).sort(),frame?['area','at','courtyardFrame','dash','intent','x','y']:['area','at','dash','intent','x','y']);\n    if(frame)assert.deepEqual(motion.courtyardFrame,direct);\n   }else{assert.equal(fixture.plazaLatestMotion,null);assert.deepEqual(fixture.plazaMotion,[]);}\n   return direct;\n  };\n  m.game.events.emit('postrender');const initial=check();\n  if(movement){assert.deepEqual(initial.movement.velocity,velocity);velocity.vy=17;assert.equal(initial.movement.velocity.vy,0);velocity.vy=0;}\n  fixture.plazaProbeRequest={id:1,requestedAt:0};m.game.loop.frame++;m.game.events.emit('postrender');check();\n  if(flags.__arpgPlazaFlow===true)assert.equal(observed.gameplay.plazaProbe.id,1);\n  else assert.equal(observed.gameplay.plazaProbe,null);\n  return {frame,movement,motion:flags.__arpgPlazaFlow===true};\n }finally{globalThis.window=previous;}\n}\nfor(const p of[undefined,false,true])for(const r of[undefined,false,true])for(const c of[undefined,false,true])for(const v of[undefined,false,true])for(const w of[undefined,false,true]){\n const flags=Object.fromEntries(modeFlags.map((key,i)=>[key,[p,r,c,v,w][i]]));\n test(`actual observer mode P=${p},R=${r},C=${c},V=${v},W=${w}`,()=>producedMode(flags));\n}\nfunction actualInitFlags(name) {\n const source=readFileSync(resolve(here,name),'utf8'),ast=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true),callbacks=[];\n const visit=n=>{if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='addInitScript')callbacks.push(n.arguments[0]);ts.forEachChild(n,visit);};visit(ast);\n assert.equal(callbacks.length,1,`Exactly one actual mode initializer in ${name}`);assert(ts.isArrowFunction(callbacks[0]));\n const code=ts.transpileModule(`const initialize=${callbacks[0].getText(ast)};initialize();`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;\n const flags={};new Function('window',code)(flags);return flags;\n}\nfor(const[name,file,expected]of[\n ['ordinary readiness','plaza-browser.ts',{frame:true,movement:true,motion:true}],\n ['native courtyard','courtyard-browser.ts',{frame:true,movement:false,motion:true}],\n ['controlled visual','visual-browser.ts',{frame:true,movement:false,motion:true}],\n ['controlled walking-frame','walk-frame-browser.ts',{frame:false,movement:false,motion:true}],\n ['prompt diagnostic','prompt-timing.browser.spec.ts',{frame:false,movement:false,motion:true}],\n ['frame-gap diagnostic','frame-gap.browser.spec.ts',{frame:false,movement:false,motion:true}],\n ['original return case','readiness.browser.spec.ts',{frame:false,movement:false,motion:false}]\n])test(`real ${name} initializer routes all actual producers correctly`,()=>assert.deepEqual(producedMode(actualInitFlags(file)),expected));\nfor(const flag of['__arpgPlazaFlow','__arpgReturnFlow'])test(`nonboolean ${flag} cannot opt into readiness evidence`,()=>{\n for(const value of[1,'true',{}]){const result=producedMode({__arpgPlazaFlow:true,__arpgReturnFlow:true,[flag]:value});assert.equal(result.movement,false);assert.equal(result.frame,false);}\n});\ntest('return-enabled walking flag still cannot acquire readiness-only evidence',()=>{\n assert.deepEqual(producedMode({__arpgPlazaFlow:true,__arpgReturnFlow:true,__arpgWalkFrameFlow:true}),{frame:false,movement:false,motion:true});\n});\n\nconst observerScopePins={\n  \"observe-scene.ts\": \"c617902fa69bdece1c761f25214609ef7d27b3cbcdc5bab466454c3b20419856\",\n  \"perimeter-preservation.mjs\": \"b9dc2ad3623b79d478ccb52236112f91465371f0132b128c642b57fd0bff52ae\",\n  \"courtyard-visibility.test.mjs\": \"310c3afca34d442a0a694699b9c926ef6f0c52490151a509230b3274b62262e1\",\n  \"perimeter-contract.test.mjs\": \"41674ef7b8411c9f608847935219f04830a11f0a2b62ba53a87567a3b224a6e1\"\n};\nfor(const[name,hash]of Object.entries(observerScopePins))test(`exact79e observer-scope reversal: ${name}`,()=>{\n const source=readFileSync(resolve(here,name),'utf8');assert.equal(createHash('sha256').update(beforeObserverScope(name,source)).digest('hex'),hash);\n assert.throws(()=>beforeObserverScope(name,source+source),/Exact observer-scope delta/);\n});\n",
      ""
    ],
    [
      "  else assert.equal(observed.gameplay.plazaProbe,null);\n  // Same registered observer across departure and return: area refresh must\n  // preserve mode routing, including the original Return-only no-motion path.\n  for(const area of[1,0]){\n   fixture.plazaProbeRequest=null;m.scene.expedition.area=area;m.game.loop.frame++;m.game.events.emit('postrender');check();\n   assert.equal(observed.gameplay.area,area);\n   if(flags.__arpgPlazaFlow===true)assert.equal(fixture.plazaLatestMotion.area,area);\n  }\n  return {frame,movement,motion:flags.__arpgPlazaFlow===true};",
      "  else assert.equal(observed.gameplay.plazaProbe,null);\n  return {frame,movement,motion:flags.__arpgPlazaFlow===true};"
    ]
  ],
  "perimeter-contract.test.mjs": [
    [
      "test('passive active fields use one exclusive ordinary-readiness predicate at all three producers',()=>{\n const source=read('./observe-scene.ts');\n assert.match(source,/window\\.__arpgPlazaFlow === true && window\\.__arpgReturnFlow === true/);\n assert.match(source,/window\\.__arpgCourtyardFlow !== true && window\\.__arpgCourtyardVisualFlow !== true && window\\.__arpgWalkFrameFlow !== true/);\n assert.equal((source.match(/readinessPlazaFlow\\(\\)/g)||[]).length,3);\n assert.equal((source.match(/readinessPlazaFlow\\(\\) \\|\\| window\\.__arpgCourtyardFlow === true \\|\\| window\\.__arpgCourtyardVisualFlow === true/g)||[]).length,2);\n});\n",
      "test('passive active fields are scoped to readiness and do not expand other capture payloads',()=>{\n const source=read('./observe-scene.ts');assert.match(source,/window\\.__arpgPlazaFlow === true && window\\.__arpgCourtyardFlow !== true && window\\.__arpgCourtyardVisualFlow !== true/);\n assert.match(source,/window\\.__arpgPlazaFlow === true \\|\\| window\\.__arpgCourtyardFlow === true \\|\\| window\\.__arpgCourtyardVisualFlow === true/);\n});\n"
    ]
  ]
};
export function beforeObserverScope(name,source) {
  name=name.split('/').at(-1);
  if(!changes[name])return source;
  source=String(source);
  for(const [added,original]of [...changes[name]].reverse()){
    assert(added.length>0);assert.equal(source.split(added).length,2,`Exact observer-scope delta required in ${name}`);
    source=source.replace(added,original);
  }
  return source;
}
