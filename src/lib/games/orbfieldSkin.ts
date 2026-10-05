/** Moonlit Conservatory is cosmetic only; simulation coordinates and collision radii live in the engine. */
export const ORBFIELD_SKIN_URLS = {
  background: '/games/dodge/skins/moonlit/arena.webp',
  player: '/games/dodge/skins/moonlit/pearl-wisp.webp',
  hazard: '/games/dodge/skins/moonlit/thorn-mote.webp',
  companion: '/games/dodge/skins/moonlit/muse.webp'
} as const;
export type OrbfieldSkinAsset = keyof typeof ORBFIELD_SKIN_URLS;
export type OrbfieldSkinAssets = Partial<Record<OrbfieldSkinAsset, HTMLImageElement>>;
export type OrbfieldSkinLoad = { assets: OrbfieldSkinAssets; complete: boolean };

/** One bounded preload per mounted shell. Abort detaches every callback; no retries or mid-round swaps. */
export function loadOrbfieldSkin(options: {
  signal?: AbortSignal; timeoutMs?: number; imageFactory?: () => HTMLImageElement
} = {}): Promise<OrbfieldSkinLoad> {
  const { signal, timeoutMs = 4000, imageFactory = () => new Image() } = options;
  if (signal?.aborted) return Promise.resolve({ assets: {}, complete: false });
  return new Promise((resolve) => {
    const assets: OrbfieldSkinAssets = {};
    const images: HTMLImageElement[] = [];
    const settled = new Set<OrbfieldSkinAsset>();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      for (const image of images) {
        image.onload = null; image.onerror = null;
        // Clearing the attribute cancels pending bytes without issuing an empty-src document request.
        if (!image.complete) image.removeAttribute('src');
      }
      resolve({ assets: signal?.aborted ? {} : assets, complete: !signal?.aborted && Object.keys(assets).length === 4 });
    };
    const cancel = () => finish();
    const timer = setTimeout(finish, timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    const settle = (key: OrbfieldSkinAsset, image?: HTMLImageElement) => {
      if (finished || settled.has(key)) return;
      settled.add(key);
      if (image) assets[key] = image;
      if (settled.size === 4) finish();
    };
    for (const key of Object.keys(ORBFIELD_SKIN_URLS) as OrbfieldSkinAsset[]) {
      if (finished) break;
      try {
        const image = imageFactory(); images.push(image);
        image.decoding = 'async';
        image.onload = () => {
          if (!image.naturalWidth || !image.naturalHeight) { settle(key); return; }
          // decode() avoids first-play decode work. Older image implementations may omit it.
          if (typeof image.decode === 'function') image.decode().then(() => settle(key, image), () => settle(key));
          else settle(key, image);
        };
        image.onerror = () => settle(key);
        image.src = ORBFIELD_SKIN_URLS[key];
      } catch { settle(key); }
    }
  });
}

type SkinFrame = {
  width: number; height: number; playerX: number; playerY: number;
  playerRadius: number; hazardRadius: number; elapsedMs: number; slowMo: boolean;
  enemies: ReadonlyArray<{ x: number; y: number }>;
};

/** Crops equally on opposite sides without stretching the painted plate or changing the camera. */
export function coverRect(imageWidth: number, imageHeight: number, width: number, height: number) {
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const sourceWidth = width / scale, sourceHeight = height / scale;
  return [(imageWidth - sourceWidth) / 2, (imageHeight - sourceHeight) / 2, sourceWidth, sourceHeight] as const;
}

export function createOrbfieldRenderer(context: CanvasRenderingContext2D, assets: OrbfieldSkinAssets = {}, reducedMotion: boolean | (() => boolean) = false) {
  // Snapshot references once. Loading or changing a theme cannot change silhouettes during this round.
  const { background, player, hazard, companion } = assets;
  let destroyed = false;
  return {
    draw(frame: SkinFrame) {
      if (destroyed) return;
      const staticMotion = typeof reducedMotion === 'function' ? reducedMotion() : reducedMotion;
      const { width: w, height: h, playerX: x, playerY: y, playerRadius: pr, hazardRadius: hr } = frame;
      context.clearRect(0, 0, w, h);
      context.fillStyle = '#191528'; context.fillRect(0, 0, w, h);
      if (background) {
        context.drawImage(background, ...coverRect(background.naturalWidth, background.naturalHeight, w, h), 0, 0, w, h);
        context.fillStyle = '#17142680'; context.fillRect(0, 0, w, h);
      }
      // Hazard body exactly communicates the original r=8 collision boundary. Art fills the same bounds.
      for (const enemy of frame.enemies) {
        context.fillStyle = '#ed8464'; context.beginPath();
        context.arc(enemy.x, enemy.y, hr, 0, Math.PI * 2); context.fill();
        if (hazard) context.drawImage(hazard, enemy.x - hr, enemy.y - hr, hr * 2, hr * 2);
        else {
          context.fillStyle = '#ffd195'; context.beginPath();
          for (let i = 0; i < 16; i++) {
            const angle = i * Math.PI / 8, radius = i % 2 ? hr * .65 : hr;
            const px = enemy.x + Math.cos(angle) * radius, py = enemy.y + Math.sin(angle) * radius;
            if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
          }
          context.closePath(); context.fill();
        }
      }
      context.save();
      if (frame.slowMo) {
        const pulse = staticMotion ? 0 : Math.sin(frame.elapsedMs / 220) * 2;
        context.strokeStyle = '#dcc1ff'; context.lineWidth = 2; context.beginPath();
        context.arc(x, y, pr + 9 + pulse, 0, Math.PI * 2); context.stroke();
      }
      context.fillStyle = '#f4edf9'; context.beginPath(); context.arc(x, y, pr, 0, Math.PI * 2); context.fill();
      if (player) context.drawImage(player, x - pr, y - pr, pr * 2, pr * 2);
      context.strokeStyle = '#fff4fa'; context.lineWidth = 1; context.beginPath();
      context.arc(x, y, pr - .5, 0, Math.PI * 2); context.stroke();
      // Muse remains decorative, like the original cyan companion. No collision or simulation state.
      if (companion) {
        const bob = staticMotion ? 0 : Math.sin(frame.elapsedMs / 500) * 1.5;
        context.globalAlpha = .92;
        context.drawImage(companion, x + 10, y - 35 + bob, 32, 32);
      }
      context.restore();
    },
    destroy() { destroyed = true; }
  };
}
