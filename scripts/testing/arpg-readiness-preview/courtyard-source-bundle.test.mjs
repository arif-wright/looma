// Static bundle/preservation checks. These are not a Vite build, full TypeScript
// check, Playwright discovery or browser launch.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const ts=createRequire(import.meta.url)('typescript');
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
const read=p=>readFileSync(resolve(root,p),'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
const preserved={
  "scripts/testing/arpg-readiness-preview/cases.mjs": "b11aea766a2497ea2e0682b0d9cc43854d99724d4848891ee822137f8a126196",
  "scripts/testing/arpg-readiness-preview/screenshots.mjs": "ef3c40e44fc363ef3dc65982684753685b692dad853a75e28e8f490726170e26",
  "scripts/testing/arpg-readiness-preview/readiness.browser.spec.ts": "8afafcd3d89d1e89166993e8da51b7c6c2bb02040c945b2043650fd9c7df241d",
  "scripts/testing/arpg-readiness-preview/playwright.config.ts": "5ca9d83e9c0679b167c4c21b0ca7eaf6e5967ca9374a12d9d258a46a8507b28b",
  "scripts/testing/arpg-readiness-preview/plaza-navigation.mjs": "3236281de80be869dbbf0319a73c90aa9c39d057c22b7e8bb347b3c2dde9b322",
  "scripts/testing/arpg-readiness-preview/plaza-contract.mjs": "1cd2b3dc0158421fc6fb6b700eccb26987252fd90b4a49dcce57bd0665a674c6",
  "scripts/testing/arpg-readiness-preview/protocol.mjs": "3a2557002f82071c4d0e4b9ae0763bda8dd8f5311058d55f81ba81d8dbe81643",
  "scripts/testing/arpg-readiness-preview/vite.config.mjs": "ea44102b9b0f7f296e9de9b3710b329c9d723c1ebe143700c07e9752acb641e6",
  "src/lib/games/arpg/townSession.ts": "3b98ae4545490d829c6cfb329edee6f0e3da7efb0d04f7997ddd74d3b395e4f0",
  "src/lib/games/arpg/main.ts": "7fd352fce5b07daed82905f37276c3d46bf807dfc44f6c625f1c3883a91ee46b",
  "src/lib/games/arpg/expedition.ts": "0af301e88413268ebb658db41e1d454332773d647157b7517cc55a882bb11ccc",
  "src/lib/games/arpg/viewportLayout.ts": "3f8e688160d71fa485fcbd5ce6e8801b3648e8681e10cffa9cc08d840e6a8748",
  "src/lib/games/arpg/townPlaza.ts": "21a6a4d5139a0a652f8dd3ed031d2f32e5781ec87e2f37db6c7ffa03afc7328b",
  "src/lib/games/arpg/scenes/GameScene.ts": "1a3ac222506c56c8ce2958efc98f9577dcd8b16ac0a28ffff3e942e7b0cf596a",
  "src/lib/games/arpg/ecs/components.ts": "034130bc0bace2542f50854492dceb30b610b459dd05bbd68806bbf29651897a",
  "src/lib/games/arpg/ecs/systems.ts": "23e3a0266e2fc0128d2ff77f9b8b11bc2e42206bef6c2a1635b3757f26afcbb4",
  "src/lib/games/arpg/assets/townCorner.ts": "fc6d2c5da008412135fbcfa204be71d2ae92f326e759057048e3bcadf9c49e18",
  "src/lib/games/arpg/assets/townGroundSurface.ts": "dfd6650e65453212cb7c4e0ceb538f6f56714ae60c34052098605ae8b06394ef",
  "src/lib/games/arpg/assets/townFacadeData.ts": "62e2cd05371b28fcc372d32aa402fc7bc2535d8ee43c3818c751251dd71bc7a1",
  "src/lib/games/arpg/assets/manifest.ts": "038729a99f8379762f015bc2a311de6d6c0b19daffb5876ab615df36f72fdd18",
  "src/lib/games/arpg/assets/townBoundary.ts": "bff6d1c28fa19acd6da073f6a9f2b01f031cb9a9433168f7861fbcd00175041c",
  "src/lib/games/arpg/assets/townCourtyard.ts": "dfc44912ebabacad78a382818d759d1ccbd74aaa99b8a9d8dd14382184c402ac"
};
for(const[path,digest]of Object.entries(preserved))test(`preserve reviewed app/original contract ${path}`,()=>assert.equal(hash(read(path)),digest));
test('original outbound isolation/cleanup guard changes only native-return titles and native observation serialization',()=>{
 let s=read('scripts/testing/arpg-readiness-preview/guard.ts');
 const serializerImport="import { serializeCourtyardOrLegacyObservation } from './courtyard-observation-wire.mjs';\n";
 const nativeBody="serializeCourtyardOrLegacyObservation({ browserVersion: browser.version(), state, afterCleanup, blocked, errors,\n        consoleErrors, unexpectedConsoleErrors, cleanupErrors }, info.title)";
 const legacyBody="JSON.stringify({ browserVersion: browser.version(), state, afterCleanup, blocked, errors,\n        consoleErrors, unexpectedConsoleErrors, cleanupErrors }, null, 2)";
 assert.equal(s.split(serializerImport).length-1,1,'Exactly one explicit native observation serializer import required');
 assert.equal(s.split(nativeBody).length-1,1,'Exactly one explicit native observation serializer call required');
 s=s.replace(serializerImport,'').replace(nativeBody,legacyBody);
 s=s.replace("import { COURTYARD_TITLES } from './courtyard-contract.mjs';\n",'').replace(' && !COURTYARD_TITLES.includes(info.title)','');
 assert.equal(hash(s),"58fcfd7b06cebd1b788218a8e8d348a8301c2d7997cb5e102fac30df8400ac6a");
});
test('original native controller is literal-preserved with shared exports only',()=>{
 let s=read('scripts/testing/arpg-readiness-preview/plaza-browser.ts');
 s=s.replace('\n// Shared native primitives; the original exploration calls keep their defaults.\nexport { release, position, releasedFrame, freshGameplay, move, walkInto, dashInto };\n','');
 assert.equal(hash(s),"35567c3633c5cf94ebd62915b466e5dc308626289a3f9dfd1625593a94dcbe04");
});
test('actual route entry adds only explicit visual observer imports after original observer',()=>{
 const s=read('scripts/testing/arpg-readiness-preview/main.ts'), added="import './walk-frame-observer';\n";
  assert.equal(s.split(added).length-1,1,'Exactly one explicit walking-frame observer import required');
  const original=s.replace(added,'');assert(original.includes("import './observe-scene';\nimport './visual-observer';"));
 assert.equal(hash(original.replace("import './visual-observer';\n",'')),"4d6989a12254bc38399d61ebc8f76fac4a5b76eb23d598d1049351a749bd6b6d");
});
const newModules=[
  "courtyard-setup-preservation.mjs",
  "courtyard-setup.ts",
  "courtyard-setup.mjs",
  "courtyard-navigation.ts",
  "courtyard-navigation.test.mjs",
  "courtyard-departure.ts",
  "courtyard-departure.test.mjs",
  "visual.spec.ts",
  "visual-browser.ts",
  "verify-courtyard-results.mjs",
  "courtyard-native.test.mjs",
  "visual-verifier.mjs",
  "visual-contract.mjs",
  "courtyard-browser.ts",
  "courtyard-visibility.test.mjs",
  "courtyard-native-schema.mjs",
  "courtyard-results.test.mjs",
  "courtyard-capture.test.mjs",
  "courtyard-capture.ts",
  "visual-observer.ts",
  "courtyard.browser.spec.ts",
  "courtyard-contract.mjs",
  "visual.playwright.config.ts",
  "courtyard.playwright.config.ts",
  "courtyard-visibility.mjs",
  "verify-courtyard.mjs",
  "courtyard-png.mjs",
  "visual.test.mjs",
  "courtyard-capture-contract.mjs"
];
for(const name of newModules)test(`new source module resolves only explicit existing relative imports: ${name}`,()=>{
 const path=resolve(here,name),source=readFileSync(path,'utf8'),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
 for(const n of ast.statements)if(ts.isImportDeclaration(n)){
  const value=n.moduleSpecifier.text;if(!value.startsWith('.')){assert(value.startsWith('node:')||['phaser','@playwright/test'].includes(value));continue;}
  assert(['','.ts','.mjs','.svelte'].some(ext=>existsSync(resolve(here,value+ext))),value);
 }
 if(name.endsWith('.ts')){const r=ts.transpileModule(source,{fileName:path,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});assert.deepEqual(r.diagnostics,[]);}
});
test('native fixture never invokes controlled pose setter or scene position writes',()=>{
 const s=read('scripts/testing/arpg-readiness-preview/courtyard-browser.ts');assert.doesNotMatch(s,/__arpgCourtyardVisual\.assign|world\.getTransform|setPosition|\.launch\(|page\.screenshot/);
});
test('native PNG capture does not alter framebuffer/camera/context options',()=>{
 const s=read('scripts/testing/arpg-readiness-preview/courtyard-capture.ts');assert.doesNotMatch(s,/preserveDrawingBuffer|canvas\.(width|height)\s*=|getContext\(|requestAnimationFrame|setTimeout/);assert.equal((s.match(/canvas\.toDataURL/g)||[]).length,1);
});

test('all 51 ordinary native target boxes and within-route cardinal corridors retain radius38 plus the full8px error box',async()=>{
 const {COURTYARD_ACTIONS,COURTYARD_SOLIDS}=await import('./courtyard-contract.mjs');const{sweptDistance,roomAllows}=await import('./plaza-contract.mjs');let minimum=Infinity,count=0;
 const check=(a,b)=>{const poly=[[Math.min(a[0],b[0])-8,Math.min(a[1],b[1])-8],[Math.max(a[0],b[0])+8,Math.min(a[1],b[1])-8],[Math.max(a[0],b[0])+8,Math.max(a[1],b[1])+8],[Math.min(a[0],b[0])-8,Math.max(a[1],b[1])+8]];assert(poly.every(roomAllows));for(const solid of Object.values(COURTYARD_SOLIDS)){const d=Math.min(...poly.map((p,i)=>sweptDistance(p,poly[(i+1)%4],solid)),...solid.map(p=>sweptDistance(p,p,poly)));assert(d>38);minimum=Math.min(minimum,d-38);}};
 for(const action of COURTYARD_ACTIONS)if(action.points)action.points.forEach((p,i)=>{count++;check(p,p);if(i){const a=action.points[i-1];assert(a[0]===p[0]||a[1]===p[1]);check(a,p);}});
 assert.equal(count,51);assert(Math.abs(minimum-.510214)*1e6<1); // finite corridor proof, not native convergence
});
