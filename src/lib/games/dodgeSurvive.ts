// src/lib/games/dodgeSurvive.ts
import type {
  LoomaGameFactory,
  LoomaGameInstance,
  LoomaGameInitOptions
} from './types';

type Enemy = { x: number; y: number; vx: number; vy: number };

export const createDodgeSurvive: LoomaGameFactory = (
  opts: LoomaGameInitOptions
): LoomaGameInstance => {
  const { canvas, onGameOver } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No ctx');

  let running = false;
  let rafId = 0;

  const center = () => ({ x: canvas.width / 2, y: canvas.height / 2 });
  let playerX = canvas.width / 2;
  let playerY = canvas.height / 2;
  const playerR = 12;

  let enemies: Enemy[] = [];
  let lastTime = performance.now();
  let spawnTimer = 0;
  let score = 0;
  let elapsedMs = 0;
  let slowMo = 0;
  let slowCharges = 3;

  function reset() {
    const c = center();
    playerX = c.x;
    playerY = c.y;
    enemies = [];
    lastTime = performance.now();
    spawnTimer = 0;
    score = 0;
    elapsedMs = 0;
    slowMo = 0;
    slowCharges = 3;
  }

  function spawnEnemy() {
    const edge = Math.floor(Math.random() * 4);
    const margin = 20;
    const w = canvas.width;
    const h = canvas.height;
    let x = 0,
      y = 0;

    if (edge === 0) {
      x = -margin;
      y = Math.random() * h;
    } else if (edge === 1) {
      x = w + margin;
      y = Math.random() * h;
    } else if (edge === 2) {
      x = Math.random() * w;
      y = -margin;
    } else {
      x = Math.random() * w;
      y = h + margin;
    }

    const target = center();
    const dx = target.x - x;
    const dy = target.y - y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 0.15 + elapsedMs / 40000;

    enemies.push({
      x,
      y,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed
    });
  }

  function activateSlowMo() {
    if (slowCharges <= 0 || slowMo > 0) return;
    slowCharges -= 1;
    slowMo = 2000; // ms
  }

  function update(dt: number) {
    const factor = slowMo > 0 ? 0.3 : 1;
    const realDt = dt * factor;

    elapsedMs += dt;
    score += realDt * 0.01;

    spawnTimer += realDt;
    const spawnInterval = Math.max(300, 1000 - elapsedMs / 20);
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      spawnEnemy();
    }

    enemies.forEach((e) => {
      e.x += e.vx * realDt;
      e.y += e.vy * realDt;
    });

    const w = canvas.width;
    const h = canvas.height;
    enemies = enemies.filter(
      (e) => e.x > -40 && e.x < w + 40 && e.y > -40 && e.y < h + 40
    );

    // Collision
    for (const e of enemies) {
      const dist = Math.hypot(e.x - playerX, e.y - playerY);
      if (dist < playerR + 8) {
        running = false;
        cancelAnimationFrame(rafId);
        onGameOver({
          score: Math.floor(score),
          durationMs: elapsedMs,
          meta: {}
        });
        return;
      }
    }

    if (slowMo > 0) slowMo -= dt;
  }

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);

    // Radial glow
    const g = ctx.createRadialGradient(
      playerX,
      playerY,
      10,
      playerX,
      playerY,
      120
    );
    g.addColorStop(0, '#22c55e33');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Player
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.arc(playerX, playerY, playerR, 0, Math.PI * 2);
    ctx.fill();

    // Companion orb
    const orbX = playerX + 26;
    const orbY = playerY - 18;
    ctx.save();
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.arc(orbX, orbY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Enemies
    ctx.fillStyle = '#f97373';
    enemies.forEach((e) => {
      ctx.beginPath();
      ctx.arc(e.x, e.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#e5e7eb';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`Score: ${Math.floor(score)}`, 12, 20);
    ctx.fillText(`Slow-mo: ${slowCharges}`, 12, 38);
    if (slowMo > 0) ctx.fillText('Time warp!', 12, 56);
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

  function pointerHandler(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    playerX = e.clientX - rect.left;
    playerY = e.clientY - rect.top;
  }

  function keyHandler(e: KeyboardEvent) {
    if (e.code === 'Space') {
      e.preventDefault();
      activateSlowMo();
    }
  }

  function start() {
    if (running) return;
    reset();
    running = true;
    lastTime = performance.now();
    loop();
    canvas.addEventListener('pointermove', pointerHandler);
    window.addEventListener('keydown', keyHandler);
  }

  function destroy() {
    running = false;
    cancelAnimationFrame(rafId);
    canvas.removeEventListener('pointermove', pointerHandler);
    window.removeEventListener('keydown', keyHandler);
  }

  return { start, destroy };
};
