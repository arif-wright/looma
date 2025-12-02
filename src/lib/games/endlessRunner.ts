import type {
  LoomaGameFactory,
  LoomaGameInstance,
  LoomaGameInitOptions,
  LoomaGameResult,
  LoomaPowerupState
} from './types';
import { playSound as playGameSound } from './audio';

type Obstacle = { x: number; width: number; height: number };
type Shard = { x: number; y: number; collected?: boolean };
type ShardPopup = { x: number; y: number; t: number; value: number };
type PowerupType = 'shield' | 'magnet' | 'doubleShards' | 'slowMo' | 'dash' | 'dreamSurge';
type Powerup = { type: PowerupType; x: number; y: number; collected?: boolean };

type PowerupUsage = {
  shield: number;
  magnet: number;
  doubleShards: number;
  slowMo: number;
  dash: number;
  dreamSurge: number;
};

const SHARD_POPUP_DURATION = 500;
const SHARD_RESPAWN_MIN = 1200;
const SHARD_RESPAWN_MAX = 2600;
const SHARD_HITBOX = 30;
const POWERUP_RESPAWN_MIN = 6000;
const POWERUP_RESPAWN_MAX = 12000;
const MAGNET_DURATION = 5000;
const DOUBLE_SHARDS_DURATION = 6000;
const SLOW_MO_DURATION = 3500;
const DASH_DURATION = 600;
const DREAM_SURGE_DURATION = 6000;
const DASH_COLLISION_OFFSET = 25;
const DREAM_SURGE_SPEED_FACTOR = 1.15;
const DREAM_SURGE_SCORE_MULTIPLIER = 1.5;
const DREAM_SURGE_SHARD_BONUS = 1;
const SLOW_MO_TIME_SCALE = 0.4;

const POWERUP_POOL: Array<{ type: PowerupType; weight: number }> = [
  { type: 'shield', weight: 3 },
  { type: 'magnet', weight: 3 },
  { type: 'doubleShards', weight: 3 },
  { type: 'slowMo', weight: 2 },
  { type: 'dash', weight: 1.5 },
  { type: 'dreamSurge', weight: 1.5 }
];

const roundRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
};

export const createEndlessRunner: LoomaGameFactory = (
  opts: LoomaGameInitOptions
): LoomaGameInstance => {
  const {
    canvas,
    onGameOver,
    difficulty = 'normal',
    onShardCollected,
    onPowerupState
  } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  canvas.style.touchAction = 'none';
  (canvas.style as any).webkitTapHighlightColor = 'transparent';

  const difficultyFactor =
    difficulty === 'easy' ? 0.85 : difficulty === 'hard' ? 1.25 : 1.0;

  // Slightly lighter gravity + stronger jump for better mobile feel
  const gravity = 0.0014;
  const jumpVelocity = -0.85 * (difficulty === 'hard' ? 1.08 : 1);
  const baseSpeed = 0.24 * difficultyFactor * 0.9;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

  const baseSpawnInterval = 1650 / difficultyFactor;
  const minSpawnInterval = 820 / difficultyFactor;
  let spawnInterval = baseSpawnInterval;

  const groundY = () => canvas.height * 0.75;

  let playerX = 0;
  let playerY = 0;
  let playerVy = 0;
  let isOnGround = true;

  let hasShield = true;
  let shieldPulse = 0;

  let obstacles: Obstacle[] = [];
  let spawnTimer = 0;
  let shards: Shard[] = [];
  let shardPopups: ShardPopup[] = [];
  let shardSpawnTimer = 0;
  let shardsCollected = 0;
  let powerups: Powerup[] = [];
  let powerupSpawnTimer = 0;
  let magnetTimer = 0;
  let doubleShardsTimer = 0;
  let slowMoTimer = 0;
  let dashTimer = 0;
  let dreamSurgeTimer = 0;
  let powerupUsage: PowerupUsage = { shield: 0, magnet: 0, doubleShards: 0, slowMo: 0, dash: 0, dreamSurge: 0 };
  let lastPowerupState: LoomaPowerupState | null = null;

  let lastTime = performance.now();
  let elapsedMs = 0;
  let score = 0;

  let rafId = 0;
  let running = false;
  let paused = false;

  const notifyShardCount = () => {
    onShardCollected?.(shardsCollected);
  };

  const quantizeTimer = (value: number) => {
    if (value <= 0) return 0;
    return Math.ceil(value / 100) * 100;
  };

  const emitPowerupState = () => {
    if (!onPowerupState) return;
    const payload: LoomaPowerupState = {
      shield: hasShield,
      magnet: quantizeTimer(magnetTimer),
      doubleShards: quantizeTimer(doubleShardsTimer),
      slowMo: quantizeTimer(slowMoTimer),
      dash: quantizeTimer(dashTimer),
      dreamSurge: quantizeTimer(dreamSurgeTimer)
    };
    const changed =
      !lastPowerupState ||
      lastPowerupState.shield !== payload.shield ||
      lastPowerupState.magnet !== payload.magnet ||
      lastPowerupState.doubleShards !== payload.doubleShards ||
      lastPowerupState.slowMo !== payload.slowMo ||
      lastPowerupState.dash !== payload.dash ||
      lastPowerupState.dreamSurge !== payload.dreamSurge;
    if (changed) {
      lastPowerupState = payload;
      onPowerupState({ ...payload });
    }
  };

  const resetRun = () => {
    playerX = canvas.width * 0.2;
    playerY = groundY();
    playerVy = 0;
    isOnGround = true;
    hasShield = true;
    shieldPulse = 0;
    obstacles = [];
    spawnTimer = 0;
    spawnInterval = 1200 / difficultyFactor;
    elapsedMs = 0;
    score = 0;
    shards = [];
    shardPopups = [];
    shardSpawnTimer = randomBetween(SHARD_RESPAWN_MIN, SHARD_RESPAWN_MAX);
    shardsCollected = 0;
    powerups = [];
    powerupSpawnTimer = randomBetween(POWERUP_RESPAWN_MIN, POWERUP_RESPAWN_MAX);
    magnetTimer = 0;
    doubleShardsTimer = 0;
    slowMoTimer = 0;
    dashTimer = 0;
    dreamSurgeTimer = 0;
    powerupUsage = { shield: 0, magnet: 0, doubleShards: 0, slowMo: 0, dash: 0, dreamSurge: 0 };
    lastPowerupState = null;
    notifyShardCount();
    emitPowerupState();
  };

  const spawnObstacle = () => {
    const width = 28 + Math.random() * 38;
    const height = 42 + Math.random() * 68;
    obstacles.push({
      x: canvas.width + width,
      width,
      height
    });
  };

  const spawnShard = () => {
    const gY = groundY();
    const y = randomBetween(gY - 90, gY - 30);
    shards.push({
      x: canvas.width + 40,
      y
    });
  };

const spawnPowerup = () => {
  const gY = groundY();
  const type = choosePowerupType();
  if (!type) return;
  powerups.push({
    type,
    x: canvas.width + 40,
    y: randomBetween(gY - 90, gY - 30)
  });
};

const choosePowerupType = (): PowerupType => {
  const totalWeight = POWERUP_POOL.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of POWERUP_POOL) {
    if (roll < entry.weight) {
      return entry.type;
    }
    roll -= entry.weight;
  }
  return POWERUP_POOL[0]?.type ?? 'shield';
};

  const collectShard = (shard: Shard) => {
    if (shard.collected) return;
    shard.collected = true;
    let amount = doubleShardsTimer > 0 ? 2 : 1;
    if (dreamSurgeTimer > 0) amount += DREAM_SURGE_SHARD_BONUS;
    shardsCollected += amount;
    playGameSound('shard');
    shardPopups.push({ x: shard.x, y: shard.y, t: 0, value: amount });
    notifyShardCount();
  };

  const checkShardCollisions = () => {
    const playerHeight = 42;
    const playerCenterY = playerY - playerHeight / 2;
    for (const shard of shards) {
      if (shard.collected) continue;
      const dx = Math.abs(playerX - shard.x);
      const dy = Math.abs(playerCenterY - shard.y);
      if (dx < SHARD_HITBOX && dy < SHARD_HITBOX) {
        collectShard(shard);
      }
    }
  };

  const activatePowerup = (type: PowerupType) => {
    switch (type) {
      case 'shield':
        hasShield = true;
        shieldPulse = 1;
        powerupUsage.shield += 1;
        break;
      case 'magnet':
        magnetTimer = MAGNET_DURATION;
        powerupUsage.magnet += 1;
        break;
      case 'doubleShards':
        doubleShardsTimer = DOUBLE_SHARDS_DURATION;
        powerupUsage.doubleShards += 1;
        break;
      case 'slowMo':
        slowMoTimer = SLOW_MO_DURATION;
        powerupUsage.slowMo += 1;
        break;
      case 'dash':
        dashTimer = DASH_DURATION;
        powerupUsage.dash += 1;
        break;
      case 'dreamSurge':
        dreamSurgeTimer = DREAM_SURGE_DURATION;
        powerupUsage.dreamSurge += 1;
        break;
    }
    emitPowerupState();
  };

  const checkPowerupCollisions = () => {
    const playerHeight = 42;
    const playerCenterY = playerY - playerHeight / 2;
    for (const powerup of powerups) {
      if (powerup.collected) continue;
      const dx = Math.abs(playerX - powerup.x);
      const dy = Math.abs(playerCenterY - powerup.y);
      if (dx < SHARD_HITBOX && dy < SHARD_HITBOX) {
        powerup.collected = true;
        activatePowerup(powerup.type);
        playGameSound('shield');
      }
    }
  };

  const drawShards = (context: CanvasRenderingContext2D) => {
    context.save();
    context.fillStyle = '#4fffff';
    shards.forEach((shard) => {
      if (shard.collected) return;
      context.beginPath();
      context.moveTo(shard.x, shard.y - 10);
      context.lineTo(shard.x + 8, shard.y);
      context.lineTo(shard.x, shard.y + 10);
      context.lineTo(shard.x - 8, shard.y);
      context.closePath();
      context.fill();
    });
    context.restore();
  };

  const drawShardPopups = (context: CanvasRenderingContext2D) => {
    context.save();
    context.font = '600 16px "Inter", system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    shardPopups.forEach((popup) => {
      const alpha = 1 - popup.t / SHARD_POPUP_DURATION;
      context.globalAlpha = Math.max(0, alpha);
      context.fillStyle = '#4fffff';
      context.fillText(`+${popup.value}`, popup.x, popup.y - popup.t / 20);
    });
    context.restore();
  };

  const drawPowerups = (context: CanvasRenderingContext2D) => {
    powerups.forEach((powerup) => {
      if (powerup.collected) return;
      context.save();
      context.translate(powerup.x, powerup.y);
      switch (powerup.type) {
        case 'shield':
          context.strokeStyle = '#38bdf8';
          context.lineWidth = 3;
          context.globalAlpha = 0.9;
          context.beginPath();
          context.arc(0, 0, 13, 0, Math.PI * 2);
          context.stroke();
          context.beginPath();
          context.arc(0, 0, 8, 0, Math.PI * 2);
          context.stroke();
          break;
        case 'magnet':
          context.fillStyle = '#c084fc';
          context.beginPath();
          context.moveTo(0, -12);
          context.lineTo(10, 0);
          context.lineTo(0, 12);
          context.lineTo(-10, 0);
          context.closePath();
          context.fill();
          break;
        case 'doubleShards':
          context.fillStyle = '#facc15';
          context.beginPath();
          for (let i = 0; i < 6; i += 1) {
            const angle = (Math.PI / 3) * i;
            const nextAngle = angle + Math.PI / 3;
            const radius = 12;
            const x1 = Math.cos(angle) * radius;
            const y1 = Math.sin(angle) * radius;
            const x2 = Math.cos(nextAngle) * radius;
            const y2 = Math.sin(nextAngle) * radius;
            if (i === 0) context.moveTo(x1, y1);
            context.lineTo(x2, y2);
          }
          context.closePath();
          context.fill();
          break;
        case 'slowMo':
          context.strokeStyle = '#7dd3fc';
          context.lineWidth = 4;
          context.globalAlpha = 0.85;
          context.beginPath();
          context.arc(0, 0, 14, 0, Math.PI * 2);
          context.stroke();
          context.beginPath();
          context.moveTo(-8, 0);
          context.lineTo(8, 0);
          context.stroke();
          break;
        case 'dash':
          context.fillStyle = '#facc15';
          context.beginPath();
          context.moveTo(-12, -4);
          context.lineTo(12, 0);
          context.lineTo(-12, 4);
          context.closePath();
          context.fill();
          break;
        case 'dreamSurge':
          const surgeGradient = context.createRadialGradient(0, 0, 2, 0, 0, 16);
          surgeGradient.addColorStop(0, '#fb7185');
          surgeGradient.addColorStop(1, 'rgba(249, 115, 22, 0.1)');
          context.fillStyle = surgeGradient;
          context.beginPath();
          context.arc(0, 0, 16, 0, Math.PI * 2);
          context.fill();
          break;
      }
      context.restore();
    });
  };

  const endRun = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    const result: LoomaGameResult = {
      score: Math.floor(score),
      durationMs: elapsedMs,
      meta: {
        difficulty: difficultyFactor,
        shards: shardsCollected,
        shield_powerups: powerupUsage.shield,
        magnet_powerups: powerupUsage.magnet,
        double_powerups: powerupUsage.doubleShards,
        slowmo_powerups: powerupUsage.slowMo,
        dash_powerups: powerupUsage.dash,
        dream_powerups: powerupUsage.dreamSurge
      }
    };
    onGameOver(result);
  };

  const handleJump = () => {
    if (!running) return;
    if (!isOnGround) return;
    isOnGround = false;
    playerVy = jumpVelocity;
    playGameSound('jump');
  };

  const keyHandler = (event: KeyboardEvent) => {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault();
      handleJump();
    }
  };

  const pointerHandler = (event: PointerEvent) => {
    event.preventDefault();
    handleJump();
  };

  const update = (dt: number) => {
    const timeScale = slowMoTimer > 0 ? SLOW_MO_TIME_SCALE : 1;
    const scaledDt = dt * timeScale;
    elapsedMs += scaledDt;
    const surgeSpeedFactor = dreamSurgeTimer > 0 ? DREAM_SURGE_SPEED_FACTOR : 1;
    const speed = baseSpeed * (1 + (elapsedMs / 60000) * difficultyFactor) * surgeSpeedFactor;
    const scoreMultiplier = dreamSurgeTimer > 0 ? DREAM_SURGE_SCORE_MULTIPLIER : 1;
    score += scaledDt * 0.012 * difficultyFactor * scoreMultiplier;

    playerVy += gravity * scaledDt;
    playerY += playerVy * scaledDt;
    const gY = groundY();
    if (playerY >= gY) {
      playerY = gY;
      playerVy = 0;
      isOnGround = true;
    }

    spawnTimer += scaledDt;
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      spawnObstacle();
      const difficultyProgress = Math.min(score / 5000, 1);
      const targetInterval = lerp(baseSpawnInterval, minSpawnInterval, difficultyProgress);
      spawnInterval = randomBetween(targetInterval * 0.85, targetInterval * 1.15);
    }

    obstacles.forEach((obstacle) => {
      obstacle.x -= speed * scaledDt;
    });
    obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -40);

    powerupSpawnTimer -= scaledDt;
    if (powerupSpawnTimer <= 0) {
      spawnPowerup();
      powerupSpawnTimer = randomBetween(POWERUP_RESPAWN_MIN, POWERUP_RESPAWN_MAX);
    }

    powerups.forEach((powerup) => {
      powerup.x -= speed * scaledDt;
    });
    checkPowerupCollisions();
    powerups = powerups.filter((powerup) => !powerup.collected && powerup.x > -40);

    shardSpawnTimer -= scaledDt;
    if (shardSpawnTimer <= 0) {
      spawnShard();
      shardSpawnTimer = randomBetween(SHARD_RESPAWN_MIN, SHARD_RESPAWN_MAX);
    }

    shards.forEach((shard) => {
      shard.x -= speed * scaledDt;
    });
    if (magnetTimer > 0) {
      const playerHeight = 42;
      const playerCenterY = playerY - playerHeight / 2;
      const attraction = 0.15;
      shards.forEach((shard) => {
        shard.x += (playerX - shard.x) * attraction;
        shard.y += (playerCenterY - shard.y) * attraction;
      });
    }
    checkShardCollisions();
    shards = shards.filter((shard) => shard.x > -40 && !shard.collected);

    shardPopups.forEach((popup) => {
      popup.t += scaledDt;
    });
    shardPopups = shardPopups.filter((popup) => popup.t < SHARD_POPUP_DURATION);

    const playerWidth = 34;
    const playerHeight = 42;
    const dashOffset = dashTimer > 0 ? DASH_COLLISION_OFFSET : 0;
    const collisionX = playerX + dashOffset;
    const px1 = collisionX - playerWidth / 2;
    const px2 = collisionX + playerWidth / 2;
    const py1 = playerY - playerHeight;
    const py2 = playerY;

    let hit = false;
    for (const obstacle of obstacles) {
      const ox1 = obstacle.x;
      const ox2 = obstacle.x + obstacle.width;
      const oy1 = gY - obstacle.height;
      const oy2 = gY;
      if (px1 < ox2 && px2 > ox1 && py1 < oy2 && py2 > oy1) {
        hit = true;
        break;
      }
    }

    if (hit) {
      if (hasShield) {
        hasShield = false;
        shieldPulse = 1;
        obstacles = obstacles.filter((obstacle) => obstacle.x > collisionX + 80);
        playGameSound('shield');
      } else {
        playGameSound('hit');
        endRun();
        return;
      }
    }

    if (shieldPulse > 0) {
      shieldPulse -= scaledDt / 320;
      if (shieldPulse < 0) shieldPulse = 0;
    }

    magnetTimer = Math.max(0, magnetTimer - dt);
    doubleShardsTimer = Math.max(0, doubleShardsTimer - dt);
    slowMoTimer = Math.max(0, slowMoTimer - dt);
    dashTimer = Math.max(0, dashTimer - dt);
    dreamSurgeTimer = Math.max(0, dreamSurgeTimer - dt);

    emitPowerupState();
  };

  const draw = () => {
    const w = canvas.width;
    const h = canvas.height;
    const gY = groundY();

    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#020617');
    bg.addColorStop(0.5, '#0b1120');
    bg.addColorStop(1, '#020617');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(2, 6, 23, 0.35)';
    ctx.fillRect(0, 0, w, h);

    if (slowMoTimer > 0) {
      ctx.save();
      const alpha = 0.12 + 0.08 * Math.sin(elapsedMs * 0.01);
      ctx.fillStyle = `rgba(56, 189, 248, ${Math.min(0.3, Math.max(0.1, alpha))})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    if (dreamSurgeTimer > 0) {
      ctx.save();
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, 'rgba(236, 72, 153, 0.25)');
      gradient.addColorStop(1, 'rgba(14, 165, 233, 0.15)');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    ctx.strokeStyle = '#091226';
    ctx.lineWidth = 1;
    for (let y = gY + 20; y < h; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, gY);
    ctx.lineTo(w, gY);
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = '#fb923c';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#f97316';
    obstacles.forEach((obstacle) => {
      const jitter = Math.sin((elapsedMs + obstacle.x) * 0.004) * 5;
      const baseY = gY - obstacle.height + jitter;
      ctx.beginPath();
      ctx.moveTo(obstacle.x, baseY + obstacle.height);
      ctx.lineTo(obstacle.x + obstacle.width / 2, baseY);
      ctx.lineTo(obstacle.x + obstacle.width, baseY + obstacle.height);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();

    drawShards(ctx);
    drawPowerups(ctx);

    const playerWidth = 34;
    const playerHeight = 42;
    if (dashTimer > 0) {
      ctx.save();
      const intensity = Math.max(0, Math.min(1, dashTimer / DASH_DURATION));
      const trailGradient = ctx.createLinearGradient(playerX - 90, playerY, playerX, playerY);
      trailGradient.addColorStop(0, 'rgba(59, 130, 246, 0)');
      trailGradient.addColorStop(1, `rgba(59, 130, 246, ${0.5 * intensity})`);
      ctx.fillStyle = trailGradient;
      ctx.beginPath();
      ctx.ellipse(playerX - 45, playerY - playerHeight / 2, 55, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(playerX, playerY - playerHeight / 2);
    const tilt = Math.max(-0.35, Math.min(0.35, playerVy * 0.003));
    ctx.rotate(tilt);
    const grad = ctx.createLinearGradient(-playerWidth / 2, -playerHeight / 2, playerWidth / 2, playerHeight / 2);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(1, '#a855f7');
    ctx.fillStyle = grad;
    roundRect(ctx, -playerWidth / 2, -playerHeight / 2, playerWidth, playerHeight, 10);
    ctx.fill();
    ctx.restore();

    const orbitPhase = elapsedMs * 0.005;
    const companionX = playerX - 46 + Math.cos(orbitPhase) * 6;
    const companionY = playerY - 56 + Math.sin(orbitPhase) * 6;
    ctx.save();
    ctx.shadowColor = hasShield ? '#22d3ee' : '#94a3b8';
    ctx.shadowBlur = hasShield ? 18 : 10;
    const radius = 12 + shieldPulse * 6;
    const gradient = ctx.createRadialGradient(companionX, companionY, 2, companionX, companionY, radius);
    gradient.addColorStop(0, hasShield ? '#22d3ee' : '#94a3b8');
    gradient.addColorStop(0.6, '#22d3ee33');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(companionX, companionY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#22d3ee11';
    ctx.beginPath();
    ctx.ellipse(playerX, gY + 6, 45, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    drawShardPopups(ctx);
  };

  const loop = () => {
    if (!running) return;
    const now = performance.now();
    const dt = now - lastTime;
    lastTime = now;
    if (paused) {
      rafId = requestAnimationFrame(loop);
      return;
    }
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  };

  const start = () => {
    if (running) return;
    running = true;
    paused = false;
    resetRun();
    lastTime = performance.now();
    loop();
    window.addEventListener('keydown', keyHandler);
    canvas.addEventListener('pointerdown', pointerHandler);
  };

  const pause = () => {
    if (!running) return;
    paused = true;
  };

  const resume = () => {
    if (!running) return;
    paused = false;
    lastTime = performance.now();
  };

  const reset = () => {
    resetRun();
    draw();
  };

  const destroy = () => {
    running = false;
    paused = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', keyHandler);
    canvas.removeEventListener('pointerdown', pointerHandler);
  };

  return {
    start,
    pause,
    resume,
    reset,
    destroy,
    playerJump: handleJump
  };
};
