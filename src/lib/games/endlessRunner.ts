import type {
  LoomaGameFactory,
  LoomaGameInstance,
  LoomaGameInitOptions,
  LoomaGameResult
} from './types';

type Obstacle = { x: number; width: number; height: number };
type GameState = 'title' | 'playing' | 'dead';

type AudioStopper = () => void;

type RunnerConfig = {
  difficulty: 'normal' | 'hard';
  muted: boolean;
};

const DEFAULT_CONFIG: RunnerConfig = {
  difficulty: 'normal',
  muted: false
};

export const createEndlessRunner: LoomaGameFactory = (
  opts: LoomaGameInitOptions
): LoomaGameInstance => {
  const { canvas, onGameOver, config } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');

  const mergedConfig: RunnerConfig = {
    ...DEFAULT_CONFIG,
    difficulty: (config?.difficulty as RunnerConfig['difficulty']) ?? DEFAULT_CONFIG.difficulty,
    muted: Boolean(config?.muted)
  };

  const difficulty = mergedConfig.difficulty;
  const muted = mergedConfig.muted;

  let state: GameState = 'title';
  let running = false;
  let rafId = 0;

  const groundY = () => canvas.height * 0.75;
  const gravity = 0.0016;
  const jumpVelocity = -0.8;
  const baseSpeed = difficulty === 'hard' ? 0.32 : 0.24;
  const speedRamp = difficulty === 'hard' ? 1 / 45000 : 1 / 60000;

  let playerX = 0;
  let playerY = 0;
  let playerVy = 0;
  let isOnGround = true;
  let lean = 0;

  let hasShield = true;
  let shieldPulse = 0;

  let obstacles: Obstacle[] = [];
  let spawnTimer = 0;
  let spawnInterval = difficulty === 'hard' ? 950 : 1200;

  let lastTime = performance.now();
  let score = 0;
  let elapsedMs = 0;
  let bestScore = 0;

  try {
    const raw = localStorage.getItem('neon-run-best');
    if (raw) bestScore = Number(raw) || 0;
  } catch {
    // ignore
  }

  const jumpAudio = !muted ? createBeep(180, 0.08) : null;
  const shieldAudio = !muted ? createBeep(320, 0.12) : null;
  const bgLoopStopper = !muted ? createBackgroundLoop() : null;

  function createBeep(freq: number, duration: number) {
    try {
      const audioCtx = new AudioContext();
      return () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = freq;
        osc.type = 'triangle';
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      };
    } catch {
      return () => {};
    }
  }

  function createBackgroundLoop(): AudioStopper | null {
    try {
      const audioCtx = new AudioContext();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 42;
      osc.type = 'sawtooth';
      gain.gain.value = 0.015;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      return () => {
        try {
          osc.stop();
          audioCtx.close();
        } catch {
          // ignore
        }
      };
    } catch {
      return null;
    }
  }

  function resetRun() {
    playerX = canvas.width * 0.2;
    playerY = groundY();
    playerVy = 0;
    lean = 0;
    isOnGround = true;
    hasShield = true;
    shieldPulse = 0;
    obstacles = [];
    spawnTimer = 0;
    spawnInterval = difficulty === 'hard' ? 950 : 1200;
    lastTime = performance.now();
    score = 0;
    elapsedMs = 0;
  }

  function spawnObstacle() {
    const w = 26 + Math.random() * 40;
    const h = 36 + Math.random() * 70;
    obstacles.push({
      x: canvas.width + w,
      width: w,
      height: h
    });
  }

  function endRun() {
    state = 'dead';
    running = true;
    const floored = Math.floor(score);
    if (floored > bestScore) {
      bestScore = floored;
      try {
        localStorage.setItem('neon-run-best', String(bestScore));
      } catch {
        // ignore
      }
    }
    const result: LoomaGameResult = {
      score: floored,
      durationMs: elapsedMs,
      meta: { difficulty: difficulty === 'hard' ? 2 : 1 }
    };
    onGameOver(result);
  }

  function update(dt: number) {
    if (state !== 'playing') return;

    const speed = baseSpeed * (1 + elapsedMs * speedRamp);
    elapsedMs += dt;
    score += dt * 0.012;

    playerVy += gravity * dt;
    playerY += playerVy * dt;
    const gY = groundY();

    if (playerY >= gY) {
      playerY = gY;
      playerVy = 0;
      isOnGround = true;
    }

    const targetLean = isOnGround ? 0.18 : -0.2;
    lean += (targetLean - lean) * 0.12;

    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      spawnObstacle();
      const minInterval = difficulty === 'hard' ? 520 : 640;
      spawnInterval = Math.max(minInterval, spawnInterval - (difficulty === 'hard' ? 7 : 5));
    }

    obstacles.forEach((o) => {
      o.x -= speed * dt;
    });
    obstacles = obstacles.filter((o) => o.x + o.width > -40);

    const playerWidth = 34;
    const playerHeight = 46;
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
      if (px1 < ox2 && px2 > ox1 && py1 < oy2 && py2 > oy1) {
        hit = true;
        break;
      }
    }

    if (hit) {
      if (hasShield) {
        hasShield = false;
        shieldPulse = 1;
        if (shieldAudio) shieldAudio();
        obstacles = obstacles.filter((o) => o.x > playerX + 80);
      } else {
        endRun();
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

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#040312');
    bg.addColorStop(0.5, '#041225');
    bg.addColorStop(1, '#050b16');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const t = performance.now() * 0.04;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    const gridGap = 42;
    ctx.beginPath();
    for (let x = -((t / 3) % gridGap); x < w + gridGap; x += gridGap) {
      ctx.moveTo(x, gY + 10);
      ctx.lineTo(x + 24, h);
    }
    ctx.stroke();

    ctx.strokeStyle = '#22d3ee88';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, gY);
    ctx.lineTo(w, gY);
    ctx.stroke();

    for (const o of obstacles) {
      const ox = o.x;
      const oy = gY;
      const oh = o.height;
      ctx.save();
      ctx.translate(ox + o.width / 2, oy);
      ctx.fillStyle = '#f97316';
      ctx.shadowColor = '#fb923c';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(-o.width / 2, 0);
      ctx.lineTo(0, -oh);
      ctx.lineTo(o.width / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const playerWidth = 34;
    const playerHeight = 46;
    ctx.save();
    ctx.translate(playerX, playerY);
    ctx.rotate(lean);
    const grad = ctx.createLinearGradient(0, -playerHeight, 0, 0);
    grad.addColorStop(0, '#c4b5fd');
    grad.addColorStop(1, '#22d3ee');
    ctx.fillStyle = grad;
    ctx.beginPath();
    const r = 8;
    const w2 = playerWidth / 2;
    const h2 = playerHeight;
    ctx.moveTo(-w2 + r, -h2);
    ctx.lineTo(w2 - r, -h2);
    ctx.quadraticCurveTo(w2, -h2, w2, -h2 + r);
    ctx.lineTo(w2, -r);
    ctx.quadraticCurveTo(w2, 0, w2 - r, 0);
    ctx.lineTo(-w2 + r, 0);
    ctx.quadraticCurveTo(-w2, 0, -w2, -r);
    ctx.lineTo(-w2, -h2 + r);
    ctx.quadraticCurveTo(-w2, -h2, -w2 + r, -h2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const companionX = playerX - 50;
    const companionY = playerY - 60;
    ctx.save();
    const glow = hasShield ? 20 : 12;
    ctx.shadowColor = hasShield ? '#22d3ee' : '#94a3b8';
    ctx.shadowBlur = glow;
    const radius = 12 + shieldPulse * 8;
    const gradient = ctx.createRadialGradient(
      companionX,
      companionY,
      2,
      companionX,
      companionY,
      radius
    );
    gradient.addColorStop(0, hasShield ? '#22d3ee' : '#94a3b8');
    gradient.addColorStop(0.7, '#22d3ee22');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(companionX, companionY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#e5e7eb';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'start';
    ctx.fillText(`Score: ${Math.floor(score)}`, 12, 22);
    ctx.fillText(`Best: ${bestScore}`, 12, 40);
    ctx.fillText(`Shield: ${hasShield ? 'READY' : 'USED'}`, 12, 58);
    ctx.fillText(`Diff: ${difficulty === 'hard' ? 'Hard' : 'Normal'}`, 12, 76);

    ctx.textAlign = 'center';
    if (state === 'title') {
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '24px system-ui, sans-serif';
      ctx.fillText('Neon Run', w / 2, h / 2 - 40);
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('Press Space or Tap to start', w / 2, h / 2 - 10);
      ctx.fillText('Avoid shards. Companion shields one hit.', w / 2, h / 2 + 14);
    } else if (state === 'dead') {
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText(`Run over · Score ${Math.floor(score)}`, w / 2, h / 2 - 20);
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(`Best ${bestScore} · Press Space / Tap to retry`, w / 2, h / 2 + 10);
    }
    ctx.textAlign = 'start';
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

  function handleJump() {
    if (state === 'title') {
      state = 'playing';
      resetRun();
      return;
    }

    if (state === 'dead') {
      state = 'title';
      resetRun();
      return;
    }

    if (!isOnGround) return;
    isOnGround = false;
    playerVy = jumpVelocity;
    if (jumpAudio) jumpAudio();
  }

  function keyHandler(e: KeyboardEvent) {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      handleJump();
    }
  }

  function pointerHandler(e: PointerEvent) {
    e.preventDefault();
    handleJump();
  }

  function start() {
    if (running) return;
    running = true;
    state = 'title';
    resetRun();
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
    if (bgLoopStopper) bgLoopStopper();
  }

  return { start, destroy };
};
