import * as THREE from 'three';
import { getWorldArea, type WorldArea } from '../../areas';
import type { EnvironmentManifest } from '../../environment/contract';
import { anchoredPlaneTranslation, cylindricalBillboardYaw } from '../../environment/presentation';
import {
  createBroadleafReviewManifest, createEnvironmentWorld, WILDS_ENVIRONMENT_MANIFEST,
  type EnvironmentDebugOverrides, type EnvironmentDiagnosticStage, type EnvironmentWorld
} from './environmentWorld';
import { SharedEnvironmentResources } from './environmentResources';
import { SERVER_UNITS_PER_WORLD_UNIT, serverToWorld } from './math';

export const CONNECTED_AREA_ART = {
  portal: '/game/world/connected-wilds/lantern-portal.png',
  cottage: '/game/world/connected-wilds/lantern-cottage.png'
} as const;

/** Keep the production Grove intact. Hollow reuses its authored art, with its own geometry. */
export const areaEnvironmentManifest = (area: WorldArea): EnvironmentManifest => {
  if (!WILDS_ENVIRONMENT_MANIFEST) throw new Error('No valid Wilds environment manifest is available.');
  const manifest = structuredClone(WILDS_ENVIRONMENT_MANIFEST);
  if (area.id === 'wilds-exploration') return manifest;
  manifest.mapId = area.id;
  manifest.terrain.pathCenterline = [
    { x: 0, y: 270, width: 100 }, { x: 160, y: 270, width: 106 },
    { x: 350, y: 248, width: 110 }, { x: 490, y: 270, width: 164 },
    { x: 640, y: 276, width: 110 }, { x: 960, y: 270, width: 100 }
  ];
  manifest.props = area.traversal.blockers.filter((blocker) => !blocker.id.startsWith('cottage-')).map((blocker) => ({
    id: `${blocker.id}-visual`,
    assetId: blocker.kind === 'tree' ? 'tree.broadleaf' : 'rock.large',
    x: blocker.x, y: blocker.y, collisionRef: blocker.id
  }));
  manifest.interactables = [];
  manifest.effects = [{ id: 'hollow-lantern-motes', assetId: 'effect.aether-motes', x: 480, y: 270 }];
  manifest.decorations = manifest.decorations.map((field, index) => ({
    ...field, id: `hollow-${field.id}`, seed: 72119 + index * 349, count: index === 0 ? 28 : 3
  }));
  return manifest;
};

/** Failure-only signage keeps missing art readable without disguising a blocked cottage as open ground. */
const failedAreaArtCanvas = (cottage: boolean, destination: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, 512, 512);
  context.fillStyle = '#304a48';
  context.strokeStyle = '#f1d69a';
  context.lineWidth = 14;
  if (cottage) {
    context.fillRect(65, 188, 382, 260);
    context.strokeRect(65, 188, 382, 260);
    context.beginPath();
    context.moveTo(40, 188);
    context.lineTo(256, 65);
    context.lineTo(472, 188);
    context.closePath();
    context.fill();
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(75, 471);
    context.lineTo(75, 205);
    context.arc(256, 205, 181, Math.PI, 0);
    context.lineTo(437, 471);
    context.closePath();
    context.fill();
    context.stroke();
  }
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff4d5';
  context.font = '700 46px system-ui, sans-serif';
  context.fillText(cottage ? 'Cottage' : 'Portal', 256, 255, 350);
  context.font = '500 25px system-ui, sans-serif';
  context.fillText(cottage ? 'Please walk around' : `To ${destination}`, 256, 312, 350);
  context.fillStyle = '#d7e1d3';
  context.font = '400 22px system-ui, sans-serif';
  context.fillText('Artwork unavailable', 256, 366, 350);
  return canvas;
};

export type AreaEnvironmentWorld = EnvironmentWorld & { setPortalEmphasis: (active: boolean) => void };

export const createAreaEnvironment = (
  area: WorldArea = getWorldArea(),
  stage: EnvironmentDiagnosticStage = 'full',
  debug: EnvironmentDebugOverrides = {},
  broadleafReview = false
): AreaEnvironmentWorld => {
  const areaManifest = areaEnvironmentManifest(area);
  const environment = createEnvironmentWorld(
    broadleafReview && area.id === 'wilds-exploration' ? createBroadleafReviewManifest(areaManifest) : areaManifest,
    stage, debug
  );
  const resources = new SharedEnvironmentResources();
  const cards: Array<{ mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; root: THREE.Group; url: string }> = [];
  const supplementalTextures = new Map<string, { texture: THREE.Texture; status: 'loading' | 'loaded' | 'failed'; bytes: number; mapUnavailable: boolean }>();
  const failedTextures = new Set<string>();
  let disposed = false;
  let portalEmphasized = false;
  let labelBytes = 0;
  let labelCount = 0;
  // The supplemental art is intentionally outside the existing production asset manifest.
  // Its placement and cottage obstruction references still come from the canonical map.
  const textureFor = (url: string) => resources.acquire(`texture:${url}`, () => {
    const hasDocument = typeof document !== 'undefined';
    const texture = hasDocument ? new THREE.Texture() : new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const record: { texture: THREE.Texture; status: 'loading' | 'loaded' | 'failed'; bytes: number; mapUnavailable: boolean } = {
      texture, status: hasDocument ? 'loading' : 'loaded', bytes: hasDocument ? 0 : 4, mapUnavailable: false
    };
    supplementalTextures.set(url, record);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    if (hasDocument) {
      // Load image bytes into the owned texture rather than returning TextureLoader's
      // independently allocated texture. A late callback cannot resurrect this resource.
      new THREE.ImageLoader().load(url, (loaded) => {
        if (disposed || record.status !== 'loading') return;
        texture.image = loaded;
        texture.needsUpdate = true;
        record.status = 'loaded';
        record.bytes = (loaded.naturalWidth || loaded.width || 1) * (loaded.naturalHeight || loaded.height || 1) * 4;
      }, undefined, () => {
        if (disposed || record.status !== 'loading') return;
        record.status = 'failed';
        failedTextures.add(url);
        const fallback = failedAreaArtCanvas(url === CONNECTED_AREA_ART.cottage, area.portal.targetName);
        if (fallback) {
          texture.image = fallback;
          texture.needsUpdate = true;
          record.bytes = fallback.width * fallback.height * 4;
        } else {
          // If Canvas 2D itself is unavailable, retain a clearly colored footprint.
          // This last-resort material is never used for loaded or loading artwork.
          record.mapUnavailable = true;
          record.bytes = 0;
        }
      });
    }
    return texture;
  });
  const addCard = (id: string, x: number, y: number, url: string, width: number, height: number, anchorY: number, collisionRef?: string) => {
    const root = new THREE.Group();
    root.name = id;
    const point = serverToWorld(x, y);
    root.position.set(point.x, 0.02, point.z);
    const geometry = resources.acquire(`geometry:${url}:${width}:${height}`, () => {
      const shape = new THREE.PlaneGeometry(width, height);
      const anchor = anchoredPlaneTranslation(width, height, { x: 0.5, y: anchorY });
      shape.translate(anchor.x, anchor.y, 0);
      return shape;
    });
    const material = resources.acquire(`material:${id}`, () => new THREE.MeshBasicMaterial({
      map: textureFor(url), transparent: true, alphaTest: 0.025, depthWrite: false, side: THREE.DoubleSide
    }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = supplementalTextures.get(url)?.status !== 'loading';
    root.add(mesh);
    environment.root.add(root);
    cards.push({ mesh, root, url });
    if (collisionRef) {
      root.traverse((child) => { child.userData.obstructionId = collisionRef; });
      environment.obstructables.push({ id: collisionRef, root, materials: [material] });
    }
    return root;
  };

  const portal = area.portal;
  if (stage === 'full' && !broadleafReview) {
    addCard(`portal:${portal.id}`, portal.x, portal.y, CONNECTED_AREA_ART.portal, 3, 3 * 1355 / 1161, 0.92);
    for (const blocker of area.traversal.blockers.filter((item) => item.id.startsWith('cottage-'))) {
      const width = (blocker.radius * 2 + 54) / SERVER_UNITS_PER_WORLD_UNIT;
      addCard(`${blocker.id}-visual`, blocker.x, blocker.y, CONNECTED_AREA_ART.cottage, width, width * 1142 / 1377, 0.87, blocker.id);
    }
  }
  const ringGeometry = resources.acquire('geometry:portal-ring', () => new THREE.RingGeometry(0.86, 0.95, 64));
  const ringMaterial = resources.acquire('material:portal-ring', () => new THREE.MeshBasicMaterial({
    color: area.id === 'wilds-town' ? '#f4d59a' : '#cbb6ff', transparent: true, opacity: 0.42,
    depthWrite: false, side: THREE.DoubleSide
  }));
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  const portalPosition = serverToWorld(portal.x, portal.y);
  ring.name = 'portal-ground-light';
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(portalPosition.x, 0.032, portalPosition.z);
  if (stage === 'full' && !broadleafReview) environment.root.add(ring);

  if (stage === 'full' && !broadleafReview && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (context) {
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = '600 32px system-ui, sans-serif';
      context.lineWidth = 7;
      context.strokeStyle = '#102524';
      context.strokeText(`To ${portal.targetName}`, 320, 48);
      context.fillStyle = '#fff1c9';
      context.fillText(`To ${portal.targetName}`, 320, 48);
      const texture = resources.acquire('texture:portal-label', () => new THREE.CanvasTexture(canvas));
      texture.colorSpace = THREE.SRGBColorSpace;
      labelBytes = canvas.width * canvas.height * 4;
      labelCount = 1;
      const material = resources.acquire('material:portal-label', () => new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
      const label = new THREE.Sprite(material);
      label.name = 'portal-destination-label';
      label.position.set(portalPosition.x, 3.45, portalPosition.z);
      label.scale.set(4.6, 0.69, 1);
      environment.root.add(label);
    }
  }

  const baseUpdate = environment.update;
  const baseDispose = environment.dispose;
  const baseDrawCalls = environment.metrics.drawCalls;
  const baseInstances = environment.metrics.instances;
  environment.metrics.sharedResources += resources.size;
  const baseSetQuality = environment.setQuality;
  let baseVisibleProps = environment.metrics.visibleProps;
  return {
    ...environment,
    setPortalEmphasis: (active) => { portalEmphasized = active; },
    setQuality: (quality) => {
      if (disposed) return;
      baseSetQuality(quality);
      baseVisibleProps = environment.metrics.visibleProps;
      environment.metrics.visibleProps = baseVisibleProps + cards.filter((card) => card.mesh.visible).length;
    },
    update: (elapsed, cameraPosition, cameraQuaternion, viewCenter, cameraForward) => {
      if (disposed) return;
      baseUpdate(elapsed, cameraPosition, cameraQuaternion, viewCenter, cameraForward);
      // The production renderer recomputes these two totals on every update. Capture
      // that frame's values before adding supplemental resources exactly once.
      const baseTextureBytes = environment.metrics.textureMemoryBytes;
      const baseFailedAssets = environment.metrics.failedAssets;
      for (const card of cards) {
        const record = supplementalTextures.get(card.url)!;
        card.mesh.visible = record.status !== 'loading';
        card.root.userData.assetStatus = record.status;
        if (record.mapUnavailable && card.mesh.material.map) {
          card.mesh.material.map = null;
          card.mesh.material.color.set('#d4af78');
          card.mesh.material.needsUpdate = true;
        }
        if (cameraPosition) card.mesh.rotation.y = cylindricalBillboardYaw(cameraPosition.x, cameraPosition.z, card.root.position.x, card.root.position.z);
      }
      ringMaterial.opacity = portalEmphasized ? 0.72 : 0.42;
      ring.scale.setScalar(portalEmphasized ? 1.08 : 1);
      const visibleCards = cards.filter((card) => card.mesh.visible).length;
      environment.metrics.drawCalls = baseDrawCalls + visibleCards + Number(stage === 'full' && !broadleafReview) + labelCount;
      environment.metrics.instances = baseInstances + cards.length;
      environment.metrics.visibleProps = baseVisibleProps + visibleCards;
      environment.metrics.textureMemoryBytes = baseTextureBytes + labelBytes + [...supplementalTextures.values()].reduce((total, item) => total + item.bytes, 0);
      environment.metrics.failedAssets = baseFailedAssets + failedTextures.size;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      baseDispose();
      resources.dispose();
      supplementalTextures.clear();
      failedTextures.clear();
    }
  };
};
