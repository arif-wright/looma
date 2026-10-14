// Test-only exact reversal of the single east walk setup delta.
import assert from 'node:assert/strict';
const changes={
  "courtyard-contract.mjs": [
    [
      "export const WEST_INNER_SETUP = Object.freeze({minX:1440,maxX:1472,minY:624,maxY:656});\n// Only east-inner-ready replaces its incidental near-wall walk preparation.\nexport const EAST_INNER_SETUP = Object.freeze({minX:1856,maxX:1888,minY:688,maxY:720});",
      "export const WEST_INNER_SETUP = Object.freeze({minX:1440,maxX:1472,minY:624,maxY:656});"
    ],
    [
      "region:'west-inner'|'east-inner',target:'west'|'east',points?:number[][]",
      "region:'west-inner',target:'west',points?:number[][]"
    ],
    [
      "  {kind:'setup',region:'east-inner',target:'east',points:[[2112,600],[1872,600]],label:'east-inner-ready'},",
      "  move([[2112,600],[1872,600],[1872,752]],'east-inner-ready'),"
    ]
  ],
  "courtyard-browser.ts": [
    [
      "import { setupWestInner } from './courtyard-setup';\nimport { setupEastInner } from './courtyard-east-setup';",
      "import { setupWestInner } from './courtyard-setup';"
    ],
    [
      "    const setup=await (label==='east-inner-ready'?setupEastInner:setupWestInner)(page,()=>{",
      "    const setup=await setupWestInner(page,()=>{"
    ]
  ],
  "verify-courtyard.mjs": [
    [
      "COURTYARD_SOLIDS, WEST_INNER_SETUP, EAST_INNER_SETUP, courtyardDirection",
      "COURTYARD_SOLIDS, WEST_INNER_SETUP, courtyardDirection"
    ],
    [
      "    if(a.kind==='setup')(a.region==='east-inner'?verifyEastInnerSetup:verifyWestInnerSetup)(a,points[i-1],p,s.plazaMotion,driver.setups.find(r=>r.label===a.label));",
      "    if(a.kind==='setup')verifyWestInnerSetup(a,points[i-1],p,s.plazaMotion,driver.setups.find(r=>r.label===a.label));"
    ]
  ],
  "courtyard-native-schema.mjs": [
    [
      "move([pos[0],action.region==='east-inner'?704:640]);push(16);setups.push",
      "move([pos[0],640]);push(16);setups.push"
    ]
  ],
  "courtyard-native.test.mjs": [
    [
      "50 ordinary + three setup legs",
      "51 ordinary + two setup legs"
    ],
    [
      "(a.points?.length??0),0),50);",
      "(a.points?.length??0),0),51);"
    ],
    [
      "['west-inner-ready','west-inner-dash-ready','east-inner-ready']);assert.equal(COURTYARD_VIEWS",
      "['west-inner-ready','west-inner-dash-ready']);assert.equal(COURTYARD_VIEWS"
    ]
  ],
  "courtyard-setup.test.mjs": [
    [
      "test('only two explicit west setup actions replace their incidental coordinate goals'",
      "test('only two explicit setup actions replace incidental coordinate goals'"
    ],
    [
      "COURTYARD_ACTIONS.filter(a=>a.kind==='setup'&&a.region==='west-inner'),[",
      "COURTYARD_ACTIONS.filter(a=>a.kind==='setup'),["
    ]
  ],
  "courtyard-source-bundle.test.mjs": [
    [
      "  \"courtyard-setup.mjs\",\n  \"courtyard-east-setup.mjs\",\n  \"courtyard-east-setup.ts\",",
      "  \"courtyard-setup.mjs\","
    ],
    [
      "  \"courtyard-east-setup.ts\",\n  \"courtyard-east-setup-preservation.mjs\",",
      "  \"courtyard-east-setup.ts\","
    ],
    [
      "all 50 ordinary native target boxes",
      "all 51 ordinary native target boxes"
    ],
    [
      "assert.equal(count,50);",
      "assert.equal(count,51);"
    ]
  ],
  "courtyard-setup-preservation.mjs": [
    [
      "import assert from 'node:assert/strict';\nimport { beforeEastInnerSetup } from './courtyard-east-setup-preservation.mjs';",
      "import assert from 'node:assert/strict';"
    ],
    [
      "export function beforeWestInnerSetup(name,source) {\n  source=beforeEastInnerSetup(name,source);",
      "export function beforeWestInnerSetup(name,source) {"
    ]
  ],
  "courtyard-runtime.md": [
    [
      "The three explicitly typed\ninner setup actions below replace only their incidental near-wall goals.",
      "The two explicitly typed\nwest-inner setup actions below replace only their incidental near-wall goals."
    ],
    [
      "Together with the single east walk setup below, these are three distinct region\nlegs alongside 50 ordinary legs; the original total of 53 legs, all 45 checkpoint\nlabels and all 18 captures remain.",
      "These are two distinct region legs alongside 51 ordinary legs;\nthe original total of 53 legs, all 45 checkpoint labels and all 18 captures remain."
    ],
    [
      "\n\n## Explicit east-inner walk setup region\n\nOnly `east-inner-ready` uses the closed region [1856,1888] \u00d7 [688,720]. Its\nordinary (2112,600), then (1872,600) alignments retain the original \u00b18 acceptance.\nThe remaining setup is vertical at the observed x. `east-inner-dash-ready`\nremains the original ordinary (1872,752) goal; every walk and dash primitive,\nphysical assertion, remaining route and session/departure obligation is unchanged.\n\nThe east helper has the same 6,500 ms total leg clock, 3,000 ms fresh-neutral\nwatchdog, original pulse sizing and mandatory per-pulse budget callback. It adds\nno frame pacing, sleep, correction chord or position assignment. Its complete\nobserved slice must stay within x\u2208[1856,1888], y\u2265592 and north of y=1752\u22120.5x,\nwith finite chronological contiguous native frames, vertical-only movement and\nintent, no active dash, and >38 swept clearance from every solid. The independent\nverifier requires the exact east action, both ordinary alignments in the contract,\nmatching start/settled/checkpoint anchors, a complete alignment prefix and an\nunchanged neutral settled suffix. There are exactly three setup receipts.\n\nContinuous east clearance throughout the region is at least 70.70959280799255 px.\nThe radius-38 contact bound is B(x)=1752\u22120.5x\u221246\u221a1.25. The available south travel\nis 36.57043651750485\u201384.57043651750485 px. Conditionally on actual movement\nupdates in the failed desktop observation's 55\u201363.33 ms engine-delta bracket,\nthe first update is clear and at most six updates can be admitted before contact;\neight updates suffice geometrically for approach before first block and two\nblocks. The original thirteen captured held frames span 660.9 ms. Eight of those\ntimestamps span only 386.6 ms and correctly fail the unchanged 400 ms held-span\nassertion. For the phone's observed 16.66\u201325 ms bracket, at most 23 updates can\nmove and 25 suffice geometrically; its 38 held frames span 686.1 ms.\n\nThese brackets describe observed cases, not universal timing bounds or native\nsuccess for this candidate. The unchanged 700 ms hold does not guarantee enough\nfuture frames. Insufficient actual samples/span, a first block before any approach,\nunsafe attempts or incomplete setup must still fail without extending any limit.\nBoth exact-source native desktop and phone acceptance and PNG review are required\nafter publication; offline model/schema passes, builds and discovery are separate.\n",
      ""
    ]
  ]
};
export function beforeEastInnerSetup(name,source) {
  if(name==='verify-courtyard.mjs'){
    const marker='\n// Independent east-inner receipt acceptance:';
    assert.equal(source.split(marker).length,2,'Exactly one additive east setup verifier');
    source=source.slice(0,source.indexOf(marker));
  }
  for(const [added,original] of [...(changes[name]??[])].reverse()){
    assert(added.length>0);assert.equal(source.split(added).length,2,`Exact east setup delta required in ${name}`);
    source=source.replace(added,original);
  }
  return source;
}
