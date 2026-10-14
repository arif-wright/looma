// Test-only historical source preservation. The explicit setup delta is removed
// before checking the original reviewed hashes; no runtime imports this module.
import assert from 'node:assert/strict';
const changes={
  "courtyard-contract.mjs": [
    [
      "// This explicit goal is limited to the two west-inner challenge preparations.\nexport const WEST_INNER_SETUP = Object.freeze({minX:1440,maxX:1472,minY:624,maxY:656});\n/** @typedef {{kind:'setup',region:'west-inner',target:'west',points?:number[][],label:string,view?:string}|{kind:'move',points:number[][],label:string,view?:string}|{kind:'walk'|'dash',key:string,label:string,target:string,view?:string}|{kind:'save'|'depart'|'return',label:string,view?:string}} CourtyardAction */\n",
      "/** @typedef {{kind:'move',points:number[][],label:string,view?:string}|{kind:'walk'|'dash',key:string,label:string,target:string,view?:string}|{kind:'save'|'depart'|'return',label:string,view?:string}} CourtyardAction */\n"
    ],
    [
      "// Ordinary cardinal staircase moves retain the original waypointStep, target\n// band, watchdog and conditional correction rules. Only setup uses a region.\n",
      "// Cardinal staircase corridors, not a second steering controller. The original\n// waypointStep, target band, watchdog, quantum and chord rules remain active.\n"
    ],
    [
      "  {kind:'setup',region:'west-inner',target:'west',points:[[1456,536]],label:'west-inner-ready',view:'west-inner-ready'},\n",
      "  move([[1456,536],[1456,688]],'west-inner-ready','west-inner-ready'),\n"
    ],
    [
      "  {kind:'setup',region:'west-inner',target:'west',label:'west-inner-dash-ready'},\n",
      "  move([[1456,688]],'west-inner-dash-ready'),\n"
    ]
  ],
  "courtyard-browser.ts": [
    [
      "import { setupWestInner } from './courtyard-setup';\n",
      ""
    ],
    [
      "  const receipt={kind:'native-courtyard-driver',index,legs:0,pulses:0,completed:false,completedActions:[] as string[],setups:[] as Array<{label:string}&Awaited<ReturnType<typeof setupWestInner>>>,captures:[] as Array<{label:string;probeId:number;nativeFrame:number;pngSHA256:string}>};\n",
      "  const receipt={kind:'native-courtyard-driver',index,legs:0,pulses:0,completed:false,completedActions:[] as string[],captures:[] as Array<{label:string;probeId:number;nativeFrame:number;pngSHA256:string}>};\n"
    ],
    [
      "  };\n  const guardedSetup=async(label:string)=>{\n    if(++receipt.legs>COURTYARD_LIMITS.legs)throw Error('Courtyard waypoint budget exceeded');\n    const setup=await setupWestInner(page,()=>{\n      if(++receipt.pulses>COURTYARD_LIMITS.pulses)throw Error('Courtyard native pulse budget exceeded');\n    });\n    receipt.setups.push({label,...setup});\n",
      ""
    ],
    [
      "      else if(action.kind==='setup'){\n        for(const[x,y]of action.points??[])await guardedMove(x,y);\n        await guardedSetup(action.label);\n      }\n",
      ""
    ]
  ],
  "verify-courtyard.mjs": [
    [
      "import { COURTYARD_ACTIONS, COURTYARD_LIMITS, COURTYARD_VIEWS, COURTYARD_SOLIDS, WEST_INNER_SETUP, courtyardDirection, courtyardTraceIssues, courtyardScreenshot } from './courtyard-contract.mjs';\n",
      "import { COURTYARD_ACTIONS, COURTYARD_LIMITS, COURTYARD_VIEWS, COURTYARD_SOLIDS, courtyardDirection, courtyardTraceIssues, courtyardScreenshot } from './courtyard-contract.mjs';\n"
    ],
    [
      "    assert(pairs.some(({p,prev})=>p.at<blocked[0].p.at&&Math.hypot(p.x-prev.x,p.y-prev.y)>0),'Walk genuinely approaches before its first blocked frame');\n",
      ""
    ],
    [
      "  assert.equal(driver.legs,COURTYARD_ACTIONS.reduce((n,a)=>n+(a.points?.length??0)+(a.kind==='setup'?1:0),0));assert(driver.legs<=COURTYARD_LIMITS.legs);\n",
      "  assert.equal(driver.legs,COURTYARD_ACTIONS.reduce((n,a)=>n+(a.points?.length??0),0));assert(driver.legs<=COURTYARD_LIMITS.legs);\n"
    ],
    [
      "  assert.deepEqual(driver.setups?.map(r=>r.label),COURTYARD_ACTIONS.filter(a=>a.kind==='setup').map(a=>a.label),'Exactly one complete receipt per setup action');\n",
      ""
    ],
    [
      "    if(a.kind==='setup')verifyWestInnerSetup(a,points[i-1],p,s.plazaMotion,driver.setups.find(r=>r.label===a.label));\n    else if(i)verifyCourtyardAction(a,points[i-1],p,s.plazaMotion);\n",
      "    if(i)verifyCourtyardAction(a,points[i-1],p,s.plazaMotion);\n"
    ]
  ]
};
export function beforeWestInnerSetup(name,source) {
  if(name==='verify-courtyard.mjs'){
    const marker='\n// Independent receipt acceptance:';
    assert.equal(source.split(marker).length,2,'Exactly one additive setup verifier');
    source=source.slice(0,source.indexOf(marker));
  }
  for(const [added,original] of changes[name]??[]){
    assert(added.length>0);
    assert.equal(source.split(added).length,2,`Exact approved setup delta required in ${name}`);
    source=source.replace(added,original);
  }
  return source;
}
