import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getWorldArea } from '$lib/game/areas';
import { CONNECTED_AREA_ART, createAreaEnvironment } from '$lib/game/renderers/three/areaEnvironment';

type ImageRequest = { load: (image: HTMLImageElement) => void; fail: (error: unknown) => void };
const imageHarness = (canvasAvailable = true) => {
  const requests = new Map<string, ImageRequest>();
  const labels: string[] = [];
  const canvases: Array<{ width: number; height: number; getContext: () => unknown }> = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = {
        width: 0, height: 0,
        getContext: () => canvasAvailable ? {
          clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, arc() {}, strokeText() {},
          fillText: (text: string) => labels.push(text)
        } : null
      };
      canvases.push(canvas);
      return canvas;
    }
  });
  vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((url, load, _progress, fail) => {
    requests.set(url, { load: load ?? (() => {}), fail: fail ?? (() => {}) });
    return {} as HTMLImageElement;
  });
  const image = (width: number, height: number) => ({ width, height, naturalWidth: width, naturalHeight: height }) as HTMLImageElement;
  return { requests, labels, canvases, image };
};

const cottageMesh = (environment: ReturnType<typeof createAreaEnvironment>) =>
  environment.root.getObjectByName('cottage-hollow-west-visual')!.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
const portalMesh = (environment: ReturnType<typeof createAreaEnvironment>) =>
  environment.root.getObjectByName('portal:hollow-to-grove')!.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('actual Three supplemental environment failure handling', () => {
  it('uses only loaded artwork normally and explicit cottage/portal signs only after a real load failure', () => {
    const h = imageHarness();
    const environment = createAreaEnvironment(getWorldArea('wilds-town'));
    const cottage = cottageMesh(environment);
    const portal = portalMesh(environment);
    expect(cottage.visible).toBe(false);
    expect(portal.visible).toBe(false);
    expect(h.labels).toEqual(['To Moonberry Grove']);
    const portalImage = h.image(1161, 1355);
    h.requests.get(CONNECTED_AREA_ART.portal)!.load(portalImage);
    environment.update(0);
    expect(portal.visible).toBe(true);
    expect(portal.material.map!.image).toBe(portalImage);
    expect(h.labels).not.toContain('Portal');

    h.requests.get(CONNECTED_AREA_ART.cottage)!.fail(new Error('404'));
    environment.update(1);
    expect(cottage.visible).toBe(true);
    expect(cottage.parent!.userData.assetStatus).toBe('failed');
    expect(cottage.material.map!.image).toEqual(expect.objectContaining({ width: 512, height: 512 }));
    expect(h.labels).toContain('Cottage');
    expect(h.labels).toContain('Please walk around');
    expect(h.labels).toContain('Artwork unavailable');
    // Both cottages share this single failed asset and its single failure sign texture.
    const east = environment.root.getObjectByName('cottage-hollow-east-visual')!.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    expect(east.material.map).toBe(cottage.material.map);
    expect(environment.metrics.failedAssets).toBe(1);
    environment.dispose();

    const second = createAreaEnvironment(getWorldArea('wilds-town'));
    h.requests.get(CONNECTED_AREA_ART.portal)!.fail(new Error('404'));
    second.update(0);
    expect(h.labels).toContain('Portal');
    expect(portalMesh(second).visible).toBe(true);
    second.dispose();
  });

  it('keeps base-plus-supplemental failure, texture, resource and visibility totals stable across frames', () => {
    const h = imageHarness();
    const environment = createAreaEnvironment(getWorldArea('wilds-town'));
    environment.update(0);
    const pendingBytes = environment.metrics.textureMemoryBytes;
    h.requests.get(CONNECTED_AREA_ART.portal)!.load(h.image(1161, 1355));
    h.requests.get(CONNECTED_AREA_ART.cottage)!.fail(new Error('404'));
    // Also fail one base asset, to verify that the helper does not lose its failure.
    const base = [...h.requests].find(([url]) => url.includes('large-rock-01.png'))!;
    base[1].fail(new Error('base texture unavailable'));
    environment.update(1);
    const totals = { ...environment.metrics };
    expect(totals.failedAssets).toBe(2);
    expect(totals.textureMemoryBytes - pendingBytes).toBe((1161 * 1355 + 512 * 512) * 4);
    for (let frame = 2; frame <= 12; frame += 1) {
      h.requests.get(CONNECTED_AREA_ART.cottage)!.fail(new Error('duplicate failure callback'));
      environment.update(frame);
      expect(environment.metrics.failedAssets).toBe(totals.failedAssets);
      expect(environment.metrics.textureMemoryBytes).toBe(totals.textureMemoryBytes);
      expect(environment.metrics.visibleProps).toBe(totals.visibleProps);
      expect(environment.metrics.instances).toBe(totals.instances);
      expect(environment.metrics.drawCalls).toBe(totals.drawCalls);
      expect(environment.metrics.sharedResources).toBe(totals.sharedResources);
    }
    environment.setQuality('minimum');
    environment.update(13);
    const lowQualityVisible = environment.metrics.visibleProps;
    environment.update(14);
    expect(environment.metrics.visibleProps).toBe(lowQualityVisible);
    expect(lowQualityVisible).toBeLessThan(totals.visibleProps);
    environment.dispose();
  });

  it('ignores late success and failure callbacks without allocating textures or signs after disposal', () => {
    const h = imageHarness();
    const environment = createAreaEnvironment(getWorldArea('wilds-town'));
    const cottageTexture = cottageMesh(environment).material.map!;
    const portalTexture = portalMesh(environment).material.map!;
    const cottageDispose = vi.spyOn(cottageTexture, 'dispose');
    const portalDispose = vi.spyOn(portalTexture, 'dispose');
    const cottageVersion = cottageTexture.version;
    const portalVersion = portalTexture.version;
    const cottageRequest = h.requests.get(CONNECTED_AREA_ART.cottage)!;
    const portalRequest = h.requests.get(CONNECTED_AREA_ART.portal)!;
    environment.dispose();
    const canvases = h.canvases.length;
    cottageRequest.fail(new Error('late failure'));
    cottageRequest.load(h.image(1377, 1142));
    portalRequest.load(h.image(1161, 1355));
    portalRequest.fail(new Error('late failure'));
    environment.update(1);
    environment.dispose();
    expect(h.canvases).toHaveLength(canvases);
    expect(cottageDispose).toHaveBeenCalledOnce();
    expect(portalDispose).toHaveBeenCalledOnce();
    expect(cottageTexture.version).toBe(cottageVersion);
    expect(portalTexture.version).toBe(portalVersion);
    expect(cottageTexture.image).toBeNull();
    expect(portalTexture.image).toBeNull();
    expect(environment.root.children).toHaveLength(0);
  });

  it('retains a visible warm footprint even if both the asset and Canvas 2D are unavailable', () => {
    const h = imageHarness(false);
    const environment = createAreaEnvironment(getWorldArea('wilds-town'));
    h.requests.get(CONNECTED_AREA_ART.cottage)!.fail(new Error('404'));
    environment.update(0);
    const cottage = cottageMesh(environment);
    expect(cottage.visible).toBe(true);
    expect(cottage.material.map).toBeNull();
    expect(cottage.material.color.getHexString()).toBe('d4af78');
    expect(environment.metrics.failedAssets).toBe(1);
    environment.dispose();
  });
});
