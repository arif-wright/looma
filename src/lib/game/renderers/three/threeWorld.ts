import * as THREE from 'three';
import { PLAYER_SPEED } from '../../config';
import { FacingState, FACING_LABELS, type FacingDirection } from '../../facing';
import { MovementIntentScheduler } from '../../movementIntentScheduler';
import type { GameRuntime } from '../../lifecycle';
import type { PlayerSnapshot, WorldSnapshot } from '../../protocol';
import type { WorldSession } from '../../worldSession';
import { movementState, type PlayerVisualState } from '../../visualState';
import { isCameraPreset, OrbitCameraState, type CameraPresetName } from './cameraController';
import { CompanionTrail } from './companionTrail';
import { nextContextStatus, type WebglContextStatus } from './contextRecovery';
import { cameraRelativeMovement, SERVER_UNITS_PER_WORLD_UNIT, serverToWorld } from './math';
import { ObstructionFadeController, type ObstructableRegistration } from './obstruction';
import { parseSyntheticDensity, qualityDprCap, selectVisualQuality, type VisualQuality } from './performance';
import { calculateVisualRosterDelta } from './roster';

type DirectionalBillboard = {
  sprite: THREE.Sprite;
  setFacing: (facing: FacingDirection) => void;
};

type VisualPlayer = {
  billboard: DirectionalBillboard;
  target: THREE.Vector3;
  previousTarget: THREE.Vector3;
  facing: FacingState;
  state: PlayerVisualState;
  trail: CompanionTrail;
  follower?: DirectionalBillboard;
  followerTarget?: THREE.Vector3;
  followerFacing?: FacingState;
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

const MOONBERRY = { x: 800, y: 120, radius: 58 };
const CAMERA_STORAGE_KEY = 'memvoya.world.camera-preset';
const MAX_CAMERA_TARGET_LAG = 2.5;

const readCameraPreset = (): CameraPresetName => {
  try {
    const value = localStorage.getItem(CAMERA_STORAGE_KEY);
    return isCameraPreset(value) ? value : 'classic';
  } catch { return 'classic'; }
};

const createBillboard = (label: string, color: string, companion = false): DirectionalBillboard => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(companion ? 1.5 : 2, companion ? 1.12 : 1.5, 1);
  sprite.center.set(0.5, 0);
  let currentFacing: FacingDirection | null = null;

  const setFacing = (facing: FacingDirection) => {
    if (facing === currentFacing) return;
    currentFacing = facing;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(76, 28, 104, companion ? 86 : 112, 28);
    context.fill();
    context.fillStyle = '#07131a';
    context.font = '800 38px system-ui, sans-serif';
    context.textAlign = 'center';
    context.fillText(FACING_LABELS[facing], 128, companion ? 87 : 103);
    context.fillStyle = '#fff';
    context.beginPath();
    context.moveTo(128, 10);
    context.lineTo(115, 31);
    context.lineTo(141, 31);
    context.closePath();
    context.fill();
    context.font = '600 21px system-ui, sans-serif';
    context.fillText(label.slice(0, 24), 128, 180);
    texture.needsUpdate = true;
  };
  setFacing('s');
  return { sprite, setFacing };
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
  const obstructables: ObstructableRegistration[] = [];
  const obstructionFader = new ObstructionFadeController();
  const raycaster = new THREE.Raycaster();
  const synthetic: DirectionalBillboard[] = [];
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

  scene.add(new THREE.HemisphereLight(0xd9fff5, 0x355044, 1.8));
  const sun = new THREE.DirectionalLight(0xfff0cf, 2.2);
  sun.position.set(-8, 14, -5);
  scene.add(sun);

  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(30, 16.875), new THREE.MeshStandardMaterial({ color: 0x4f896c, roughness: 0.95 }));
  terrain.rotation.x = -Math.PI / 2;
  scene.add(terrain);
  const path = new THREE.Mesh(new THREE.BoxGeometry(30, 0.12, 3.3), new THREE.MeshStandardMaterial({ color: 0x9c835d, roughness: 1 }));
  path.position.y = 0.04;
  scene.add(path);

  const registerObstructable = (id: string, root: THREE.Object3D, materials: THREE.Material[]) => {
    root.userData.obstructionId = id;
    root.traverse((child) => { child.userData.obstructionId = id; });
    for (const material of materials) { material.transparent = true; material.depthWrite = true; }
    obstructables.push({ id, root, materials });
  };

  for (const [index, [x, z]] of [[-11, -6], [-8, 5], [10, -5], [12, 4], [-4, -6]].entries()) {
    const tree = new THREE.Group();
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x624a35 });
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2c654c });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8), trunkMaterial);
    trunk.position.y = 0.8;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.05, 2.6, 10), leafMaterial);
    crown.position.y = 2.35;
    tree.add(trunk, crown);
    tree.position.set(x, 0, z);
    scene.add(tree);
    registerObstructable(`tree-${index}`, tree, [trunkMaterial, leafMaterial]);
  }
  for (const [index, [x, z, scale]] of [[-6, 3, 0.7], [4, -5, 1], [7, 4, 0.65]].entries()) {
    const material = new THREE.MeshStandardMaterial({ color: 0x67736f, roughness: 1 });
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), material);
    rock.scale.y = 0.65;
    rock.position.set(x, scale * 0.42, z);
    scene.add(rock);
    registerObstructable(`rock-${index}`, rock, [material]);
  }
  const grovePosition = serverToWorld(MOONBERRY.x, MOONBERRY.y);
  const grove = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.25, 24), new THREE.MeshStandardMaterial({ color: 0x7a5bc1, emissive: 0x241447, emissiveIntensity: 0.5 }));
  grove.position.set(grovePosition.x, 0.14, grovePosition.z);
  scene.add(grove);

  if (import.meta.env.DEV) {
    const density = parseSyntheticDensity(new URLSearchParams(location.search).get('worldDensity'));
    for (let index = 0; index < density; index += 1) {
      const billboard = createBillboard(`Synthetic ${index + 1}`, '#7898d8');
      const angle = index / Math.max(1, density) * Math.PI * 2;
      const radius = 4 + index % 4;
      billboard.sprite.position.set(Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius);
      billboard.setFacing((['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as FacingDirection[])[index % 8]);
      synthetic.push(billboard);
      scene.add(billboard.sprite);
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
    scene.remove(visual.billboard.sprite);
    disposeObject(visual.billboard.sprite);
    if (visual.follower) { scene.remove(visual.follower.sprite); disposeObject(visual.follower.sprite); }
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
        const billboard = createBillboard(player.displayName, id === localPlayerId ? '#39d7bc' : '#f0a7cf');
        billboard.sprite.position.set(mapped.x, 0.02, mapped.z);
        scene.add(billboard.sprite);
        const facing = new FacingState();
        visual = {
          billboard,
          target: new THREE.Vector3(mapped.x, 0.02, mapped.z),
          previousTarget: new THREE.Vector3(mapped.x, 0.02, mapped.z),
          facing,
          trail: new CompanionTrail(),
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
            companionOwnerEntityId: player.companionPresent ? id : null,
            connectionState: player.connected ? 'connected' : 'reconnecting'
          }
        };
        players.set(id, visual);
      }
      const motionX = mapped.x - visual.target.x;
      const motionZ = mapped.z - visual.target.z;
      visual.previousTarget.copy(visual.target);
      visual.target.set(mapped.x, 0.02, mapped.z);
      if (id !== localPlayerId) visual.facing.update(motionX, motionZ, 0.02);
      visual.billboard.setFacing(visual.facing.value);
      visual.billboard.sprite.material.opacity = player.connected ? 1 : 0.4;
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
        companionOwnerEntityId: player.companionPresent ? id : null,
        connectionState: player.connected ? 'connected' : 'reconnecting'
      };
      if (id === localPlayerId) localServerPosition = { x: player.x, y: player.y };
      if (player.companionPresent) {
        if (!visual.follower) {
          visual.follower = createBillboard(player.companionName, '#ffd36e', true);
          visual.followerFacing = new FacingState();
          visual.followerTarget = new THREE.Vector3(mapped.x - 0.9, 0.02, mapped.z + 0.8);
          visual.follower.sprite.position.copy(visual.followerTarget);
          scene.add(visual.follower.sprite);
        }
        visual.follower.sprite.material.opacity = player.companionStatus === 'reconnecting' ? 0.45 : 0.95;
      } else if (visual.follower) {
        scene.remove(visual.follower.sprite);
        disposeObject(visual.follower.sprite);
        visual.follower = undefined;
        visual.followerTarget = undefined;
        visual.followerFacing = undefined;
      }
    });
    for (const id of rosterDelta.removed) removePlayer(id);
    const available = Math.hypot(localServerPosition.x - MOONBERRY.x, localServerPosition.y - MOONBERRY.y) <= MOONBERRY.radius;
    if (available !== interactionVisible) { interactionVisible = available; options.onGatherPrompt(available); }
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
      item?.materials.forEach((material) => { material.opacity = state.opacity; material.depthWrite = state.opacity > 0.75; });
    }
  };

  const animate = () => {
    if (destroyed || paused) return;
    raf = requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    cameraState.update(delta);
    const inputX = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touch.x;
    const inputY = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) + touch.y;
    const intentDirection = cameraRelativeMovement(inputX, inputY, cameraState.yaw);
    const intent = movement.next(intentDirection.x, intentDirection.y, delta * 1000);
    if (intent) options.session.sendMovement(intent);

    const local = players.get(localPlayerId);
    if (local) {
      local.facing.update(intentDirection.x, intentDirection.y);
      local.billboard.setFacing(local.facing.value);
      const motion = movementState(intentDirection.x, intentDirection.y);
      local.state = { ...local.state, facing: local.facing.value, ...motion };
      local.billboard.sprite.position.x += intentDirection.x * PLAYER_SPEED / SERVER_UNITS_PER_WORLD_UNIT * delta;
      local.billboard.sprite.position.z += intentDirection.y * PLAYER_SPEED / SERVER_UNITS_PER_WORLD_UNIT * delta;
      local.billboard.sprite.position.lerp(local.target, 1 - Math.exp(-8 * delta));
      cameraTarget.copy(local.billboard.sprite.position);
      renderer.domElement.dataset.localPlayerX = local.billboard.sprite.position.x.toFixed(3);
      renderer.domElement.dataset.localPlayerZ = local.billboard.sprite.position.z.toFixed(3);
      renderer.domElement.dataset.facing = local.facing.value;
    }
    const updateRemoteVisuals = quality === 'full' || frame % 2 === 0;
    for (const [id, visual] of players) {
      if (id !== localPlayerId && updateRemoteVisuals) visual.billboard.sprite.position.lerp(visual.target, 1 - Math.exp(-10 * delta));
      visual.state.renderPosition = { x: visual.billboard.sprite.position.x, z: visual.billboard.sprite.position.z };
      visual.trail.push(visual.state.renderPosition);
      if (visual.follower && visual.followerTarget) {
        const trailTarget = visual.trail.target({ x: visual.billboard.sprite.position.x - 0.9, z: visual.billboard.sprite.position.z + 0.8 });
        visual.followerTarget.set(trailTarget.x, 0.02, trailTarget.z);
        visual.follower.sprite.position.lerp(visual.followerTarget, 1 - Math.exp(-7 * delta));
        const followX = visual.followerTarget.x - visual.follower.sprite.position.x;
        const followZ = visual.followerTarget.z - visual.follower.sprite.position.z;
        visual.follower.setFacing(visual.followerFacing?.update(followX, followZ, 0.02) ?? visual.facing.value);
      }
    }

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
      }
      fpsWindowElapsed = 0;
      recentMinimumFps = currentFps;
    }
    if (debug && fpsElapsed >= 0.5) {
      const localFacing = players.get(localPlayerId)?.facing.value ?? 's';
      const billboardCount = players.size + [...players.values()].filter((visual) => visual.follower).length + synthetic.length;
      debug.textContent = `renderer three\nfps ${Math.round(currentFps)}\nrecent min ${Math.round(recentMinimumFps)}\ndraw calls ${renderer.info.render.calls}\ntriangles ${renderer.info.render.triangles}\nplayers ${players.size}\nbillboards ${billboardCount}\ndpr ${renderer.getPixelRatio().toFixed(2)}\nquality ${quality}\npitch ${(cameraState.pitch * 180 / Math.PI).toFixed(1)}°\nzoom ${cameraState.zoom.toFixed(2)}\npreset ${cameraState.preset}\nfacing ${localFacing}\nobstructions ${obstructed.size}\ncontext ${contextStatus}\nstatus ${options.session.connectionStatus}`;
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
  };

  const selectCameraPreset = (preset: CameraPresetName) => {
    cameraState.selectPreset(preset);
    options.onCameraPreset?.(preset);
    try { localStorage.setItem(CAMERA_STORAGE_KEY, preset); } catch { /* optional preference */ }
  };
  const debugGlobal = globalThis as typeof globalThis & { __MEMVOYA_WORLD_THREE__?: { loseContext: () => void; restoreContext: () => void } };
  if (import.meta.env.DEV) debugGlobal.__MEMVOYA_WORLD_THREE__ = {
    loseContext: () => renderer.forceContextLoss(),
    restoreContext: () => renderer.forceContextRestore()
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
      synthetic.forEach((billboard) => { scene.remove(billboard.sprite); disposeObject(billboard.sprite); });
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      debug?.remove();
      if (debugGlobal.__MEMVOYA_WORLD_THREE__) delete debugGlobal.__MEMVOYA_WORLD_THREE__;
    }
  };
};
