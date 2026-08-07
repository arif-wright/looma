import * as THREE from 'three';

export type EnvironmentAtlasRegion = { x: number; y: number; width: number; height: number };

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

export const createEnvironmentAtlasMaterial = (texture: THREE.Texture) => new THREE.ShaderMaterial({
  uniforms: {
    atlas: { value: texture }, atlasRegion: { value: new THREE.Vector4(0, 0, 1, 1) }, opacity: { value: 1 }
  },
  vertexShader,
  fragmentShader,
  transparent: true,
  depthWrite: false
});

export const environmentAtlasRegionForFrame = (frame: number, frameCount: number, columns: number): EnvironmentAtlasRegion => {
  const safeFrame = Math.min(frameCount - 1, Math.max(0, frame));
  const rows = Math.ceil(frameCount / columns);
  return {
    x: (safeFrame % columns) / columns,
    y: 1 - (Math.floor(safeFrame / columns) + 1) / rows,
    width: 1 / columns,
    height: 1 / rows
  };
};

export const applyEnvironmentAtlasFrame = (
  material: THREE.ShaderMaterial,
  texture: THREE.Texture,
  region: EnvironmentAtlasRegion
) => {
  material.uniforms.atlas!.value = texture;
  material.uniforms.atlasRegion!.value.set(region.x, region.y, region.width, region.height);
};
