import type {
  LoomaGameFactory,
  LoomaGameInstance,
  LoomaGameInitOptions,
  LoomaGameResult
} from './types';

type Obstacle = { x: number; width: number; height: number };

type SoundHandle = HTMLAudioElement | null;

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

const createSound = (path: string, audioEnabled: boolean): SoundHandle => {
  if (!audioEnabled || typeof Audio === 'undefined') return null;
  try {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.volume = 0.4;
    return audio;
  } catch {
    return null;
  }
};

const playSound = (sound: SoundHandle) => {
  if (!sound) return;
  sound.currentTime = 0;
  sound.play().catch(() => {
    /* ignore autoplay issues */
  });
};

export const createEndlessRunner: LoomaGameFactory = (
  opts: LoomaGameInitOptions
): LoomaGameInstance => {
  const {
    canvas,
    onGameOver,
    difficulty = 'normal',
    audioEnabled = true
  } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  canvas.style.touchAction = 'none';
  (canvas.style as any).webkitTapHighlightColor = 'transparent';

  const difficultyFactor =
    difficulty === 'easy' ? 0.85 : difficulty === 'hard' ? 1.25 : 1.0;

  const gravity = 0.0016;
  const jumpVelocity = -0.78 * (difficulty === 'hard' ? 1.05 : 1);
  const baseSpeed = 0.24 * difficultyFactor;

  let spawnInterval = 1200 / difficultyFactor;
  const minSpawnInterval = 620 / difficultyFactor;

  const groundY = () => canvas.height * 0.75;

  let playerX = 0;
  let playerY = 0;
  let playerVy = 0;
  let isOnGround = true;

  let hasShield = true;
  let shieldPulse = 0;

  let obstacles: Obstacle[] = [];
  let spawnTimer = 0;

  let lastTime = performance.now();
  let elapsedMs = 0;
  let score = 0;

  let rafId = 0;
  let running = false;
  let paused = false;

  const jumpSound = createSound('/sounds/runner-jump.wav', audioEnabled);
  const hitSound = createSound('/sounds/runner-hit.wav', audioEnabled);
  const shieldSound = createSound('/sounds/runner-shield.wav', audioEnabled);

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

  const endRun = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    const result: LoomaGameResult = {
      score: Math.floor(score),
      durationMs: elapsedMs,
      meta: { difficulty: difficultyFactor }
    };
    onGameOver(result);
  };

  const handleJump = () => {
    if (!running) return;
    if (!isOnGround) return;
    isOnGround = false;
    playerVy = jumpVelocity;
    playSound(jumpSound);
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
    const speed = baseSpeed * (1 + elapsedMs / 60000 * difficultyFactor);
    elapsedMs += dt;
    score += dt * 0.012 * difficultyFactor;

    playerVy += gravity * dt;
    playerY += playerVy * dt;
    const gY = groundY();
    if (playerY >= gY) {
      playerY = gY;
      playerVy = 0;
      isOnGround = true;
    }

    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      spawnObstacle();
      spawnInterval = Math.max(minSpawnInterval, spawnInterval - 6 * difficultyFactor);
    }

    obstacles.forEach((obstacle) => {
      obstacle.x -= speed * dt;
    });
    obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -40);

    const playerWidth = 34;
    const playerHeight = 42;
    const px1 = playerX - playerWidth / 2;
    const px2 = playerX + playerWidth / 2;
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
        obstacles = obstacles.filter((obstacle) => obstacle.x > playerX + 80);
        playSound(shieldSound);
      } else {
        playSound(hitSound);
        endRun();
      }
    }

    if (shieldPulse > 0) {
      shieldPulse -= dt / 320;
      if (shieldPulse < 0) shieldPulse = 0;
    }
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

    const playerWidth = 34;
    const playerHeight = 42;
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
    destroy
  };
};
