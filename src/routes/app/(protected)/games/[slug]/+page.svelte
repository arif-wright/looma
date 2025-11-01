<script lang="ts">
  import { onDestroy } from 'svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import OrbPanel from '$lib/components/ui/OrbPanel.svelte';
  import { init, startSession, completeSession } from '$lib/games/sdk';
  import type { PageData } from './$types';

  export let data: PageData;

  const slug = data.slug;
  const game = data.game ?? { name: slug, min_version: '1.0.0' };

  const devBanner = import.meta.env.DEV;

  let status = 'Preparing bridge…';
  let errorMessage: string | null = null;
  let reward: { xpDelta: number; currencyDelta: number } | null = null;
  let iframeEl: HTMLIFrameElement | null = null;
  let bridge: ReturnType<typeof init> | null = null;
  let unsubscribers: Array<() => void> = [];
  let session: { sessionId: string; nonce: string } | null = null;
  const embedSrcDoc = String.raw`<!DOCTYPE html><html><head><meta charset="utf-8" /><style>html,body{margin:0;padding:0;background:#050b1f;color:#fff;font-family:Inter,sans-serif;height:100%;display:grid;place-items:center;}</style></head><body><div>Mini-game sandbox</div><script>\n(function(){\n  const send = (type, payload) => parent.postMessage({ type, payload }, '*');\n  window.__loomaGame = { send, lastSession:null, lastReward:null };\n  window.addEventListener('message', (event) => {\n    if (event.data?.type === 'SESSION_STARTED') { window.__loomaGame.lastSession = event.data.payload; }\n    if (event.data?.type === 'REWARD_GRANTED') { window.__loomaGame.lastReward = event.data.payload; }\n    if (event.data?.type === 'ERROR') { window.__loomaGame.lastError = event.data.payload; }\n  });\n  send('GAME_READY');\n})();\n<\/script></body></html>`;

  const resetListeners = () => {
    unsubscribers.forEach((fn) => fn());
    unsubscribers = [];
    bridge?.destroy();
    bridge = null;
    if (typeof window !== 'undefined') {
      delete (window as any).__loomaSession;
      delete (window as any).__loomaComplete;
    }
  };

  onDestroy(resetListeners);

  const handleFrameLoad = async (iframe: HTMLIFrameElement) => {
    const target = iframe.contentWindow;
    if (!target) {
      errorMessage = 'Unable to load game frame';
      return;
    }

    resetListeners();
    bridge = init({ targetWindow: target, origin: '*' });

    unsubscribers.push(
      bridge.subscribe('GAME_READY', () => {
        status = 'Game signaled ready';
        if (session) {
          bridge?.post('SESSION_STARTED', { ...session, slug });
        }
      })
    );

    unsubscribers.push(
      bridge.subscribe('GAME_START', () => {
        status = 'Game session in progress';
      })
    );

    const finalize = async (payload: any) => {
      try {
        if (!session) throw new Error('Session missing');
        const score = Number(payload?.score ?? 0);
        const durationMs = Number(payload?.durationMs ?? 0);
        const reportedNonce = typeof payload?.nonce === 'string' ? payload.nonce : session.nonce;
        const signature = typeof payload?.signature === 'string' ? payload.signature : '';

        if (!signature) {
          throw new Error('Missing signature');
        }

        const result = await completeSession({
          sessionId: session.sessionId,
          score,
          durationMs,
          nonce: reportedNonce,
          signature
        });

        reward = result;
        status = 'Session complete';
        bridge?.post('REWARD_GRANTED', result);
      } catch (err) {
        errorMessage = (err as Error).message ?? 'Unable to complete session';
        bridge?.post('ERROR', { message: errorMessage });
      }
    };

    unsubscribers.push(bridge.subscribe('GAME_COMPLETE', finalize));

    if (typeof window !== 'undefined') {
      (window as any).__loomaComplete = finalize;
    }

    try {
      status = 'Starting session…';
      session = await startSession(slug, game.min_version ?? '1.0.0');
      if (typeof window !== 'undefined') {
        (window as any).__loomaSession = session;
      }
      status = 'Session handshake complete';
      bridge.post('SESSION_STARTED', { ...session, slug });
    } catch (err) {
      errorMessage = (err as Error).message ?? 'Unable to start session';
      status = 'Handshake failed';
    }
  };

  onMount(() => {
    if (!iframeEl) return;
    const runner = () => handleFrameLoad(iframeEl!);
    iframeEl.addEventListener('load', runner);
    if (iframeEl.contentWindow) {
      runner();
    }
    return () => {
      iframeEl?.removeEventListener('load', runner);
    };
  });

  const goBack = () => goto('/app/games');
</script>

<svelte:head>
  <title>Looma — {game.name}</title>
</svelte:head>

<div class="bg-neuro min-h-screen" data-testid="game-embed">
  <BackgroundStack />
  <main class="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pb-24 pt-20">
    <button class="back-link" type="button" on:click={goBack}>
      ← Back to hub
    </button>

    {#if devBanner}
      <div class="dev-banner">Bridge status: {status}</div>
    {/if}

    <OrbPanel class="space-y-6">
      <header class="flex flex-col gap-2 text-white">
        <p class="text-xs uppercase tracking-[0.3em] text-white/40">Now playing</p>
        <h1 class="text-3xl font-semibold">{game.name}</h1>
      </header>

      <div class="game-frame">
        <iframe
          bind:this={iframeEl}
          title={`${game.name} embed`}
          srcdoc={embedSrcDoc}
          allowfullscreen
        ></iframe>
      </div>

      {#if reward}
        <div class="reward-callout">
          <p>XP earned: <strong>{reward.xpDelta}</strong></p>
          <p>Shards collected: <strong>{reward.currencyDelta}</strong></p>
        </div>
      {/if}

      {#if errorMessage}
        <div class="error-banner">{errorMessage}</div>
      {/if}
    </OrbPanel>
  </main>
</div>

<style>
  .back-link {
    align-self: flex-start;
    color: rgba(255, 255, 255, 0.65);
    font-size: 0.85rem;
    text-decoration: none;
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .back-link:hover,
  .back-link:focus-visible {
    color: rgba(255, 255, 255, 0.95);
    outline: none;
  }

  .dev-banner {
    border-radius: 999px;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    background: rgba(8, 12, 28, 0.6);
    color: rgba(255, 255, 255, 0.75);
    padding: 0.4rem 0.8rem;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .game-frame {
    position: relative;
    width: 100%;
    padding-top: 56.25%;
    border-radius: 1.2rem;
    overflow: hidden;
    box-shadow: 0 18px 35px rgba(9, 12, 26, 0.45);
  }

  iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
  }

  .reward-callout {
    display: flex;
    gap: 1.5rem;
    font-size: 0.95rem;
    color: rgba(255, 255, 255, 0.78);
  }

  .reward-callout strong {
    color: rgba(255, 255, 255, 0.95);
  }

  .error-banner {
    border-radius: 0.9rem;
    padding: 0.65rem 0.9rem;
    background: rgba(255, 71, 87, 0.16);
    border: 1px solid rgba(255, 71, 87, 0.45);
    color: rgba(255, 224, 230, 0.92);
  }
</style>
