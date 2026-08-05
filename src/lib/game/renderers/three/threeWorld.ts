import * as THREE from 'three';
import { PLAYER_SPEED } from '../../config';
import { FacingState, type FacingDirection } from '../../facing';
import { MovementIntentScheduler } from '../../movementIntentScheduler';
import type { GameRuntime } from '../../lifecycle';
import type { PlayerSnapshot, WorldSnapshot } from '../../protocol';
import type { WorldSession } from '../../worldSession';
import { movementState, type PlayerVisualState } from '../../visualState';
import { MOONBERRY_INTERACTION, WORLD_TRAVERSAL } from '../../traversal';
import { isCameraPreset, OrbitCameraState, type CameraPresetName } from './cameraController';
import { CompanionTrail } from './companionTrail';
import { nextContextStatus, type WebglContextStatus } from './contextRecovery';
import { cameraRelativeMovement, SERVER_UNITS_PER_WORLD_UNIT, serverToWorld } from './math';
import { ObstructionFadeController, type ObstructableRegistration } from './obstruction';
import { parseSyntheticDensity, qualityDprCap, selectVisualQuality, type VisualQuality } from './performance';
import { calculateVisualRosterDelta } from './roster';
import { HdSpriteEntity, HdSpriteResources, PLAYER_ATLAS_URL, type SpriteAnimationOverride } from './hdSprite';
import { selectCompanionSpriteAsset, type CompanionSpriteSelection } from '../../sprites/companionAsset';
import { playerBodyManifestUrl } from '../../playerBody';
import { createEnvironmentWorld } from './environmentWorld';

type VisualPlayer = {
  billboard: HdSpriteEntity;
  target: THREE.Vector3;
  previousTarget: THREE.Vector3;
  facing: FacingState;
  state: PlayerVisualState;
  trail: CompanionTrail;
  follower?: HdSpriteEntity;
  followerTarget?: THREE.Vector3;
  followerFacing?: FacingState;
  followerMuse?: boolean;
  followerAssetSelection?: CompanionSpriteSelection;
  followerIdentityKey?: string;
  playerBodyManifestUrl: string;
};

export type { WebglContextStatus } from './contextRecovery';

export type ThreeWorldRuntime = GameRuntime & {
  setTouchDirection: (x: number, y: number) => void;
  interact: () => void;
  orbitCamera: (yaw: number, pitch: number) => void;
  zoomCamera: (delta: number) => void;
  resetCamera: () => void;
  selectCameraPreset: (preset: CameraPresetName) => void;
  simulateContextLoss: () => void;
  simulateContextRestore: () => void;
};

type ThreeWorldOptions = {
  session: WorldSession;
  onGatherPrompt: (visible: boolean) => void;
  onContextStatus?: (status: WebglContextStatus) => void;
  onCameraPreset?: (preset: CameraPresetName) => void;
};

const MOONBERRY = MOONBERRY_INTERACTION;
const CAMERA_STORAGE_KEY = 'memvoya.world.camera-preset';
const MAX_CAMERA_TARGET_LAG = 2.5;

export const parseMuseAnimationOverride = (value: string | null): SpriteAnimationOverride | null => {
  if (!value) return null;
  const match = /^(idle|walk)\.(n|ne|e|se|s|sw|w|nw)$/.exec(value.trim().toLowerCase());
  return match ? { state: match[1] as 'idle' | 'walk', facing: match[2] as FacingDirection } : null;
};

const readCameraPreset = (): CameraPresetName => {
  try {
    const value = localStorage.getItem(CAMERA_STORAGE_KEY);
    return isCameraPreset(value) ? value : 'classic';
  } catch { return 'classic'; }
};

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const renderable = child as THREE.Mesh;
    renderable.geometry?.dispose();
    const materials = Array.isArray(renderable.material) ? renderable.material : renderable.material ? [renderable.material] : [];
    for (const material of materials) {
      (material as THREE.MeshBasicMaterial).map?.dispose();
      material.dispose();
    }
  });
};

export const createThreeWorld = (host: HTMLElement, options: ThreeWorldOptions): ThreeWorldRuntime => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#91bcae');
  const fullFog = new THREE.Fog('#91bcae', 22, 42);
  scene.fog = fullFog;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  let quality: VisualQuality = 'full';
  const setDpr = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityDprCap(quality)));
  setDpr();
  renderer.shadowMap.enabled = false;
  renderer.domElement.dataset.renderer = 'three';
  renderer.domElement.style.touchAction = 'none';
  host.appendChild(renderer.domElement);

  const camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 100);
  const cameraState = new OrbitCameraState(readCameraPreset());
  const cameraTarget = new THREE.Vector3();
  const cameraTargetSmooth = new THREE.Vector3();
  const clock = new THREE.Clock();
  const movement = new MovementIntentScheduler();
  const keys = new Set<string>();
  const touch = { x: 0, y: 0 };
  const players = new Map<string, VisualPlayer>();
  const spriteResources = new HdSpriteResources();
  const obstructables: ObstructableRegistration[] = [];
  const obstructionFader = new ObstructionFadeController();
  const raycaster = new THREE.Raycaster();
  const synthetic: HdSpriteEntity[] = [];
  let obstructed = new Set<string>();
  let localPlayerId = '';
  let localServerPosition = { x: 180, y: 270 };
  let interactionVisible = false;
  let frame = 0;
  let destroyed = false;
  let paused = false;
  let contextStatus: WebglContextStatus = 'ready';
  let raf = 0;
  let drag: { x: number; y: number } | null = null;
  let fpsFrames = 0;
  let fpsElapsed = 0;
  let fpsWindowElapsed = 0;
  let recentMinimumFps = 60;
  let animationUpdateMs = 0;
  let forcedMuseAnimation = import.meta.env.DEV
    ? parseMuseAnimationOverride(new URLSearchParams(location.search).get('worldMuseAnimation')) : null;

  scene.add(new THREE.HemisphereLight(0xd9fff5, 0x355044, 1.8));
  const sun = new THREE.DirectionalLight(0xfff0cf, 2.2);
  sun.position.set(-8, 14, -5);
  scene.add(sun);

  const environment = createEnvironmentWorld();
  scene.add(environment.root);
  obstructables.push(...environment.obstructables);

  if (import.meta.env.DEV) {
    const collisionDebug = new THREE.Group();
    collisionDebug.name = 'collision-debug';
    const bounds = WORLD_TRAVERSAL.bounds;
    const corners = [
      serverToWorld(bounds.minX, bounds.minY), serverToWorld(bounds.maxX, bounds.minY),
      serverToWorld(bounds.maxX, bounds.maxY), serverToWorld(bounds.minX, bounds.maxY),
      serverToWorld(bounds.minX, bounds.minY)
    ];
    const boundsGeometry = new THREE.BufferGeometry().setFromPoints(corners.map((point) => new THREE.Vector3(point.x, 0.035, point.z)));
    collisionDebug.add(new THREE.Line(boundsGeometry, new THREE.LineBasicMaterial({ color: 0x5fffd2, depthTest: false })));
    const addRing = (x: number, y: number, radius: number, color: number) => {
      const mapped = serverToWorld(x, y);
      const visualRadius = radius / SERVER_UNITS_PER_WORLD_UNIT;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.01, visualRadius - 0.025), visualRadius, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(mapped.x, 0.04, mapped.z);
      collisionDebug.add(ring);
    };
    WORLD_TRAVERSAL.blockers.forEach((blocker) => addRing(blocker.x, blocker.y, blocker.radius + 16, 0xff6b6b));
    addRing(WORLD_TRAVERSAL.spawn.x, WORLD_TRAVERSAL.spawn.y, 10, 0x62ff9a);
    addRing(MOONBERRY.x, MOONBERRY.y, MOONBERRY.radius, 0xc9a7ff);
    scene.add(collisionDebug);
  }

  if (import.meta.env.DEV) {
    const density = parseSyntheticDensity(new URLSearchParams(location.search).get('worldDensity'));
    for (let index = 0; index < density; index += 1) {
      const billboard = new HdSpriteEntity(spriteResources, {
        label: `Synthetic ${index + 1}`, manifestUrl: PLAYER_ATLAS_URL
      });
      const angle = index / Math.max(1, density) * Math.PI * 2;
      const radius = 4 + index % 4;
      billboard.root.position.set(Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius);
      billboard.animator.facing = (['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as FacingDirection[])[index % 8]!;
      synthetic.push(billboard);
      scene.add(billboard.root);
    }
  }

  const debug = import.meta.env.DEV ? document.createElement('pre') : null;
  if (debug) {
    debug.dataset.testid = 'three-diagnostics';
    Object.assign(debug.style, { position: 'absolute', left: '8px', top: '8px', zIndex: '5', maxHeight: '45%', overflow: 'hidden', margin: '0', padding: '6px', color: '#dffff5', background: '#07120dcc', font: '11px monospace', pointerEvents: 'none' });
    host.appendChild(debug);
  }

  const removePlayer = (id: string) => {
    const visual = players.get(id);
    if (!visual) return;
    scene.remove(visual.billboard.root);
    visual.billboard.destroy();
    if (visual.follower) { scene.remove(visual.follower.root); visual.follower.destroy(); }
    players.delete(id);
  };

  const applySnapshot = (snapshot: WorldSnapshot) => {
    localPlayerId = snapshot.localPlayerId;
    const rosterDelta = calculateVisualRosterDelta(
      new Set(players.keys()),
      new Set([...players].filter(([, visual]) => Boolean(visual.follower)).map(([id]) => id)),
      snapshot.players
    );
    snapshot.players.forEach((player: PlayerSnapshot, id) => {
      const mapped = serverToWorld(player.x, player.y);
      let visual = players.get(id);
      if (!visual) {
        const playerManifestUrl = playerBodyManifestUrl(player.playerBody);
        const billboard = new HdSpriteEntity(spriteResources, { label: player.displayName, manifestUrl: playerManifestUrl });
        billboard.root.position.set(mapped.x, 0.02, mapped.z);
        scene.add(billboard.root);
        const facing = new FacingState();
        visual = {
          billboard,
          target: new THREE.Vector3(mapped.x, 0.02, mapped.z),
          previousTarget: new THREE.Vector3(mapped.x, 0.02, mapped.z),
          facing,
          trail: new CompanionTrail(),
          playerBodyManifestUrl: playerManifestUrl,
          state: {
            entityId: id,
            worldPosition: { x: mapped.x, z: mapped.z },
            previousWorldPosition: { x: mapped.x, z: mapped.z },
            renderPosition: { x: mapped.x, z: mapped.z },
            facing: facing.value,
            movementState: 'idle', movementMagnitude: 0,
            local: id === localPlayerId,
            displayName: player.displayName,
            handle: player.handle,
            playerBody: player.playerBody,
            companionOwnerEntityId: player.companionPresent ? id : null,
            connectionState: player.connected ? 'connected' : 'reconnecting'
          }
        };
        players.set(id, visual);
      }
      const nextPlayerManifestUrl = playerBodyManifestUrl(player.playerBody);
      if (visual.playerBodyManifestUrl !== nextPlayerManifestUrl) {
        scene.remove(visual.billboard.root);
        visual.billboard.destroy();
        visual.billboard = new HdSpriteEntity(spriteResources, { label: player.displayName, manifestUrl: nextPlayerManifestUrl });
        visual.billboard.root.position.copy(visual.target);
        visual.playerBodyManifestUrl = nextPlayerManifestUrl;
        scene.add(visual.billboard.root);
      }
      const motionX = mapped.x - visual.target.x;
      const motionZ = mapped.z - visual.target.z;
      visual.previousTarget.copy(visual.target);
      visual.target.set(mapped.x, 0.02, mapped.z);
      if (id !== localPlayerId) visual.facing.update(motionX, motionZ, 0.02);
      visual.billboard.setOpacity(player.connected ? 1 : 0.4);
      const motion = movementState(motionX, motionZ, 0.02);
      visual.state = {
        ...visual.state,
        worldPosition: { x: mapped.x, z: mapped.z },
        previousWorldPosition: { x: visual.previousTarget.x, z: visual.previousTarget.z },
        facing: visual.facing.value,
        ...motion,
        local: id === localPlayerId,
        displayName: player.displayName,
        handle: player.handle,
        playerBody: player.playerBody,
        companionOwnerEntityId: player.companionPresent ? id : null,
        connectionState: player.connected ? 'connected' : 'reconnecting'
      };
      if (id === localPlayerId) localServerPosition = { x: player.x, y: player.y };
      if (player.companionPresent) {
        const followerIdentityKey = `${player.companionKind}:${player.companionName}`;
        if (visual.follower && visual.followerIdentityKey !== followerIdentityKey) {
          scene.remove(visual.follower.root);
          visual.follower.destroy();
          delete visual.follower;
          delete visual.followerTarget;
          delete visual.followerFacing;
          delete visual.followerMuse;
          delete visual.followerAssetSelection;
        }
        if (!visual.follower) {
          const assetSelection = selectCompanionSpriteAsset(player.companionKind);
          const muse = assetSelection.muse;
          visual.follower = new HdSpriteEntity(spriteResources, {
            label: player.companionName,
            manifestUrl: assetSelection.manifestUrl,
            fallbackManifestUrl: PLAYER_ATLAS_URL,
            companion: true,
            museEffects: muse,
            requireProduction: assetSelection.production
          });
          visual.followerMuse = muse;
          visual.followerAssetSelection = assetSelection;
          visual.followerIdentityKey = followerIdentityKey;
          visual.followerFacing = new FacingState();
          visual.followerTarget = new THREE.Vector3(mapped.x - 0.9, 0.02, mapped.z + 0.8);
          visual.follower.root.position.copy(visual.followerTarget);
          scene.add(visual.follower.root);
        }
        visual.follower.setOpacity(player.companionStatus === 'reconnecting' ? 0.45 : 0.95);
      } else if (visual.follower) {
        scene.remove(visual.follower.root);
        visual.follower.destroy();
        delete visual.follower;
        delete visual.followerTarget;
        delete visual.followerFacing;
        delete visual.followerMuse;
        delete visual.followerAssetSelection;
        delete visual.followerIdentityKey;
      }
    });
    for (const id of rosterDelta.removed) removePlayer(id);
    const available = Math.hypot(localServerPosition.x - MOONBERRY.x, localServerPosition.y - MOONBERRY.y) <= MOONBERRY.radius;
    if (available !== interactionVisible) {
      interactionVisible = available;
      environment.setMoonberryEmphasis(available);
      options.onGatherPrompt(available);
    }
  };
  options.session.setSnapshotConsumer(applySnapshot);

  const resize = (width: number, height: number) => {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const halfHeight = 7;
    const aspect = safeWidth / safeHeight;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(safeWidth, safeHeight, false);
  };

  const keyDown = (event: KeyboardEvent) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    }
    if (event.code === 'KeyR') cameraState.reset();
    if (event.code === 'KeyE' && interactionVisible) options.session.gatherMoonberry();
  };
  const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
  const pointerDown = (event: PointerEvent) => {
    if (event.button === 2) {
      renderer.domElement.setPointerCapture?.(event.pointerId);
      drag = { x: event.clientX, y: event.clientY };
    }
  };
  const pointerMove = (event: PointerEvent) => {
    if (!drag) return;
    cameraState.orbitPixels(event.clientX - drag.x, event.clientY - drag.y);
    drag = { x: event.clientX, y: event.clientY };
  };
  const pointerUp = () => { drag = null; };
  const wheel = (event: WheelEvent) => { event.preventDefault(); cameraState.adjustZoom(-event.deltaY * 0.001); };
  const contextMenu = (event: Event) => event.preventDefault();
  const contextLost = (event: Event) => {
    event.preventDefault();
    contextStatus = nextContextStatus(contextStatus, 'lost');
    options.onContextStatus?.('lost');
    if (import.meta.env.DEV) console.info('[world:three] WebGL context lost; world session retained.');
  };
  const contextRestored = () => {
    contextStatus = nextContextStatus(contextStatus, 'restore-started');
    options.onContextStatus?.('restoring');
    setDpr();
    resize(host.clientWidth || 960, host.clientHeight || 540);
    contextStatus = nextContextStatus(contextStatus, 'restored');
    options.onContextStatus?.('ready');
    if (import.meta.env.DEV) console.info('[world:three] WebGL context restored without session rejoin.');
  };
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', keyUp);
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('wheel', wheel, { passive: false });
  renderer.domElement.addEventListener('contextmenu', contextMenu);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  renderer.domElement.addEventListener('webglcontextrestored', contextRestored);

  const updateObstructions = (delta: number) => {
    if (frame % 4 === 0 && cameraTargetSmooth.lengthSq() > 0) {
      const direction = cameraTargetSmooth.clone().sub(camera.position);
      const distance = direction.length();
      raycaster.set(camera.position, direction.normalize());
      raycaster.far = Math.max(0, distance - 0.5);
      obstructed = new Set(
        raycaster.intersectObjects(obstructables.map((item) => item.root), true)
          .map((hit) => hit.object.userData.obstructionId as string)
          .filter(Boolean)
      );
    }
    const opacity = obstructionFader.update(obstructables.map((item) => item.id), obstructed, delta);
    for (const state of opacity) {
      const item = obstructables.find((candidate) => candidate.id === state.id);
      if (item?.setOpacity) item.setOpacity(state.opacity);
      else item?.materials.forEach((material) => { material.opacity = state.opacity; material.depthWrite = state.opacity > 0.75; });
    }
  };

  const animate = () => {
    if (destroyed || paused) return;
    raf = requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    environment.update(clock.elapsedTime);
    cameraState.update(delta);
    const inputX = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touch.x;
    const inputY = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) + touch.y;
    const intentDirection = cameraRelativeMovement(inputX, inputY, cameraState.yaw);
    const intent = movement.next(intentDirection.x, intentDirection.y, delta * 1000);
    if (intent) options.session.sendMovement(intent);

    const animationStart = performance.now();
    const local = players.get(localPlayerId);
    if (local) {
      local.facing.update(intentDirection.x, intentDirection.y);
      const motion = movementState(intentDirection.x, intentDirection.y);
      local.state = { ...local.state, facing: local.facing.value, ...motion };
      local.billboard.root.position.x += intentDirection.x * PLAYER_SPEED / SERVER_UNITS_PER_WORLD_UNIT * delta;
      local.billboard.root.position.z += intentDirection.y * PLAYER_SPEED / SERVER_UNITS_PER_WORLD_UNIT * delta;
      local.billboard.root.position.lerp(local.target, 1 - Math.exp(-8 * delta));
      cameraTarget.copy(local.billboard.root.position);
      renderer.domElement.dataset.localPlayerX = local.billboard.root.position.x.toFixed(3);
      renderer.domElement.dataset.localPlayerZ = local.billboard.root.position.z.toFixed(3);
      renderer.domElement.dataset.facing = local.facing.value;
    }
    const updateRemoteVisuals = quality === 'full' || frame % 2 === 0;
    for (const [id, visual] of players) {
      if (id !== localPlayerId && updateRemoteVisuals) visual.billboard.root.position.lerp(visual.target, 1 - Math.exp(-10 * delta));
      visual.state.renderPosition = { x: visual.billboard.root.position.x, z: visual.billboard.root.position.z };
      visual.trail.push(visual.state.renderPosition);
      visual.billboard.update(delta, visual.state.facing, visual.state.movementMagnitude, cameraState.yaw, quality, camera.position.distanceTo(visual.billboard.root.position));
      if (visual.follower && visual.followerTarget) {
        const trailTarget = visual.trail.target({ x: visual.billboard.root.position.x - 0.9, z: visual.billboard.root.position.z + 0.8 });
        visual.followerTarget.set(trailTarget.x, 0.02, trailTarget.z);
        visual.follower.root.position.lerp(visual.followerTarget, 1 - Math.exp(-7 * delta));
        const followX = visual.followerTarget.x - visual.follower.root.position.x;
        const followZ = visual.followerTarget.z - visual.follower.root.position.z;
        const followerFacing = visual.followerFacing?.update(followX, followZ, 0.02) ?? visual.facing.value;
        const followerMotion = movementState(followX, followZ, 0.018);
        visual.follower.update(delta, followerFacing, followerMotion.movementMagnitude, cameraState.yaw, quality,
          camera.position.distanceTo(visual.follower.root.position), visual.followerMuse ? forcedMuseAnimation ?? undefined : undefined);
      }
    }
    for (const billboard of synthetic) {
      billboard.update(delta, billboard.animator.facing, frame % 240 < 150 ? 0.5 : 0, cameraState.yaw, quality, camera.position.distanceTo(billboard.root.position));
    }
    animationUpdateMs = performance.now() - animationStart;

    const followAlpha = 1 - Math.exp(-cameraState.settings.followSmoothing * delta);
    cameraTargetSmooth.lerp(cameraTarget, followAlpha);
    const lag = cameraTargetSmooth.distanceTo(cameraTarget);
    if (lag > MAX_CAMERA_TARGET_LAG) cameraTargetSmooth.lerp(cameraTarget, 1 - MAX_CAMERA_TARGET_LAG / lag);
    const distance = 18;
    const horizontal = Math.cos(cameraState.pitch) * distance;
    camera.position.set(
      cameraTargetSmooth.x + Math.sin(cameraState.yaw) * horizontal,
      Math.sin(cameraState.pitch) * distance,
      cameraTargetSmooth.z + Math.cos(cameraState.yaw) * horizontal
    );
    camera.lookAt(cameraTargetSmooth.x, 0.5, cameraTargetSmooth.z);
    camera.zoom = cameraState.zoom;
    camera.updateProjectionMatrix();
    updateObstructions(delta);
    if (contextStatus === 'ready') renderer.render(scene, camera);

    fpsFrames += 1;
    fpsElapsed += delta;
    fpsWindowElapsed += delta;
    const currentFps = fpsElapsed > 0 ? fpsFrames / fpsElapsed : 60;
    recentMinimumFps = Math.min(recentMinimumFps, currentFps);
    if (fpsWindowElapsed >= 2) {
      const nextQuality = selectVisualQuality(recentMinimumFps);
      if (nextQuality !== quality) {
        quality = nextQuality;
        setDpr();
        scene.fog = quality === 'minimum' ? null : fullFog;
        environment.setQuality(quality);
      }
      fpsWindowElapsed = 0;
      recentMinimumFps = currentFps;
    }
    if (debug && fpsElapsed >= 0.5) {
      const localFacing = players.get(localPlayerId)?.facing.value ?? 's';
      const billboardCount = players.size + [...players.values()].filter((visual) => visual.follower).length + synthetic.length;
      const animated = [...players.values()].reduce((count, visual) => count + 1 + Number(Boolean(visual.follower)), 0) + synthetic.length;
      const textureMemoryMb = spriteResources.estimatedTextureMemoryBytes / (1024 * 1024);
      const animation = players.get(localPlayerId)?.billboard.animationDiagnostics;
      const museVisual = (players.get(localPlayerId)?.followerMuse ? players.get(localPlayerId) : undefined) ??
        [...players.values()].find((visual) => visual.followerMuse);
      const museAnimation = museVisual?.follower?.animationDiagnostics;
      const museAsset = museVisual?.follower?.assetDiagnostics;
      const museIdentity = museVisual?.followerAssetSelection;
      debug.textContent = `renderer three\nfps ${Math.round(currentFps)}\nrecent min ${Math.round(recentMinimumFps)}\ndraw calls ${renderer.info.render.calls}\ntriangles ${renderer.info.render.triangles}\nplayers ${players.size}\nbillboards ${billboardCount}\nanimated sprites ${animated}\nanimation update ${animationUpdateMs.toFixed(2)} ms\nanimation ${animation ? `${animation.state}/${animation.requestedDirection} ${animation.frame}/${animation.totalFrames} @ ${animation.fps} fps` : 'loading'}\nmuse identity ${museIdentity ? `${museIdentity.suppliedIdentity || '(empty)'} -> ${museIdentity.archetype}` : 'none'}\nmuse requested manifest ${museAsset?.requestedManifestUrl ?? 'none'}\nmuse resolved manifest ${museAsset?.resolvedManifestUrl ?? 'none'}\nmuse asset status ${museAsset?.assetStatus ?? 'none'}\nmuse atlas page ${museAsset?.currentPageId ?? 'none'}\nmuse requested ${museAnimation ? `${museAnimation.state}.${museAnimation.requestedDirection}` : 'none'}\nmuse resolved ${museAnimation ? `${museAnimation.state}.${museAnimation.resolvedDirection}` : 'none'}\nmuse provenance ${museAnimation?.source ?? 'none'}\nmuse fallback reason ${museAsset?.fallbackReason ?? 'none'}\nmuse last error ${museAsset?.lastAssetError ?? 'none'}\natlas pages ${spriteResources.cacheSize}\nest atlas MB ${textureMemoryMb.toFixed(2)}\ndpr ${renderer.getPixelRatio().toFixed(2)}\nquality ${quality}\npitch ${(cameraState.pitch * 180 / Math.PI).toFixed(1)}°\nzoom ${cameraState.zoom.toFixed(2)}\npreset ${cameraState.preset}\nfacing ${localFacing}\ncollision blockers ${WORLD_TRAVERSAL.blockers.length}\nobstructions ${obstructed.size}\ncontext ${contextStatus}\nstatus ${options.session.connectionStatus}`;
      fpsFrames = 0;
      fpsElapsed = 0;
    }
    frame += 1;
    renderer.domElement.dataset.frame = String(frame);
    renderer.domElement.dataset.cameraYaw = cameraState.yaw.toFixed(3);
    renderer.domElement.dataset.cameraPitch = cameraState.pitch.toFixed(3);
    renderer.domElement.dataset.cameraZoom = cameraState.zoom.toFixed(3);
    renderer.domElement.dataset.cameraPreset = cameraState.preset;
    renderer.domElement.dataset.contextStatus = contextStatus;
    renderer.domElement.dataset.animatedSprites = String(players.size + [...players.values()].filter((visual) => visual.follower).length + synthetic.length);
    renderer.domElement.dataset.spriteAssets = String(spriteResources.cacheSize);
    renderer.domElement.dataset.spriteMemoryMb = (spriteResources.estimatedTextureMemoryBytes / (1024 * 1024)).toFixed(2);
    renderer.domElement.dataset.animationUpdateMs = animationUpdateMs.toFixed(3);
    renderer.domElement.dataset.environmentDrawCalls = String(environment.metrics.drawCalls);
    renderer.domElement.dataset.environmentVisibleProps = String(environment.metrics.visibleProps);
    renderer.domElement.dataset.environmentDecorativeProps = String(environment.metrics.decorativeProps);
    renderer.domElement.dataset.environmentTextureMemoryMb = (environment.metrics.textureMemoryBytes / (1024 * 1024)).toFixed(2);
    renderer.domElement.dataset.environmentEffects = String(environment.metrics.ambientEffects);
    renderer.domElement.dataset.environmentSharedResources = String(environment.metrics.sharedResources);
    renderer.domElement.dataset.localAnimation = local?.billboard.animator.state ?? 'idle';
    renderer.domElement.dataset.localSpriteLoad = local?.billboard.loadState ?? 'loading';
    renderer.domElement.dataset.museSprites = String([...players.values()].filter((visual) => visual.follower?.assetId.startsWith('muse-')).length);
    const activeMuse = (players.get(localPlayerId)?.followerMuse ? players.get(localPlayerId) : undefined) ??
      [...players.values()].find((visual) => visual.followerMuse);
    renderer.domElement.dataset.museAssetStatus = activeMuse?.follower?.assetDiagnostics.assetStatus ?? 'none';
    renderer.domElement.dataset.museManifest = activeMuse?.follower?.assetDiagnostics.resolvedManifestUrl ?? '';
    renderer.domElement.dataset.museAtlasPage = activeMuse?.follower?.assetDiagnostics.currentPageId ?? '';
    renderer.domElement.dataset.museIdentity = activeMuse?.followerAssetSelection?.suppliedIdentity ?? '';
    renderer.domElement.dataset.museArchetype = activeMuse?.followerAssetSelection?.archetype ?? '';
    renderer.domElement.dataset.museFallbackReason = activeMuse?.follower?.assetDiagnostics.fallbackReason ?? '';
    renderer.domElement.dataset.museAssetError = activeMuse?.follower?.assetDiagnostics.lastAssetError ?? '';
  };

  const selectCameraPreset = (preset: CameraPresetName) => {
    cameraState.selectPreset(preset);
    options.onCameraPreset?.(preset);
    try { localStorage.setItem(CAMERA_STORAGE_KEY, preset); } catch { /* optional preference */ }
  };
  const debugGlobal = globalThis as typeof globalThis & { __MEMVOYA_WORLD_THREE__?: {
    loseContext: () => void; restoreContext: () => void; forceMuseAnimation: (value: string | null) => boolean
  } };
  if (import.meta.env.DEV) debugGlobal.__MEMVOYA_WORLD_THREE__ = {
    loseContext: () => renderer.forceContextLoss(),
    restoreContext: () => renderer.forceContextRestore(),
    forceMuseAnimation: (value) => {
      if (value === null) { forcedMuseAnimation = null; return true; }
      const parsed = parseMuseAnimationOverride(value);
      if (!parsed) return false;
      forcedMuseAnimation = parsed;
      return true;
    }
  };

  resize(host.clientWidth || 960, host.clientHeight || 540);
  options.onContextStatus?.('ready');
  options.onCameraPreset?.(cameraState.preset);
  animate();

  return {
    resize,
    pause: () => { paused = true; cancelAnimationFrame(raf); },
    resume: () => { if (!destroyed && paused) { paused = false; clock.getDelta(); animate(); } },
    setTouchDirection: (x, y) => { touch.x = x; touch.y = y; },
    interact: () => options.session.gatherMoonberry(),
    orbitCamera: (yaw, pitch) => cameraState.orbit(yaw, pitch),
    zoomCamera: (delta) => cameraState.adjustZoom(delta),
    resetCamera: () => cameraState.reset(),
    selectCameraPreset,
    simulateContextLoss: () => renderer.forceContextLoss(),
    simulateContextRestore: () => renderer.forceContextRestore(),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      options.session.setSnapshotConsumer(null);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('wheel', wheel);
      renderer.domElement.removeEventListener('contextmenu', contextMenu);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', contextRestored);
      for (const id of [...players.keys()]) removePlayer(id);
      synthetic.forEach((billboard) => { scene.remove(billboard.root); billboard.destroy(); });
      spriteResources.dispose();
      scene.remove(environment.root);
      environment.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      debug?.remove();
      if (debugGlobal.__MEMVOYA_WORLD_THREE__) delete debugGlobal.__MEMVOYA_WORLD_THREE__;
    }
  };
};
