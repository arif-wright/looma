import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const fake = [
  '$app/environment', '$app/navigation', '$app/stores', '$lib/supabase/client', '$lib/games/audio',
  '$lib/games/fullscreen', '$lib/games/arpg/main', '$lib/progression/listeners', '$lib/games/state',
  '$lib/stores/companions', '$lib/stores/companionRituals', '$lib/utils/analytics',
  '$lib/client/events/sendEvent', '$lib/achievements/store'
];
const presentation = [
  '$lib/ui/BackgroundStack.svelte', '$lib/components/ui/OrbPanel.svelte',
  '$lib/components/games/LeaderboardTabs.svelte', '$lib/components/games/LeaderboardList.svelte',
  '$lib/components/games/AchievementToastStack.svelte', './CompanionOverlay.svelte'
];
export default {
  root,
  plugins: [{
    name: 'arpg-town-real-route',
    resolveId(id) { if (id.startsWith('arpg-town-test:')) return `\0${id}`; },
    load(id) { if (id.startsWith('\0arpg-town-test:')) return 'export {};'; },
    transform(source, id) {
      if (!id.endsWith('.svelte')) return;
      const output = compile(source, { filename: id, generate: 'client', css: 'injected', dev: true });
      return { code: output.js.code, map: output.js.map };
    }
  }],
  resolve: {
    conditions: ['browser'],
    alias: [
      ...fake.map(id => ({ find: id, replacement: `arpg-town-test:${id}` })),
      ...presentation.map(id => ({ find: id, replacement: `${root}/${id.endsWith('LeaderboardList.svelte') ? 'ArpgTownLeaderboardStub' : 'LegacyPresentationStub'}.svelte` })),
      { find: /^svelte$/, replacement: `${repository}node_modules/svelte/src/index-client.js` },
      { find: '$lib', replacement: `${repository}src/lib` }
    ]
  },
  ssr: { noExternal: ['svelte'] },
  test: {
    retry: 0, allowOnly: false,
    environment: 'happy-dom', include: ['arpg-town-component.spec.ts'],
    pool: 'forks', poolOptions: { forks: { singleFork: true } },
    server: { deps: { inline: ['svelte'] } }
  }
};
