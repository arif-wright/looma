// Test-only exact reversal of the reviewed local courtyard material and source-pin delta.
// No runtime module imports this historical preservation adapter.
import { beforeEndcapStaging } from './endcap-staging-preservation.mjs';
import assert from 'node:assert/strict';
const changes={
  "townCourtyard.ts": [
    [
      " * Fixed recipe: 192 quads / 768 points across the four create-once Graphics. */\nexport function townCourtyardSurface(face: Face, layer: string, faceIndex: number, wallIndex: number): Face[] {\n  const foundation = layer === 'foundation', cap = faceIndex === 2, end = faceIndex === 1;\n  // Recessed joints stay legible in the compact view. Keep the outer 0.32 px\n  // margin and all physical corners unchanged; widen only internal joints.\n  const base = foundation ? (cap ? 0x746c5c : 0x514c42) : (cap ? 0x6b6252 : 0x554f44);\n  const edgeInset = .32, jointInset = .7;\n  if (foundation && cap) return [{ points: face.points, color: base }];\n  const palette = foundation ? [0x6e6655, 0x746b59, 0x696353, 0x776e5b]\n    : end ? [0x776d5b, 0x7a705d]\n",
      " * Fixed recipe: 192 quads / 768 points across the four create-once Graphics. */\nexport function townCourtyardSurface(face: Face, layer: string, faceIndex: number, wallIndex: number): Face[] {\n  const foundation = layer === 'foundation', cap = faceIndex === 2, end = faceIndex === 1;\n  const base = foundation ? (cap ? 0x746c5c : 0x605c50) : (cap ? 0x8b806b : 0x706856);\n  if (foundation && cap) return [{ points: face.points, color: base }];\n  const palette = foundation ? [0x6e6655, 0x746b59, 0x696353, 0x776e5b]\n    : end ? [0x776d5b, 0x7a705d]\n"
    ],
    [
      "  const seed = wallIndex * 2 + (cap ? 1 : 0);\n  let previousV = 0;\n  for (let row = 0; row < rows; row++) {\n    const v0 = row / rows + (row === 0 ? edgeInset : jointInset) / extent;\n    const v1 = (row + 1) / rows - (row === rows - 1 ? edgeInset : jointInset) / extent;\n    tile(0, 1, previousV, v0, base);\n    let previousU = 0, start = row ? -25 : 0, index = 0;\n    while (start < length) {\n      const stop = end ? length : start + widths[(index + seed + row * 2) % widths.length]!;\n      const u0 = (Math.max(0, end ? 0 : start) + (end || start <= 0 ? edgeInset : jointInset)) / length;\n      const u1 = (Math.min(length, stop) - (stop >= length ? edgeInset : jointInset)) / length;\n      if (u1 > u0) {\n        tile(previousU, u0, v0, v1, base);\n        tile(u0, u1, v0, v1, palette[(index + row * 3 + wallIndex) % palette.length]!);\n",
      "  const seed = wallIndex * 2 + (cap ? 1 : 0);\n  let previousV = 0;\n  for (let row = 0; row < rows; row++) {\n    const v0 = row / rows + .32 / extent, v1 = (row + 1) / rows - .32 / extent;\n    tile(0, 1, previousV, v0, base);\n    let previousU = 0, start = row ? -25 : 0, index = 0;\n    while (start < length) {\n      const stop = end ? length : start + widths[(index + seed + row * 2) % widths.length]!;\n      const u0 = (Math.max(0, end ? 0 : start) + .32) / length;\n      const u1 = (Math.min(length, stop) - .32) / length;\n      if (u1 > u0) {\n        tile(previousU, u0, v0, v1, base);\n        tile(u0, u1, v0, v1, palette[(index + row * 3 + wallIndex) % palette.length]!);\n"
    ]
  ],
  "courtyard-graphics.mjs": [
    [
      "  for(const [faceIndex,{points}]of courtyardFaces(name).entries()){\n    const [a,b,,d]=points,cap=faceIndex===2,end=faceIndex===1;\n    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),extent=Math.hypot(d[0]-a[0],d[1]-a[1]);\n    const base=foundation?(cap?0x746c5c:0x514c42):(cap?0x6b6252:0x554f44);\n    const palette=foundation?[0x6e6655,0x746b59,0x696353,0x776e5b]:end?[0x776d5b,0x7a705d]:\n      cap?[0x978b72,0xa09277,0x92866f,0x9c8f75,0x988d77]:[0x7c715e,0x877a65,0x786e5c,0x817461,0x897b65,0x7d7461];\n    const map=(u,v)=>{\n",
      "  for(const [faceIndex,{points}]of courtyardFaces(name).entries()){\n    const [a,b,,d]=points,cap=faceIndex===2,end=faceIndex===1;\n    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),extent=Math.hypot(d[0]-a[0],d[1]-a[1]);\n    const base=foundation?(cap?0x746c5c:0x605c50):(cap?0x8b806b:0x706856);\n    const palette=foundation?[0x6e6655,0x746b59,0x696353,0x776e5b]:end?[0x776d5b,0x7a705d]:\n      cap?[0x978b72,0xa09277,0x92866f,0x9c8f75,0x988d77]:[0x7c715e,0x877a65,0x786e5c,0x817461,0x897b65,0x7d7461];\n    const map=(u,v)=>{\n"
    ],
    [
      "    const rows=cap||foundation?1:2,widths=foundation?[70,88,76,94,82]:[44,56,48,52,60,46,54];\n    let previousV=0;\n    for(let row=0;row<rows;row++){\n      const v0=row/rows+(row===0?.32:.7)/extent,v1=(row+1)/rows-(row===rows-1?.32:.7)/extent;\n      paint(0,1,previousV,v0,base);\n      let previousU=0,start=row?-25:0,i=0;\n      while(start<length){\n        const stop=end?length:Math.min(length,start+widths[(i+wi*2+(cap?1:0)+row*2)%widths.length]);\n        const u0=(Math.max(0,end?0:start)+(end||start<=0?.32:.7))/length,u1=(stop-(stop>=length?.32:.7))/length;\n        if(u1>u0){\n          paint(previousU,u0,v0,v1,base);\n          paint(u0,u1,v0,v1,palette[(i+row*3+wi)%palette.length]);\n",
      "    const rows=cap||foundation?1:2,widths=foundation?[70,88,76,94,82]:[44,56,48,52,60,46,54];\n    let previousV=0;\n    for(let row=0;row<rows;row++){\n      const v0=row/rows+.32/extent,v1=(row+1)/rows-.32/extent;\n      paint(0,1,previousV,v0,base);\n      let previousU=0,start=row?-25:0,i=0;\n      while(start<length){\n        const stop=end?length:Math.min(length,start+widths[(i+wi*2+(cap?1:0)+row*2)%widths.length]);\n        const u0=(Math.max(0,end?0:start)+.32)/length,u1=(stop-.32)/length;\n        if(u1>u0){\n          paint(previousU,u0,v0,v1,base);\n          paint(u0,u1,v0,v1,palette[(i+row*3+wi)%palette.length]);\n"
    ]
  ],
  "courtyard-visibility.test.mjs": [
    [
      "    assert.equal(fills.length,graphics.COURTYARD_FILL_COUNTS[name]);\n    assert.equal(commands.length,graphics.COURTYARD_COMMAND_COUNTS[name]);\n    assert(fills.every(f=>f.alpha===1&&f.points.length===4));\n    total+=fills.length;stones+=fills.filter(f=>![0x746c5c,0x514c42,0x6b6252,0x554f44].includes(f.color)).length;\n  }\n  assert.equal(total,192);assert.equal(total*4,768);assert.equal(stones,76);\n});\n",
      "    assert.equal(fills.length,graphics.COURTYARD_FILL_COUNTS[name]);\n    assert.equal(commands.length,graphics.COURTYARD_COMMAND_COUNTS[name]);\n    assert(fills.every(f=>f.alpha===1&&f.points.length===4));\n    total+=fills.length;stones+=fills.filter(f=>![0x746c5c,0x605c50,0x8b806b,0x706856].includes(f.color)).length;\n  }\n  assert.equal(total,192);assert.equal(total*4,768);assert.equal(stones,76);\n});\n"
    ]
  ],
  "courtyard.test.mjs": [
    [
      "// Material proof: real production surface helper, independent saved study\n// polygons/colors, and UV area/coverage checks. No raster alpha is inferred.\nconst stoneFixture=JSON.parse(readFileSync(resolve(here,'courtyard-stone-fixtures.json')));\nconst baseColor=(layer,face)=>layer==='foundation'?(face===2?0x746c5c:0x514c42):(face===2?0x6b6252:0x554f44);\nconst painted=geometry.flatMap((wall,wi)=>['foundation','upper'].flatMap(layer=>wall[layer].map((face,fi)=>\n  ({wi,layer,fi,face,tiles:townCourtyardSurface(face,layer,fi,wi)}))));\nconst toUV=(face,p)=>{const[a,b,,d]=face.points,x=b.x-a.x,y=b.y-a.y,c=d.x-a.x,e=d.y-a.y,det=x*e-y*c;\n",
      "// Material proof: real production surface helper, independent saved study\n// polygons/colors, and UV area/coverage checks. No raster alpha is inferred.\nconst stoneFixture=JSON.parse(readFileSync(resolve(here,'courtyard-stone-fixtures.json')));\nconst baseColor=(layer,face)=>layer==='foundation'?(face===2?0x746c5c:0x605c50):(face===2?0x8b806b:0x706856);\nconst painted=geometry.flatMap((wall,wi)=>['foundation','upper'].flatMap(layer=>wall[layer].map((face,fi)=>\n  ({wi,layer,fi,face,tiles:townCourtyardSurface(face,layer,fi,wi)}))));\nconst toUV=(face,p)=>{const[a,b,,d]=face.points,x=b.x-a.x,y=b.y-a.y,c=d.x-a.x,e=d.y-a.y,det=x*e-y*c;\n"
    ],
    [
      "  source=source.replace(\"      for (const [faceIndex, face] of faces.entries()) {\\n        for (const paint of townCourtyardSurface(face, layer, faceIndex, wall.id === 'west' ? 0 : 1)) {\\n          graphic.fillStyle(paint.color, 1).fillPoints(paint.points, true);\\n        }\\n      }\",'      for (const face of faces) graphic.fillStyle(face.color, 1).fillPoints(face.points, true);');\n  assert.equal(createHash('sha256').update(source).digest('hex'),'ad69819cf818c83feaaab5e3773436a68d757df236f0662131cfa886ef6338e3');\n});\ntest('all 76 stone colors and courses retain the saved study with only internal joint recession',()=>{\n  assert.equal(stoneFixture.stones.length,76);let count=0;\n  for(const {wi,layer,fi,face,tiles}of painted){\n    const stones=tiles.filter(t=>t.color!==baseColor(layer,fi)),expected=stoneFixture.stones.filter(s=>s[0]===wi&&s[1]===layer&&s[2]===fi);\n    assert.equal(stones.length,expected.length);count+=stones.length;\n    // Independent evolution of the original saved stone polygons: retreat only\n    // internal edges another 0.38 world pixels; keep exterior margins at 0.32.\n    const [a,b,,d]=face.points,L=Math.hypot(b.x-a.x,b.y-a.y),H=Math.hypot(d.x-a.x,d.y-a.y);\n    stones.forEach((s,i)=>{assert.equal(s.color,expected[i][3]);s.points.forEach((p,j)=>{\n      const [x,y]=expected[i][4][j],uv=toUV(face,{x,y});\n      const du=Math.min(uv.x,1-uv.x)*L>.32+1e-8?(j===0||j===3?.38:-.38):0;\n      const dv=Math.min(uv.y,1-uv.y)*H>.32+1e-8?(j<2?.38:-.38):0;\n      approx(p.x,x+du*(b.x-a.x)/L+dv*(d.x-a.x)/H,1e-11);\n      approx(p.y,y+du*(b.y-a.y)/L+dv*(d.y-a.y)/H,1e-11);\n    });});\n    verifyPartition(face,tiles);\n  }assert.equal(count,76);\n});\n",
      "  source=source.replace(\"      for (const [faceIndex, face] of faces.entries()) {\\n        for (const paint of townCourtyardSurface(face, layer, faceIndex, wall.id === 'west' ? 0 : 1)) {\\n          graphic.fillStyle(paint.color, 1).fillPoints(paint.points, true);\\n        }\\n      }\",'      for (const face of faces) graphic.fillStyle(face.color, 1).fillPoints(face.points, true);');\n  assert.equal(createHash('sha256').update(source).digest('hex'),'ad69819cf818c83feaaab5e3773436a68d757df236f0662131cfa886ef6338e3');\n});\ntest('all 76 stones retain the independently saved study polygon/color with no underlay',()=>{\n  assert.equal(stoneFixture.stones.length,76);let count=0;\n  for(const {wi,layer,fi,face,tiles}of painted){\n    const stones=tiles.filter(t=>t.color!==baseColor(layer,fi)),expected=stoneFixture.stones.filter(s=>s[0]===wi&&s[1]===layer&&s[2]===fi);\n    assert.equal(stones.length,expected.length);count+=stones.length;\n    stones.forEach((s,i)=>{assert.equal(s.color,expected[i][3]);s.points.forEach((p,j)=>{approx(p.x,expected[i][4][j][0],1e-11);approx(p.y,expected[i][4][j][1],1e-11);});});\n    verifyPartition(face,tiles);\n  }assert.equal(count,76);\n});\n"
    ]
  ],
  "arpg-prompt-timing.yml": [
    [
      "          set -euo pipefail\n          mkdir -p artifacts/arpg-prompt-timing\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = 805e1fcc084b21e0dd97ee9f632a2aba326ef8f1\n          test \"$(git rev-parse HEAD:static)\" = 4e73595fef84bde3a91c0d9d129eaa2969c7fe68\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${ARPG_READINESS_BROWSER_EXECUTABLE:-}\"\n",
      "          set -euo pipefail\n          mkdir -p artifacts/arpg-prompt-timing\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = e0907ac0beccf4d364494d818c9e8d02fdaa96fd\n          test \"$(git rev-parse HEAD:static)\" = 4e73595fef84bde3a91c0d9d129eaa2969c7fe68\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${ARPG_READINESS_BROWSER_EXECUTABLE:-}\"\n"
    ]
  ],
  "arpg-walk-frame.yml": [
    [
      "          set -euo pipefail\n          mkdir -p artifacts/arpg-walk-frame\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = 805e1fcc084b21e0dd97ee9f632a2aba326ef8f1\n          test \"$(git rev-parse HEAD:static)\" = 4e73595fef84bde3a91c0d9d129eaa2969c7fe68\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${ARPG_READINESS_BROWSER_EXECUTABLE:-}\"\n",
      "          set -euo pipefail\n          mkdir -p artifacts/arpg-walk-frame\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = e0907ac0beccf4d364494d818c9e8d02fdaa96fd\n          test \"$(git rev-parse HEAD:static)\" = 4e73595fef84bde3a91c0d9d129eaa2969c7fe68\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${ARPG_READINESS_BROWSER_EXECUTABLE:-}\"\n"
    ]
  ],
  "arpg-courtyard-native.yml": [
    [
      "          set -euo pipefail\n          mkdir -p artifacts/arpg-courtyard-native\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = 805e1fcc084b21e0dd97ee9f632a2aba326ef8f1\n          test \"$(git rev-parse HEAD:static)\" = 4e73595fef84bde3a91c0d9d129eaa2969c7fe68\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${ARPG_READINESS_BROWSER_EXECUTABLE:-}\"\n",
      "          set -euo pipefail\n          mkdir -p artifacts/arpg-courtyard-native\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = e0907ac0beccf4d364494d818c9e8d02fdaa96fd\n          test \"$(git rev-parse HEAD:static)\" = 4e73595fef84bde3a91c0d9d129eaa2969c7fe68\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${ARPG_READINESS_BROWSER_EXECUTABLE:-}\"\n"
    ]
  ],
  "startup-recovery.yml": [
    [
      "          set -euo pipefail\n          mkdir -p artifacts/startup-recovery\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = 805e1fcc084b21e0dd97ee9f632a2aba326ef8f1\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${START_RECOVERY_BROWSER_EXECUTABLE:-}\"\n          {\n",
      "          set -euo pipefail\n          mkdir -p artifacts/startup-recovery\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = e0907ac0beccf4d364494d818c9e8d02fdaa96fd\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${START_RECOVERY_BROWSER_EXECUTABLE:-}\"\n          {\n"
    ]
  ],
  "recovery-release.yml": [
    [
      "            git -C \"$fixture\" rev-parse HEAD HEAD^{tree}\n            node --version\n          } > artifacts/moonberry-gather/comparison-source.txt\n          expected_src=805e1fcc084b21e0dd97ee9f632a2aba326ef8f1\n          if [ \"$COMPARISON_SOURCE\" = baseline ]; then expected_src=882236c59c42b5c14cb7f28a442295d9690d9ae5; fi\n          test \"$(git rev-parse HEAD:src)\" = \"$expected_src\"\n          node \"$fixture/scripts/testing/recovery-dom/verify-playwright-toolchain.mjs\" \"$COMPARISON_SOURCE\" before \"$PWD\" \"$fixture\" > artifacts/moonberry-gather/toolchain-before-overlay.json\n",
      "            git -C \"$fixture\" rev-parse HEAD HEAD^{tree}\n            node --version\n          } > artifacts/moonberry-gather/comparison-source.txt\n          expected_src=e0907ac0beccf4d364494d818c9e8d02fdaa96fd\n          if [ \"$COMPARISON_SOURCE\" = baseline ]; then expected_src=882236c59c42b5c14cb7f28a442295d9690d9ae5; fi\n          test \"$(git rev-parse HEAD:src)\" = \"$expected_src\"\n          node \"$fixture/scripts/testing/recovery-dom/verify-playwright-toolchain.mjs\" \"$COMPARISON_SOURCE\" before \"$PWD\" \"$fixture\" > artifacts/moonberry-gather/toolchain-before-overlay.json\n"
    ]
  ],
  "arpg-scene-readiness.yml": [
    [
      "          set -euo pipefail\n          mkdir -p artifacts/arpg-scene-readiness\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = 805e1fcc084b21e0dd97ee9f632a2aba326ef8f1\n          test \"$(git rev-parse HEAD:static)\" = 4e73595fef84bde3a91c0d9d129eaa2969c7fe68\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${ARPG_READINESS_BROWSER_EXECUTABLE:-}\"\n",
      "          set -euo pipefail\n          mkdir -p artifacts/arpg-scene-readiness\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = e0907ac0beccf4d364494d818c9e8d02fdaa96fd\n          test \"$(git rev-parse HEAD:static)\" = 4e73595fef84bde3a91c0d9d129eaa2969c7fe68\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${ARPG_READINESS_BROWSER_EXECUTABLE:-}\"\n"
    ]
  ],
  "arpg-courtyard-controlled.yml": [
    [
      "          set -euo pipefail\n          mkdir -p artifacts/arpg-courtyard-controlled\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = 805e1fcc084b21e0dd97ee9f632a2aba326ef8f1\n          test \"$(git rev-parse HEAD:static)\" = 4e73595fef84bde3a91c0d9d129eaa2969c7fe68\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${ARPG_READINESS_BROWSER_EXECUTABLE:-}\"\n",
      "          set -euo pipefail\n          mkdir -p artifacts/arpg-courtyard-controlled\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = e0907ac0beccf4d364494d818c9e8d02fdaa96fd\n          test \"$(git rev-parse HEAD:static)\" = 4e73595fef84bde3a91c0d9d129eaa2969c7fe68\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${ARPG_READINESS_BROWSER_EXECUTABLE:-}\"\n"
    ]
  ],
  "arpg-frame-gap.yml": [
    [
      "          set -euo pipefail\n          mkdir -p artifacts/arpg-frame-gap\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = 805e1fcc084b21e0dd97ee9f632a2aba326ef8f1\n          test \"$(git rev-parse HEAD:static)\" = 4e73595fef84bde3a91c0d9d129eaa2969c7fe68\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${ARPG_READINESS_BROWSER_EXECUTABLE:-}\"\n",
      "          set -euo pipefail\n          mkdir -p artifacts/arpg-frame-gap\n          test \"$(git rev-parse HEAD)\" = \"$EXPECTED_SHA\"\n          test \"$(git rev-parse HEAD:src)\" = e0907ac0beccf4d364494d818c9e8d02fdaa96fd\n          test \"$(git rev-parse HEAD:static)\" = 4e73595fef84bde3a91c0d9d129eaa2969c7fe68\n          test \"$(git rev-parse HEAD:supabase)\" = 0a420e027ca5ff8038408d43072ece95c6333c8c\n          test -z \"${ARPG_READINESS_BROWSER_EXECUTABLE:-}\"\n"
    ]
  ],
  "game-postgrest-bootstrap.mjs": [
    [
      "  // It inherits PR17 e73cad94f07309c1a126e5f2aa76bca5ab126db2 without merging.\n  // Only this source-pin metadata changed here; no server/SQL logic changed.\n  // Keep Supabase pinned independently; this is not a hosted-schema claim.\n  for (const [directory, expected] of Object.entries({src:'805e1fcc084b21e0dd97ee9f632a2aba326ef8f1',supabase:'0a420e027ca5ff8038408d43072ece95c6333c8c'})) {\n    assert.equal(execFileSync('git',['rev-parse',`HEAD:${directory}`],{cwd:root,encoding:'utf8'}).trim(),expected,`Reviewed ${directory} product tree required; update this bounded gate after independent review`);\n  }\n  const report = { status: 'RUNNING', database: DATABASE, manifest: [], sourceTree, startedAt: new Date().toISOString() };\n",
      "  // It inherits PR17 e73cad94f07309c1a126e5f2aa76bca5ab126db2 without merging.\n  // Only this source-pin metadata changed here; no server/SQL logic changed.\n  // Keep Supabase pinned independently; this is not a hosted-schema claim.\n  for (const [directory, expected] of Object.entries({src:'e0907ac0beccf4d364494d818c9e8d02fdaa96fd',supabase:'0a420e027ca5ff8038408d43072ece95c6333c8c'})) {\n    assert.equal(execFileSync('git',['rev-parse',`HEAD:${directory}`],{cwd:root,encoding:'utf8'}).trim(),expected,`Reviewed ${directory} product tree required; update this bounded gate after independent review`);\n  }\n  const report = { status: 'RUNNING', database: DATABASE, manifest: [], sourceTree, startedAt: new Date().toISOString() };\n"
    ]
  ],
  "observer-scope-preservation.mjs": [
    [
      "// Test-only exact reversal of ordinary-readiness observer scoping.\n// No runtime module imports this historical adapter.\nimport { beforeTownMasonry } from './town-masonry-preservation.mjs';\nimport assert from 'node:assert/strict';\nconst changes={\n  \"observe-scene.ts\": [\n",
      "// Test-only exact reversal of ordinary-readiness observer scoping.\n// No runtime module imports this historical adapter.\nimport assert from 'node:assert/strict';\nconst changes={\n  \"observe-scene.ts\": [\n"
    ],
    [
      "};\nexport function beforeObserverScope(name,source) {\n  name=name.split('/').at(-1);\n  if(!changes[name])return beforeTownMasonry(name,source);\n  source=String(source);\n  for(const [added,original]of [...changes[name]].reverse()){\n    assert(added.length>0);assert.equal(source.split(added).length,2,`Exact observer-scope delta required in ${name}`);\n    source=source.replace(added,original);\n  }\n  return beforeTownMasonry(name,source);\n}\n",
      "};\nexport function beforeObserverScope(name,source) {\n  name=name.split('/').at(-1);\n  if(!changes[name])return source;\n  source=String(source);\n  for(const [added,original]of [...changes[name]].reverse()){\n    assert(added.length>0);assert.equal(source.split(added).length,2,`Exact observer-scope delta required in ${name}`);\n    source=source.replace(added,original);\n  }\n  return source;\n}\n"
    ]
  ]
};
export function beforeTownMasonry(name,source) {
  source=beforeEndcapStaging(name,source);
  name=name.split('/').at(-1);
  if(!changes[name])return source;
  source=String(source);
  for(const [added,original]of [...changes[name]].reverse()){
    assert(added.length>0);
    assert.equal(source.split(added).length,2,`Exact courtyard masonry delta required in ${name}`);
    source=source.replace(added,original);
  }
  return source;
}
