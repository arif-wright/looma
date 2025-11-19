// src/lib/games/endlessRunner.ts
import type {
  LoomaGameFactory,
  LoomaGameInstance,
  LoomaGameInitOptions,
  LoomaGameResult
} from './types';

type Obstacle = { x: number; width: number; height: number };

export const createEndlessRunner: LoomaGameFactory = (
  opts: LoomaGameInitOptions
): LoomaGameInstance => {
  const { canvas, onGameOver } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No 2D context');
  }

  let running = false;
  let rafId = 0;

  const groundY = () => canvas.height * 0.75;
  const gravity = 0.0015;
  const jumpVelocity = -0.7;
  const baseSpeed = 0.25;

  let playerX = canvas.width * 0.2;
  let playerY = groundY();
  let playerVy = 0;
  let isOnGround = true;

  // Companion shield
  let hasShield = true;
  let shieldPulse = 0;

  let obstacles: Obstacle[] = [];
  let spawnTimer = 0;
  let spawnInterval = 1200; // ms
  let lastTime = performance.now();
  let score = 0;
  let elapsedMs = 0;

  function reset() {
    playerX = canvas.width * 0.2;
    playerY = groundY();
    playerVy = 0;
    isOnGround = true;
    hasShield = true;
    shieldPulse = 0;
    obstacles = [];
    spawnTimer = 0;
    spawnInterval = 1200;
    lastTime = performance.now();
    score = 0;
    elapsedMs = 0;
  }

  function spawnObstacle() {
    const w = 30 + Math.random() * 40;
    const h = 30 + Math.random() * 50;
    obstacles.push({
      x: canvas.width + w,
      width: w,
      height: h
    });
  }

  function end() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    const result: LoomaGameResult = {
      score: Math.floor(score),
      durationMs: elapsedMs,
      meta: {}
    };
    onGameOver(result);
  }

  function update(dt: number) {
    const speed = baseSpeed * (1 + elapsedMs / 60000);
    elapsedMs += dt;
    score += dt * 0.01;

    // Player physics
    playerVy += gravity * dt;
    playerY += playerVy * dt;
    const gY = groundY();

    if (playerY >= gY) {
      playerY = gY;
      playerVy = 0;
      isOnGround = true;
    }

    // Obstacles
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      spawnObstacle();
      spawnInterval = Math.max(500, spawnInterval - 5);
    }

    obstacles.forEach((o) => {
      o.x -= speed * dt;
    });
    obstacles = obstacles.filter((o) => o.x + o.width > -10);

    // Collision
    const playerWidth = 32;
    const playerHeight = 40;
    const px1 = playerX - playerWidth / 2;
    const px2 = playerX + playerWidth / 2;
    const py1 = playerY - playerHeight;
    const py2 = playerY;

    let hit = false;
    for (const o of obstacles) {
      const ox1 = o.x;
      const ox2 = o.x + o.width;
      const oy1 = gY - o.height;
      const oy2 = gY;

      const overlapX = px1 < ox2 && px2 > ox1;
      const overlapY = py1 < oy2 && py2 > oy1;
      if (overlapX && overlapY) {
        hit = true;
        break;
      }
    }

    if (hit) {
      if (hasShield) {
        hasShield = false;
        shieldPulse = 1;
        obstacles = obstacles.filter((o) => o.x > playerX + 60);
      } else {
        end();
      }
    }

    if (shieldPulse > 0) {
      shieldPulse -= dt / 300;
      if (shieldPulse < 0) shieldPulse = 0;
    }
  }

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    const gY = groundY();

    ctx.clearRect(0, 0, w, h);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#030712');
    bg.addColorStop(1, '#020617');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Ground line
    ctx.strokeStyle = '#22d3ee55';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, gY);
    ctx.lineTo(w, gY);
    ctx.stroke();

    // Obstacles
    for (const o of obstacles) {
      ctx.fillStyle = '#fb718599';
      ctx.fillRect(o.x, gY - o.height, o.width, o.height);
    }

    // Player
    const playerWidth = 32;
    const playerHeight = 40;
    ctx.fillStyle = '#a5b4fc';
    ctx.fillRect(
      playerX - playerWidth / 2,
      playerY - playerHeight,
      playerWidth,
      playerHeight
    );

    // Companion orb
    const companionX = playerX - 40;
    const companionY = playerY - 50;
    ctx.save();
    const glow = hasShield ? 15 : 8;
    ctx.shadowColor = hasShield ? '#22d3ee' : '#64748b';
    ctx.shadowBlur = glow;

    const radius = 10 + shieldPulse * 6;
    const gradient = ctx.createRadialGradient(
      companionX,
      companionY,
      2,
      companionX,
      companionY,
      radius
    );
    gradient.addColorStop(0, hasShield ? '#22d3ee' : '#94a3b8');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(companionX, companionY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // HUD
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`Score: ${Math.floor(score)}`, 12, 20);
    ctx.fillText(`Shield: ${hasShield ? 'READY' : 'USED'}`, 12, 38);
  }

  function handleInput() {
    if (!isOnGround) return;
    isOnGround = false;
    playerVy = jumpVelocity;
  }

  function keyHandler(e: KeyboardEvent) {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      handleInput();
    }
  }

  function pointerHandler(e: PointerEvent) {
    e.preventDefault();
    handleInput();
  }

  function loop() {
    if (!running) return;
    const now = performance.now();
    const dt = now - lastTime;
    lastTime = now;
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    reset();
    running = true;
    lastTime = performance.now();
    loop();
    window.addEventListener('keydown', keyHandler);
    canvas.addEventListener('pointerdown', pointerHandler);
  }

  function destroy() {
    running = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', keyHandler);
    canvas.removeEventListener('pointerdown', pointerHandler);
  }

  return { start, destroy };
};
