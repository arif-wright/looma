import { RUNNER_LANTERNWAY_ATLAS as ATLAS } from './runnerLanternwayAtlas';

/** Lanternway is a cosmetic layer. Collision, timing and input are owned by endlessRunner.ts. */
export const RUNNER_LANTERNWAY_URLS = {
  background: '/games/runner/skins/lanternway/background.webp',
  ground: '/games/runner/skins/lanternway/ground.webp',
  props: '/games/runner/skins/lanternway/props.webp',
  adventurer: '/games/runner/skins/lanternway/adventurer.webp',
  echo: '/games/runner/skins/lanternway/echo.webp'
} as const;
export type RunnerLanternwayAsset = keyof typeof RUNNER_LANTERNWAY_URLS;
export type RunnerLanternwayAssets = Partial<Record<RunnerLanternwayAsset, HTMLImageElement>>;
export type RunnerRenderFrame = {
  width: number; height: number; groundY: number; elapsedMs: number;
  /** Engine's accumulated logical world travel, not a new simulation value. */
  distanceMeters?: number;
  playerX: number; playerY: number; playerVy: number; hasShield: boolean; shieldPulse: number;
  magnetTimer: number; doubleShardsTimer: number; slowMoTimer: number; dashTimer: number; dreamSurgeTimer: number;
  obstacles: ReadonlyArray<{ x: number; width: number; height: number }>;
  shards: ReadonlyArray<{ x: number; y: number; collected?: boolean }>;
  powerups: ReadonlyArray<{ type: 'shield' | 'magnet' | 'doubleShards' | 'slowMo' | 'dash' | 'dreamSurge'; x: number; y: number; collected?: boolean }>;
  shardPopups: ReadonlyArray<{ x: number; y: number; t: number; value: number }>;
};

const ASSET_KEYS = Object.keys(RUNNER_LANTERNWAY_URLS) as RunnerLanternwayAsset[];

/** Bounded preload; callers freeze the returned complete snapshot for a run. Never swaps mid-round. */
export function loadRunnerLanternwaySkin(options: {
  signal?: AbortSignal; timeoutMs?: number; imageFactory?: () => HTMLImageElement
} = {}): Promise<{ assets: RunnerLanternwayAssets; complete: boolean }> {
  const { signal, timeoutMs = 4000, imageFactory = () => new Image() } = options;
  if (signal?.aborted) return Promise.resolve({ assets: {}, complete: false });
  return new Promise((resolve) => {
    const assets: RunnerLanternwayAssets = {};
    const images: HTMLImageElement[] = [];
    const settled = new Set<RunnerLanternwayAsset>();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      for (const image of images) {
        image.onload = null; image.onerror = null;
        if (!image.complete) image.removeAttribute('src');
      }
      const complete = !signal?.aborted && Object.keys(assets).length === ASSET_KEYS.length;
      // All-or-nothing avoids mismatched silhouettes or a half-painted game after a failed download.
      resolve({ assets: complete ? assets : {}, complete });
    };
    const cancel = () => finish();
    const timer = setTimeout(finish, Math.max(1, timeoutMs));
    signal?.addEventListener('abort', cancel, { once: true });
    const settle = (key: RunnerLanternwayAsset, image?: HTMLImageElement) => {
      if (finished || settled.has(key)) return;
      settled.add(key);
      if (image) assets[key] = image;
      if (settled.size === ASSET_KEYS.length) finish();
    };
    for (const key of ASSET_KEYS) {
      if (finished) break;
      try {
        const image = imageFactory(); images.push(image); image.decoding = 'async';
        image.onload = () => {
          if (image.naturalWidth !== ATLAS[key].width || image.naturalHeight !== ATLAS[key].height) { settle(key); return; }
          if (typeof image.decode === 'function') image.decode().then(() => settle(key, image), () => settle(key));
          else settle(key, image);
        };
        image.onerror = () => settle(key);
        image.src = RUNNER_LANTERNWAY_URLS[key];
      } catch { settle(key); }
    }
  });
}

/** Returns false before drawing if the full snapshot is unavailable; the engine owns its safe fallback. */
export function drawRunnerLanternway(
  context: CanvasRenderingContext2D, frame: RunnerRenderFrame,
  assets: RunnerLanternwayAssets, reducedMotion = false
): boolean {
  if (!ASSET_KEYS.every((key) => assets[key]?.naturalWidth === ATLAS[key].width && assets[key]?.naturalHeight === ATLAS[key].height)) return false;
  const { width: w, height: h, groundY, playerX, playerY, elapsedMs } = frame;
  if (![w, h, groundY, playerX, playerY, elapsedMs].every(Number.isFinite) || w <= 0 || h <= 0 || groundY < 0 || groundY >= h) return false;
  const { background, ground, props, adventurer, echo } = assets as Required<RunnerLanternwayAssets>;
  const drawProp = (name: keyof typeof ATLAS.props.sprites, x: number, y: number, width: number, height: number) => {
    const [sx, sy, sw, sh] = ATLAS.props.sprites[name];
    context.drawImage(props, sx, sy, sw, sh, x, y, width, height);
  };
  const drawCharacter = (name: 'adventurer' | 'echo', image: HTMLImageElement, index: number, x: number, y: number, width: number, height: number) => {
    const metadata = ATLAS[name];
    const [sx, sy, sw, sh] = metadata.sourceRect;
    context.drawImage(image, (index % metadata.frames) * metadata.frameSize[0] + sx, sy, sw, sh, x, y, width, height);
  };
  context.save();
  try {
    context.clearRect(0, 0, w, h);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(background, 0, 0, w, h);
    // A quiet action lane separates small silhouettes from the painted town.
    const mist = context.createLinearGradient(0, h * .32, 0, groundY);
    mist.addColorStop(0, 'rgba(20,43,49,0)');
    mist.addColorStop(1, 'rgba(20,43,49,0.16)');
    context.fillStyle = mist; context.fillRect(0, h * .32, w, groundY - h * .32);

    // The floor is cosmetic. Its top remains exactly on the collision ground line.
    const floorHeight = h - groundY;
    const tileWidth = floorHeight * ground.naturalWidth / ground.naturalHeight;
    const travel = Number.isFinite(frame.distanceMeters) ? Math.max(0, frame.distanceMeters!) : Math.max(0, elapsedMs) * .216;
    const offset = reducedMotion ? 0 : travel % tileWidth;
    for (let x = -offset; x < w; x += tileWidth) {
      context.drawImage(ground, x, groundY, tileWidth + .5, floorHeight);
    }
    context.fillStyle = '#f8dba2'; context.fillRect(0, groundY, w, 1.2);

    for (const obstacle of frame.obstacles) {
      if (![obstacle.x, obstacle.width, obstacle.height].every(Number.isFinite) || obstacle.width <= 0 || obstacle.height <= 0) continue;
      const y = groundY - obstacle.height;
      // The solid rectangular backing and outline communicate the engine's AABB,
      // including the small chipped regions of the painted stone. No jitter/rotation.
      context.fillStyle = '#26332f'; context.fillRect(obstacle.x, y, obstacle.width, obstacle.height);
      drawProp('waystone', obstacle.x, y, obstacle.width, obstacle.height);
      context.strokeStyle = '#f6d69a'; context.lineWidth = 1.25;
      context.strokeRect(obstacle.x + .625, y + .625, Math.max(0, obstacle.width - 1.25), Math.max(0, obstacle.height - 1.25));
    }
    for (const shard of frame.shards) {
      if (shard.collected || !Number.isFinite(shard.x) || !Number.isFinite(shard.y)) continue;
      drawProp('shard', shard.x - 9, shard.y - 13, 18, 26);
    }
    for (const pickup of frame.powerups) {
      if (pickup.collected || !Number.isFinite(pickup.x) || !Number.isFinite(pickup.y)) continue;
      drawProp(pickup.type, pickup.x - 15, pickup.y - 17, 30, 34);
    }

    const dashOffset = frame.dashTimer > 0 ? 25 : 0;
    const runnerX = playerX + dashOffset;
    const frameIndex = reducedMotion || playerY < groundY - .5 ? 1 : Math.floor(Math.max(0, elapsedMs) / ATLAS.adventurer.frameDurationMs) % ATLAS.adventurer.frames;
    // Dash's existing collision offset is also shown by the artwork; this does not move simulation state.
    if (frame.dashTimer > 0 && !reducedMotion) {
      context.globalAlpha = .18;
      drawCharacter('adventurer', adventurer, frameIndex, runnerX - 36, playerY - 42, 34, 42);
      context.globalAlpha = 1;
    }
    context.fillStyle = '#16303660'; context.beginPath();
    context.ellipse(runnerX, groundY + 3, 17, 3, 0, 0, Math.PI * 2); context.fill();
    context.shadowColor = '#fff1c7'; context.shadowBlur = 2;
    drawCharacter('adventurer', adventurer, frameIndex, runnerX - 17, playerY - 42, 34, 42);
    context.shadowBlur = 0;

    // Echo is decorative and never has a hitbox. Canonical source art is reused unchanged.
    const bob = reducedMotion ? 0 : Math.sin(elapsedMs / 260) * 2;
    context.globalAlpha = frame.hasShield ? 1 : .72;
    drawCharacter('echo', echo, frameIndex, playerX - 61, playerY - 73 + bob, 29, 39);
    context.globalAlpha = 1;
    if (frame.hasShield) {
      context.strokeStyle = '#a6efff'; context.lineWidth = 1.7;
      const pulse = reducedMotion ? 0 : Math.max(0, frame.shieldPulse) * 3;
      context.beginPath(); context.ellipse(runnerX, playerY - 21, 20 + pulse, 25 + pulse, 0, 0, Math.PI * 2); context.stroke();
    }
    if (frame.magnetTimer > 0) {
      context.strokeStyle = '#cca7ef'; context.lineWidth = 1.4;
      context.beginPath(); context.ellipse(runnerX, playerY - 21, 27, 30, 0, 0, Math.PI * 2); context.stroke();
    }
    if (frame.slowMoTimer > 0 || frame.dreamSurgeTimer > 0) {
      context.fillStyle = frame.slowMoTimer > 0 ? '#61d9f012' : '#f392d312';
      context.fillRect(0, 0, w, h);
    }
    context.font = '700 16px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    for (const popup of frame.shardPopups) {
      if (![popup.x, popup.y, popup.t, popup.value].every(Number.isFinite)) continue;
      context.globalAlpha = Math.max(0, Math.min(1, 1 - popup.t / 500));
      context.fillStyle = '#fff1ca'; context.shadowColor = '#332144'; context.shadowBlur = 3;
      context.fillText(`+${popup.value}`, popup.x, popup.y - (reducedMotion ? 0 : popup.t / 20));
    }
    return true;
  } catch {
    // The engine clears and draws its fallback if a browser refuses an image draw.
    return false;
  } finally {
    context.restore();
  }
}
