export type GameRuntime = {
  resize: (width: number, height: number) => void;
  pause: () => void;
  resume: () => void;
  destroy: () => void;
};

export type GameRuntimeFactory = (host: HTMLElement) => GameRuntime | Promise<GameRuntime>;

export class GameLifecycle {
  private runtime: GameRuntime | null = null;
  private generation = 0;
  private paused = false;

  constructor(private readonly createRuntime: GameRuntimeFactory) {}

  async mount(host: HTMLElement) {
    const generation = ++this.generation;
    this.destroyRuntime();
    const runtime = await this.createRuntime(host);

    if (generation !== this.generation) {
      runtime.destroy();
      return;
    }

    this.runtime = runtime;
    if (this.paused) runtime.pause();
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.runtime?.resize(width, height);
  }

  pause() {
    this.paused = true;
    this.runtime?.pause();
  }

  resume() {
    this.paused = false;
    this.runtime?.resume();
  }

  destroy() {
    this.generation += 1;
    this.destroyRuntime();
  }

  private destroyRuntime() {
    this.runtime?.destroy();
    this.runtime = null;
  }
}
