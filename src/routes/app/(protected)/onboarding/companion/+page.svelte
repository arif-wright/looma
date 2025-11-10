<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { logEvent } from '$lib/analytics';

  type Q = {
    id: string;
    prompt: string;
    axis?: 'EI' | 'NS' | 'TF' | 'JP';
    facet?: 'empathy' | 'curiosity' | 'structure';
  };

  const questions: Q[] = [
    { id: 'q1', prompt: 'A quiet recharge beats a crowded victory lap.', axis: 'EI', facet: 'empathy' },
    { id: 'q2', prompt: 'You’d rather explore than follow a checklist.', axis: 'JP', facet: 'curiosity' },
    { id: 'q3', prompt: 'You decide with heart as much as head.', axis: 'TF', facet: 'empathy' },
    { id: 'q4', prompt: 'You prefer clarity and routine to surprises.', axis: 'JP', facet: 'structure' },
    { id: 'q5', prompt: 'You seek patterns, not just facts.', axis: 'NS', facet: 'curiosity' },
    { id: 'q6', prompt: 'You like to keep things organized.', axis: 'JP', facet: 'structure' },
    { id: 'q7', prompt: 'People lean on you for support.', facet: 'empathy' },
    { id: 'q8', prompt: 'You get a spark from learning new tricks.', facet: 'curiosity' },
    { id: 'q9', prompt: 'You calm a room without saying much.', axis: 'EI', facet: 'structure' },
    { id: 'q10', prompt: 'You enjoy finishing things as much as starting them.', axis: 'JP' }
  ];

  type Answer = { id: string; axis?: Q['axis']; facet?: Q['facet']; choice: 'A' | 'B' };
  let answers: Answer[] = [];
  let submitting = false;
  let result: { archetype?: string | null; summary?: any } | null = null;
  let errorMsg = '';

  function answer(q: Q, choice: 'A' | 'B') {
    const next = { id: q.id, axis: q.axis, facet: q.facet, choice };
    const idx = answers.findIndex((entry) => entry.id === q.id);
    if (idx === -1) {
      answers = [...answers, next];
    } else {
      answers = answers.map((entry, i) => (i === idx ? next : entry));
    }
  }

  async function submit() {
    if (answers.length < questions.length) {
      errorMsg = 'Please answer all questions.';
      return;
    }

    submitting = true;
    errorMsg = '';

    try {
      const res = await fetch('/api/persona/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? 'Unable to score quiz');
      }
      result = { archetype: data?.archetype, summary: data?.summary };
      logEvent('persona_quiz_complete', { archetype: data?.archetype ?? null });
    } catch (err: any) {
      errorMsg = err?.message ?? 'Failed to save';
    } finally {
      submitting = false;
    }
  }

  async function spawn() {
    try {
      const res = await fetch('/api/persona/spawn', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to spawn companion');
      }
      logEvent('companion_spawn', { archetype: data?.archetype ?? null });
      window.location.href = '/app/home';
    } catch (err: any) {
      errorMsg = err?.message ?? 'Failed to spawn companion';
    }
  }
</script>

<div class="mx-auto max-w-3xl px-4 py-12 text-white">
  <h1 class="text-2xl font-semibold mb-6">Find your first bond</h1>

  {#if !result}
    <div class="space-y-5">
      {#each questions as q, i}
        <div
          class="rounded-2xl p-4 ring-1 ring-white/10 bg-white/5"
          in:fade={{ delay: i * 30 }}
          out:fade
        >
          <div class="text-white/90">{q.prompt}</div>
          <div class="mt-3 flex gap-2">
            <button
              class="px-3 py-2 rounded-xl ring-1 ring-white/15 hover:bg-white/10 {answers.find((a) => a.id === q.id && a.choice === 'A') ? 'bg-white/10' : ''}"
              type="button"
              on:click={() => answer(q, 'A')}
            >
              Agree
            </button>
            <button
              class="px-3 py-2 rounded-xl ring-1 ring-white/15 hover:bg-white/10 {answers.find((a) => a.id === q.id && a.choice === 'B') ? 'bg-white/10' : ''}"
              type="button"
              on:click={() => answer(q, 'B')}
            >
              Disagree
            </button>
          </div>
        </div>
      {/each}

      {#if errorMsg}
        <p class="text-rose-300 text-sm">{errorMsg}</p>
      {/if}

      <button
        class="mt-2 px-4 py-2 rounded-2xl bg-white/10 ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-50"
        type="button"
        disabled={submitting}
        on:click={submit}
      >
        {submitting ? 'Scoring…' : 'See your match'}
      </button>
    </div>
  {:else}
    <div class="rounded-3xl p-6 ring-1 ring-white/10 bg-white/5" in:fly={{ y: 16 }}>
      <p class="text-sm text-white/70">Your Archetype</p>
      <h2 class="mt-1 text-3xl font-bold capitalize">{result.archetype}</h2>
      <p class="mt-2 text-white/80">
        This companion will tune to your vibe. Ready to begin your bond?
      </p>
      <div class="mt-5 flex gap-3">
        <button
          class="px-4 py-2 rounded-2xl bg-white/10 ring-1 ring-white/15 hover:bg-white/20"
          type="button"
          on:click={spawn}
        >
          Begin your bond
        </button>
        <a
          class="px-4 py-2 rounded-2xl ring-1 ring-white/15 hover:bg-white/10"
          href="/app/home"
        >
          Skip for now
        </a>
      </div>
    </div>
  {/if}
</div>
