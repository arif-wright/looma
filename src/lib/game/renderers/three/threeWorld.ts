import * as THREE from 'three';
import { PLAYER_SPEED } from '../../config';
import { MovementIntentScheduler } from '../../movementIntentScheduler';
import type { GameRuntime } from '../../lifecycle';
import type { PlayerSnapshot, WorldSnapshot } from '../../protocol';
import type { WorldSession } from '../../worldSession';
import { OrbitCameraState } from './cameraController';
import { cameraRelativeMovement, SERVER_UNITS_PER_WORLD_UNIT, serverToWorld } from './math';
import { calculateVisualRosterDelta } from './roster';

type VisualPlayer = {
  sprite: THREE.Sprite;
  target: THREE.Vector3;
  follower?: THREE.Sprite;
  followerTarget?: THREE.Vector3;
};

export type ThreeWorldRuntime = GameRuntime & {
  setTouchDirection: (x: number, y: number) => void;
  interact: () => void;
  orbitCamera: (yaw: number, pitch: number) => void;
  zoomCamera: (delta: number) => void;
  resetCamera: () => void;
};

type ThreeWorldOptions = {
  session: WorldSession;
  onGatherPrompt: (visible: boolean) => void;
};

const MOONBERRY = { x: 800, y: 120, radius: 58 };

const spriteTexture = (label: string, color: string, companion = false) => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(80, 20, 96, companion ? 82 : 100, 28);
  context.fill();
  context.fillStyle = '#fff';
  context.font = '600 23px system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText(label.slice(0, 24), 128, 150);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const makeBillboard = (label: string, color: string, companion = false) => {
  const material = new THREE.SpriteMaterial({ map: spriteTexture(label, color, companion), transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(companion ? 1.5 : 2, companion ? 0.94 : 1.25, 1);
  sprite.center.set(0.5, 0);
  return sprite;
};

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      const map = (material as THREE.MeshBasicMaterial).map;
      map?.dispose();
      material.dispose();
    }
  });
};

export const createThreeWorld = (host: HTMLElement, options: ThreeWorldOptions): ThreeWorldRuntime => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#91bcae');
  scene.fog = new THREE.Fog('#91bcae', 22, 42);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = false;
  renderer.domElement.dataset.renderer = 'three';
  renderer.domElement.style.touchAction = 'none';
  host.appendChild(renderer.domElement);

  const camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 100);
  const cameraState = new OrbitCameraState();
  const cameraTarget = new THREE.Vector3();
  const cameraTargetSmooth = new THREE.Vector3();
  const clock = new THREE.Clock();
  const movement = new MovementIntentScheduler();
  const keys = new Set<string>();
  const touch = { x: 0, y: 0 };
  const players = new Map<string, VisualPlayer>();
  let localPlayerId = '';
  let localServerPosition = { x: 180, y: 270 };
  let interactionVisible = false;
  let frame = 0;
  let destroyed = false;
  let paused = false;
  let raf = 0;
  let drag: { x: number; y: number } | null = null;
  let fpsFrames = 0;
  let fpsElapsed = 0;

  scene.add(new THREE.HemisphereLight(0xd9fff5, 0x355044, 1.8));
  const sun = new THREE.DirectionalLight(0xfff0cf, 2.2);
  sun.position.set(-8, 14, -5);
  scene.add(sun);

  const terrain = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 16.875),
    new THREE.MeshStandardMaterial({ color: 0x4f896c, roughness: 0.95 })
  );
  terrain.rotation.x = -Math.PI / 2;
  scene.add(terrain);
  const path = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.12, 3.3),
    new THREE.MeshStandardMaterial({ color: 0x9c835d, roughness: 1 })
  );
  path.position.y = 0.04;
  scene.add(path);

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x624a35 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2c654c });
  for (const [x, z] of [[-11, -6], [-8, 5], [10, -5], [12, 4], [-4, -6]] as Array<[number, number]>) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8), trunkMaterial);
    trunk.position.y = 0.8;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.05, 2.6, 10), leafMaterial);
    crown.position.y = 2.35;
    tree.add(trunk, crown);
    tree.position.set(x, 0, z);
    scene.add(tree);
  }
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x67736f, roughness: 1 });
  for (const [x, z, scale] of [[-6, 3, 0.7], [4, -5, 1], [7, 4, 0.65]] as Array<[number, number, number]>) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), rockMaterial);
    rock.scale.y = 0.65;
    rock.position.set(x, scale * 0.42, z);
    scene.add(rock);
  }
  const grovePosition = serverToWorld(MOONBERRY.x, MOONBERRY.y);
  const grove = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.9, 0.25, 24),
    new THREE.MeshStandardMaterial({ color: 0x7a5bc1, emissive: 0x241447, emissiveIntensity: 0.5 })
  );
  grove.position.set(grovePosition.x, 0.14, grovePosition.z);
  scene.add(grove);

  const debug = import.meta.env.DEV ? document.createElement('pre') : null;
  if (debug) {
    debug.dataset.testid = 'three-diagnostics';
    Object.assign(debug.style, { position: 'absolute', left: '8px', top: '8px', zIndex: '5', margin: '0', padding: '6px', color: '#dffff5', background: '#07120dcc', font: '11px monospace', pointerEvents: 'none' });
    host.appendChild(debug);
  }

  const removePlayer = (id: string) => {
    const visual = players.get(id);
    if (!visual) return;
    scene.remove(visual.sprite);
    disposeObject(visual.sprite);
    if (visual.follower) { scene.remove(visual.follower); disposeObject(visual.follower); }
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
        const sprite = makeBillboard(player.displayName, id === localPlayerId ? '#39d7bc' : '#f0a7cf');
        sprite.position.set(mapped.x, 0.02, mapped.z);
        scene.add(sprite);
        visual = { sprite, target: new THREE.Vector3(mapped.x, 0.02, mapped.z) };
        players.set(id, visual);
      }
      visual.target.set(mapped.x, 0.02, mapped.z);
      visual.sprite.material.opacity = player.connected ? 1 : 0.4;
      if (id === localPlayerId) localServerPosition = { x: player.x, y: player.y };
      if (player.companionPresent) {
        if (!visual.follower) {
          visual.follower = makeBillboard(player.companionName, '#ffd36e', true);
          visual.followerTarget = new THREE.Vector3(mapped.x - 0.8, 0.02, mapped.z + 0.7);
          visual.follower.position.copy(visual.followerTarget);
          scene.add(visual.follower);
        }
        visual.followerTarget?.set(mapped.x - 0.8, 0.02, mapped.z + 0.7);
        visual.follower.material.opacity = player.companionStatus === 'reconnecting' ? 0.45 : 0.95;
      } else if (visual.follower) {
        scene.remove(visual.follower);
        disposeObject(visual.follower);
        visual.follower = undefined;
        visual.followerTarget = undefined;
      }
    });
    for (const id of rosterDelta.removed) removePlayer(id);
    const available = Math.hypot(localServerPosition.x - MOONBERRY.x, localServerPosition.y - MOONBERRY.y) <= MOONBERRY.radius;
    if (available !== interactionVisible) {
      interactionVisible = available;
      options.onGatherPrompt(available);
    }
  };
  options.session.setSnapshotConsumer(applySnapshot);

  const resize = (width: number, height: number) => {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const aspect = safeWidth / safeHeight;
    const halfHeight = 7;
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
  const pointerDown = (event: PointerEvent) => { if (event.button === 2) drag = { x: event.clientX, y: event.clientY }; };
  const pointerMove = (event: PointerEvent) => {
    if (!drag) return;
    cameraState.orbit(-(event.clientX - drag.x) * 0.008, (event.clientY - drag.y) * 0.006);
    drag = { x: event.clientX, y: event.clientY };
  };
  const pointerUp = () => { drag = null; };
  const wheel = (event: WheelEvent) => { event.preventDefault(); cameraState.adjustZoom(-event.deltaY * 0.001); };
  const contextMenu = (event: Event) => event.preventDefault();
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', keyUp);
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('wheel', wheel, { passive: false });
  renderer.domElement.addEventListener('contextmenu', contextMenu);

  const animate = () => {
    if (destroyed || paused) return;
    raf = requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    const inputX = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touch.x;
    const inputY = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) + touch.y;
    const intentDirection = cameraRelativeMovement(inputX, inputY, cameraState.yaw);
    const intent = movement.next(intentDirection.x, intentDirection.y, delta * 1000);
    if (intent) options.session.sendMovement(intent);

    const local = players.get(localPlayerId);
    if (local) {
      local.sprite.position.x += intentDirection.x * PLAYER_SPEED / SERVER_UNITS_PER_WORLD_UNIT * delta;
      local.sprite.position.z += intentDirection.y * PLAYER_SPEED / SERVER_UNITS_PER_WORLD_UNIT * delta;
      local.sprite.position.lerp(local.target, 0.12);
      cameraTarget.copy(local.sprite.position);
      renderer.domElement.dataset.localPlayerX = local.sprite.position.x.toFixed(3);
      renderer.domElement.dataset.localPlayerZ = local.sprite.position.z.toFixed(3);
    }
    for (const [id, visual] of players) {
      if (id !== localPlayerId) visual.sprite.position.lerp(visual.target, 0.18);
      if (visual.follower && visual.followerTarget) visual.follower.position.lerp(visual.followerTarget, 0.1);
    }
    cameraTargetSmooth.lerp(cameraTarget, 0.12);
    const distance = 18;
    const horizontal = Math.cos(cameraState.pitch) * distance;
    camera.position.set(
      cameraTargetSmooth.x + Math.sin(cameraState.yaw) * horizontal,
      Math.sin(cameraState.pitch) * distance,
      cameraTargetSmooth.z + Math.cos(cameraState.yaw) * horizontal
    );
    camera.lookAt(cameraTargetSmooth.x, 0.5, cameraTargetSmooth.z);
    const currentZoom = camera.zoom;
    camera.zoom = THREE.MathUtils.lerp(currentZoom, cameraState.zoom, 0.12);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    fpsFrames += 1;
    fpsElapsed += delta;
    if (debug && fpsElapsed >= 0.5) {
      debug.textContent = `renderer three\nfps ${Math.round(fpsFrames / fpsElapsed)}\ndraw calls ${renderer.info.render.calls}\ntriangles ${renderer.info.render.triangles}\nplayers ${players.size}\npitch ${(cameraState.pitch * 180 / Math.PI).toFixed(1)}°\nzoom ${cameraState.zoom.toFixed(2)}\nstatus ${options.session.connectionStatus}`;
      fpsFrames = 0;
      fpsElapsed = 0;
    }
    frame += 1;
    renderer.domElement.dataset.frame = String(frame);
    renderer.domElement.dataset.cameraYaw = cameraState.yaw.toFixed(3);
    renderer.domElement.dataset.cameraPitch = cameraState.pitch.toFixed(3);
    renderer.domElement.dataset.cameraZoom = cameraState.zoom.toFixed(3);
  };
  resize(host.clientWidth || 960, host.clientHeight || 540);
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
      for (const id of [...players.keys()]) removePlayer(id);
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      debug?.remove();
    }
  };
};
