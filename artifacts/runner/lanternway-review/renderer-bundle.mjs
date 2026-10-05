// src/lib/games/runnerLanternwayAtlas.ts
var RUNNER_LANTERNWAY_ATLAS = {
  "background": {
    "width": 1280,
    "height": 720
  },
  "ground": {
    "width": 1024,
    "height": 342
  },
  "props": {
    "width": 1024,
    "height": 128,
    "sprites": {
      "waystone": [
        20,
        2,
        87,
        124
      ],
      "shard": [
        157,
        2,
        70,
        124
      ],
      "shield": [
        278,
        2,
        84,
        124
      ],
      "magnet": [
        400,
        2,
        95,
        124
      ],
      "doubleShards": [
        523,
        2,
        106,
        124
      ],
      "slowMo": [
        667,
        2,
        74,
        124
      ],
      "dash": [
        784,
        2,
        95,
        124
      ],
      "dreamSurge": [
        913,
        2,
        94,
        124
      ]
    }
  },
  "adventurer": {
    "width": 768,
    "height": 96,
    "frames": 12,
    "frameSize": [
      64,
      96
    ],
    "sourceRect": [
      6,
      0,
      51,
      96
    ],
    "frameDurationMs": 90
  },
  "echo": {
    "width": 960,
    "height": 104,
    "frames": 12,
    "frameSize": [
      80,
      104
    ],
    "sourceRect": [
      1,
      0,
      77,
      104
    ],
    "frameDurationMs": 90
  }
};

// src/lib/games/runnerLanternwaySkin.ts
var RUNNER_LANTERNWAY_URLS = {
  background: "/games/runner/skins/lanternway/background.webp",
  ground: "/games/runner/skins/lanternway/ground.webp",
  props: "/games/runner/skins/lanternway/props.webp",
  adventurer: "/games/runner/skins/lanternway/adventurer.webp",
  echo: "/games/runner/skins/lanternway/echo.webp"
};
var ASSET_KEYS = Object.keys(RUNNER_LANTERNWAY_URLS);
function loadRunnerLanternwaySkin(options = {}) {
  const { signal, timeoutMs = 4e3, imageFactory = () => new Image() } = options;
  if (signal?.aborted) return Promise.resolve({ assets: {}, complete: false });
  return new Promise((resolve) => {
    const assets = {};
    const images = [];
    const settled = /* @__PURE__ */ new Set();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      for (const image of images) {
        image.onload = null;
        image.onerror = null;
        if (!image.complete) image.removeAttribute("src");
      }
      const complete = !signal?.aborted && Object.keys(assets).length === ASSET_KEYS.length;
      resolve({ assets: complete ? assets : {}, complete });
    };
    const cancel = () => finish();
    const timer = setTimeout(finish, Math.max(1, timeoutMs));
    signal?.addEventListener("abort", cancel, { once: true });
    const settle = (key, image) => {
      if (finished || settled.has(key)) return;
      settled.add(key);
      if (image) assets[key] = image;
      if (settled.size === ASSET_KEYS.length) finish();
    };
    for (const key of ASSET_KEYS) {
      if (finished) break;
      try {
        const image = imageFactory();
        images.push(image);
        image.decoding = "async";
        image.onload = () => {
          if (image.naturalWidth !== RUNNER_LANTERNWAY_ATLAS[key].width || image.naturalHeight !== RUNNER_LANTERNWAY_ATLAS[key].height) {
            settle(key);
            return;
          }
          if (typeof image.decode === "function") image.decode().then(() => settle(key, image), () => settle(key));
          else settle(key, image);
        };
        image.onerror = () => settle(key);
        image.src = RUNNER_LANTERNWAY_URLS[key];
      } catch {
        settle(key);
      }
    }
  });
}
function drawRunnerLanternway(context, frame, assets, reducedMotion = false) {
  if (!ASSET_KEYS.every((key) => assets[key]?.naturalWidth === RUNNER_LANTERNWAY_ATLAS[key].width && assets[key]?.naturalHeight === RUNNER_LANTERNWAY_ATLAS[key].height)) return false;
  const { width: w, height: h, groundY, playerX, playerY, elapsedMs } = frame;
  if (![w, h, groundY, playerX, playerY, elapsedMs].every(Number.isFinite) || w <= 0 || h <= 0 || groundY < 0 || groundY >= h) return false;
  const { background, ground, props, adventurer, echo } = assets;
  const drawProp = (name, x, y, width, height) => {
    const [sx, sy, sw, sh] = RUNNER_LANTERNWAY_ATLAS.props.sprites[name];
    context.drawImage(props, sx, sy, sw, sh, x, y, width, height);
  };
  context.save();
  try {
    context.clearRect(0, 0, w, h);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(background, 0, 0, w, h);
    const mist = context.createLinearGradient(0, h * 0.32, 0, groundY);
    mist.addColorStop(0, "rgba(20,43,49,0)");
    mist.addColorStop(1, "rgba(20,43,49,0.16)");
    context.fillStyle = mist;
    context.fillRect(0, h * 0.32, w, groundY - h * 0.32);
    const floorHeight = h - groundY;
    const tileWidth = floorHeight * ground.naturalWidth / ground.naturalHeight;
    const travel = Number.isFinite(frame.distanceMeters) ? Math.max(0, frame.distanceMeters) : Math.max(0, elapsedMs) * 0.216;
    const offset = reducedMotion ? 0 : travel % tileWidth;
    for (let x = -offset; x < w; x += tileWidth) {
      context.drawImage(ground, x, groundY, tileWidth + 0.5, floorHeight);
    }
    context.fillStyle = "#f8dba2";
    context.fillRect(0, groundY, w, 1.2);
    for (const obstacle of frame.obstacles) {
      if (![obstacle.x, obstacle.width, obstacle.height].every(Number.isFinite) || obstacle.width <= 0 || obstacle.height <= 0) continue;
      const y = groundY - obstacle.height;
      context.fillStyle = "#26332f";
      context.fillRect(obstacle.x, y, obstacle.width, obstacle.height);
      drawProp("waystone", obstacle.x, y, obstacle.width, obstacle.height);
      context.strokeStyle = "#f6d69a";
      context.lineWidth = 1.25;
      context.strokeRect(obstacle.x + 0.625, y + 0.625, Math.max(0, obstacle.width - 1.25), Math.max(0, obstacle.height - 1.25));
    }
    for (const shard of frame.shards) {
      if (shard.collected || !Number.isFinite(shard.x) || !Number.isFinite(shard.y)) continue;
      drawProp("shard", shard.x - 9, shard.y - 13, 18, 26);
    }
    for (const pickup of frame.powerups) {
      if (pickup.collected || !Number.isFinite(pickup.x) || !Number.isFinite(pickup.y)) continue;
      drawProp(pickup.type, pickup.x - 15, pickup.y - 17, 30, 34);
    }
    const dashOffset = frame.dashTimer > 0 ? 25 : 0;
    const runnerX = playerX + dashOffset;
    const frameIndex = reducedMotion || playerY < groundY - 0.5 ? 1 : Math.floor(Math.max(0, elapsedMs) / RUNNER_LANTERNWAY_ATLAS.adventurer.frameDurationMs) % RUNNER_LANTERNWAY_ATLAS.adventurer.frames;
    if (frame.dashTimer > 0 && !reducedMotion) {
      context.globalAlpha = 0.18;
      context.drawImage(adventurer, frameIndex * 64 + 6, 0, 51, 96, runnerX - 36, playerY - 42, 34, 42);
      context.globalAlpha = 1;
    }
    context.fillStyle = "#16303660";
    context.beginPath();
    context.ellipse(runnerX, groundY + 3, 17, 3, 0, 0, Math.PI * 2);
    context.fill();
    context.shadowColor = "#fff1c7";
    context.shadowBlur = 2;
    context.drawImage(adventurer, frameIndex * 64 + 6, 0, 51, 96, runnerX - 17, playerY - 42, 34, 42);
    context.shadowBlur = 0;
    const bob = reducedMotion ? 0 : Math.sin(elapsedMs / 260) * 2;
    context.globalAlpha = frame.hasShield ? 1 : 0.72;
    context.drawImage(echo, frameIndex * 80 + 1, 0, 77, 104, playerX - 61, playerY - 73 + bob, 29, 39);
    context.globalAlpha = 1;
    if (frame.hasShield) {
      context.strokeStyle = "#a6efff";
      context.lineWidth = 1.7;
      const pulse = reducedMotion ? 0 : Math.max(0, frame.shieldPulse) * 3;
      context.beginPath();
      context.ellipse(runnerX, playerY - 21, 20 + pulse, 25 + pulse, 0, 0, Math.PI * 2);
      context.stroke();
    }
    if (frame.magnetTimer > 0) {
      context.strokeStyle = "#cca7ef";
      context.lineWidth = 1.4;
      context.beginPath();
      context.ellipse(runnerX, playerY - 21, 27, 30, 0, 0, Math.PI * 2);
      context.stroke();
    }
    if (frame.slowMoTimer > 0 || frame.dreamSurgeTimer > 0) {
      context.fillStyle = frame.slowMoTimer > 0 ? "#61d9f012" : "#f392d312";
      context.fillRect(0, 0, w, h);
    }
    context.font = "700 16px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const popup of frame.shardPopups) {
      if (![popup.x, popup.y, popup.t, popup.value].every(Number.isFinite)) continue;
      context.globalAlpha = Math.max(0, Math.min(1, 1 - popup.t / 500));
      context.fillStyle = "#fff1ca";
      context.shadowColor = "#332144";
      context.shadowBlur = 3;
      context.fillText(`+${popup.value}`, popup.x, popup.y - (reducedMotion ? 0 : popup.t / 20));
    }
    return true;
  } catch {
    return false;
  } finally {
    context.restore();
  }
}
export {
  RUNNER_LANTERNWAY_URLS,
  drawRunnerLanternway,
  loadRunnerLanternwaySkin
};
