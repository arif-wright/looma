import { createGame } from './engine';

const SLUG = 'tiles-run';

type ParentMessage =
  | { type: 'SESSION_STARTED'; sessionId: string; nonce: string }
  | { type: 'SESSION_RESET' }
  | { type: 'ERROR'; message: string };

type ChildMessage =
  | { type: 'GAME_READY'; slug: string }
  | { type: 'GAME_COMPLETE'; score: number; durationMs: number; nonce: string };

type Cleanup = () => void;

type BootstrapResult = {
  destroy: Cleanup;
};

const post = (message: ChildMessage) => {
  const { type, ...payload } = message;
  window.parent.postMessage({ type, payload }, '*');
};

export const bootstrapEmbed = (canvas: HTMLCanvasElement): BootstrapResult => {
  const game = createGame();
  let sessionNonce = '';
  let hasSession = false;
  let inputLocked = false;

  const handleJump = () => {
    if (inputLocked) return;
    game.playerJump?.();
  };

  const handlePointer = () => handleJump();
  const handleKey = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      event.preventDefault();
      handleJump();
    }
  };

  const finalize = (score: number, durationMs: number) => {
    if (!hasSession) return;
    inputLocked = true;
    hasSession = false;
    post({ type: 'GAME_COMPLETE', score, durationMs, nonce: sessionNonce });
  };

  const start = () => {
    inputLocked = false;
    hasSession = true;
    game.start();
  };

  game.mount(canvas);
  game.onGameOver = finalize;

  const handleMessage = (event: MessageEvent<ParentMessage>) => {
    const raw = event.data;
    if (!raw || typeof raw !== 'object') return;
    const type = typeof (raw as any).type === 'string' ? (raw as any).type : null;
    if (!type) return;
    const payload = (raw as any).payload && typeof (raw as any).payload === 'object' ? (raw as any).payload : raw;

    if (type === 'SESSION_STARTED') {
      const nonce = typeof (payload as any).nonce === 'string' ? (payload as any).nonce : '';
      if (!nonce) return;
      sessionNonce = nonce;
      start();
      return;
    }

    if (type === 'SESSION_RESET') {
      hasSession = false;
      inputLocked = false;
      sessionNonce = '';
      game.stop();
    }
  };

  window.addEventListener('message', handleMessage);
  window.addEventListener('pointerdown', handlePointer);
  window.addEventListener('keydown', handleKey);

  post({ type: 'GAME_READY', slug: SLUG });

  return {
    destroy() {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('pointerdown', handlePointer);
      window.removeEventListener('keydown', handleKey);
      game.destroy();
    }
  };
};
