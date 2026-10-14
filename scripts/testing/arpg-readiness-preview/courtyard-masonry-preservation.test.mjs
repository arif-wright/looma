// Local publication-composition regression only. No browser or runtime evidence.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeTownMasonry } from './town-masonry-preservation.mjs';
const root=new URL('../../../',import.meta.url),hash=s=>createHash('sha256').update(s).digest('hex');
const records=[
  {
    "path": "src/lib/games/arpg/assets/townCourtyard.ts",
    "sha256": "c19b2bfff5dc43a39e6001d0041f9e1633674b6c5dd3a64d25a0685d50dc674f",
    "baselineSHA256": "dfc44912ebabacad78a382818d759d1ccbd74aaa99b8a9d8dd14382184c402ac"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/courtyard-graphics.mjs",
    "sha256": "ee77ae5d63dc0eaf6c10daa7c733c4d4f2338a1ceb83834c12cd533f0a70a003",
    "baselineSHA256": "9a7d52c5f3fd4351f76fab2aaad73ad4a9ee854d6bb57447754afb3322d5e663"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/courtyard-visibility.test.mjs",
    "sha256": "07d2be8db54df9cbb67bf3b1f6382c0eec5cbf6bf04752b5dfb468a25d82cc6c",
    "baselineSHA256": "84efa25692154b07c17f3b434a5e4e47da5201a4d56339ace5369444203af9ee"
  },
  {
    "path": "scripts/testing/arpg-courtyard-local/courtyard.test.mjs",
    "sha256": "ed09143538e8239d6edb408d5bde6a1f333908b165b2c8046e58d2d4c9103936",
    "baselineSHA256": "934e2b9e2b6172e33144fe078100717b88b85e3d535e79aa171edef7865148ab"
  },
  {
    "path": ".github/workflows/arpg-prompt-timing.yml",
    "sha256": "a9db6faa6de4504030da2401ff88858789b846ea37f6de88cbf5b2019a6ce917",
    "baselineSHA256": "e83eb3a461bbbaca213db8bbd5b4cf74259e6f4e0947a1a469d280798026d342"
  },
  {
    "path": ".github/workflows/arpg-walk-frame.yml",
    "sha256": "80f19e3b2a5b7c359bbaa9b1bc71fd4cebfa14a685db5babe15fc0b47609a8ae",
    "baselineSHA256": "37cf3fc5da28e9f2749daa10deaa8f6e587ca4b53fc8b37e9ae020bd45fddf4c"
  },
  {
    "path": ".github/workflows/arpg-courtyard-native.yml",
    "sha256": "461f2b0206db8de3e29e721dbd2dd74fbc9e5f31e493d75b3d60483f007c5b74",
    "baselineSHA256": "102d3e74f41683bf54370f16a1b91c4e9a660575849998c67ddd8be52fb8fd92"
  },
  {
    "path": ".github/workflows/startup-recovery.yml",
    "sha256": "c916cd4e9281b66821181216623e280d39c911b49cd6f6bc543024460d95bfbf",
    "baselineSHA256": "78c76972c85726477713076928c7727f37ef29835fae0be51e890bfbe3b0696e"
  },
  {
    "path": ".github/workflows/recovery-release.yml",
    "sha256": "dec4478bfffab608921a7d20cc75e00660f3c1f4e4a8cfe8df5e8ef12053802b",
    "baselineSHA256": "867d67e4090bdd7d27ebf809153c715ee9e0cfd0fb83f5997f66df6e3f781868"
  },
  {
    "path": ".github/workflows/arpg-scene-readiness.yml",
    "sha256": "1525c31d3855b749e5034c654a8b4affedce5b4f0fd2bb7544e295e787e59435",
    "baselineSHA256": "9f957c2faf26016a13a4fef02f365ce1a3e66a00c59e0dd74c671a5e9773430f"
  },
  {
    "path": ".github/workflows/arpg-courtyard-controlled.yml",
    "sha256": "4807bf5cb85f3a4e04fb569d70db0f1a72b27129cf79472cddce2b71bd2d9ac6",
    "baselineSHA256": "de51bb69d11a9368cabaf5e63138c8028fd6ab83f9944f1419d9dca84cc4d423"
  },
  {
    "path": ".github/workflows/arpg-frame-gap.yml",
    "sha256": "6104fa0a378e9288d9cc92ddd1266b494856454e658b564c7ee40ccc212e1c50",
    "baselineSHA256": "aaa2cf963b9d4154e28fa5b9638df51bf390a92da6e53f684d9931f576a9370a"
  },
  {
    "path": "tests/sql/helpers/game-postgrest-bootstrap.mjs",
    "sha256": "955c566c57f1d1edcc3a3da163c1ae3000a3fbe908261d8a292f53c92fa7265a",
    "baselineSHA256": "b2db0f80d690c2193a302d436ebd0819ea6cbff3d307bbe386da1079a211d48f"
  },
  {
    "path": "scripts/testing/arpg-readiness-preview/observer-scope-preservation.mjs",
    "sha256": "601226bbf2271f38581297306db28fe5068cc93861cd0ac10e48752c0f978763",
    "baselineSHA256": "861dd0c7d599f3feb09e1b0dca8ce59c7c06b67792c48a183fc5a2ca7cdf6d0a"
  }
];
for(const row of records)test(`exact current-head source outside material integration: ${row.path}`,()=>{
 const source=readFileSync(new URL(row.path,root),'utf8');
 assert.equal(hash(source),row.sha256,'Exact composed candidate required');
 assert.equal(hash(beforeTownMasonry(row.path,source)),row.baselineSHA256,'Original 80a fixture behavior outside exact delta');
 assert.throws(()=>beforeTownMasonry(row.path,source+source),/Exact courtyard masonry delta/);
 const changed=source+'\n// unrelated corruption\n';
 assert.notEqual(hash(beforeTownMasonry(row.path,changed)),row.baselineSHA256,'Unrelated edits remain visible to historical hash guards');
});
test('all nine live source-tree pins use the exact new production tree',()=>{
 const paths=[".github/workflows/arpg-prompt-timing.yml", ".github/workflows/arpg-walk-frame.yml", ".github/workflows/arpg-courtyard-native.yml", ".github/workflows/startup-recovery.yml", ".github/workflows/recovery-release.yml", ".github/workflows/arpg-scene-readiness.yml", ".github/workflows/arpg-courtyard-controlled.yml", ".github/workflows/arpg-frame-gap.yml", "tests/sql/helpers/game-postgrest-bootstrap.mjs"];
 for(const path of paths){const s=readFileSync(new URL(path,root),'utf8');assert.equal(s.split('805e1fcc084b21e0dd97ee9f632a2aba326ef8f1').length,2);assert(!s.includes('e0907ac0beccf4d364494d818c9e8d02fdaa96fd'));}
});
