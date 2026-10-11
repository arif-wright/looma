import { readFileSync } from 'node:fs';
import { WAYPOINT_TOLERANCE, WAYPOINT_DEADLINE_MS, NAVIGATION_PHASES, waypointKeys, waypointPulse, waypointStep, waypointCorrection, chordEnvelope, safeChordEnvelope, chordEndpointAllowed } from './plaza-navigation.mjs';
import { fabricatePlazaSchema } from './schema-plaza-data.mjs';
import { FOOTPRINTS, sweptDistance, roomAllows, plazaObjectsIssues, plazaGeometryIssues, PLAZA_KEYS } from './plaza-contract.mjs';
// Verifier schema tests; these never launch or impersonate executed browsers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TITLES, isExpectedConsoleError } from './cases.mjs';
import { scanAlphaBounds } from './alpha-bounds.mjs';
import { verify } from './verify-results.mjs';
import { DESKTOP_TOWN_SCREENSHOT, PHONE_TOWN_SCREENSHOT, requiredScreenshots } from './screenshots.mjs';
import { EXPECTED_STARTS } from './verify-observations.mjs';
import { EXPECTED_REWARD_MUTATIONS, expectedStart, FLOW_CAP_MS, SIGNATURE, validSign, validComplete } from './protocol.mjs';
const FILE = 'readiness.browser.spec.ts', PROJECT = 'chromium-arpg-readiness';
const image = Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), Buffer.alloc(101)]).toString('base64');
// Deliberately fabricated JSON shapes for verifier unit tests only. These never
// write browser-results.json or count as scene, asset or browser execution.
function report(mode = 'execution') {
  const execution = mode === 'execution';
  const specs = TITLES.map((title, index) => {
    const keys = [...Array.from({ length: 249 }, (_, i) => `key-${i}`), 'town_cobble_material_v1', 'town_corner_shop_v1', 'town_corner_lantern_v1', 'town_ruins_entrance_v1', ...PLAZA_KEYS];
    const artObject = (key, y, depth, originX = 0.5, originY = 0.5) => ({ key, x: 100, y, depth, originX, originY, scaleX: 1, scaleY: 1, displayWidth: 100, displayHeight: 100 });
    const townArt = { hero: { ...artObject('hero-idle', 536, 556), x: 1472 }, objects: [
      { ...artObject('town_ground_plane_v1', -168, -161, 0, 0), x: 128, scaleX: 2, scaleY: 2, displayWidth: 2688, displayHeight: 1344 },
      artObject('town_corner_shop_v1', 700, 720, 618 / 1254, 1175 / 1254), artObject('town_corner_lantern_v1', 600, 620),
      { ...artObject('town_ruins_entrance_v1', 664, 684, 666 / 1536, 826 / 1024), x: 1728, scaleX: 110 / 780, scaleY: 110 / 780 }
    ], ground: { legacyFloorCount: 0, legacyWallCount: 0,
      perimeter: [{ objectId: 100, depth: -160, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, active: true, visible: true }], largeMarkerCount: 0, textureWidth: 1344, textureHeight: 672, filterMode: 0,
      samples: Array.from({ length: 5 }, (_, index) => ({ worldX: 1472 + index * 64, worldY: 536 + index * 32, pixelX: 672 + index * 32, pixelY: 352 + index * 16, alpha: 255 })) } };
    const viewportGeometry = {
      canvas: { width: 358, height: 500 },
      camera: { x: 0, y: 0, width: 358, height: 500, zoom: 0.7, scrollX: 1000, scrollY: 300, matrix: [0.3, 0, 0, 0.3, 125.3, 70] },
      hud: { x: 8, y: 8, width: 342, height: 44 }, controls: { x: 8, y: 438, width: 342, height: 54 },
      hudItems: [{ name: 'score', bounds: { x: 16, y: 13, width: 100, height: 14 } }, { name: 'hp', bounds: { x: 16, y: 33, width: 60, height: 12 } }, { name: 'area', bounds: { x: 148, y: 33, width: 80, height: 12 } }],
      controlItems: [{ name: 'status', bounds: { x: 16, y: 443, width: 160, height: 13 } }, { name: 'primary', bounds: { x: 16, y: 463, width: 90, height: 20 } }],
      heroGround: { x: 120, y: 250 }, shop: { x: 180, y: 100, width: 120, height: 120 }, entrance: { x: 240, y: 240, width: 100, height: 100 }, entranceLabel: { x: 245, y: 345, width: 94, height: 20 },
      heroVisible: { textureKey: 'hero-idle', alphaThreshold: 32, frameWidth: 256, frameHeight: 256, sourceBounds: { x: 110, y: 100, width: 30, height: 50, opaquePixels: 700 }, screenBounds: { x: 110, y: 220, width: 18, height: 32 } },
      entranceVisible: { textureKey: 'town_ruins_entrance_v1', alphaThreshold: 32, frameWidth: 1536, frameHeight: 1024, sourceBounds: { x: 395, y: 155, width: 819, height: 781, opaquePixels: 200000 }, screenBounds: { x: 250, y: 250, width: 80, height: 80 } }
    };
    const game = { viewportGeometry, at: 1, area: 0, elapsed: 0, durationLimit: 90000, expeditionActive: false, outcome: 'preparing', returned: false, x: 1472, y: 536, hp: 140, kills: 0, townArt };
    const scene = { id: 1, queuedKeys: keys, decodedKeys: keys, missingKeys: [], createAt: 1, framesAfterCreate: 1, destroyed: false, loadErrors: [], loadComplete: true, gameplay: { ...game } };
    const scenes = [scene];
    if ([1, 2, 3, 9].includes(index)) {
      scenes.unshift({ ...structuredClone(scene), id: 0, createAt: null, destroyed: true, gameplay: null,
        loadErrors: index === 1 ? ['floor_0'] : [], missingKeys: index === 2 ? ['floor_0'] : [] });
    }
    if ([4, 5, 6, 7].includes(index)) { scene.destroyed = true; scene.createAt = null; scene.gameplay = null; }
    const api = Array.from({ length: EXPECTED_STARTS[index] }, () => ({ path: '/api/games/session/start', method: 'POST', at: 100, responseAt: 200, body: structuredClone(expectedStart) }));
    const state = { ready: true, profile: index === 10 ? 'return-flow' : 'readiness', blocked: [], rewardMutations: [], api, scenes, checkpoints: [], visuals: [], pages: [{ status: 'Town is untimed. Depart when you’re ready.' }] };
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
      state.checkpoints = [point('town-before-idle', beforeAt, 0), point('town-after-idle', idleAt, 0), point('expedition-started', beganAt, 1, active), point('hero-moved', beganAt + 300, 1, { ...active, x: 1502 }), point('returned-and-saved', returnedAt, 1, returned), point('returned-town-after-idle', restedAt, 1, returned)];
      scene.gameplay = returned;
      state.pages[0].status = 'Result saved. Town is untimed; depart again whenever you’re ready.';
      const signed = { sessionId: 'fixture-arpg-1', slug: 'arpg', nonce: 'nonce-fixture-arpg-1', score: 0, durationMs: 1000, clientVersion: '1.0.0' };
      const { slug: _slug, ...completion } = signed;
      api.push({ path: '/api/games/sign', method: 'POST', at: returnedAt - 10, body: signed },
        { path: '/api/games/session/complete', method: 'POST', at: returnedAt - 5, body: { ...completion, signature: SIGNATURE, success: true, stats: { mode: 'standard', expeditionDurationMs: 500 } } },
        { path: '/api/games/player/state', method: 'GET', at: returnedAt - 4 });
    }
    if ([10, 11].includes(index)) {
      const viewport = index === 11 ? { width: 390, height: 844 } : { width: 1280, height: 900 };
      state.visuals = [{ label: index === 11 ? PHONE_TOWN_SCREENSHOT : DESKTOP_TOWN_SCREENSHOT, at: 9000, starts: 0, viewport,
        documentWidth: viewport.width, canvas: { x: 16, y: 160, width: viewport.width - 32, height: index === 11 ? 500 : 200, pixelWidth: viewport.width - 32, pixelHeight: index === 11 ? 500 : 200 },
        scene: { ...structuredClone(scene), gameplay: structuredClone(game) } }];
    }
    if (index >= 12) fabricatePlazaSchema(state, scene, game, index);
    const observation = { browserVersion: '143.0.7499.4', blocked: [], errors: [], unexpectedConsoleErrors: [], cleanupErrors: [], consoleErrors: [], state,
      afterCleanup: { ...structuredClone(state), scenes: state.scenes.map(scene => ({ ...scene, destroyed: true })), canvasCount: 0, authCallbacks: 0, mountedPages: [] } };
    return { title, id: `case-${index}`, file: FILE, ok: true, tests: [{ projectId: PROJECT, projectName: PROJECT, expectedStatus: 'passed', annotations: [], status: execution ? 'expected' : 'skipped', results: execution ? [{ status: 'passed', retry: 0, errors: [], annotations: [], workerIndex: 0, startTime: '2026-10-09T00:00:00Z', duration: index === 10 ? 2 * FLOW_CAP_MS + 10000 : 30000,
      attachments: [{ name: 'arpg-real-engine-observations', contentType: 'application/json', body: Buffer.from(JSON.stringify(observation)).toString('base64') }, ...requiredScreenshots(index).map(name => ({ name, contentType: 'image/png', body: image }))] }] : [] }] };
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
  value.afterCleanup.visuals = structuredClone(value.state.visuals);
}, index);
test('accept exact synthetic execution shape',()=>assert.match(verify(report(),'execution'),/14 executed/));
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
  'flow without real movement':r=>coherentObservation(r,o=>o.state.checkpoints[3].scene.gameplay.x=1472,10),
  'flow with short town idle':r=>coherentObservation(r,o=>o.state.checkpoints[1].at=10001,10),
  'flow with active town timer':r=>coherentObservation(r,o=>o.state.checkpoints[5].scene.gameplay.elapsed+=1,10),
  'flow with timeout instead of explicit return':r=>coherentObservation(r,o=>o.state.checkpoints[4].scene.gameplay.outcome='rescued',10),
  'flow with duplicate sign':r=>coherentObservation(r,o=>o.state.api.push({...o.state.api[1]}),10),
  'flow with invented reward':r=>coherentObservation(r,o=>o.state.rewardMutations[0].value.xpDelta=10,10),
  'flow with changed completion score':r=>coherentObservation(r,o=>o.state.api[2].body.score+=1,10),
  'flow with extra completion field':r=>coherentObservation(r,o=>o.state.api[2].body.account='unapproved',10),
  'flow with extra completion stats':r=>coherentObservation(r,o=>o.state.api[2].body.stats.unknown=true,10),
  'flow with missing receipt screenshot':r=>r.suites[0].specs[10].tests[0].results[0].attachments.splice(1,1),
  'missing desktop art screenshot':r=>r.suites[0].specs[10].tests[0].results[0].attachments.pop(),
  'missing phone art screenshot':r=>r.suites[0].specs[11].tests[0].results[0].attachments.pop(),
  'missing phone geometry evidence':r=>coherentObservation(r,o=>o.state.visuals=[],11),
  'wrong phone viewport':r=>coherentObservation(r,o=>o.state.visuals[0].viewport.width=1280,11),
  'phone page overflow':r=>coherentObservation(r,o=>o.state.visuals[0].documentWidth=391,11),
  'phone canvas overflow':r=>coherentObservation(r,o=>o.state.visuals[0].canvas.width=400,11),
  'empty phone canvas':r=>coherentObservation(r,o=>o.state.visuals[0].canvas.pixelWidth=0,11),
  'phone autostart':r=>coherentObservation(r,o=>o.state.visuals[0].starts=1,11),
  'undecoded town art':r=>coherentObservation(r,o=>o.state.visuals[0].scene.decodedKeys.pop(),11),
  'missing instantiated shop':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.objects.splice(1,1),11),
  'wrong shop foot anchor':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.objects[1].originY=1,11),
  'floor drawn over hero':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.objects[0].depth=9999,11),
  'phone geometry missing':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry=null,11),
  'phone HUD beyond canvas':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.hud.width=440,11),
  'phone controls beyond canvas':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.controls.y=510,11),
  'phone HUD text beyond panel':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.hudItems[0].bounds.width=440,11),
  'phone control text beyond panel':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.controlItems[0].bounds.width=440,11),
  'phone missing actual control text':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.controlItems=[],11),
  'phone hero under HUD':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.heroGround.y=30,11),
  'phone hero under controls':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.heroGround.y=450,11),
  'phone hero outside canvas':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.heroGround.x=-5,11),
  'phone shop clipped sideways':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.shop.x=340,11),
  'phone shop behind HUD':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.shop.y=44,11),
  'phone shop behind controls':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.shop.height=400,11),
  'phone camera transform missing':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.camera.matrix=[],11),
  'phone geometry canvas mismatch':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.canvas.width=360,11),
  'missing continuous ground observation':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.ground=null,11),
  'town legacy floor tiles remain':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.ground.legacyFloorCount=1,11),
  'town oversized markers remain':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.ground.largeMarkerCount=1,11),
  'wrong derived ground resolution':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.ground.textureWidth=512,11),
  'ground plane wrong extent':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.objects[0].displayWidth=512,11),
  'ground plane wrong position':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.objects[0].x+=1,11),
  'missing ground path sample':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.ground.samples.pop(),11),
  'transparent ground at gate':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.ground.samples[4].alpha=0,11),
  'unsampled derived canvas':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.ground.samples[0].alpha=null,11),
  'incorrect sample texture coordinate':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.ground.samples[0].pixelX+=1,11),
  'entrance moved off gate':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.objects[3].x+=1,11),
  'entrance wrong foot anchor':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.objects[3].originY=1,11),
  'entrance wrong scale':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.objects[3].scaleX=1,11),
  'phone entrance missing':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.entrance=null,11),
  'phone entrance clipped':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.entrance.x=350,11),
  'phone entrance covered by controls':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.entrance.y=430,11),
  'phone gate label missing':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.entranceLabel=null,11),
  'phone gate label clipped':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.entranceLabel.x=350,11),
  'phone gate label covered by controls':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.entranceLabel.y=450,11),
  'returned town missing ground':r=>coherentObservation(r,o=>o.state.checkpoints[4].scene.gameplay.townArt.ground=null,10),
  'returned town duplicate ground':r=>coherentObservation(r,o=>o.state.checkpoints[5].scene.gameplay.townArt.objects.push({...o.state.checkpoints[5].scene.gameplay.townArt.objects[0]}),10),
  'published short portrait canvas':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.canvas.height=280,11),
  'phone hero silhouette missing':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.heroVisible=null,11),
  'phone hero silhouette too short':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.heroVisible.screenBounds.height=14,11),
  'phone hero silhouette too narrow':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.heroVisible.screenBounds.width=8,11),
  'phone alpha includes transparent padding':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.heroVisible.alphaThreshold=0,11),
  'phone visible hero behind HUD':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.heroVisible.screenBounds.y=30,11),
  'phone entrance silhouette too small':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.entranceVisible.screenBounds.height=39,11),
  'phone missing source frame dimensions':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.heroVisible.frameWidth=null,11),
  'ground nearest texture filter':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.townArt.ground.filterMode=1,11),
  'returned ground nearest texture filter':r=>coherentObservation(r,o=>o.state.checkpoints[4].scene.gameplay.townArt.ground.filterMode=1,10),
  'swapped measured hero texture':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.heroVisible.textureKey='town_corner_shop_v1',11),
  'swapped measured entrance texture':r=>coherentObservation(r,o=>o.state.visuals[0].scene.gameplay.viewportGeometry.entranceVisible.textureKey='town_corner_shop_v1',11),
  'desktop capture after departure':r=>coherentObservation(r,o=>o.state.visuals[0].at=o.state.api[0].at+1,10),
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


test('alpha bounds exclude transparent frame padding', () => {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 2; y < 6; y++) for (let x = 3; x < 5; x++) data[(y * 8 + x) * 4 + 3] = 255;
  assert.deepEqual(scanAlphaBounds(data, 8, 8), { x: 3, y: 2, width: 2, height: 4, opaquePixels: 8 });
});
test('alpha bounds use the documented alpha32 threshold', () => {
  const data = new Uint8ClampedArray(3 * 4); data[3] = 31; data[7] = 32; data[11] = 0;
  assert.deepEqual(scanAlphaBounds(data, 3, 1), { x: 1, y: 0, width: 1, height: 1, opaquePixels: 1 });
});
test('transparent decoded frame cannot supply visible bounds', () => assert.equal(scanAlphaBounds(new Uint8ClampedArray(16), 2, 2), null));
test('invalid alpha buffers fail closed', () => assert.throws(() => scanAlphaBounds(new Uint8ClampedArray(15), 2, 2)));

// Additive corruption gates for real-input exploration evidence. Each mutation
// keeps cleanup copies coherent, rather than failing an unrelated snapshot check.
const plazaMutations = {
  'plaza settled checkpoint still holds movement key': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.intent={x:1,y:0},
  'plaza initial entrance opacity changed': o=>o.state.checkpoints.find(p=>p.label==='plaza-home').scene.gameplay.townArt.objects.find(a=>a.key==='town_ruins_entrance_v1').alpha=.28,
  'plaza checkpoint reuses stale geometry': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plazaProbe=structuredClone(o.state.checkpoints.find(p=>p.label==='rear-side-dash-blocked').scene.gameplay.plazaProbe),
  'plaza probe precedes request': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plazaProbe.requestedAt+=100,
  'plaza missing explicit probe': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plazaProbe=null,
  'plaza never exercises entrance cutaway on east approach': o=>o.state.checkpoints.find(p=>p.label==='gate-east-approach').scene.gameplay.townArt.objects.find(a=>a.key==='town_ruins_entrance_v1').alpha=1,
  'plaza opaque entrance at threshold': o=>o.state.checkpoints.find(p=>p.label==='gate-arrived').scene.gameplay.townArt.objects.find(a=>a.key==='town_ruins_entrance_v1').alpha=1,
  'plaza entrance fails to restore on return': o=>o.state.checkpoints.find(p=>p.label==='plaza-returned-owned').scene.gameplay.townArt.objects.find(a=>a.key==='town_ruins_entrance_v1').alpha=.28,
  'plaza missing native checkpoint': o=>o.state.checkpoints.splice(6,1),
  'plaza missing movement trace': o=>o.state.plazaMotion=[],
  'plaza trace overflow': o=>o.state.plazaMotionOverflow=true,
  'plaza trace through rear foundation': o=>{const t=o.state.plazaMotion.find(t=>t.x===1368&&t.y===411);t.y=320;},
  'plaza walk input never reaches real scene': o=>o.state.plazaMotion.forEach(t=>t.intent={x:0,y:0}),
  'plaza dash cooldown never activates': o=>o.state.plazaMotion.forEach(t=>t.dash.cd=0),
  'plaza dash wrong native direction': o=>o.state.plazaMotion.filter(t=>t.dash.cd>=600).forEach(t=>t.dash.lastDir={x:0,y:1}),
  'plaza checkpoint without trace frame': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.at+=.5,
  'plaza premature expedition clock': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.elapsed=1,
  'plaza missing owned facade': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plaza.pop(),
  'plaza duplicated owner id': o=>{const a=o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plaza;a[1].objectId=a[0].objectId;},
  'plaza wrong facade pivot': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plaza[1].originX=.5,
  'plaza wrong facade contact': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plaza[1].x+=1,
  'plaza facade nonuniform scaling': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plaza[1].scaleX=.49,
  'plaza translucent solid foundation': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plaza[1].alpha=.28,
  'plaza opaque cutaway hides hero': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plaza[2].alpha=1,
  'plaza cutaway not restored': o=>o.state.checkpoints.find(p=>p.label==='rear-front-restored').scene.gameplay.plaza[2].alpha=.28,
  'plaza lifted above original depth': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plaza[2].depth=5000,
  'plaza split foundation upper depths': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plaza[1].depth-=1,
  'plaza hidden hero scale change': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.townArt.hero.scaleX=.8,
  'plaza zoom down to fit architecture': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.viewportGeometry.camera.zoom-=.01,
  'plaza tiny hero alpha hull': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.viewportGeometry.heroVisible.screenBounds.height=5,
  'plaza missing source-alpha visibility': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plazaVisibility=null,
  'plaza foreground completely obscures hero': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plazaVisibility.readable=0,
  'plaza foreground overly dims hero': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.plazaVisibility.meanTransmission=.1,
  'plaza hero behind HUD': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.viewportGeometry.heroVisible.screenBounds.y=30,
  'plaza exploration camera does not follow': o=>o.state.checkpoints.find(p=>p.label==='rear-back-cutaway').scene.gameplay.viewportGeometry.heroGround.x=80,
  'plaza east gate label clipped': o=>o.state.checkpoints.find(p=>p.label==='gate-east-approach').scene.gameplay.viewportGeometry.entranceLabel.x=-20,
  'plaza south entrance under HUD': o=>o.state.checkpoints.find(p=>p.label==='gate-south-approach').scene.gameplay.viewportGeometry.entrance.y=30,
  'plaza missed actual gate approach': o=>o.state.checkpoints.find(p=>p.label==='gate-arrived').scene.gameplay.x=1472,
  'plaza departed facade leaked': o=>o.state.checkpoints.find(p=>p.label==='plaza-departed').scene.gameplay.plaza=[{}],
  'plaza returned old image ownership': o=>{o.state.checkpoints.find(p=>p.label==='plaza-returned-owned').scene.gameplay.plaza[0].objectId=o.state.checkpoints.find(p=>p.label==='plaza-home').scene.gameplay.plaza[0].objectId;},
  'plaza returned cutaway not reset': o=>o.state.checkpoints.find(p=>p.label==='plaza-returned-owned').scene.gameplay.plaza[2].alpha=.28,
  'plaza unbounded expedition': o=>o.state.checkpoints.find(p=>p.label==='plaza-departed').scene.gameplay.durationLimit=90000,
  'plaza extra settlement request': o=>o.state.api.push(structuredClone(o.state.api[1])),
  'plaza missing exploration screenshot observation': o=>o.state.visuals.pop(),
  'plaza capture from another checkpoint': o=>o.state.visuals[0].scene.gameplay.x+=1,
  'plaza wrong phone viewport': o=>o.state.visuals[0].viewport.width=1280,
};
for(const [name,mutate] of Object.entries(plazaMutations))test(`reject ${name}`,()=>{
  const r=report();coherentObservation(r,o=>{mutate(o);o.afterCleanup.plazaMotion=structuredClone(o.state.plazaMotion);o.afterCleanup.plazaMotionOverflow=o.state.plazaMotionOverflow;},13);
  assert.throws(()=>verify(r,'execution'));
});
test('independent sweep rejects tunneling with both endpoints clear',()=>{
  for(const [a,b,id]of [[[1368,411],[1368,181],'rear'],[[1200,260],[1430,260],'rear'],[[1640,260],[1640+230*Math.SQRT1_2,260+230*Math.SQRT1_2],'endcap']]){
    assert(sweptDistance(a,a,FOOTPRINTS[id])>38);assert(sweptDistance(b,b,FOOTPRINTS[id])>38);
    assert(sweptDistance(a,b,FOOTPRINTS[id])<38);assert(roomAllows(a)&&roomAllows(b));
  }
});
test('independent sweep distinguishes tangent radius from centerline crossing',()=>{
  assert.equal(sweptDistance([1200,260],[1430,260],FOOTPRINTS.rear),12);
  assert.equal(sweptDistance([1368,411],[1368,181],FOOTPRINTS.rear),0);
});
test('independent footprint route preserves spawn to original gate',()=>assert(Object.values(FOOTPRINTS).every(p=>sweptDistance([1472,536],[1728,664],p)>38)));

for(const fps of [15,30,60])test(`native steering converges at${fps}fps without physics or clock changes`,()=>{
  const position={x:1472,y:536};
  for(const [x,y] of Object.values(NAVIGATION_PHASES).flat()){
    let steps=0;
    for(;steps<fps*6;steps++){
      const keys=waypointKeys(position,x,y);if(!keys.length)break;
      const dx=Number(keys.includes('d'))-Number(keys.includes('a')),dy=Number(keys.includes('s'))-Number(keys.includes('w')),length=Math.hypot(dx,dy);
      const before=[position.x,position.y];position.x+=dx/length*220/fps;position.y+=dy/length*220/fps;
      assert(Object.values(FOOTPRINTS).every(p=>sweptDistance(before,[position.x,position.y],p)>38));
    }
    assert(steps<fps*6,'Steering cannot oscillate forever around a waypoint');
    assert(Math.abs(position.x-x)<=WAYPOINT_TOLERANCE&&Math.abs(position.y-y)<=WAYPOINT_TOLERANCE);
  }
});
test('all route segments preserve radius38 with independent8px endpoint errors',()=>{
  let before=[1472,536],minimum=Infinity;
  for(const after of Object.values(NAVIGATION_PHASES).flat()){
    for(const ax of[-8,8])for(const ay of[-8,8])for(const bx of[-8,8])for(const by of[-8,8]){
      minimum=Math.min(minimum,...Object.values(FOOTPRINTS).map(poly=>sweptDistance([before[0]+ax,before[1]+ay],[after[0]+bx,after[1]+by],poly)));
    }
    before=after;
  }
  assert(minimum>41);
});

const hostedReplay=JSON.parse(readFileSync(new URL('./plaza-feedback-replay.json',import.meta.url),'utf8'));
test('hosted trace records held input after first in-tolerance frame',()=>{
 const excerpt=hostedReplay.first_leg_excerpt,first=excerpt.find(p=>Math.abs(p.x-1368)<=8),released=excerpt.find(p=>p.intent.x===0);
 assert(first&&released);assert(released.at-first.at>300);assert(Math.abs(released.x-1368)>8);
 assert.equal(hostedReplay.provenance.run_id,38092384077);
});
// Discrete update replay. Only update boundaries inside a native key interval
// move the actor; a pulse wholly between boundaries causes zero movement.
// This is a hypothetical scheduling model, not browser execution or a claim
// that the second hosted run missed input (its command-level trace did not).
function replayPulses(steps,phase,readLag,cooldownFrames=0){
 const p={x:1472,y:536};let clock=0,next=phase,frame=0,misses=0,zero=0,maxLeg=0;
 const advance=(until,key)=>{
  let moved=0;
  while(next<=until){
   const step=steps[Math.min(frame,steps.length-1)];
   const distance=frame<cooldownFrames?220/60:step.distance;
   if(key){
    const before=[p.x,p.y];
    p.x+=(key==='d'?1:key==='a'?-1:0)*distance;
    p.y+=(key==='s'?1:key==='w'?-1:0)*distance;
    assert(Object.values(FOOTPRINTS).every(poly=>sweptDistance(before,[p.x,p.y],poly)>38));
    assert(roomAllows([p.x,p.y]));moved++;
   }
   next+=step.dt;frame++;
  }
  clock=until;return moved;
 };
 for(const[x,y]of Object.values(NAVIGATION_PHASES).flat()){
  const started=clock;let pulses=0;misses=0;advance(clock+readLag,null);
  while(waypointPulse(p,x,y)){
   assert(++pulses<500,'Native steering must converge without growing its target');
   const pulse=waypointPulse(p,x,y,misses);
   advance(clock+readLag,null); // command overhead, no held movement
   if(advance(clock+pulse.delay,pulse.key))misses=0;else{misses++;zero++;}
   const released={...p};advance(clock+readLag,null);assert.deepEqual(p,released);
  }
  assert(Math.abs(p.x-x)<=8&&Math.abs(p.y-y)<=8);
  maxLeg=Math.max(maxLeg,clock-started);
 }
 return {zero,maxLeg,clock};
}
for(const feedbackLag of[0,160,315,500])test(`release-before-feedback pulses tolerate${feedbackLag}ms neutral read lag on hosted47ms cadence`,()=>{
 for(const phase of[0,1,16,31,47])replayPulses(hostedReplay.moving_frame_steps,phase,feedbackLag);
 // This checks finite convergence only. Arbitrarily slow calls may still fail
 // the unchanged real deadline; the model never changes the browser clock.
});
const boundedReplay=hostedReplay.bounded_pulse_failure;
test('second hosted trace establishes overhead without claiming missed input',()=>{
 assert.equal(boundedReplay.provenance.run_id,38093516123);
 assert.equal(boundedReplay.cases.desktop.pulse_count,7);
 assert.equal(boundedReplay.cases.phone.pulse_count,57);
 for(const c of Object.values(boundedReplay.cases))assert.equal(c.zero_movement_pulses,0);
 assert(boundedReplay.cases.desktop.median_cycle_ms>890);
 assert(boundedReplay.cases.phone.median_cycle_ms>290);
 assert(boundedReplay.cases.desktop.presses.slice(0,3).every(p=>p.delay===64&&Math.abs(p.distance-22/3)<1e-6));
});
test('a final released in-target position succeeds before checking elapsed deadline',()=>{
 const c=boundedReplay.cases.phone;
 assert.equal(waypointStep(c.final_neutral,...c.target,WAYPOINT_DEADLINE_MS+1),null);
 const d=boundedReplay.cases.desktop;
 assert.throws(()=>waypointStep(d.final_neutral,...d.target,WAYPOINT_DEADLINE_MS),/Native route stalled/);
});
test('bounded pulses retain target and limit only after actually missed updates',()=>{
 assert.equal(waypointPulse({x:0,y:0},8,8),null);
 assert.equal(waypointPulse({x:0,y:0},1000,0).delay,240);
 assert.equal(waypointPulse({x:0,y:0},30,0).delay,16);
 assert.equal(waypointPulse({x:0,y:0},30,0,1).delay,32);
 assert.equal(waypointPulse({x:0,y:0},30,0,99).delay,48);
 assert.equal(waypointPulse({x:0,y:0},9,0,99).delay,16);
});
for(const name of['desktop','phone'])for(const lag of(name==='desktop'?[63,126,190]:[21,42,70]))test(`phase-aware${name} replay with${lag}ms call overhead preserves deadline and solid sweeps`,()=>{
 const c=boundedReplay.cases[name];
 for(const cooldown of(name==='desktop'?[40,46,60]:[0]))for(const phase of[0,1,16,31,47,63]){
  // Desktop's last confirmed target-clamped move and first smoothed move
  // bracket the remaining startup cooldown.40 frames fits the observed interval;46 brackets it conservatively,
  // and60 covers navigation beginning earlier after fewer reads. This is
  // an explicit model assumption, not a measured raw engine delta history.
  const result=replayPulses(c.moving_frame_steps,phase,lag,cooldown);
  assert(result.zero>0,'Replay must exercise pulses missed between frames');
  assert(result.maxLeg<WAYPOINT_DEADLINE_MS);
  assert(result.clock<140_000,'Leave room within180s for checkpoints/return');
 }
});
test('a pulse wholly between two real update boundaries produces no displacement',()=>{
 const period=boundedReplay.cases.desktop.median_frame_ms;
 assert(period>63);assert(16<period);
 const frames=[0,period,period*2],start=20,end=36;
 assert.equal(frames.filter(at=>at>=start&&at<end).length,0);
});

test('reject missing gate-arrival screenshot independently of existing17 images',()=>{
 const r=report(),result=r.suites[0].specs[13].tests[0].results[0];
 result.attachments=result.attachments.filter(a=>a.name!=='phone-plaza-gate-arrived');
 assert.throws(()=>verify(r,'execution'));
});

const perimeterPoint=(o,label='perimeter-wall-blocked')=>o.state.checkpoints.find(p=>p.label===label);
const perimeterMutations={
 'missing required perimeter approach':o=>o.state.checkpoints=o.state.checkpoints.filter(p=>p.label!=='perimeter-ready'),
 'missing owned continuous rim':o=>perimeterPoint(o).scene.gameplay.townArt.ground.perimeter=[],
 'duplicate continuous rim':o=>{const a=perimeterPoint(o).scene.gameplay.townArt.ground.perimeter;a.push(structuredClone(a[0]));},
 'rim painted over feet':o=>perimeterPoint(o).scene.gameplay.townArt.ground.perimeter[0].depth=100,
 'rim scaled off blocked ring':o=>perimeterPoint(o).scene.gameplay.townArt.ground.perimeter[0].scaleY=.9,
 'legacy isolated wall sprites remain':o=>perimeterPoint(o).scene.gameplay.townArt.ground.legacyWallCount=1,
 'returned rim reuses destroyed owner':o=>perimeterPoint(o,'plaza-returned-owned').scene.gameplay.townArt.ground.perimeter[0].objectId=perimeterPoint(o,'plaza-home').scene.gameplay.townArt.ground.perimeter[0].objectId,
 'perimeter key never reaches scene':o=>{const a=perimeterPoint(o,'perimeter-ready'),b=perimeterPoint(o);o.state.plazaMotion.filter(t=>t.at>a.at&&t.at<=b.at).forEach(t=>t.intent={x:0,y:0});},
 'perimeter feet hidden':o=>perimeterPoint(o).scene.gameplay.plazaVisibility.readable=0,
};
for(const[name,mutate]of Object.entries(perimeterMutations))test(`reject ${name}`,()=>{
 const r=report();coherentObservation(r,o=>{mutate(o);o.afterCleanup.plazaMotion=structuredClone(o.state.plazaMotion);},13);
 assert.throws(()=>verify(r,'execution'));
});
for(const index of[12,13])test(`reject old19-capture report missing ${index===12?'desktop':'phone'} perimeter image`,()=>{
 const r=report(),result=r.suites[0].specs[index].tests[0].results[0];
 result.attachments=result.attachments.filter(a=>!a.name.endsWith('-perimeter-edge-feet'));
 assert.throws(()=>verify(r,'execution'));
});
test('perimeter target retains original radius38 stop independently of visual drawing',()=>{
 for(const x of[1360,1368,1376]){
  const y=.5*x-706;
  assert(roomAllows([x,y]));assert(!roomAllows([x,y-.01]));
 }
});
test('perimeter approach and return stay inside original wall for all8px endpoint errors',()=>{
 for(const a of[[1368,210],[1368,-8]])for(const ax of[-8,8])for(const ay of[-8,8])for(const bx of[-8,8])for(const by of[-8,8]){
  const b=a[1]===210?[1368,-8]:[1368,210];
  for(let n=0;n<=100;n++){const t=n/100;assert(roomAllows([(a[0]+ax)*(1-t)+(b[0]+bx)*t,(a[1]+ay)*(1-t)+(b[1]+by)*t]));}
 }
});


test('bounded trace experiment preserves explicit images and failure diagnostics',()=>{
 const config=readFileSync(new URL('./playwright.config.ts',import.meta.url),'utf8');
 assert.equal((config.match(/\btrace:/g)||[]).length,1);
 assert.match(config,/trace:\s*\{\s*mode:\s*'retain-on-failure',\s*screenshots:\s*false,\s*snapshots:\s*false,\s*sources:\s*true\s*\}/);
 assert.match(config,/\bscreenshot:\s*'only-on-failure'/);
 assert.equal(TITLES.flatMap((_title,index)=>requiredScreenshots(index)).length,21);
 assert(requiredScreenshots(12).includes('desktop-plaza-perimeter-edge-feet'));
 assert(requiredScreenshots(13).includes('phone-plaza-perimeter-edge-feet'));
});

// This phase-count model explicitly stages native key delivery in the installed
// server order. Each held phase may consume0,1,2 real updates; a native chord
// is never treated as instantaneous. It is a scheduling hypothesis, not a
// claim that a chord has yet been observed in hosted Chromium.
const coarseFailures=hostedReplay.coarse_quantization_failures;
const navRecord=p=>({key:p.key,delay:p.requestedDelay,before:{x:p.before.x,y:p.before.y},after:{x:p.after.x,y:p.after.y}});
function firstCorrection(c){
 const history=[];
 for(const p of c.presses){history.push(navRecord(p));const pulse=waypointCorrection(p.after,...c.target,history);
  if(pulse)return{p:{x:p.after.x,y:p.after.y},history:history.slice(-2),pulse,elapsed:p.responseEnd-c.presses[0].commandStart};}
 throw new Error('Recorded skipped band must trigger a bounded correction');
}
const keyDirection=k=>[Number(k==='d')-Number(k==='a'),Number(k==='s')-Number(k==='w')];
function replaySequentialChord(c,leading,diagonal,trailing,missFirst=false,jitter=false){
 const seed=firstCorrection(c),p={...seed.p},history=[...seed.history];
 const q=Math.max(...history.map(h=>Math.hypot(h.after.x-h.before.x,h.after.y-h.before.y)));
 const dt=c.median_frame_ms;let elapsed=seed.elapsed,corrections=0,commands=0,frame=0;const events=[];
 const fine=c.presses.filter(p=>p.requestedDelay===16).map(p=>p.distance),vary=[Math.min(...fine),Math.max(...fine)];
 const update=(keys,count)=>{
  const vector=keys.map(keyDirection).reduce((a,b)=>[a[0]+b[0],a[1]+b[1]],[0,0]),length=Math.hypot(...vector);
  for(let i=0;i<count;i++){
   const distance=jitter?vary[frame++%2]:q;
   const before=[p.x,p.y];p.x+=vector[0]/length*distance;p.y+=vector[1]/length*distance;elapsed+=dt;
   assert(Object.values(FOOTPRINTS).every(poly=>sweptDistance(before,[p.x,p.y],poly)>38));assert(roomAllows([p.x,p.y]));
  }
 };
 for(;;){
  const pulse=waypointStep(p,...c.target,elapsed,0,history);if(!pulse)return{elapsed,corrections,commands,p,events};
  assert(++commands<40);const before={...p},commandStarted=elapsed;elapsed+=dt; // neutral command dispatch
  if(pulse.key.includes('+')){
   corrections++;const [lateral,primary]=pulse.key.split('+'),miss=missFirst&&corrections===1;
   events.push({type:'down',key:lateral,at:elapsed});update([lateral],miss?0:leading);
   events.push({type:'down',key:primary,at:elapsed});elapsed+=pulse.delay;update([lateral,primary],miss?0:diagonal);
   events.push({type:'up',key:primary,at:elapsed});update([lateral],miss?0:trailing);
   events.push({type:'up',key:lateral,at:elapsed});
   // Even a phase consuming zero updates still awaits its native event ack.
   // Four sequential acks at a conservative100ms each, then a fresh neutral
   // read below, are charged independently from consumed movement frames.
   elapsed=Math.max(elapsed,commandStarted+4*100+pulse.delay);
  }else{
   // Real measured fine presses consumed one update despite16ms requested delay.
   // Coarse pulses consume bounded whole updates; feedback is always neutral.
   update([pulse.key],Math.max(1,Math.round(pulse.delay/dt)));
  }
  assert(chordEndpointAllowed(p,pulse));
  elapsed+=dt;history.push({key:pulse.key,delay:pulse.delay,before,after:{...p}});if(history.length>2)history.shift();
 }
}
for(const c of coarseFailures){
 const run=c.provenance.run_id;
 test(`hosted${run} preserves actual skipped-band diagnosis`,()=>{
  assert([38102814074,38103713681].includes(run));assert.equal(c.provenance.case_index,12);
  const fine=c.presses.filter(p=>p.requestedDelay===16);assert(fine.length>=8);
  assert(fine.every(p=>p.heldFrames===1&&p.distance>20&&p.distance<24));
  assert(fine.every(p=>Math.abs(p.after.y-260)>8));
  const seed=firstCorrection(c);assert.equal(seed.pulse.key.split('+')[0],'a','Lateral prefix must point away from rear solid');
  assert(safeChordEnvelope(seed.pulse.correction.envelope));assert(seed.elapsed<2500);
  assert.throws(()=>waypointStep(seed.p,1200,260,6500,0,seed.history),/Native route stalled/);
 });
 for(const leading of[0,1,2])for(const trailing of[0,1,2])test(`hosted${run} sequential chord${leading}/1/${trailing} keeps8px and6500ms`,()=>{
  const result=replaySequentialChord(c,leading,1,trailing);
  assert(result.corrections>=1);assert(result.elapsed<6500);assert(Math.abs(result.p.x-1200)<=8&&Math.abs(result.p.y-260)<=8);
  const e=result.events.slice(0,4);assert.deepEqual(e.map(x=>x.type),['down','down','up','up']);assert.equal(e[0].key,e[3].key);assert.equal(e[1].key,e[2].key);
 });
 test(`hosted${run} a fully missed first chord cannot fabricate success`,()=>{
  const result=replaySequentialChord(c,1,1,1,true);assert(result.corrections>=2);assert(result.elapsed<6500);
 });
 test(`hosted${run} alternating measured step jitter retains native chord safety`,()=>{
  if(run===38102814074){
   assert.throws(()=>replaySequentialChord(c,1,1,1,false,true),/Native route stalled before 1200,260/);
   return; // Slower historical jitter exceeds the same deadline; never a pass.
  }
  const result=replaySequentialChord(c,1,1,1,false,true);
  assert(result.elapsed<6500);assert(Math.abs(result.p.x-1200)<=8&&Math.abs(result.p.y-260)<=8);
 });
 test(`hosted${run} two diagonal frames remain bounded or fail the unchanged deadline`,()=>{
  for(const lead of[0,1,2])for(const tail of[0,1,2]){
   try{const r=replaySequentialChord(c,lead,2,tail);assert(r.elapsed<6500);}
   catch(e){assert.match(e.message,/Native route stalled|No independently safe native chord envelope/);}
  }
 });
}
test('safe chord guard rejects both containment directions and radius proximity',()=>{
 assert.equal(safeChordEnvelope([[1200,230],[1600,230],[1600,475],[1200,475]]),false,'Whole rear solid is enclosed');
 assert.equal(safeChordEnvelope([[1350,335],[1355,335],[1355,340],[1350,340]]),false,'Envelope is inside solid');
 assert.equal(safeChordEnvelope([[1170,278],[1210,278],[1210,295],[1170,295]]),false,'Envelope approaches the radius boundary');
 assert.equal(safeChordEnvelope([[1000,150],[1100,150],[1100,220],[1000,220]]),true);
});
test('coarse chord envelope explicitly contains0..2 frames in each held phase',()=>{
 const p={x:1200,y:270},bound=28,e=chordEnvelope(p,'a','w',bound);
 assert(safeChordEnvelope(e));
 for(const lead of[0,1,2])for(const diagonal of[0,1,2])for(const trail of[0,1,2]){
  const point=[p.x-bound*(lead+trail+diagonal*Math.SQRT1_2),p.y-bound*diagonal*Math.SQRT1_2];
  assert(sweptDistance(point,point,e)<1e-7);
 }
});
test('unsafe narrow-passage oscillation rejects rather than widening target or nudging through solids',()=>{
 const a={key:'a',delay:16,before:{x:1708.1,y:425},after:{x:1687.2,y:425}},b={key:'d',delay:16,before:{x:1687.2,y:425},after:{x:1708.1,y:425}};
 // The farther endpoint is1687.2; both candidate sequential envelopes are unsafe.
 const history=[b,{...a,before:b.after}];
 assert.throws(()=>waypointCorrection(a.after,1700,420,history),/No independently safe native chord envelope/);
});
test('fine correction requires genuine opposite skipped-band pulses and observed neutral endpoints',()=>{
 const c=coarseFailures[0],s=firstCorrection(c);
 assert.equal(waypointCorrection(s.p,1200,260,[]),null);
 assert.equal(waypointCorrection(s.p,1200,260,[{...s.history[0],delay:240},s.history[1]]),null);
 assert.equal(waypointCorrection({...s.p,x:s.p.x+1},1200,260,s.history),null);
 assert.equal(waypointCorrection({...s.p,y:260},1200,260,s.history),null);
 assert.equal(waypointStep({x:1200,y:260},1200,260,7000,0,s.history),null);
});
test('actual chord feedback beyond the envelope fails rather than continuing',()=>{
 const s=firstCorrection(coarseFailures[1]);
 assert(chordEndpointAllowed(s.p,s.pulse));
 assert.equal(chordEndpointAllowed({x:s.p.x+1,y:s.p.y},s.pulse),false,'Opposite-side drift is outside the native chord');
 assert.equal(chordEndpointAllowed({x:s.p.x-200,y:s.p.y-20},s.pulse),false,'Unexpectedly prolonged native hold cannot pass');
 assert.equal(chordEndpointAllowed({x:NaN,y:s.p.y},s.pulse),false);
});
test('native correction rejects an unsupported quantum above24px',()=>{
 const a={key:'s',delay:16,before:{x:1200,y:247},after:{x:1200,y:272}},b={key:'w',delay:16,before:{x:1200,y:272},after:{x:1200,y:247}};
 assert.throws(()=>waypointCorrection(b.after,1200,260,[a,b]),/Unmodeled native fine-step quantum/);
});
for(const q of[20.9,22.36])test(`constant${q}px whole-route stress fails closed where safe convergence is unproved`,()=>{
 // Deliberately adversarial constant steps; actual Phaser deltas vary. This
 // documents unsupported perimeter/pinch phases instead of weakening the gate.
 const dt=q/.22,p={x:1472,y:536};let frames=0,minimum=Infinity,corrections=0;
 assert.throws(()=>{
  for(const[x,y]of Object.values(NAVIGATION_PHASES).flat()){
   let elapsed=0;const history=[];
   for(;;){
    const pulse=waypointStep(p,x,y,elapsed,0,history);if(!pulse)break;
    const before={...p},commandStarted=elapsed;elapsed+=dt;
    const move=(keys,n)=>{
     const vector=keys.map(keyDirection).reduce((a,b)=>[a[0]+b[0],a[1]+b[1]],[0,0]),length=Math.hypot(...vector);
     for(let i=0;i<n;i++){
      const a=[p.x,p.y];p.x+=vector[0]/length*q;p.y+=vector[1]/length*q;elapsed+=dt;frames++;
      minimum=Math.min(minimum,...Object.values(FOOTPRINTS).map(poly=>sweptDistance(a,[p.x,p.y],poly)));
      assert(minimum>38&&roomAllows([p.x,p.y]));
     }
    };
    if(pulse.key.includes('+')){const[a,b]=pulse.key.split('+');move([a],1);move([a,b],1);move([a],1);corrections++;elapsed=Math.max(elapsed,commandStarted+4*100+pulse.delay);}
    else move([pulse.key],Math.max(1,Math.round(pulse.delay/dt)));
    assert(chordEndpointAllowed(p,pulse));elapsed+=dt;
    history.push({key:pulse.key,delay:pulse.delay,before,after:{...p}});if(history.length>2)history.shift();
   }
  }
 },q===20.9?/Native route stalled before 1368,-8/:/No independently safe native chord envelope near 1660,400/);
 assert(frames>100&&corrections>0&&minimum>38);
});
