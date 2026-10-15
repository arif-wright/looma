import Phaser from 'phaser';
import { GameScene } from '../../../src/lib/games/arpg/scenes/GameScene';
import type { World, EntityId, Transform } from '../../../src/lib/games/arpg/ecs/components';
import { fixture, type SceneObservation } from './runtime';
import { VISUAL_MODE, VISUAL_POSES, VISUAL_LIMITS, VISUAL_CAMERA_KEYS, visualClearance, visualCameraStable } from './visual-contract.mjs';

type Key = { isDown: boolean; _justDown: boolean };
type VisualState = {
  initialized: boolean; ended: boolean; runState: string; townStatus: string;
  handlers: { isCurrent(): boolean }; playerId: EntityId | null; world: World;
  expedition: { area: number; returned: boolean; outcome: string }; expeditionActive: boolean;
  movementInput: { x: number; y: number }; pendingDash: boolean; pointerAttack: boolean; heroAttacking: boolean;
  wasd: Record<'w' | 'a' | 's' | 'd', Key>;
  cursors: Record<'up' | 'down' | 'left' | 'right', Key>;
  interactKey: Key; dashKeys: Key[]; playerSprite: Phaser.GameObjects.Sprite;
};
type Frame = {
  nativeFrame: number; at: number; transform: Transform; intent: { x: number; y: number };
  velocity: { vx: number; vy: number }; dashTimer: number;
  sprite: { x: number; y: number; depth: number; texture: string; frame: string | number; animation: string | null; playing: boolean };
  camera: { x: number; y: number; width: number; height: number; zoom: number; scrollX: number; scrollY: number; matrix: number[] };
};
export type VisualPoseReceipt = {
  evidenceMode: typeof VISUAL_MODE; nativeMovementEvidence: false; assignment: 'actual-ecs-transform';
  sequence: number; poseId: string; sceneId: number; playerId: EntityId;
  prior: Transform; assigned: Transform; assignedAt: number; assignedNativeFrame: number; assignedFrameCounter: number;
  clearance: ReturnType<typeof visualClearance>; frames: Frame[];
  stableComparisons: number; cameraTolerance: number; settled: Transform | null;
  settledNativeFrame: number | null; settledAt: number | null;
};

// This module is imported only by the isolated preview. Its only production-
// object write is x/y on the actual ECS hero transform, behind an explicit
// visual-only mode. It never changes input, velocity, sprite, camera or time.
export function createVisualController() {
  let binding: { scene: GameScene; observation: SceneObservation; playerId: EntityId | null } | null = null;
  let closed = false, pending: VisualPoseReceipt | null = null;
  let lastRenderedNativeFrame: number | null = null;
  const receipts: VisualPoseReceipt[] = [], errors: string[] = [];
  function fail(message: string): never { errors.push(message); throw Error(message); }
  const mode = () => {
    if (window.__arpgCourtyardVisualFlow !== true || window.__arpgPlazaFlow !== true ||
        window.__arpgCourtyardFlow === true || window.__arpgReturnFlow === true) fail('Controlled visual mode is not exclusive and explicitly enabled');
    if (errors.length) throw Error(errors[0]);
  };
  const state = () => {
    mode();
    if (!binding || closed) fail('Controlled visual scene is unavailable or closed');
    const { scene, observation } = binding;
    const value = scene as unknown as VisualState;
    const live = fixture.scenes.filter(scene => !scene.destroyed);
    if (live.length !== 1 || live[0] !== observation || observation.pageId !== 1 || observation.createAt === null ||
        observation.framesAfterCreate < 1 || !observation.loadComplete || observation.totalFailed !== 0 ||
        observation.loadErrors.length || observation.missingKeys.length || !value.initialized || value.ended ||
        value.runState !== 'running' || value.townStatus !== 'ready' || !value.handlers.isCurrent() ||
        value.expedition.area !== 0 || value.expeditionActive || value.expedition.returned || value.expedition.outcome !== 'preparing') {
      fail('Controlled pose needs the one current ready initial town scene');
    }
    if (value.playerId === null || !value.world.getPlayer(value.playerId) || value.world.getPlayers().length !== 1 ||
        (binding.playerId !== null && value.playerId !== binding.playerId)) fail('Controlled visual player identity changed');
    const position = value.world.getTransform(value.playerId!);
    const velocity = value.world.getVelocity(value.playerId!);
    const dash = value.world.getDash(value.playerId!);
    if (!position || !Object.values(position).every(Number.isFinite) || !velocity || velocity.vx !== 0 || velocity.vy !== 0 ||
        value.movementInput.x !== 0 || value.movementInput.y !== 0 || !dash || dash.timer !== 0 ||
        value.pendingDash !== false || value.pointerAttack !== false || value.heroAttacking !== false) fail('Controlled pose requires neutral actual intent, dash and velocity');
    const keys = [...['w','a','s','d'].map(key => value.wasd?.[key as keyof VisualState['wasd']]),
      ...['up','down','left','right'].map(key => value.cursors?.[key as keyof VisualState['cursors']]),
      value.interactKey, ...value.dashKeys];
    if (keys.length !== 11 || keys.some(key => !key || key.isDown !== false || key._justDown !== false) ||
        scene.input.activePointer.isDown !== false) fail('Controlled pose requires released actual keyboard and pointer state');
    if (fixture.api.some(call => call.path !== '/api/leaderboard/arpg/alltime' || call.method !== 'GET') ||
        fixture.rewardMutations.length || fixture.navigations.length || fixture.blocked.length) fail('Controlled visual isolation has external side effects');
    return { scene, observation, value, position: position!, velocity: velocity!, dash: dash! };
  };
  const readFrame = (): Frame => {
    const { scene, value, position, velocity, dash } = state();
    const camera = scene.cameras.main as Phaser.Cameras.Scene2D.Camera & { matrix: { a: number; b: number; c: number; d: number; e: number; f: number } };
    const nativeFrame = scene.sys.game.loop.frame;
    const fields = Object.fromEntries(VISUAL_CAMERA_KEYS.map(key => [key, camera[key as keyof typeof camera]]));
    const matrix = ['a','b','c','d','e','f'].map(key => camera.matrix[key as keyof typeof camera.matrix]);
    if (!Number.isSafeInteger(nativeFrame) || nativeFrame < 0 || ![...Object.values(fields), ...matrix].every(Number.isFinite)) fail('Invalid native render frame or camera readback');
    const sprite = value.playerSprite;
    if (!sprite?.active || !sprite.visible || sprite.alpha !== 1 || !sprite.texture?.key || sprite.frame?.name === undefined ||
        !/^hero-knight_armed_idle-(N|NE|E|SE|S|SW|W|NW)$/.test(sprite.anims.currentAnim?.key ?? '')) fail('Missing actual visible hero idle frame');
    return { nativeFrame, at: performance.now(), transform: { ...position }, intent: { x: value.movementInput.x, y: value.movementInput.y },
      velocity: { vx: velocity.vx, vy: velocity.vy }, dashTimer: dash.timer,
      sprite: { x: sprite.x, y: sprite.y, depth: sprite.depth, texture: sprite.texture.key, frame: sprite.frame.name,
        animation: sprite.anims.currentAnim?.key ?? null, playing: sprite.anims.isPlaying },
      camera: { ...fields, matrix } as Frame['camera'] };
  };
  const samePose = (frame: Frame, receipt: VisualPoseReceipt) => frame.transform.x === receipt.assigned.x &&
    frame.transform.y === receipt.assigned.y && frame.transform.rot === receipt.assigned.rot;
  const onRender = () => {
    if (!binding || closed || errors.length) return;
    const nativeFrame = binding.scene.sys.game.loop.frame;
    // Phaser increments loop.frame AFTER its callback returns. Remember the
    // counter at the genuine POST_RENDER callback, not between callbacks.
    if (!pending) { lastRenderedNativeFrame = nativeFrame; return; }
    try {
      const frame = readFrame(), previous = pending.frames.at(-1);
      lastRenderedNativeFrame = frame.nativeFrame;
      if (frame.nativeFrame <= (previous?.nativeFrame ?? pending.assignedNativeFrame)) fail('Controlled pose needs strictly increasing native frames');
      if (!samePose(frame, pending)) fail('Actual transform drifted from its explicitly assigned pose');
      pending.frames.push(frame);
      const spriteSynced = frame.sprite.x === frame.transform.x && frame.sprite.y === frame.transform.y && frame.sprite.depth === frame.transform.y + 20;
      pending.stableComparisons = spriteSynced && previous && visualCameraStable(previous.camera, frame.camera) ? pending.stableComparisons + 1 : 0;
      if (pending.stableComparisons >= VISUAL_LIMITS.stableComparisons) {
        pending.settled = { ...frame.transform }; pending.settledNativeFrame = frame.nativeFrame; pending.settledAt = frame.at; pending = null;
      } else if (pending.frames.length >= VISUAL_LIMITS.framesPerPose) fail('Controlled camera failed to settle within 64 native frames');
    } catch (error) {
      if (!errors.length) errors.push(String(error));
      pending = null;
    }
  };
  const release = () => {
    if (!binding || closed) return;
    closed = true;
    binding.scene.sys.game.events.off(Phaser.Core.Events.POST_RENDER, onRender);
    binding.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, release);
    binding.scene.events.off(Phaser.Scenes.Events.DESTROY, release);
    binding.scene.sys.game.events.off(Phaser.Core.Events.DESTROY, release);
    if (pending) { errors.push('Controlled scene closed with an unsettled assignment'); pending = null; }
  };
  return {
    bind(scene: GameScene, observation: SceneObservation) {
      mode();
      if (binding || closed || !observation || !fixture.scenes.includes(observation)) fail('Controlled fixture permits exactly one observed scene binding');
      binding = { scene, observation, playerId: null };
      scene.sys.game.events.on(Phaser.Core.Events.POST_RENDER, onRender);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, release);
      scene.events.once(Phaser.Scenes.Events.DESTROY, release);
      scene.sys.game.events.once(Phaser.Core.Events.DESTROY, release);
    },
    assign(poseId: string) {
      const { value, position, observation, scene } = state();
      if (pending) fail('Previous controlled pose has not settled');
      const pose = VISUAL_POSES[receipts.length];
      if (!pose || pose.id !== poseId) fail('Only the six ordered enumerated controlled pose IDs are accepted');
      const clearance = visualClearance(pose);
      if (!clearance.valid) fail('Controlled pose violates independent radius-38 clearance');
      if (receipts.length && (position.x !== receipts.at(-1)!.assigned.x || position.y !== receipts.at(-1)!.assigned.y)) fail('Prior controlled pose drifted before its successor');
      const nativeFrame = scene.sys.game.loop.frame;
      if (!Number.isSafeInteger(nativeFrame) || nativeFrame < 0 || lastRenderedNativeFrame === null ||
          !Number.isSafeInteger(lastRenderedNativeFrame) || lastRenderedNativeFrame < 0 || nativeFrame < lastRenderedNativeFrame) fail('Assignment needs a genuine previous POST_RENDER frame ID');
      const receipt: VisualPoseReceipt = {
        evidenceMode: VISUAL_MODE, nativeMovementEvidence: false, assignment: 'actual-ecs-transform',
        sequence: receipts.length + 1, poseId, sceneId: observation.id, playerId: value.playerId!,
        prior: { ...position }, assigned: { ...position, x: pose.x, y: pose.y }, assignedAt: performance.now(), assignedNativeFrame: lastRenderedNativeFrame!, assignedFrameCounter: nativeFrame,
        clearance, frames: [], stableComparisons: 0, cameraTolerance: VISUAL_LIMITS.cameraTolerance,
        settled: null, settledNativeFrame: null, settledAt: null
      };
      binding!.playerId = value.playerId;
      // Explicitly discontinuous setup. Preserve rotation, velocity and all
      // other game state. Native sync/update/render must reconcile this pose.
      position.x = pose.x; position.y = pose.y;
      receipts.push(receipt); pending = receipt;
      return structuredClone(receipt);
    },
    currentReceipt() {
      const frame = readFrame(), receipt = receipts.at(-1);
      if (!receipt || pending || !receipt.settled || !samePose(frame, receipt) ||
          frame.sprite.x !== frame.transform.x || frame.sprite.y !== frame.transform.y || frame.sprite.depth !== frame.transform.y + 20 ||
          !visualCameraStable(receipt.frames.at(-1)!.camera, frame.camera)) fail('A stable current controlled pose receipt is required');
      return structuredClone(receipt!);
    },
    snapshot() {
      return structuredClone({ evidenceMode: VISUAL_MODE, nativeMovementEvidence: false, enabled: window.__arpgCourtyardVisualFlow === true,
        bound: binding !== null, closed, lastRenderedNativeFrame, pending: pending !== null, complete: receipts.length === VISUAL_LIMITS.poses && pending === null && !errors.length,
        receipts, errors });
    }
  };
}
export type VisualController = ReturnType<typeof createVisualController>;
declare global { interface Window { __arpgCourtyardVisualFlow?: boolean; __arpgCourtyardVisual?: VisualController; } }
if (window.__arpgCourtyardVisualFlow === true) {
  const controller = createVisualController();
  window.__arpgCourtyardVisual = controller;
  const preload = GameScene.prototype.preload;
  GameScene.prototype.preload = function (...args: Parameters<typeof preload>) {
    const before = fixture.scenes.length;
    const result = preload.apply(this, args);
    if (fixture.scenes.length !== before + 1) throw Error('Controlled visual setup needs the real observation lifecycle');
    controller.bind(this, fixture.scenes[before]!);
    return result;
  };
}
