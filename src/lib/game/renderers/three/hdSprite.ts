import * as THREE from 'three';
import type { FacingDirection } from '../../facing';
import { atlasUvFor, pageFor, parseSpriteAssetContract, resolveAssetImageUrl, sequenceFor, spritePresentationLayout, type SpriteAssetContract } from '../../sprites/assetContract';
import { MotionAnimationState, SpriteAnimator, effectsEnabledForQuality, yawOnlyBillboardRotation } from '../../sprites/animation';
import { ReferenceAssetCache, type ResourceLease } from '../../sprites/atlasCache';
import type { VisualQuality } from './performance';

export const PLAYER_ATLAS_URL = '/game/sprites/players/placeholder/player-placeholder.atlas.json';
export const MUSE_ATLAS_URL = '/game/sprites/companions/muse/muse.atlas.json';

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragmentShader = `
uniform sampler2D atlas;
uniform vec4 atlasRegion;
uniform float opacity;
varying vec2 vUv;
void main() {
  vec2 atlasUv = atlasRegion.xy + vUv * atlasRegion.zw;
  vec4 color = texture2D(atlas, atlasUv);
  if (color.a < 0.025) discard;
  gl_FragColor = vec4(color.rgb, color.a * opacity);
}`;

const labelTexture = (label: string, subordinate: boolean) => {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 80;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.font = `${subordinate ? 500 : 650} ${subordinate ? 27 : 31}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = subordinate ? 5 : 7;
  context.strokeStyle = 'rgba(5, 13, 20, .82)';
  context.strokeText(label.slice(0, 28), 192, 40);
  context.fillStyle = subordinate ? '#e8e2ff' : '#ffffff';
  context.fillText(label.slice(0, 28), 192, 40);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

export class HdSpriteResources {
  private readonly contracts = new ReferenceAssetCache<SpriteAssetContract>();
  private readonly textures = new ReferenceAssetCache<THREE.Texture>();
  private readonly textureBytes = new Map<string, number>();
  readonly planeGeometry = new THREE.PlaneGeometry(1, 1);
  readonly shadowGeometry = new THREE.CircleGeometry(0.5, 24);
  readonly auraGeometry = new THREE.RingGeometry(0.42, 0.58, 32);
  readonly shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x07131a, transparent: true, opacity: 0.24, depthWrite: false });
  readonly auraMaterial = new THREE.MeshBasicMaterial({ color: 0x67f5e8, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });

  acquireContract(manifestUrl: string) {
    return this.contracts.acquire(manifestUrl, async () => {
      const response = await fetch(manifestUrl, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Atlas metadata request failed (${response.status})`);
      const contract = parseSpriteAssetContract(await response.json());
      if (!contract) throw new Error('Atlas metadata is invalid');
      return contract;
    }, () => undefined);
  }

  acquirePage(manifestUrl: string, contract: SpriteAssetContract, pageId: string) {
    const page = pageFor(contract, pageId);
    if (!page) return Promise.reject(new Error(`Unknown atlas page: ${pageId}`));
    const imageUrl = resolveAssetImageUrl(manifestUrl, page.image);
    return this.textures.acquire(imageUrl, async () => {
      const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      this.textureBytes.set(imageUrl, page.imageWidth * page.imageHeight * 4);
      return texture;
    }, (texture) => {
      texture.dispose();
      this.textureBytes.delete(imageUrl);
    });
  }

  get cacheSize() { return this.textures.size(); }
  get estimatedTextureMemoryBytes() { return [...this.textureBytes.values()].reduce((sum, bytes) => sum + bytes, 0); }
  references(url: string) { return this.textures.references(url); }

  dispose() {
    this.planeGeometry.dispose();
    this.shadowGeometry.dispose();
    this.auraGeometry.dispose();
    this.shadowMaterial.dispose();
    this.auraMaterial.dispose();
  }
}

export type HdSpriteOptions = {
  label: string;
  manifestUrl: string;
  fallbackManifestUrl?: string;
  companion?: boolean;
  museEffects?: boolean;
};

export class HdSpriteEntity {
  readonly root = new THREE.Group();
  readonly plane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly label: THREE.Sprite;
  readonly aura: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly animator = new SpriteAnimator();
  readonly motion = new MotionAnimationState();
  loadState: 'loading' | 'loaded' | 'fallback' | 'failed' = 'loading';
  assetId = 'loading';
  private contract: SpriteAssetContract | null = null;
  private contractLease: ResourceLease<SpriteAssetContract> | null = null;
  private pageLeases = new Map<string, ResourceLease<THREE.Texture>>();
  private manifestUrl = '';
  private pageRequest = 0;
  private pendingPageSet = '';
  private destroyed = false;
  private lastFrameKey = '';
  private loadingTexture: THREE.Texture | null;

  constructor(private readonly resources: HdSpriteResources, private readonly options: HdSpriteOptions) {
    const loadingTexture = new THREE.DataTexture(new Uint8Array([114, 99, 154, 255]), 1, 1);
    loadingTexture.needsUpdate = true;
    this.loadingTexture = loadingTexture;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        atlas: { value: loadingTexture }, atlasRegion: { value: new THREE.Vector4(0, 0, 1, 1) }, opacity: { value: 1 }
      }, vertexShader, fragmentShader, transparent: true, depthWrite: false
    });
    this.plane = new THREE.Mesh(resources.planeGeometry, material);
    this.plane.name = options.companion ? 'companion-hd-sprite' : 'player-hd-sprite';
    this.plane.scale.set(options.companion ? 2.2 : 2.8, options.companion ? 2.2 : 2.8, 1);
    this.plane.position.y = this.plane.scale.y / 2 + 0.02;

    this.shadow = new THREE.Mesh(resources.shadowGeometry, resources.shadowMaterial);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(options.companion ? 1.05 : 1.35, options.companion ? 0.55 : 0.68, 1);
    this.shadow.position.y = 0.018;

    const nameTexture = labelTexture(options.label, Boolean(options.companion));
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture, transparent: true, depthWrite: false }));
    this.label.name = options.companion ? 'companion-nameplate' : 'player-nameplate';
    this.label.scale.set(options.companion ? 2.15 : 2.5, options.companion ? 0.45 : 0.52, 1);
    this.label.position.y = options.companion ? 2.48 : 3.12;

    this.aura = new THREE.Mesh(resources.auraGeometry, resources.auraMaterial);
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.03;
    this.aura.visible = Boolean(options.museEffects);
    this.root.add(this.shadow, this.plane, this.label, this.aura);
    void this.load();
  }

  private async load() {
    try {
      await this.attach(await this.resources.acquireContract(this.options.manifestUrl), this.options.manifestUrl, false);
    } catch {
      if (this.options.fallbackManifestUrl && this.options.fallbackManifestUrl !== this.options.manifestUrl) {
        try {
          await this.attach(await this.resources.acquireContract(this.options.fallbackManifestUrl), this.options.fallbackManifestUrl, true);
          return;
        } catch { /* use safe colored loading texture */ }
      }
      this.loadState = 'failed';
      this.assetId = 'safe-color-fallback';
    }
  }

  private async attach(lease: ResourceLease<SpriteAssetContract>, manifestUrl: string, fallback: boolean) {
    if (this.destroyed) { lease.release(); return; }
    this.contractLease?.release();
    this.contractLease = lease;
    this.contract = lease.resource;
    this.manifestUrl = manifestUrl;
    const idle = sequenceFor(lease.resource, 'idle', 's');
    const idlePages = new Set(idle.sequence.frames.map((frame) => frame.page));
    const initialPageSet = [...idlePages].sort().join('|');
    this.pendingPageSet = initialPageSet;
    try { await this.ensurePages(idlePages); }
    finally { if (this.pendingPageSet === initialPageSet) this.pendingPageSet = ''; }
    if (this.destroyed) return;
    this.loadingTexture?.dispose();
    this.loadingTexture = null;
    this.loadState = fallback ? 'fallback' : 'loaded';
    this.assetId = lease.resource.id;
    const clip = lease.resource.animations.idle!;
    const layout = spritePresentationLayout(clip);
    this.plane.scale.set(layout.width, layout.height, 1);
    this.plane.position.y = layout.centerY + 0.02;
    if (clip.shadow) {
      this.shadow.scale.set(clip.shadow.width, clip.shadow.depth, 1);
      this.shadow.position.z = clip.shadow.offsetY;
    }
    this.label.position.y = layout.labelY;
    this.lastFrameKey = '';
  }

  private async ensurePages(pageIds: Set<string>) {
    if (!this.contract) return;
    const request = ++this.pageRequest;
    const acquired = new Map<string, ResourceLease<THREE.Texture>>();
    try {
      await Promise.all([...pageIds].map(async (pageId) => {
        const retained = this.pageLeases.get(pageId);
        if (retained) return;
        acquired.set(pageId, await this.resources.acquirePage(this.manifestUrl, this.contract!, pageId));
      }));
      if (this.destroyed || request !== this.pageRequest) {
        acquired.forEach((lease) => lease.release());
        return;
      }
      for (const [pageId, pageLease] of acquired) this.pageLeases.set(pageId, pageLease);
      for (const [pageId, pageLease] of this.pageLeases) {
        if (!pageIds.has(pageId)) { pageLease.release(); this.pageLeases.delete(pageId); }
      }
      this.lastFrameKey = '';
    } catch (error) {
      acquired.forEach((pageLease) => pageLease.release());
      throw error;
    }
  }

  update(deltaSeconds: number, facing: FacingDirection, magnitude: number, cameraYaw: number, quality: VisualQuality, distanceToCamera = 0) {
    const state = this.motion.update(magnitude);
    this.animator.select(state, facing);
    const rotation = yawOnlyBillboardRotation(cameraYaw);
    this.plane.rotation.set(rotation.x, rotation.y, rotation.z);
    this.label.visible = distanceToCamera < 34;
    this.aura.visible = Boolean(this.options.museEffects) && effectsEnabledForQuality(quality);
    if (!this.contract) return;
    const selection = sequenceFor(this.contract, state, facing);
    const frame = this.animator.update(deltaSeconds, {
      frameCount: selection.sequence.frames.length, fps: selection.fps, loop: selection.loop
    });
    const key = `${state}:${facing}:${frame}`;
    const uv = atlasUvFor(this.contract, state, facing, frame);
    const pages = new Set(selection.sequence.frames.map((item) => item.page));
    const pageSet = [...pages].sort().join('|');
    const pageSetNeedsUpdate = pages.size !== this.pageLeases.size || [...pages].some((pageId) => !this.pageLeases.has(pageId));
    if ((pageSetNeedsUpdate || Boolean(this.pendingPageSet)) && pageSet !== this.pendingPageSet) {
      this.pendingPageSet = pageSet;
      void this.ensurePages(pages).catch(() => { this.loadState = 'failed'; }).finally(() => {
        if (this.pendingPageSet === pageSet) this.pendingPageSet = '';
      });
    }
    const texture = this.pageLeases.get(uv.page)?.resource;
    if (!texture) return;
    if (key === this.lastFrameKey && this.plane.material.uniforms.atlas!.value === texture) return;
    this.lastFrameKey = key;
    this.plane.material.uniforms.atlas!.value = texture;
    this.plane.material.uniforms.atlasRegion!.value.set(uv.u, uv.v, uv.width, uv.height);
  }

  get animationDiagnostics() {
    if (!this.contract) return null;
    const selected = sequenceFor(this.contract, this.animator.state, this.animator.facing);
    return { state: this.animator.state, facing: this.animator.facing, frame: this.animator.frame + 1,
      totalFrames: selected.sequence.frames.length, fps: selected.fps };
  }

  setOpacity(opacity: number) { this.plane.material.uniforms.opacity!.value = opacity; }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pageRequest += 1;
    this.pageLeases.forEach((lease) => lease.release());
    this.pageLeases.clear();
    this.contractLease?.release();
    this.contractLease = null;
    this.loadingTexture?.dispose();
    this.loadingTexture = null;
    this.plane.material.dispose();
    const labelMaterial = this.label.material as THREE.SpriteMaterial;
    labelMaterial.map?.dispose();
    labelMaterial.dispose();
    this.root.clear();
  }
}
