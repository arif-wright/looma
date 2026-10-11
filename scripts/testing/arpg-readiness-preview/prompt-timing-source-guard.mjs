import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('./prompt-timing-preservation.json',import.meta.url),'utf8'));
for(const item of manifest.preservedFiles){
  const bytes=readFileSync(resolve(root,item.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,`Published acceptance/toolchain file changed: ${item.path}`);
}
console.log(`Preserved ${manifest.preservedFiles.length} exact-head acceptance/toolchain files; diagnostic cannot replace acceptance.`);
