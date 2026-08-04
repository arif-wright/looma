import type { GameRuntime } from './lifecycle';

const WORLD_RUNTIME_KEY = Symbol.for('memvoya.world.runtime');
const registry = globalThis as typeof globalThis & { [WORLD_RUNTIME_KEY]?: GameRuntime };

export const activateWorldRuntime = (runtime: GameRuntime) => {
  registry[WORLD_RUNTIME_KEY]?.destroy();
  registry[WORLD_RUNTIME_KEY] = runtime;
};

export const releaseWorldRuntime = (runtime: GameRuntime) => {
  if (registry[WORLD_RUNTIME_KEY] === runtime) delete registry[WORLD_RUNTIME_KEY];
};
