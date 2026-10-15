// Exact local publication-composition regression. No browser or runtime acceptance.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeUpperStoneDepth } from './upper-stone-depth-preservation.mjs';
import { COURTYARD_NAMES, COURTYARD_FILL_COUNTS, COURTYARD_COMMAND_COUNTS, expectedCourtyardMaterial, expectedCourtyardCommands } from './courtyard-graphics.mjs';
const root=new URL('../../../',import.meta.url),hash=s=>createHash('sha256').update(s).digest('hex');
const records=[
  {
    "path": "src/lib/games/arpg/assets/townCourtyard.ts",
    "sha256": "12ccd29d38894751474c442773369d16ef2a3c9d3d4fd6398c36362b805e2191",
    "baselineSHA256": "c19b2bfff5dc43a39e6001d0041f9e1633674b6c5dd3a64d25a0685d50dc674f"
  },
  {
    "path": "src/lib/__tests__/arpgTownCorner.spec.ts",
    "sha256": "7e300be151840790e8737911766db3e15e960a5c1a33fb4087e0ab7f852a042f",
    "baselineSHA256": "3cc02df250068d9c247d4de9632239c84c745819ca3b7d040d20f5bf29ae8d10"
  },
  {
    "path": "scripts/testing/arpg-courtyard-local/courtyard.test.mjs",
    "sha256": "9867494dc6ae8a8a08c1748e169729bb8cade11f3b0cc1b454a7dd37f8f8febe",
    "baselineSHA256": "ed09143538e8239d6edb408d5bde6a1f333908b165b2c8046e58d2d4c9103936"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/courtyard-graphics.mjs",
    "sha256": "ac9bf52746418a3e962eb0c6600ccb73db8c9f72ee5a3ec2706c1a8483aa9325",
    "baselineSHA256": "ee77ae5d63dc0eaf6c10daa7c733c4d4f2338a1ceb83834c12cd533f0a70a003"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/courtyard-visibility.mjs",
    "sha256": "7dfcddff7331bc44dd973bf14133cf7f3801a99a7f568b6d2629e6c0f5d7233d",
    "baselineSHA256": "28eee9916e3ff9ecbc0a19da3973f480691da5ff0ba42d1a0f165f61ec6abbc6"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/courtyard-visibility.test.mjs",
    "sha256": "abeaef405a0e0ac8c1d1d115e150471c4ee01bd98385f08de17fa06bd012e67b",
    "baselineSHA256": "07d2be8db54df9cbb67bf3b1f6382c0eec5cbf6bf04752b5dfb468a25d82cc6c"
  },
  {
    "path": ".github/workflows/arpg-courtyard-controlled.yml",
    "sha256": "e4614804297c152bce2acbf7f89a8a88e9e1874fd0d7b492e9c9eb5f853c54d6",
    "baselineSHA256": "4807bf5cb85f3a4e04fb569d70db0f1a72b27129cf79472cddce2b71bd2d9ac6"
  },
  {
    "path": ".github/workflows/arpg-courtyard-native.yml",
    "sha256": "e6f463130d9d7b4c8da063b37867e43aa82fc5334e7b2d880aa6524d553ccd54",
    "baselineSHA256": "461f2b0206db8de3e29e721dbd2dd74fbc9e5f31e493d75b3d60483f007c5b74"
  },
  {
    "path": ".github/workflows/arpg-frame-gap.yml",
    "sha256": "d9c553881e48dc99c8d5c76fab97b9064e62b3ff7e27e0cbd4cffe15716d5d8c",
    "baselineSHA256": "6104fa0a378e9288d9cc92ddd1266b494856454e658b564c7ee40ccc212e1c50"
  },
  {
    "path": ".github/workflows/arpg-prompt-timing.yml",
    "sha256": "5b259cfa69f885e20031ec0b7874037b5eef145165ab4ee4233cd36f0f332c14",
    "baselineSHA256": "a9db6faa6de4504030da2401ff88858789b846ea37f6de88cbf5b2019a6ce917"
  },
  {
    "path": ".github/workflows/arpg-scene-readiness.yml",
    "sha256": "8c44fd8ab9294d01f4297d38351be90e460a24a305527ac9f2fba677ac47b164",
    "baselineSHA256": "1525c31d3855b749e5034c654a8b4affedce5b4f0fd2bb7544e295e787e59435"
  },
  {
    "path": ".github/workflows/arpg-walk-frame.yml",
    "sha256": "dfd1db3ec89a4a96b19e03436b69de07602a09ebe485c5e15ef1bc211e7a5452",
    "baselineSHA256": "80f19e3b2a5b7c359bbaa9b1bc71fd4cebfa14a685db5babe15fc0b47609a8ae"
  },
  {
    "path": ".github/workflows/recovery-release.yml",
    "sha256": "ef69acf4d9b1a7950162b27f68740b24f3c789997ce88519e158b09949a47282",
    "baselineSHA256": "dec4478bfffab608921a7d20cc75e00660f3c1f4e4a8cfe8df5e8ef12053802b"
  },
  {
    "path": ".github/workflows/startup-recovery.yml",
    "sha256": "6e6d8dea15a8827db0cff9be032d4d1c68a071a2a0f97b0df0ef895216d54478",
    "baselineSHA256": "c916cd4e9281b66821181216623e280d39c911b49cd6f6bc543024460d95bfbf"
  },
  {
    "path": "tests/sql/helpers/game-postgrest-bootstrap.mjs",
    "sha256": "cbf8b1564106d5fbd8655477623ad43293a7557bb6577f845ae6f9e09887b886",
    "baselineSHA256": "955c566c57f1d1edcc3a3da163c1ae3000a3fbe908261d8a292f53c92fa7265a"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/walk-frame-capture-contract.mjs",
    "sha256": "d0d28317665b4f74be767f4d05527a5b9a2f2e68b5e87286c334578360861fe1",
    "baselineSHA256": "47eb4b939c380a05c110989701d05b3a995a3e23aecf13985fecfe28bcfdf762"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/walk-frame.test.mjs",
    "sha256": "815b3fdfa17ac2c7cf27538ce72704a904e1f5683ba6f9432b0dc99a07d6a6b9",
    "baselineSHA256": "cf1016fb77fd9d3af02fb87d4d10f6fc91ee88851690a446a14f8721bfee89fe"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/courtyard-results.test.mjs",
    "sha256": "fe342638438546a335d023084bf0001553e3fc7ed8b13f0b820018c908843355",
    "baselineSHA256": "59360b68913cd680ffb741fc43243bb6c886162eedcd0a80e8bf9d07fed30df9"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/endcap-staging-preservation.mjs",
    "sha256": "a5e167a4b202db1f4cd970c3a2f062e70763044cc91c13ac664bc2a0c4589a44",
    "baselineSHA256": "dfb893d62ae2b5a0ca0486995f9e62aa60d787225d28c6be5fbe1c915d33e0c4"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/courtyard-masonry-preservation.test.mjs",
    "sha256": "700e561576f2b069ad5a788623b670cb99a52538c87d868107842f8606eb461f",
    "baselineSHA256": "09c070a7e9f56ca84b8199bff9695405552467be7df5d20a5a017dcfe467cccd"
  }
];
for(const row of records)test(`exact published252 source outside upper stone-depth integration: ${row.path}`,()=>{
 const source=readFileSync(new URL(row.path,root),'utf8');
 assert.equal(hash(source),row.sha256,'Exact composed candidate required');
 assert.equal(hash(beforeUpperStoneDepth(row.path,source)),row.baselineSHA256,'Published252 behavior outside exact approved delta');
 assert.throws(()=>beforeUpperStoneDepth(row.path,source+source),/Exact courtyard upper stone-depth delta/);
 assert.throws(()=>beforeUpperStoneDepth(row.path,''),/Exact courtyard upper stone-depth delta/);
 assert.notEqual(hash(beforeUpperStoneDepth(row.path,source+'\n// unrelated corruption\n')),row.baselineSHA256,'Unrelated edits remain visible to historical guards');
});
test('all nine current source-tree pins select exactly the new source tree',()=>{
 const paths=[".github/workflows/arpg-courtyard-controlled.yml", ".github/workflows/arpg-courtyard-native.yml", ".github/workflows/arpg-frame-gap.yml", ".github/workflows/arpg-prompt-timing.yml", ".github/workflows/arpg-scene-readiness.yml", ".github/workflows/arpg-walk-frame.yml", ".github/workflows/recovery-release.yml", ".github/workflows/startup-recovery.yml", "tests/sql/helpers/game-postgrest-bootstrap.mjs"];
 for(const path of paths){const s=readFileSync(new URL(path,root),'utf8');assert.equal(s.split('bed604d6dcffa2b665fb962f33ab8ed16e9f0648').length,2);assert(!s.includes('805e1fcc084b21e0dd97ee9f632a2aba326ef8f1'));}
});
test('strict upper-front recipe is exactly 300 quads, 1200 points and 6028 commands',()=>{
 assert.deepEqual(COURTYARD_NAMES.map(n=>COURTYARD_FILL_COUNTS[n]),[25,17,160,98]);
 assert.deepEqual(COURTYARD_NAMES.map(n=>COURTYARD_COMMAND_COUNTS[n]),[507,347,3207,1967]);
 const fills=COURTYARD_NAMES.flatMap(n=>expectedCourtyardMaterial(n));
 assert.equal(fills.length,300);assert.equal(fills.reduce((n,f)=>n+f.points.length,0),1200);
 assert.equal(COURTYARD_NAMES.reduce((n,name)=>n+expectedCourtyardCommands(name).length,0),6028);
});
test('frozen baseline fixture retains the independently reviewed identity',()=>{
 assert.equal(hash(readFileSync(new URL('scripts/testing/arpg-courtyard-local/courtyard-stone-depth-baseline.json',root))),
 '7357f57ce56a7cb1e7aeda02fe8f8a28a95342ed442add9b5106382c11ca9a11');
});
test('walking witness changes only its exact array index:56 to95',()=>{
 const saved=JSON.parse(readFileSync(new URL('scripts/testing/arpg-courtyard-local/courtyard-stone-depth-baseline.json',root),'utf8'));
 const baseline=saved.faces.filter(f=>f.wi===1&&f.layer==='upper').flatMap(f=>f.tiles).map(f=>({color:f.color,points:f.points.map(p=>[p.x,p.y])}));
 const material=expectedCourtyardMaterial('town-courtyard-east-upper');assert.deepEqual(material[95],baseline[56]);assert.equal(material[95].color,0x92866f);
 const point=[2012,706],cross=(a,b)=>(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]);
 const hits=material.flatMap((f,i)=>{const sides=f.points.map((p,j)=>cross(p,f.points[(j+1)%4]));return sides.every(n=>n>0)||sides.every(n=>n<0)?[i]:[];});assert.deepEqual(hits,[95]);
 const margin=Math.min(...material[95].points.map((a,i)=>{const b=material[95].points[(i+1)%4],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);}));assert(Math.abs(margin-.5245824720008054)<1e-9);
});
const recovery=[
  {
    "path": "scripts/testing/arpg-readiness-preview/plaza-browser.ts",
    "sha256": "9ac970edeb36e4c59221baa95f688e43b4170bf021e8b4ff1668d6ae57c01888"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/town-masonry-preservation.mjs",
    "sha256": "184b13a7ab6426cb0f3b5e37076901254edd4294dd29ebef3edab2a5ecc4acf7"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/prompt-timing-preservation.test.mjs",
    "sha256": "5d58dac5aa6a1c9fa518afe3126c56b9f11833e4b21f3c7ec78bed638ebefa93"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/courtyard-chord-selection.test.mjs",
    "sha256": "f2e8daa7789c547e20d5349a71a690c11db446e283a9dbde65be1a0308877760"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/courtyard-navigation.test.mjs",
    "sha256": "0f8d6c2ea79c5ada3e8e96594d502bb2262d96861854b122e759fd4a96d1bdca"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/endcap-staging.mjs",
    "sha256": "589ae4d81a80048949575ed3177f69af384f4ef17607125c6a568274444702d5"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/endcap-staging.ts",
    "sha256": "bb2aa673f90dce23af419d6cf4a12738a2af6d1082f2ad4dcf06cc4508adcb98"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/endcap-staging-preservation.mjs",
    "sha256": "dfb893d62ae2b5a0ca0486995f9e62aa60d787225d28c6be5fbe1c915d33e0c4"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/endcap-staging-replay.json",
    "sha256": "c3bbd815e04bc944820bf6fb97b2942119b7da87f9be4cdfd95a8fa1a7591c23"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/endcap-staging-model.mjs",
    "sha256": "49db4b6d7ccb0429d8c8a1a7a3d752dbf1ae9eb2b62c2e5b4b85150c113fb78f"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/courtyard-endcap-staging.test.mjs",
    "sha256": "2a5c27532b767e84372363ffb7432544689e03f7ee7e3c3b7a7707dad8268ea8"
  }
];
for(const row of recovery)test(`published recovery bytes retained: ${row.path}`,()=>{
 const source=readFileSync(new URL(row.path,root),'utf8');
 assert.equal(hash(row.path.endsWith('/endcap-staging-preservation.mjs')?beforeUpperStoneDepth(row.path,source):source),row.sha256);
});
const unchanged=[
  {
    "path": "scripts/testing/arpg-readiness-preview/courtyard-observation-wire.mjs",
    "sha256": "42b7e4be064e329d69def24b8fe65aa127ad87e8af6a4436c4fdea2bad657391"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/courtyard-observation-wire.test.mjs",
    "sha256": "08de23f499a34d10588978f2f1f9970b5f805d21de185c92f953b608601040b9"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/verify-courtyard-results.mjs",
    "sha256": "fa4863c64bf2e239cab60d953a110114bfb8c66502cdb4a57afdc774a4d1a81e"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/frame-gap-preservation.json",
    "sha256": "b610f15cfa18e4768c96b8c41b7ef058e4ea00048f84a833b637187a660eea04"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/prompt-timing-preservation.json",
    "sha256": "174b9b879b443cdd79575a09c7e110a0cff6c4c3827985fca2973d9cd9676a02"
  }
];
for(const row of unchanged)test(`unchanged transport bounds, legacy coverage and historical manifests: ${row.path}`,()=>assert.equal(hash(readFileSync(new URL(row.path,root))),row.sha256));
test('unlisted files and prototype names are never normalized',()=>{
 for(const name of ['unrelated.txt','constructor','__proto__','toString'])assert.equal(beforeUpperStoneDepth(name,'corrupt source'),'corrupt source');
});
