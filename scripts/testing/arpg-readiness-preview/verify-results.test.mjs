// Verifier schema tests; these never launch or impersonate executed browsers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TITLES, isExpectedConsoleError } from './cases.mjs';
import { SCREENSHOTS, verify } from './verify-results.mjs';
const FILE = 'readiness.browser.spec.ts', PROJECT = 'chromium-arpg-readiness';
const image = Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), Buffer.alloc(101)]).toString('base64');
function report(mode = 'execution') {
  const execution = mode === 'execution';
  const specs = TITLES.map((title, index) => {
    const starts = [1,2,2,2,1,1,1,1,1,2][index];
    const keys = Array.from({length:249},(_,i)=>`key-${i}`);
    const scene = { queuedKeys:keys, decodedKeys:keys, missingKeys:[], createAt:1, framesAfterCreate:1, destroyed:false };
    const state = { ready:true, blocked:[], rewardMutations:[], api:Array.from({length:starts},()=>({path:'/api/games/session/start',method:'POST'})), scenes:[scene], pages:[{status:'Session live — survive and dash!'}] };
    const observation = { browserVersion:'143.0.7499.4', blocked:[], errors:[], unexpectedConsoleErrors:[], cleanupErrors:[], consoleErrors:[], state,
      afterCleanup:{...state, scenes:[{...scene,destroyed:true}], canvasCount:0, authCallbacks:0, mountedPages:[]} };
    return { title, id:`case-${index}`, file:FILE, ok:true, tests:[{ projectId:PROJECT, projectName:PROJECT, expectedStatus:'passed', annotations:[], status:execution?'expected':'skipped', results: execution ? [{status:'passed', retry:0, errors:[], annotations:[], workerIndex:0, startTime:'2026-10-09T00:00:00Z',duration:30_000,
      attachments:[{name:'arpg-real-engine-observations',contentType:'application/json',body:Buffer.from(JSON.stringify(observation)).toString('base64')}, ...(index<4?[{name:SCREENSHOTS[index],contentType:'image/png',body:image}]:[])]}] : [] }] };
  });
  return {config:{version:'1.57.0',forbidOnly:true,workers:1,shard:null,projects:[{id:PROJECT,name:PROJECT,repeatEach:1,retries:0,testMatch:[FILE]}]}, errors:[],suites:[{file:FILE,title:FILE,specs}],stats:{expected:execution?10:0,skipped:execution?0:10,unexpected:0,flaky:0}};
}
const first = r => r.suites[0].specs[0].tests[0];
const result = r => first(r).results[0];
const observation = (r, mutate) => {
  const a=result(r).attachments[0], value=JSON.parse(Buffer.from(a.body,'base64').toString());
  mutate(value);a.body=Buffer.from(JSON.stringify(value)).toString('base64');
};
test('accept exact synthetic execution shape',()=>assert.match(verify(report(),'execution'),/10 executed/));
test('discovery explicitly means zero execution',()=>assert.match(verify(report('discovery'),'discovery'),/ZERO executed/));
test('discovery cannot satisfy execution',()=>assert.throws(()=>verify(report('discovery'),'execution')));
test('execution cannot be relabeled discovery',()=>assert.throws(()=>verify(report(),'discovery')));
const mutations={
  'no cases':r=>r.suites[0].specs=[],
  'missing case':r=>r.suites[0].specs.pop(),
  'duplicate title':r=>r.suites[0].specs[1].title=TITLES[0],
  'duplicate id':r=>r.suites[0].specs[1].id='case-0',
  'wrong title':r=>r.suites[0].specs[0].title='unknown',
  'extra file':r=>r.suites.push(structuredClone(r.suites[0])),
  'wrong file':r=>r.suites[0].file='other.ts',
  'wrong project':r=>first(r).projectId='other',
  'extra project':r=>r.config.projects.push(structuredClone(r.config.projects[0])),
  'wrong Playwright':r=>r.config.version='1.56.0',
  'allow only':r=>r.config.forbidOnly=false,
  'retries configured':r=>r.config.projects[0].retries=1,
  'repeat configured':r=>r.config.projects[0].repeatEach=2,
  'sharded run':r=>r.config.shard={current:1,total:2},
  'expected failure':r=>first(r).expectedStatus='failed',
  'skip annotation':r=>first(r).annotations=[{type:'skip'}],
  'missing execution':r=>first(r).results=[],
  'failed result':r=>result(r).status='failed',
  'retried result':r=>result(r).retry=1,
  'second attempt':r=>first(r).results.push(structuredClone(result(r))),
  'runtime skip':r=>result(r).annotations=[{type:'skip'}],
  'hidden attempt error':r=>result(r).errors=[{message:'bad'}],
  'global error':r=>r.errors=[{message:'bad'}],
  'too-short native deadline':r=>r.suites[0].specs[3].tests[0].results[0].duration=100,
  'missing observations':r=>result(r).attachments.shift(),
  'unreviewed browser':r=>observation(r,o=>o.browserVersion='other'),
  'blocked network':r=>observation(r,o=>o.blocked=['external']),
  'page error':r=>observation(r,o=>o.errors=['engine error']),
  'unclassified console error':r=>observation(r,o=>o.consoleErrors=[{text:'engine error',url:'http://127.0.0.1:4281/assets/main.js'}]),
  'unexpected console error':r=>observation(r,o=>o.unexpectedConsoleErrors=['engine error']),
  'cleanup error':r=>observation(r,o=>o.cleanupErrors=['bad']),
  'missing runtime':r=>observation(r,o=>o.state=null),
  'reward mutation':r=>observation(r,o=>o.state.rewardMutations=[{}]),
  'settlement attempt':r=>observation(r,o=>o.state.api.push({path:'/api/games/session/complete',method:'POST'})),
  'automatic extra start':r=>observation(r,o=>o.state.api.push({path:'/api/games/session/start',method:'POST'})),
  'fake small image set':r=>observation(r,o=>o.state.scenes[0].queuedKeys=['one']),
  'no frame':r=>observation(r,o=>o.state.scenes[0].framesAfterCreate=0),
  'missing decoded texture':r=>observation(r,o=>o.state.scenes[0].missingKeys=['floor_0']),
  'route never live':r=>observation(r,o=>o.state.pages=[]),
  'leaked canvas':r=>observation(r,o=>o.afterCleanup.canvasCount=1),
  'leaked Auth subscription':r=>observation(r,o=>o.afterCleanup.authCallbacks=1),
  'undestroyed scene':r=>observation(r,o=>o.afterCleanup.scenes[0].destroyed=false),
  'missing screenshot':r=>result(r).attachments.pop(),
  'non-PNG screenshot':r=>result(r).attachments[1].body='ZmFrZQ==',
  'inflated pass count':r=>r.stats.expected=11,
  'skipped count':r=>r.stats.skipped=1,
  'flaky count':r=>r.stats.flaky=1
};
for(const [name,mutate] of Object.entries(mutations))test(`reject ${name}`,()=>{const value=report();mutate(value);assert.throws(()=>verify(value,'execution'));});

test('console allowlist is limited to exact injected failures in their own cases',()=>{
 const http={text:'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',url:'http://127.0.0.1:4281/games/arpg/tiles/ground_stone1.png'};
 const decode={text:'Failed to process file: %s "%s" image floor_0',url:'http://127.0.0.1:4281/assets/main.js'};
 assert(isExpectedConsoleError(TITLES[1],http));assert(isExpectedConsoleError(TITLES[2],decode));
 assert(!isExpectedConsoleError(TITLES[0],http));assert(!isExpectedConsoleError(TITLES[0],decode));
 assert(!isExpectedConsoleError(TITLES[1],{...http,url:'https://foreign.example/games/arpg/tiles/ground_stone1.png'}));
 assert(!isExpectedConsoleError(TITLES[2],{...decode,text:'Failed to process file: %s "%s" image floor_1'}));
});
