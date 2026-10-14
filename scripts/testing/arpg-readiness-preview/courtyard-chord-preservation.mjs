// Test-only exact reversal of the additive courtyard candidate-selection delta.
// No runtime steering or verifier imports this historical source adapter.
import assert from 'node:assert/strict';
const changes={
  "plaza-navigation.mjs": [
    [
      "/** @param {(pulse: {key:string,delay:number,correction:{bound:number,envelope:number[][]}}) => boolean} [chordAllowed] */\nexport function waypointStep(position,x,y,elapsed,missedPulses=0,history=[],chordAllowed=undefined){",
      "export function waypointStep(position,x,y,elapsed,missedPulses=0,history=[]){"
    ],
    [
      "return waypointCorrection(position,x,y,history,chordAllowed)??pulse;",
      "return waypointCorrection(position,x,y,history)??pulse;"
    ],
    [
      "// Optional fixture-specific predicate can only reject original-safe candidates.\n// Omitted predicates keep the original selection; no other caller changes.\n/** @param {(pulse: {key:string,delay:number,correction:{bound:number,envelope:number[][]}}) => boolean} [chordAllowed] */\nexport function waypointCorrection(position,x,y,history,chordAllowed=undefined){",
      "export function waypointCorrection(position,x,y,history){"
    ],
    [
      "    if(safeChordEnvelope(envelope)){\n      const pulse={key:`${lateral}+${primary}`,delay:16,correction:{bound,envelope}};\n      // Isolate the candidate from predicate mutations; approval must be true,\n      // never a truthy value or Promise. Exceptions and nonfunctions fail closed.\n      if(chordAllowed===undefined||chordAllowed(structuredClone(pulse))===true)return pulse;\n    }",
      "    if(safeChordEnvelope(envelope))return {key:`${lateral}+${primary}`,delay:16,correction:{bound,envelope}};"
    ]
  ],
  "courtyard-navigation.ts": [
    [
      "import { release, releasedFrame } from './plaza-browser';\nimport { courtyardChordAllowed } from './courtyard-contract.mjs';",
      "import { release, releasedFrame } from './plaza-browser';"
    ],
    [
      "// literal-identical. The shared selector tests every candidate against the\n// courtyard solids; the final rejection callback still guards native input.",
      "// literal-identical. Offline tests prove this copy differs only by its name,\n// required callback parameter and one reject-only check before native key input."
    ],
    [
      "waypointStep(p,x,y,Date.now()-startedAt,missedPulses,history,courtyardChordAllowed);",
      "waypointStep(p,x,y,Date.now()-startedAt,missedPulses,history);"
    ]
  ],
  "courtyard-navigation.test.mjs": [
    [
      "import vm from 'node:vm';\nimport { courtyardChordAllowed } from './courtyard-contract.mjs';",
      "import vm from 'node:vm';"
    ],
    [
      "dedicated wall move adds only explicit rename, required guard, candidate predicate and final rejection",
      "dedicated wall move has only explicit rename, required parameter and one pre-press rejection line"
    ],
    [
      ".replace(signature,'').replace(check,'').replace('history,courtyardChordAllowed);','history);'),original);\n assert.equal((extended.match(/history,courtyardChordAllowed\\);/g)||[]).length,1);",
      ".replace(signature,'').replace(check,''),original);"
    ],
    [
      "waypointStep:(p,x,y,elapsed,missed,history,allowed)=>{assert.equal(allowed,courtyardChordAllowed);steps.push({p,x,y,elapsed,missed,history:structuredClone(history)});",
      "waypointStep:(p,x,y,elapsed,missed,history)=>{steps.push({p,x,y,elapsed,missed,history:structuredClone(history)});"
    ],
    [
      " }:name==='./courtyard-contract.mjs'?{courtyardChordAllowed}:name==='./plaza-browser'?{",
      " }:name==='./plaza-browser'?{"
    ]
  ],
  "courtyard-east-setup-preservation.mjs": [
    [
      "// Test-only exact reversal of the single east walk setup delta.\nimport { beforeCourtyardChordSelection } from './courtyard-chord-preservation.mjs';\n",
      "// Test-only exact reversal of the single east walk setup delta.\n"
    ],
    [
      "export function beforeEastInnerSetup(name,source) {\n  source=beforeCourtyardChordSelection(name,source);",
      "export function beforeEastInnerSetup(name,source) {"
    ]
  ],
  "courtyard-native.test.mjs": [
    [
      "import { beforeCourtyardChordSelection } from './courtyard-chord-preservation.mjs';\nimport { beforePlazaDeparture } from './plaza-departure-preservation.mjs';\n",
      "import { beforePlazaDeparture } from './plaza-departure-preservation.mjs';\n"
    ],
    [
      "sha(beforeCourtyardChordSelection(name,source(name))),hash)",
      "sha(source(name)),hash)"
    ],
    [
      "original ${name} remains byte-preserved outside the exact additive predicate delta",
      "original ${name} remains byte-for-byte preserved"
    ]
  ],
  "courtyard-source-bundle.test.mjs": [
    [
      "import { beforeCourtyardChordSelection } from './courtyard-chord-preservation.mjs';\nimport { beforePlazaDeparture } from './plaza-departure-preservation.mjs';\n",
      "import { beforePlazaDeparture } from './plaza-departure-preservation.mjs';\n"
    ],
    [
      "hash(beforeCourtyardChordSelection(path,read(path))),digest)",
      "hash(read(path)),digest)"
    ],
    [
      "  \"courtyard-navigation.ts\",\n  \"courtyard-chord-preservation.mjs\",\n  \"courtyard-chord-selection.test.mjs\",",
      "  \"courtyard-navigation.ts\","
    ]
  ],
  "prompt-timing-preservation.test.mjs": [
    [
      "import { beforeCourtyardChordSelection } from './courtyard-chord-preservation.mjs';\nimport assert from 'node:assert/strict';\n",
      "import assert from 'node:assert/strict';\n"
    ],
    [
      "update(beforeCourtyardChordSelection(name,read(`./${name}`)))",
      "update(read(`./${name}`))"
    ]
  ],
  "prompt-timing-source-guard.mjs": [
    [
      "import { beforeCourtyardChordSelection } from './courtyard-chord-preservation.mjs';\nimport assert from 'node:assert/strict';\n",
      "import assert from 'node:assert/strict';\n"
    ],
    [
      "update(beforeCourtyardChordSelection(item.path,bytes))",
      "update(bytes)"
    ],
    [
      " historical acceptance/toolchain files outside the exact courtyard chord-selection delta; diagnostic cannot replace acceptance.",
      " exact-head acceptance/toolchain files; diagnostic cannot replace acceptance."
    ]
  ],
  "frame-gap-source-guard.mjs": [
    [
      "import { beforeCourtyardChordSelection } from './courtyard-chord-preservation.mjs';\nimport assert from 'node:assert/strict';\n",
      "import assert from 'node:assert/strict';\n"
    ],
    [
      "update(beforeCourtyardChordSelection(item.path,bytes))",
      "update(bytes)"
    ],
    [
      " historical acceptance/toolchain files outside the exact courtyard chord-selection delta; diagnostic cannot replace acceptance.",
      " exact-head acceptance/toolchain files; diagnostic cannot replace acceptance."
    ]
  ],
  "courtyard-runtime.md": [
    [
      "The shared waypoint implementation still decides every ordinary move pulse. The\ncourtyard caller adds a reject-only predicate during chord enumeration, after\neach original room/solid check. The final pre-press courtyard guard is retained.\nOther callers omit the predicate and retain their original selection behavior.",
      "The original waypoint implementation still decides every ordinary move pulse. An\nadditional check only rejects its chosen chord when a courtyard wall intersects\nits conservative hull; it does not search another chord."
    ]
  ]
};
export function beforeCourtyardChordSelection(name,source) {
  name=name.split('/').at(-1);
  if(!changes[name])return source;
  source=String(source);
  for(const [added,original] of [...changes[name]].reverse()){
    assert(added.length>0);
    assert.equal(source.split(added).length,2,`Exact courtyard chord-selection delta required in ${name}`);
    source=source.replace(added,original);
  }
  return source;
}
