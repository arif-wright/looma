import type { LoomaGameInitOptions, LoomaGameInstance } from './types';

type Enemy = { x: number; y: number; vx: number; vy: number };
export type OrbfieldState = {
  score: number;
  elapsedMs: number;
  slowCharges: number;
  slowMoActive: boolean;
  playerX: number;
  playerY: number;
};
export type OrbfieldOptions = LoomaGameInitOptions & {
  maxDurationMs?: number;
  onStateChange?: (state: OrbfieldState) => void;
};
export type OrbfieldInstance = LoomaGameInstance & {
  pause(): void;
  resume(): void;
  activateSlowMo(): void;
  getState(): OrbfieldState;
};

const PLAYER_RADIUS = 12;
const MOVE_SPEED = 0.32;
const MAX_FRAME_MS = 50;
const movementKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** One bounded round; canvas coordinates remain independent of its CSS display size. */
export const createDodgeSurvive = (opts: OrbfieldOptions): OrbfieldInstance => {
  const { canvas, onGameOver } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is unavailable.');
  const context = ctx;
  const maxDurationMs = Number.isFinite(opts.maxDurationMs) && (opts.maxDurationMs ?? 0) > 0
    ? Math.floor(opts.maxDurationMs!) : 60_000;
  let running = false;
  let paused = false;
  let ended = false;
  let destroyed = false;
  let rafId: number | null = null;
  let playerX = canvas.width / 2;
  let playerY = canvas.height / 2;
  let enemies: Enemy[] = [];
  let lastTime = 0;
  let spawnTimer = 0;
  let score = 0;
  let elapsedMs = 0;
  let slowMo = 0;
  let slowCharges = 3;
  let activePointer: number | null = null;
  const heldKeys = new Set<string>();

  const getState = (): OrbfieldState => ({ score: Math.floor(score), elapsedMs: Math.floor(elapsedMs),
    slowCharges, slowMoActive: slowMo > 0, playerX, playerY });
  const notify = () => opts.onStateChange?.(getState());
  const cancelFrame = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  };
  const clearInput = () => {
    heldKeys.clear();
    if (activePointer !== null) {
      try { if (canvas.hasPointerCapture?.(activePointer)) canvas.releasePointerCapture(activePointer); } catch { /* Pointer already ended. */ }
    }
    activePointer = null;
  };
  const clampPlayer = () => {
    playerX = clamp(playerX, PLAYER_RADIUS, Math.max(PLAYER_RADIUS, canvas.width - PLAYER_RADIUS));
    playerY = clamp(playerY, PLAYER_RADIUS, Math.max(PLAYER_RADIUS, canvas.height - PLAYER_RADIUS));
  };
  const finish = (reason: 'collision' | 'round_complete') => {
    if (ended || destroyed) return;
    ended = true;
    running = false;
    cancelFrame();
    clearInput();
    notify();
    onGameOver({ score: Math.floor(score), durationMs: Math.floor(elapsedMs),
      meta: { time_warps_used: 3 - slowCharges, survived_round: reason === 'round_complete' ? 1 : 0 } });
  };

  const spawnEnemy = () => {
    const edge = Math.floor(Math.random() * 4);
    const w = canvas.width, h = canvas.height;
    const x = edge === 0 ? -20 : edge === 1 ? w + 20 : Math.random() * w;
    const y = edge === 2 ? -20 : edge === 3 ? h + 20 : Math.random() * h;
    // Aim at the current player position so sitting at an edge is not an invulnerable strategy.
    const dx = playerX - x, dy = playerY - y;
    const length = Math.hypot(dx, dy) || 1;
    const speed = 0.15 + elapsedMs / 200_000;
    enemies.push({ x, y, vx: dx / length * speed, vy: dy / length * speed });
  };
  const activateSlowMo = () => {
    if (!running || paused || destroyed || slowCharges <= 0 || slowMo > 0) return;
    slowCharges -= 1;
    slowMo = 2000;
    notify();
  };
  const update = (dt: number) => {
    const dx = Number(heldKeys.has('ArrowRight') || heldKeys.has('KeyD')) - Number(heldKeys.has('ArrowLeft') || heldKeys.has('KeyA'));
    const dy = Number(heldKeys.has('ArrowDown') || heldKeys.has('KeyS')) - Number(heldKeys.has('ArrowUp') || heldKeys.has('KeyW'));
    const length = Math.hypot(dx, dy) || 1;
    playerX += dx / length * MOVE_SPEED * dt;
    playerY += dy / length * MOVE_SPEED * dt;
    clampPlayer();
    elapsedMs += dt;
    score += dt * 0.01;
    const worldDt = dt * (slowMo > 0 ? 0.3 : 1);
    spawnTimer += worldDt;
    if (spawnTimer >= Math.max(350, 1000 - elapsedMs / 100)) {
      spawnTimer = 0;
      spawnEnemy();
    }
    for (const enemy of enemies) { enemy.x += enemy.vx * worldDt; enemy.y += enemy.vy * worldDt; }
    enemies = enemies.filter((e) => e.x > -40 && e.x < canvas.width + 40 && e.y > -40 && e.y < canvas.height + 40);
    slowMo = Math.max(0, slowMo - dt);
    if (enemies.some((e) => Math.hypot(e.x - playerX, e.y - playerY) < PLAYER_RADIUS + 8)) {
      finish('collision');
    } else if (elapsedMs >= maxDurationMs) {
      finish('round_complete');
    }
  };
  const draw = () => {
    const w = canvas.width, h = canvas.height;
    context.clearRect(0, 0, w, h);
    context.fillStyle = '#090e20'; context.fillRect(0, 0, w, h);
    const glow = context.createRadialGradient(playerX, playerY, 10, playerX, playerY, 100);
    glow.addColorStop(0, '#22d3ee33'); glow.addColorStop(1, 'transparent');
    context.fillStyle = glow; context.fillRect(0, 0, w, h);
    context.fillStyle = '#e5e7eb'; context.beginPath();
    context.arc(playerX, playerY, PLAYER_RADIUS, 0, Math.PI * 2); context.fill();
    context.save(); context.shadowColor = '#22d3ee'; context.shadowBlur = 12;
    context.fillStyle = slowMo > 0 ? '#c4b5fd' : '#22d3ee'; context.beginPath();
    context.arc(playerX + 26, playerY - 18, 8, 0, Math.PI * 2); context.fill(); context.restore();
    context.fillStyle = '#fb7185';
    for (const enemy of enemies) { context.beginPath(); context.arc(enemy.x, enemy.y, 8, 0, Math.PI * 2); context.fill(); }
  };
  const loop = (time: number) => {
    rafId = null;
    if (!running || paused || destroyed) return;
    const dt = Math.min(MAX_FRAME_MS, Math.max(0, time - lastTime), maxDurationMs - elapsedMs);
    lastTime = time;
    update(dt);
    if (destroyed) return;
    draw();
    notify();
    if (running && !paused) rafId = requestAnimationFrame(loop);
  };
  const movePointer = (event: PointerEvent) => {
    if (!running || paused || destroyed) return;
    if (activePointer !== null && activePointer !== event.pointerId) return;
    if (event.type === 'pointermove' && event.pointerType !== 'mouse' && activePointer !== event.pointerId) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    playerX = (event.clientX - rect.left) * canvas.width / rect.width;
    playerY = (event.clientY - rect.top) * canvas.height / rect.height;
    clampPlayer(); notify();
  };
  const pointerDown = (event: PointerEvent) => {
    if (!running || paused || destroyed || (activePointer !== null && activePointer !== event.pointerId)) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    activePointer = event.pointerId;
    try { canvas.setPointerCapture?.(event.pointerId); } catch { /* Drag still works within the canvas. */ }
    movePointer(event);
  };
  const releasePointer = (event: PointerEvent) => { if (activePointer === event.pointerId) activePointer = null; };
  const keyDown = (event: KeyboardEvent) => {
    if (!running || paused || destroyed) return;
    if (movementKeys.has(event.code)) { event.preventDefault(); heldKeys.add(event.code); }
    if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) activateSlowMo(); }
  };
  const keyUp = (event: KeyboardEvent) => {
    if (movementKeys.has(event.code)) { event.preventDefault(); heldKeys.delete(event.code); }
  };
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', releasePointer);
  canvas.addEventListener('keydown', keyDown);
  canvas.addEventListener('keyup', keyUp);
  canvas.addEventListener('blur', clearInput);
  draw();

  return {
    getState, activateSlowMo,
    start() {
      if (destroyed || running || ended) return;
      running = true; lastTime = performance.now(); notify();
      rafId = requestAnimationFrame(loop);
    },
    pause() { if (!running || paused) return; paused = true; clearInput(); cancelFrame(); },
    resume() { if (!running || !paused || destroyed) return; paused = false; lastTime = performance.now(); rafId = requestAnimationFrame(loop); },
    destroy() {
      destroyed = true; running = false; clearInput(); cancelFrame();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', movePointer);
      canvas.removeEventListener('pointerup', releasePointer);
      canvas.removeEventListener('pointercancel', releasePointer);
      canvas.removeEventListener('lostpointercapture', releasePointer);
      canvas.removeEventListener('keydown', keyDown);
      canvas.removeEventListener('keyup', keyUp);
      canvas.removeEventListener('blur', clearInput);
    }
  };
};
