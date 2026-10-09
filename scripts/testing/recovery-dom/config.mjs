import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';

export const repository = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = `${repository}scripts/testing/moonberry-gather-preview/`;
const mockedImports = ['$app/stores', '$lib/supabase/client', '$app/navigation', '$lib/games/endlessRunner', '$lib/games/audio',
  '$lib/games/runnerLanternwaySkin', '$lib/games/orbfieldSkin', '$lib/stores/companionRituals', '$lib/games/state',
  '$lib/stores/companions', '$lib/utils/analytics', '$lib/client/events/sendEvent', '$lib/stores/companionReactions'];

export function componentConfig(kind) {
  const neon = kind === 'neon' || kind === 'start';
  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [{
      name: `recovery-${kind}-real-svelte-component`,
      resolveId(id) { if (id.startsWith('recovery-test-mock:')) return `\0${id}`; },
      load(id) { if (id.startsWith('\0recovery-test-mock:')) return 'export {};'; },
      transform(source, id) {
        if (!id.endsWith('.svelte')) return;
        const output = compile(source, { filename: id, generate: 'client', css: 'injected', dev: neon });
        return { code: output.js.code, map: output.js.map };
      }
    }],
    resolve: {
      conditions: ['browser'],
      alias: [
        ...(neon ? [{ find: './orbfieldSkin', replacement: 'recovery-test-mock:$lib/games/orbfieldSkin' }] : []),
        ...(neon ? mockedImports.map(id => ({ find: id, replacement: `recovery-test-mock:${id}` })) : [
          { find: '$app/environment', replacement: `${fixture}environment.ts` },
          { find: '@colyseus/sdk', replacement: `${fixture}fake-colyseus.ts` }
        ]),
        { find: /^svelte$/, replacement: `${repository}node_modules/svelte/src/index-client.js` },
        { find: '$lib', replacement: `${repository}src/lib` }
      ]
    },
    ssr: { noExternal: ['svelte'] },
    test: {
      retry: 0, allowOnly: false,
      environment: neon ? 'happy-dom' : 'jsdom',
      include: [`${kind}-component.spec.ts`],
      pool: 'forks', poolOptions: { forks: { singleFork: true } },
      server: { deps: { inline: ['svelte'] } }
    }
  };
}
