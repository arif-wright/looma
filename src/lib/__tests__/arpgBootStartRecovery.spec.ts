import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('$lib/games/arpg/scenes/GameScene', () => ({
  GameScene: class {
    constructor(public handlers: { onReady: () => void }) {}
  }
}));

let created: Array<{ destroy: ReturnType<typeof vi.fn> }>;
let gameConstructor: Mock<[unknown], { destroy: ReturnType<typeof vi.fn> }>;
let main: typeof import('$lib/games/arpg/main');
const parent = () => ({}) as HTMLDivElement;

beforeEach(async () => {
  vi.resetModules(); created = [];
  vi.stubGlobal('window', {});
  gameConstructor = vi.fn(function (_config: unknown) {
    const game = { destroy: vi.fn() }; created.push(game);
    (_config as { scene: [{ handlers: { onReady: () => void } }] }).scene[0].handlers.onReady();
    return game;
  });
  vi.doMock('phaser', () => {
    return { default: { Game: gameConstructor, Scene: class {}, AUTO: 'AUTO', Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' } } };
  });
  // Load the renderer mock before exercising overlapping dynamic-import continuations.
  await import('phaser');
  await import('$lib/games/arpg/scenes/GameScene');
  main = await import('$lib/games/arpg/main');
});
afterEach(async () => {
  await vi.dynamicImportSettled(); main.shutdownGame();
  vi.doUnmock('phaser'); vi.unstubAllGlobals();
});

describe('ARPG asynchronous boot ownership', () => {
  it('does not import/create for a pre-cancelled boot', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(main.bootGame(parent(), { onGameOver: vi.fn(), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(gameConstructor).not.toHaveBeenCalled();
  });

  it('rejects cancellation promptly and never creates from the late imports', async () => {
    const controller = new AbortController();
    const boot = main.bootGame(parent(), { onGameOver: vi.fn(), signal: controller.signal });
    const rejected = expect(boot).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected;
    await vi.dynamicImportSettled();
    expect(gameConstructor).not.toHaveBeenCalled();
  });

  it('only the newest concurrent boot creates a game', async () => {
    const first = main.bootGame(parent(), { onGameOver: vi.fn() });
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const newestParent = parent();
    const second = main.bootGame(newestParent, { onGameOver: vi.fn() });
    await Promise.all([rejected, second]);
    expect(gameConstructor).toHaveBeenCalledTimes(1);
    expect(gameConstructor.mock.calls[0]![0]).toMatchObject({ parent: newestParent });
  });

  it('does not let an old signal or old page shutdown destroy a newer game', async () => {
    const oldParent = parent(); const oldController = new AbortController();
    await main.bootGame(oldParent, { onGameOver: vi.fn(), signal: oldController.signal });
    const nextParent = parent(); const nextController = new AbortController();
    await main.bootGame(nextParent, { onGameOver: vi.fn(), signal: nextController.signal });
    expect(created[0]!.destroy).toHaveBeenCalledTimes(1);
    oldController.abort(); main.shutdownGame(oldParent);
    expect(created[1]!.destroy).not.toHaveBeenCalled();
    nextController.abort(); expect(created[1]!.destroy).toHaveBeenCalledTimes(1);
  });

  it('scoped shutdown invalidates a pending import without breaking the default boot API', async () => {
    const target = parent();
    const first = main.bootGame(target, { onGameOver: vi.fn() });
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    main.shutdownGame(target); await rejected;
    expect(gameConstructor).not.toHaveBeenCalled();
    await main.bootGame(parent(), { onGameOver: vi.fn() });
    expect(gameConstructor).toHaveBeenCalledTimes(1);
    main.shutdownGame(); expect(created[0]!.destroy).toHaveBeenCalledTimes(1);
  });
});
