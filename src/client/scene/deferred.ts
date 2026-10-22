import type { SceneApi } from '../../tasks/api.js';

const METHODS = ['walkTo', 'spawn', 'move', 'wander', 'remove', 'play', 'say'] as const;

/** A SceneApi that can be used right away. Calls made before `attach` replay on the real scene, in order. */
export function createDeferredScene(): SceneApi & { attach(real: SceneApi): void } {
  let real: SceneApi | undefined;
  const pending: (() => void)[] = [];
  const api = { attach(r: SceneApi) {
    real = r;
    for (const f of pending.splice(0)) f();
  } } as SceneApi & { attach(real: SceneApi): void };
  for (const m of METHODS) {
    (api as unknown as Record<string, (...a: unknown[]) => void>)[m] = (...args: unknown[]) => {
      const call = () => (real as unknown as Record<string, (...a: unknown[]) => void>)[m](...args);
      if (real) call();
      else pending.push(call);
    };
  }
  return api;
}
