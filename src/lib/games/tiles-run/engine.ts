export type TilesRunGame = {
  mount(canvas: HTMLCanvasElement): void;
  start(): void;
  stop(): void;
  getScore(): number;
  getDurationMs(): number;
  destroy(): void;
  onGameOver?: (finalScore: number, durationMs: number) => void;
  playerJump?: () => void;
};

const GAME_SLUG = 'tiles-run';

const BASE_SPEED = 0.32; // pixels per millisecond
const SPEED_INCREMENT = 0.00008; // speed gain per millisecond of survival
const GRAVITY = 0.0045; // acceleration per millisecond squared
const JUMP_VELOCITY = -1.6; // initial jump velocity
const GROUND_HEIGHT_RATIO = 0.76;
const PLAYER_SIZE_RATIO = 0.05; // relative to canvas height
const OBSTACLE_MIN_GAP = 280;
const OBSTACLE_MAX_GAP = 520;
const OBSTACLE_MIN_WIDTH = 30;
const OBSTACLE_MAX_WIDTH = 70;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function createGame(): TilesRunGame {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let running = false;
  let destroyed = false;
  let rafId: number | null = null;
  let lastTimestamp = 0;
  let startTimestamp = 0;
  let elapsedMs = 0;
  let score = 0;
  let reducedMotion = false;
  let frameAccumulator = 0;
  const maxFrameStep = 1000 / 30;

  const state = {
    width: 0,
    height: 0,
    groundY: 0,
    speed: BASE_SPEED,
    player: {
      x: 0,
      y: 0,
      size: 0,
      vy: 0,
      airborne: false
    },
    obstacles: [] as Array<{ x: number; width: number; height: number }>
  };

  const resetState = () => {
    if (!canvas) return;
    state.width = canvas.clientWidth;
    state.height = Math.round(state.width / (16 / 9));
    state.groundY = Math.round(state.height * GROUND_HEIGHT_RATIO);
    state.player.size = Math.round(state.height * PLAYER_SIZE_RATIO);
    state.player.x = Math.round(state.width * 0.18);
    state.player.y = state.groundY - state.player.size;
    state.player.vy = 0;
    state.player.airborne = false;
    state.obstacles = [];
    state.speed = BASE_SPEED;
    score = 0;
    elapsedMs = 0;
    frameAccumulator = 0;
    lastTimestamp = 0;
    startTimestamp = 0;
  };

  const ensureContext = () => {
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(`[${GAME_SLUG}] Unable to acquire rendering context`);
    }
    ctx = context;
    ctx.imageSmoothingEnabled = true;
  };

  const handleResize = () => {
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = Math.round(width / (16 / 9));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    resetState();
  };

  const spawnObstacle = () => {
    const height = Math.round(state.player.size * (1 + Math.random() * 1.2));
    const width = Math.round(
      OBSTACLE_MIN_WIDTH + Math.random() * (OBSTACLE_MAX_WIDTH - OBSTACLE_MIN_WIDTH)
    );
    const gap = Math.round(
      OBSTACLE_MIN_GAP + Math.random() * (OBSTACLE_MAX_GAP - OBSTACLE_MIN_GAP)
    );
    const lastObstacle = state.obstacles.at(-1);
    const lastX = lastObstacle ? lastObstacle.x : state.width + gap;
    state.obstacles.push({ x: lastX + gap, width, height });
  };

  const updateObstacles = (delta: number) => {
    const speed = state.speed * delta;
    state.obstacles.forEach((obstacle) => {
      obstacle.x -= speed;
    });

    // Remove off-screen obstacles
    state.obstacles = state.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -10);

    const tailObstacle = state.obstacles.at(-1);
    const needSpawn = !tailObstacle || tailObstacle.x < state.width * 0.6;

    if (needSpawn) {
      spawnObstacle();
    }
  };

  const detectCollision = () => {
    const playerBottom = state.player.y + state.player.size;
    if (playerBottom >= state.height + state.player.size * 2) {
      return true;
    }

    return state.obstacles.some((obstacle) => {
      const overlapX =
        state.player.x < obstacle.x + obstacle.width &&
        state.player.x + state.player.size > obstacle.x;
      if (!overlapX) return false;
      const overlapY = playerBottom > state.groundY - obstacle.height;
      return overlapY;
    });
  };

  const drawBackground = () => {
    if (!ctx) return;
    ctx.fillStyle = '#0b1324';
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.fillStyle = '#0f1a33';
    ctx.fillRect(0, state.groundY, state.width, state.height - state.groundY);

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const tileSize = Math.max(24, Math.round(state.player.size * 0.9));
    ctx.beginPath();
    for (let x = 0; x < state.width + tileSize; x += tileSize) {
      ctx.moveTo(x, state.groundY);
      ctx.lineTo(x - tileSize, state.height);
    }
    ctx.stroke();
  };

  const drawPlayer = () => {
    if (!ctx) return;
    ctx.fillStyle = '#8cc5ff';
    ctx.fillRect(state.player.x, state.player.y, state.player.size, state.player.size);
  };

  const drawObstacles = () => {
    if (!ctx) return;
    const context = ctx;
    context.fillStyle = '#4d7cff';
    state.obstacles.forEach((obstacle) => {
      context.fillRect(obstacle.x, state.groundY - obstacle.height, obstacle.width, obstacle.height);
    });
  };

  const drawScore = () => {
    if (!ctx) return;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = `${Math.max(16, Math.round(state.height * 0.05))}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`Score ${Math.floor(score)}`, 24, 48);
  };

  const draw = () => {
    drawBackground();
    drawObstacles();
    drawPlayer();
    drawScore();
  };

  const step = (timestamp: number) => {
    if (!running) return;
    if (!lastTimestamp) {
      lastTimestamp = timestamp;
      startTimestamp = timestamp;
    }

    let delta = timestamp - lastTimestamp;

    if (reducedMotion) {
      frameAccumulator += delta;
      if (frameAccumulator < maxFrameStep) {
        rafId = window.requestAnimationFrame(step);
        return;
      }
      delta = frameAccumulator;
      frameAccumulator = 0;
    }

    delta = clamp(delta, 0, 48);

    elapsedMs = timestamp - startTimestamp;
    score += delta * 0.06;
    state.speed = BASE_SPEED + SPEED_INCREMENT * elapsedMs;

    // Physics
    state.player.vy += GRAVITY * delta;
    state.player.y += state.player.vy * delta;

    const groundY = state.groundY - state.player.size;
    if (state.player.y >= groundY) {
      state.player.y = groundY;
      state.player.vy = 0;
      state.player.airborne = false;
    } else {
      state.player.airborne = true;
    }

    updateObstacles(delta);

    if (detectCollision()) {
      running = false;
      draw();
      game.onGameOver?.(Math.floor(score), Math.floor(elapsedMs));
      return;
    }

    draw();
    lastTimestamp = timestamp;
    rafId = window.requestAnimationFrame(step);
  };

  const startLoop = () => {
    if (running || destroyed) return;
    if (!canvas) return;
    running = true;
    reducedMotion = prefersReducedMotion();
    frameAccumulator = 0;
    lastTimestamp = 0;
    startTimestamp = 0;
    rafId = window.requestAnimationFrame(step);
  };

  const stopLoop = () => {
    running = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const game: TilesRunGame = {
    mount(target: HTMLCanvasElement) {
      canvas = target;
      ensureContext();
      handleResize();
      window.addEventListener('resize', handleResize, { passive: true });
      draw();
    },
    start() {
      resetState();
      draw();
      startLoop();
    },
    stop() {
      stopLoop();
    },
    getScore() {
      return Math.floor(score);
    },
    getDurationMs() {
      if (!startTimestamp) return Math.floor(elapsedMs);
      return Math.floor(running ? performance.now() - startTimestamp : elapsedMs);
    },
    destroy() {
      destroyed = true;
      stopLoop();
      window.removeEventListener('resize', handleResize);
      canvas = null;
      ctx = null;
    },
    playerJump() {
      if (!canvas) return;
      if (!running) return;
      if (!state.player.airborne) {
        state.player.vy = JUMP_VELOCITY;
        state.player.airborne = true;
      }
    }
  };

  return game;
}
