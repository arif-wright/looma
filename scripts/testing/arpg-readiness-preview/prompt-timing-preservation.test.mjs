import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {RUNS,PREFIX_TIMEOUT_MS,WARMUP_FRAMES,NEUTRAL_WINDOW_MS,MAX_INPUT_CALLS} from './prompt-timing-plan.mjs';
const ts=createRequire(import.meta.url)('typescript');
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const ast=(name)=>ts.createSourceFile(name,read(name),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const original=ast('./plaza-browser.ts'),driver=ast('./prompt-timing-driver.ts');
const functions=file=>new Map(file.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name.text,node.getText(file)]));
const before=functions(original),after=functions(driver);
for(const name of ['release','position','releasedFrame','freshGameplay','move','route','walkInto','dashInto'])test(`unchanged native driver function ${name}`,()=>assert.equal(after.get(name),before.get(name)));
test('counterbalanced order and finite collection bounds',()=>{
  assert.deepEqual(RUNS.map(r=>[r.mode,r.role]),[['candidate','warmup'],['bypass','warmup'],['candidate','measured'],['bypass','measured'],['bypass','measured'],['candidate','measured']]);
  assert.equal(WARMUP_FRAMES,120);assert.equal(NEUTRAL_WINDOW_MS,10000);assert.equal(PREFIX_TIMEOUT_MS,180000);assert.equal(MAX_INPUT_CALLS,4096);
});
test('new diagnostic config is isolated from the unchanged acceptance config',()=>{
  const acceptance=read('./playwright.config.ts'),config=read('./prompt-timing.playwright.config.ts');
  assert(acceptance.includes("testMatch: 'readiness.browser.spec.ts'"));
  assert(config.includes("testMatch:'prompt-timing.browser.spec.ts'"));assert(config.includes("retries:0"));assert(config.includes('workers:1'));assert(config.includes('timeout:1_320_000'));
  assert(config.includes("serviceWorkers:'block'"));assert(config.includes('reuseExistingServer:false'));
  assert(!config.includes('executablePath'));assert(!config.includes('launchOptions'));
});
test('Vite inherits the original boundary and injects only into its dedicated build',()=>{
  const config=read('./prompt-timing.vite.config.mjs');assert(config.includes("import base from './vite.config.mjs'"));
  assert(config.includes("id.split('?')[0]!==`${root}main.ts`"));assert(config.includes("import './prompt-timing-observer'"));
  assert(config.includes('.timing-build'));assert(!read('./main.ts').includes('prompt-timing'));assert(!read('./vite.config.mjs').includes('prompt-timing'));
});
test('published acceptance fixture identities remain pinned',()=>{
  const manifest=JSON.parse(read('./prompt-timing-preservation.json'));assert.equal(manifest.baseCommit,'ea8836649a065b99cabe99d08d680c08058a16e8');assert.equal(manifest.preservedFiles.length,37);
  for(const name of ['guard.ts','index.html','main.ts','playwright.config.ts','plaza-browser.ts','plaza-navigation.mjs','protocol.mjs','readiness.browser.spec.ts','tsconfig.json','vite.config.mjs']){
    const entry=manifest.preservedFiles.find(e=>e.path===`scripts/testing/arpg-readiness-preview/${name}`);assert(entry);assert.equal(createHash('sha256').update(read(`./${name}`)).digest('hex'),entry.sha256,name);
  }
});
test('diagnostic retains guard, native page resets, zero sessions and real cleanup',()=>{
  const spec=read('./prompt-timing.browser.spec.ts');assert(spec.includes("from './guard'"));assert(spec.includes('page.goto(`/preview#promptMode='));
  assert(spec.includes('window.__arpgFixture.unmountAll()'));assert(spec.includes('state.rewardMutations).toEqual([])'));assert(spec.includes("call.path==='/api/games/session/start'"));
  assert(spec.includes('{timeout:PREFIX_TIMEOUT_MS}'));assert(spec.includes('expect(neutralAfter).toEqual(neutralBefore)'));
  for(const forbidden of ['setPosition','setVelocity','setScroll','clock.install','clock.fastForward','__arpgReturnFlow','dispatchEvent'])assert(!spec.includes(forbidden));
});
test('all new TypeScript files parse and transpile without syntax diagnostics',()=>{
  for(const name of ['prompt-timing-observer.ts','prompt-timing-driver.ts','prompt-timing.browser.spec.ts','prompt-timing.playwright.config.ts']){
    const result=ts.transpileModule(read(`./${name}`),{fileName:name,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,strict:true}});
    assert.deepEqual((result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[],name);
  }
});

test('fragment changes are followed by real reload before later-run readiness reads',()=>{const spec=read('./prompt-timing.browser.spec.ts'),goto=spec.indexOf('await page.goto(`/preview#'),reload=spec.indexOf('if(run.id>1)await page.reload();'),ready=spec.indexOf('await expect.poll(async()=>(await snapshot(page)).ready)');assert(goto>=0&&reload>goto&&ready>reload);assert.deepEqual(RUNS.map(run=>run.id),[1,2,3,4,5,6]);assert(spec.includes('expect(initial.timing).toMatchObject({mode:run.mode,runId:run.id'));});
