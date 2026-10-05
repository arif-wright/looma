import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
const dimensions = { 'lantern-portal': [1161,1355], 'lantern-cottage': [1377,1142] };
const results = [];
for (const [id, size] of Object.entries(dimensions)) {
  const source = readFileSync(`art-source/world/connected-wilds/${id}-original.png`);
  const runtime = readFileSync(`static/game/world/connected-wilds/${id}.png`);
  assert.deepEqual(runtime, source, `${id}: source bytes preserved`);
  const png = PNG.sync.read(runtime);
  assert.deepEqual([png.width,png.height], size);
  let transparent=0,visible=0;
  for(let i=3;i<png.data.length;i+=4){if(png.data[i]===0)transparent++;if(png.data[i]>200)visible++;}
  assert.ok(transparent > png.width * png.height * 0.15, `${id}: genuine alpha`);
  assert.ok(visible > png.width * png.height * 0.15, `${id}: usable illustration pixels`);
  results.push({id,width:png.width,height:png.height,bytes:runtime.length,transparent,visible,sha256:createHash('sha256').update(runtime).digest('hex')});
}
console.log(JSON.stringify(results,null,2));
