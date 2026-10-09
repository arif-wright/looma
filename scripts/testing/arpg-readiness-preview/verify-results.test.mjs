// Verifier schema tests; these never launch or impersonate executed browsers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TITLES, isExpectedConsoleError } from './cases.mjs';
import { SCREENSHOTS, verify } from './verify-results.mjs';
import { EXPECTED_STARTS } from './verify-observations.mjs';
import { EXPECTED_REWARD_MUTATIONS, expectedStart, FLOW_CAP_MS, SIGNATURE, validSign, validComplete } from './protocol.mjs';
const FILE = 'readiness.browser.spec.ts', PROJECT = 'chromium-arpg-readiness';
const image = Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), Buffer.alloc(101)]).toString('base64');
// Deliberately fabricated JSON shapes for verifier unit tests only. These never
// write browser-results.json or count as scene, asset or browser execution.
function report(mode = 'execution') {
  const execution = mode === 'execution';
  const specs = TITLES.map((title, index) => {
    const keys = Array.from({ length: 249 }, (_, i) => `key-${i}`);
    const game = { at: 1, area: 0, elapsed: 0, durationLimit: 90000, expeditionActive: false, outcome: 'preparing', returned: false, x: 0, y: 0, hp: 140, kills: 0 };
    const scene = { id: 1, queuedKeys: keys, decodedKeys: keys, missingKeys: [], createAt: 1, framesAfterCreate: 1, destroyed: false, loadErrors: [], loadComplete: true, gameplay: { ...game } };
    const scenes = [scene];
    if ([1, 2, 3, 9].includes(index)) {
      scenes.unshift({ ...structuredClone(scene), id: 0, createAt: null, destroyed: true, gameplay: null,
        loadErrors: index === 1 ? ['floor_0'] : [], missingKeys: index === 2 ? ['floor_0'] : [] });
    }
    if ([4, 5, 6, 7].includes(index)) { scene.destroyed = true; scene.createAt = null; scene.gameplay = null; }
    const api = Array.from({ length: EXPECTED_STARTS[index] }, () => ({ path: '/api/games/session/start', method: 'POST', at: 100, responseAt: 200, body: structuredClone(expectedStart) }));
    const state = { ready: true, profile: index === 10 ? 'return-flow' : 'readiness', blocked: [], rewardMutations: [], api, scenes, checkpoints: [], pages: [{ status: 'Town is untimed. Depart when you’re ready.' }] };
    const point = (label, at, starts, gameplay = { ...game }, createAt = 1) => ({ label, at, starts, scene: { ...structuredClone(scene), createAt, gameplay } });
    if (index === 0) {
      scene.gameplay = { ...game, area: 1, expeditionActive: true };
      state.pages[0].status = 'Expedition in progress. Return to town to save your result.';
      state.checkpoints = [point('assets-pending', 0, 0, null, null), point('town-ready', 10, 0), point('departure-pending', 150, 1), point('expedition-started', 210, 1, { ...scene.gameplay })];
    }
    if (index === 10) {
      state.rewardMutations = structuredClone(EXPECTED_REWARD_MUTATIONS);
      const beforeAt = 10000, idleAt = beforeAt + FLOW_CAP_MS + 1000, beganAt = idleAt + 1000;
      const returnedAt = beganAt + 1000, restedAt = returnedAt + FLOW_CAP_MS + 1000;
      api[0].at = idleAt + 500; api[0].responseAt = idleAt + 501;
      const active = { ...game, area: 1, expeditionActive: true, durationLimit: FLOW_CAP_MS };
      const returned = { ...game, elapsed: 500, returned: true, outcome: 'retreated', durationLimit: FLOW_CAP_MS };
      state.checkpoints = [point('town-before-idle', beforeAt, 0), point('town-after-idle', idleAt, 0), point('expedition-started', beganAt, 1, active), point('hero-moved', beganAt + 300, 1, { ...active, x: 30 }), point('returned-and-saved', returnedAt, 1, returned), point('returned-town-after-idle', restedAt, 1, returned)];
      scene.gameplay = returned;
      state.pages[0].status = 'Result saved. Town is untimed; depart again whenever you’re ready.';
      const signed = { sessionId: 'fixture-arpg-1', slug: 'arpg', nonce: 'nonce-fixture-arpg-1', score: 0, durationMs: 1000, clientVersion: '1.0.0' };
      const { slug: _slug, ...completion } = signed;
      api.push({ path: '/api/games/sign', method: 'POST', at: returnedAt - 10, body: signed },
        { path: '/api/games/session/complete', method: 'POST', at: returnedAt - 5, body: { ...completion, signature: SIGNATURE, success: true, stats: { mode: 'standard', expeditionDurationMs: 500 } } },
        { path: '/api/games/player/state', method: 'GET', at: returnedAt - 4 });
    }
    const observation = { browserVersion: '143.0.7499.4', blocked: [], errors: [], unexpectedConsoleErrors: [], cleanupErrors: [], consoleErrors: [], state,
      afterCleanup: { ...structuredClone(state), scenes: state.scenes.map(scene => ({ ...scene, destroyed: true })), canvasCount: 0, authCallbacks: 0, mountedPages: [] } };
    return { title, id: `case-${index}`, file: FILE, ok: true, tests: [{ projectId: PROJECT, projectName: PROJECT, expectedStatus: 'passed', annotations: [], status: execution ? 'expected' : 'skipped', results: execution ? [{ status: 'passed', retry: 0, errors: [], annotations: [], workerIndex: 0, startTime: '2026-10-09T00:00:00Z', duration: index === 10 ? 2 * FLOW_CAP_MS + 10000 : 30000,
      attachments: [{ name: 'arpg-real-engine-observations', contentType: 'application/json', body: Buffer.from(JSON.stringify(observation)).toString('base64') }, ...(SCREENSHOTS[index] ? [{ name: SCREENSHOTS[index], contentType: 'image/png', body: image }] : [])] }] : [] }] };
  });
  return { config: { version: '1.57.0', forbidOnly: true, workers: 1, shard: null, projects: [{ id: PROJECT, name: PROJECT, repeatEach: 1, retries: 0, testMatch: [FILE] }] }, errors: [], suites: [{ file: FILE, title: FILE, specs }], stats: { expected: execution ? TITLES.length : 0, skipped: execution ? 0 : TITLES.length, unexpected: 0, flaky: 0 } };
}
const first = r => r.suites[0].specs[0].tests[0];
const result = r => first(r).results[0];
const observation = (r, mutate, index = 0) => {
  const a=r.suites[0].specs[index].tests[0].results[0].attachments[0], value=JSON.parse(Buffer.from(a.body,'base64').toString());
  mutate(value);a.body=Buffer.from(JSON.stringify(value)).toString('base64');
};
// Keep the cleanup copy coherent for lifecycle/protocol corruption tests, so
// each rejection exercises its claimed gate rather than only snapshot equality.
const coherentObservation = (r, mutate, index = 0) => observation(r, value => {
  mutate(value);
  value.afterCleanup.api = structuredClone(value.state.api);
  value.afterCleanup.checkpoints = structuredClone(value.state.checkpoints);
  value.afterCleanup.rewardMutations = structuredClone(value.state.rewardMutations);
}, index);
test('accept exact synthetic execution shape',()=>assert.match(verify(report(),'execution'),/11 executed/));
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
  'too-short native town idle':r=>r.suites[0].specs[10].tests[0].results[0].duration=2*FLOW_CAP_MS-1,
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
  'cleanup API side effect':r=>observation(r,o=>o.afterCleanup.api.push({path:'/api/leaderboard/arpg/alltime',method:'GET',at:1000})),
  'duplicated decoded texture':r=>observation(r,o=>o.state.scenes[0].decodedKeys[1]=o.state.scenes[0].decodedKeys[0]),
  'fake small image set':r=>observation(r,o=>o.state.scenes[0].queuedKeys=['one']),
  'no frame':r=>observation(r,o=>o.state.scenes[0].framesAfterCreate=0),
  'missing decoded texture':r=>observation(r,o=>o.state.scenes[0].missingKeys=['floor_0']),
  'route never live':r=>observation(r,o=>o.state.pages=[]),
  'leaked canvas':r=>observation(r,o=>o.afterCleanup.canvasCount=1),
  'leaked Auth subscription':r=>observation(r,o=>o.afterCleanup.authCallbacks=1),
  'undestroyed scene':r=>observation(r,o=>o.afterCleanup.scenes[0].destroyed=false),
  'missing screenshot':r=>result(r).attachments.pop(),
  'non-PNG screenshot':r=>result(r).attachments[1].body='ZmFrZQ==',
  'inflated pass count':r=>r.stats.expected=TITLES.length+1,
  'skipped count':r=>r.stats.skipped=1,
  'start during pending assets':r=>coherentObservation(r,o=>o.state.checkpoints[0].starts=1),
  'expedition before response':r=>coherentObservation(r,o=>o.state.api[0].responseAt=1000),
  'autostart while town becomes ready':r=>coherentObservation(r,o=>o.state.checkpoints[1].starts=1),
  'missing departure checkpoint':r=>coherentObservation(r,o=>o.state.checkpoints.pop()),
  'hidden request body field':r=>coherentObservation(r,o=>o.state.api[0].body.leaked='no'),
  'loading retry creates session':r=>coherentObservation(r,o=>o.state.api.push({path:'/api/games/session/start',method:'POST',at:1,responseAt:2,body:expectedStart}),1),
  'flow with wrong profile':r=>coherentObservation(r,o=>o.state.profile='readiness',10),
  'flow without real movement':r=>coherentObservation(r,o=>o.state.checkpoints[3].scene.gameplay.x=0,10),
  'flow with short town idle':r=>coherentObservation(r,o=>o.state.checkpoints[1].at=10001,10),
  'flow with active town timer':r=>coherentObservation(r,o=>o.state.checkpoints[5].scene.gameplay.elapsed+=1,10),
  'flow with timeout instead of explicit return':r=>coherentObservation(r,o=>o.state.checkpoints[4].scene.gameplay.outcome='rescued',10),
  'flow with duplicate sign':r=>coherentObservation(r,o=>o.state.api.push({...o.state.api[1]}),10),
  'flow with invented reward':r=>coherentObservation(r,o=>o.state.rewardMutations[0].value.xpDelta=10,10),
  'flow with changed completion score':r=>coherentObservation(r,o=>o.state.api[2].body.score+=1,10),
  'flow with extra completion field':r=>coherentObservation(r,o=>o.state.api[2].body.account='unapproved',10),
  'flow with extra completion stats':r=>coherentObservation(r,o=>o.state.api[2].body.stats.unknown=true,10),
  'flow with missing receipt screenshot':r=>r.suites[0].specs[10].tests[0].results[0].attachments.pop(),
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


test('strict sign/completion schemas reject extra data and changed submission', () => {
  const sign = { sessionId: 'fixture-arpg-1', slug: 'arpg', nonce: 'nonce-fixture-arpg-1', score: 0, durationMs: 1000, clientVersion: '1.0.0' };
  const { slug: _slug, ...payload } = sign;
  const complete = { ...payload, signature: SIGNATURE, success: true, stats: { mode: 'standard', expeditionDurationMs: 500 } };
  assert(validSign(sign)); assert(validComplete(complete, sign));
  for (const value of [null, [], { ...sign, extra: true }, { ...sign, durationMs: FLOW_CAP_MS + 1 }, { ...sign, score: -1 }, { ...sign, sessionId: 'different' }]) assert(!validSign(value));
  for (const value of [null, [], { ...complete, slug: 'arpg' }, { ...complete, signature: 'other' }, { ...complete, score: 5 }, { ...complete, stats: { ...complete.stats, extra: true } }, { ...complete, stats: { ...complete.stats, expeditionDurationMs: 1001 } }]) assert(!validComplete(value, sign));
});
