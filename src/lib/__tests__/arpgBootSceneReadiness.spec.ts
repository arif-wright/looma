import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handlers = {
  onReady: () => void;
  onError: (error: Error) => void;
  onGameOver: (score: number) => void;
  isCurrent: () => boolean;
};
type Scene = { handlers: Handlers };
type FakeGame = { destroy: ReturnType<typeof vi.fn>; scene: Scene };
vi.mock('$lib/games/arpg/scenes/GameScene', () => ({
  GameScene: class {
    constructor(public handlers: Handlers) {}
  }
}));
let main: typeof import('$lib/games/arpg/main');
let created: FakeGame[];
let duringConstructor: ((scene: Scene) => void) | undefined;
const parent = () => ({}) as HTMLDivElement;
const flush = async () => { await vi.dynamicImportSettled(); await Promise.resolve(); };
const boot = async (target = parent(), signal?: AbortSignal, onGameOver = vi.fn()) => {
  const promise = main.bootGame(target, { ...(signal ? { signal } : {}), onGameOver });
  const outcome = vi.fn();
  void promise.then(() => outcome('ready'), (error) => outcome(error));
  await flush();
  return { promise, outcome, game: created.at(-1)!, onGameOver, target };
};

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('window', {});
  created = []; duringConstructor = undefined;
  vi.doMock('phaser', () => ({
    default: {
      Game: function (config: { scene: [Scene] }) {
        const game = { scene: config.scene[0], destroy: vi.fn() };
        created.push(game);
        duringConstructor?.(game.scene);
        return game;
      },
      AUTO: 'AUTO', Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' }
    }
  }));
  await import('phaser');
  await import('$lib/games/arpg/scenes/GameScene');
  main = await import('$lib/games/arpg/main');
});
afterEach(async () => {
  main.shutdownGame(); await flush();
  vi.doUnmock('phaser'); vi.unstubAllGlobals();
});

describe('ARPG boot waits for its owned scene', () => {
  it('stays pending after renderer construction until that scene reports initialized', async () => {
    const run = await boot();
    expect(created).toHaveLength(1);
    expect(run.outcome).not.toHaveBeenCalled();
    run.game.scene.handlers.onReady();
    await run.promise;
    expect(run.outcome).toHaveBeenCalledWith('ready');
    expect(run.game.destroy).not.toHaveBeenCalled();
  });

  it('rejects asynchronous asset failure and destroys the failed renderer', async () => {
    const run = await boot();
    const error = new Error('asset download failed');
    run.game.scene.handlers.onError(error);
    await expect(run.promise).rejects.toBe(error);
    expect(run.game.destroy.mock.calls).toEqual([[true]]);
    expect(run.game.scene.handlers.isCurrent()).toBe(false);
  });

  it('aborts during scene loading promptly and suppresses late completion', async () => {
    const controller = new AbortController();
    const run = await boot(parent(), controller.signal);
    controller.abort();
    await expect(run.promise).rejects.toMatchObject({ name: 'AbortError' });
    run.game.scene.handlers.onReady();
    run.game.scene.handlers.onGameOver(99);
    expect(run.onGameOver).not.toHaveBeenCalled();
    expect(run.game.destroy.mock.calls).toEqual([[true]]);
  });

  it('scoped shutdown settles pending scene initialization without an AbortSignal', async () => {
    const run = await boot();
    main.shutdownGame(run.target);
    await expect(run.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(run.game.destroy.mock.calls).toEqual([[true]]);
    run.game.scene.handlers.onReady();
    await flush();
    expect(run.outcome).toHaveBeenCalledTimes(1);
  });

  it('unrelated container shutdown leaves pending initialization intact', async () => {
    const run = await boot();
    main.shutdownGame(parent());
    expect(run.game.destroy).not.toHaveBeenCalled();
    expect(run.outcome).not.toHaveBeenCalled();
    run.game.scene.handlers.onReady();
    await run.promise;
  });

  it('supersedes a pending scene and ignores its late ready, failure and game-over callbacks', async () => {
    const first = await boot();
    const second = await boot();
    await expect(first.promise).rejects.toMatchObject({ name: 'AbortError' });
    first.game.scene.handlers.onReady();
    first.game.scene.handlers.onError(new Error('late old failure'));
    first.game.scene.handlers.onGameOver(100);
    main.shutdownGame(first.target);
    expect(first.onGameOver).not.toHaveBeenCalled();
    expect(second.outcome).not.toHaveBeenCalled();
    expect(second.game.destroy).not.toHaveBeenCalled();
    second.game.scene.handlers.onReady();
    await second.promise;
    second.game.scene.handlers.onGameOver(25);
    expect(second.onGameOver.mock.calls).toEqual([[25]]);
  });

  it('supports a fresh explicit retry after scene failure with separate handlers', async () => {
    const first = await boot();
    first.game.scene.handlers.onError(new Error('decode failed'));
    await expect(first.promise).rejects.toThrow('decode failed');
    const retry = await boot(first.target);
    first.game.scene.handlers.onReady();
    expect(retry.outcome).not.toHaveBeenCalled();
    retry.game.scene.handlers.onReady();
    await retry.promise;
    expect(created).toHaveLength(2);
    expect(first.game.destroy).toHaveBeenCalledTimes(1);
    expect(retry.game.destroy).not.toHaveBeenCalled();
  });

  it('accepts synchronous scene readiness during Phaser construction', async () => {
    duringConstructor = (scene) => { expect(scene.handlers.isCurrent()).toBe(true); scene.handlers.onReady(); };
    const run = await boot();
    await expect(run.promise).resolves.toBeUndefined();
    expect(run.game.destroy).not.toHaveBeenCalled();
  });

  it('destroys the returned renderer after synchronous scene failure during construction', async () => {
    duringConstructor = (scene) => scene.handlers.onError(new Error('create failed'));
    const run = await boot();
    await expect(run.promise).rejects.toThrow('create failed');
    expect(run.game.destroy.mock.calls).toEqual([[true]]);
  });

  it('handles an abort during construction without leaving an active renderer or rejected orphan promise', async () => {
    const controller = new AbortController();
    duringConstructor = () => controller.abort();
    const run = await boot(parent(), controller.signal);
    await expect(run.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(run.game.destroy.mock.calls).toEqual([[true]]);
    main.shutdownGame();
    expect(run.game.destroy).toHaveBeenCalledTimes(1);
  });

  it('handles a constructor throw without an unobserved readiness rejection', async () => {
    duringConstructor = () => { throw new Error('renderer failed'); };
    const run = await boot();
    await expect(run.promise).rejects.toThrow('renderer failed');
    // Vitest also fails the suite on an unhandled rejection after this flush.
    await flush();
  });

  it('retains signal ownership after readiness and removes it before a later boot', async () => {
    const controller = new AbortController();
    const first = await boot(parent(), controller.signal);
    first.game.scene.handlers.onReady(); await first.promise;
    const next = await boot();
    controller.abort();
    expect(first.game.destroy).toHaveBeenCalledTimes(1);
    expect(next.game.destroy).not.toHaveBeenCalled();
    next.game.scene.handlers.onReady(); await next.promise;
    main.shutdownGame();
    expect(next.game.destroy.mock.calls).toEqual([[true]]);
  });
});
