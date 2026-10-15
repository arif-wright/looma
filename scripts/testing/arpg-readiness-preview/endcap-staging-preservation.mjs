// Test-only exact reversal of the one-use, original-refusal-only endcap recovery.
// No runtime controller or verifier imports this adapter. Historical hashes stay fixed.
import { beforeUpperStoneDepth } from './upper-stone-depth-preservation.mjs';
import assert from 'node:assert/strict';
const changes={
  "plaza-browser.ts": [
    [
      "import { recoverEndcapSide } from './endcap-staging';\nimport { setupPerimeter } from './perimeter-setup';\nimport { departCourtyard } from './courtyard-departure';\n",
      "import { setupPerimeter } from './perimeter-setup';\nimport { departCourtyard } from './courtyard-departure';\n"
    ],
    [
      "  return gameplay(page);\n}\nasync function move(page: Page, x: number, y: number, endcapInfo?: TestInfo) {\n  const startedAt=Date.now();let missedPulses=0,recoveryUsed=false;\n  const history: {key:string;delay:number;before:{x:number;y:number};after:{x:number;y:number}}[]=[];\n  try {\n    let p=await releasedFrame(page);\n    for(;;){\n      let pulse;\n      try { pulse=waypointStep(p,x,y,Date.now()-startedAt,missedPulses,history); }\n      catch(error) {\n        if(!endcapInfo||recoveryUsed)throw error;\n        recoveryUsed=true;\n        const staged=await recoverEndcapSide(page,endcapInfo,error,p,x,y,history,()=>Date.now()-startedAt,()=>releasedFrame(page));\n        p=staged.position;history.push(...staged.history);history.splice(0,Math.max(0,history.length-2));missedPulses=0;\n        continue; // Original target and original clock remain authoritative.\n      }\n      if(!pulse)return; // Final neutral position is checked even at the deadline.\n      await page.keyboard.press(pulse.key,{delay:pulse.delay});\n",
      "  return gameplay(page);\n}\nasync function move(page: Page, x: number, y: number) {\n  const startedAt=Date.now();let missedPulses=0;\n  const history: {key:string;delay:number;before:{x:number;y:number};after:{x:number;y:number}}[]=[];\n  try {\n    let p=await releasedFrame(page);\n    for(;;){\n      const pulse=waypointStep(p,x,y,Date.now()-startedAt,missedPulses,history);\n      if(!pulse)return; // Final neutral position is checked even at the deadline.\n      await page.keyboard.press(pulse.key,{delay:pulse.delay});\n"
    ],
    [
      "\n}\nasync function route(page: Page, points: number[][], endcapInfo?: TestInfo) { for(const [x,y] of points)await move(page,x!,y!,x===1610&&y===400?endcapInfo:undefined); }\nasync function walkInto(page: Page, key: string) {\n  await page.keyboard.down(key);\n",
      "\n}\nasync function route(page: Page, points: number[][]) { for(const [x,y] of points)await move(page,x!,y!); }\nasync function walkInto(page: Page, key: string) {\n  await page.keyboard.down(key);\n"
    ],
    [
      "    await route(page,NAVIGATION_PHASES.endcapFront);\n    await save('endcap-front-ready');await walkInto(page,'w');await save('endcap-front-walk-blocked');\n    await route(page,NAVIGATION_PHASES.endcapSide,info);await save('endcap-side-ready');\n    await dashInto(page,['d','s']);await save('endcap-side-dash-blocked');\n    await route(page,NAVIGATION_PHASES.endcapRoof);\n",
      "    await route(page,NAVIGATION_PHASES.endcapFront);\n    await save('endcap-front-ready');await walkInto(page,'w');await save('endcap-front-walk-blocked');\n    await route(page,NAVIGATION_PHASES.endcapSide);await save('endcap-side-ready');\n    await dashInto(page,['d','s']);await save('endcap-side-dash-blocked');\n    await route(page,NAVIGATION_PHASES.endcapRoof);\n"
    ]
  ],
  "town-masonry-preservation.mjs": [
    [
      "// Test-only exact reversal of the reviewed local courtyard material and source-pin delta.\n// No runtime module imports this historical preservation adapter.\nimport { beforeEndcapStaging } from './endcap-staging-preservation.mjs';\nimport assert from 'node:assert/strict';\nconst changes={\n",
      "// Test-only exact reversal of the reviewed local courtyard material and source-pin delta.\n// No runtime module imports this historical preservation adapter.\nimport assert from 'node:assert/strict';\nconst changes={\n"
    ],
    [
      "};\nexport function beforeTownMasonry(name,source) {\n  source=beforeEndcapStaging(name,source);\n  name=name.split('/').at(-1);\n  if(!changes[name])return source;\n",
      "};\nexport function beforeTownMasonry(name,source) {\n  name=name.split('/').at(-1);\n  if(!changes[name])return source;\n"
    ]
  ],
  "prompt-timing-preservation.test.mjs": [
    [
      "import { beforeEndcapStaging } from './endcap-staging-preservation.mjs';\nimport { beforeCourtyardChordSelection } from './courtyard-chord-preservation.mjs';\nimport assert from 'node:assert/strict';\n",
      "import { beforeCourtyardChordSelection } from './courtyard-chord-preservation.mjs';\nimport assert from 'node:assert/strict';\n"
    ],
    [
      "const ts=createRequire(import.meta.url)('typescript');\nconst read=path=>readFileSync(new URL(path,import.meta.url),'utf8');\nconst ast=(name)=>ts.createSourceFile(name,beforeEndcapStaging(name,read(name)),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);\nconst original=ast('./plaza-browser.ts'),driver=ast('./prompt-timing-driver.ts');\nconst functions=file=>new Map(file.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name.text,node.getText(file)]));\n",
      "const ts=createRequire(import.meta.url)('typescript');\nconst read=path=>readFileSync(new URL(path,import.meta.url),'utf8');\nconst ast=(name)=>ts.createSourceFile(name,read(name),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);\nconst original=ast('./plaza-browser.ts'),driver=ast('./prompt-timing-driver.ts');\nconst functions=file=>new Map(file.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name.text,node.getText(file)]));\n"
    ]
  ],
  "courtyard-chord-selection.test.mjs": [
    [
      "for(const [name,hash] of Object.entries(baselineHashes))test(`exact 933f baseline bytes outside explicit chord-selection delta: ${name}`,()=>{\n const s=read('./'+name);assert.equal(createHash('sha256').update(beforeCourtyardChordSelection(name,s)).digest('hex'),hash);\n assert.throws(()=>beforeCourtyardChordSelection(name,s+s),/Exact (endcap staging|courtyard chord-selection) delta/);\n});\n\n",
      "for(const [name,hash] of Object.entries(baselineHashes))test(`exact 933f baseline bytes outside explicit chord-selection delta: ${name}`,()=>{\n const s=read('./'+name);assert.equal(createHash('sha256').update(beforeCourtyardChordSelection(name,s)).digest('hex'),hash);\n assert.throws(()=>beforeCourtyardChordSelection(name,s+s),/Exact courtyard chord-selection delta/);\n});\n\n"
    ]
  ],
  "courtyard-navigation.test.mjs": [
    [
      "import { beforeEndcapStaging } from './endcap-staging-preservation.mjs';\n// Offline literal-source and mocked-native-call tests, never browser proof.\nimport assert from 'node:assert/strict';\n",
      "// Offline literal-source and mocked-native-call tests, never browser proof.\nimport assert from 'node:assert/strict';\n"
    ],
    [
      "const source=read('./courtyard-navigation.ts');\nconst fn=(text,name)=>{const ast=ts.createSourceFile('fixture.ts',text,ts.ScriptTarget.Latest,true);return ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===name).getText(ast);};\nconst original=fn(beforeEndcapStaging('plaza-browser.ts',read('./plaza-browser.ts')),'move'),extended=fn(source,'moveCourtyard');\nconst signature=', guard: (position: { x: number; y: number }, pulse: ReturnType<typeof waypointStep>) => void';\nconst check='      guard(p,pulse); // Additive courtyard checks may only reject this original pulse.\\n';\n",
      "const source=read('./courtyard-navigation.ts');\nconst fn=(text,name)=>{const ast=ts.createSourceFile('fixture.ts',text,ts.ScriptTarget.Latest,true);return ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===name).getText(ast);};\nconst original=fn(read('./plaza-browser.ts'),'move'),extended=fn(source,'moveCourtyard');\nconst signature=', guard: (position: { x: number; y: number }, pulse: ReturnType<typeof waypointStep>) => void';\nconst check='      guard(p,pulse); // Additive courtyard checks may only reject this original pulse.\\n';\n"
    ]
  ]
};
export function beforeEndcapStaging(name,source){
  source=beforeUpperStoneDepth(name,source);
  name=name.split('/').at(-1);
  if(!changes[name])return source;
  source=String(source);
  for(const [added,original]of [...changes[name]].reverse()){
    assert(added.length>0);assert.equal(source.split(added).length,2,`Exact endcap staging delta required in ${name}`);
    source=source.replace(added,original);
  }
  return source;
}
