<script lang="ts">
  import { Armchair, ArrowUpRight, BookOpen, ChevronDown, Flower2, LampDesk, MapPin, Sparkles, Waves, Wind, X } from 'lucide-svelte';
  import GlassCard from '$lib/components/ui/sanctuary/GlassCard.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';
  import { keepsakeCollectionHref, storyDateLabel, type KeepsakeStory } from '$lib/items/story';

  export let story: KeepsakeStory;
  export let fromSanctuary = false;
  export let sanctuarySelection: string | null = null;
  $: ItemIcon = ({ moss_seat: Armchair, lantern: LampDesk, memory_bloom: Flower2, starglass_pool: Waves, whisper_chimes: Wind })[story.visualKey] ?? Sparkles;
  $: sanctuaryHref = `/app/sanctuary?item=${encodeURIComponent(story.id)}`;
  $: closeHref = fromSanctuary ? `/app/sanctuary${sanctuarySelection ? `?item=${encodeURIComponent(sanctuarySelection)}` : ''}` : keepsakeCollectionHref(story.id);
</script>

<GlassCard class="keepsake-story-card">
  <div class="story-header">
    <div class="story-object" aria-hidden="true"><svelte:component this={ItemIcon} size={35} strokeWidth={1.3} /></div>
    <div class="story-title">
      <p class="eyebrow">Your keepsake’s story</p>
      <h2 id="keepsake-story-title">{story.title}</h2>
      {#if story.companionName}<p class="companion">Acquired with {story.companionName}</p>{/if}
    </div>
    <a class="close-story" href={closeHref} aria-label={fromSanctuary ? 'Close story and return to Sanctuary' : 'Close story and return to collection'}><X size={20} /></a>
  </div>

  <div class="story-facts">
    <section aria-labelledby="arrival-title">
      <div class="section-label"><span aria-hidden="true">01</span><h3 id="arrival-title">How it arrived</h3></div>
      <p class="fact">{story.sourceLabel}</p>
      <p class="date">{#if story.acquiredAt}<time datetime={story.acquiredAt}>{storyDateLabel(story.acquiredAt)}</time>{:else}Date not recorded{/if}</p>
      {#if story.sourceNote}<p class="quiet">{story.sourceNote}</p>{/if}
      {#if story.careEvents.length > 0}
        <details class="care-evidence">
          <summary><span>See the three care moments</span><ChevronDown size={16} aria-hidden="true" /></summary>
          <ol>
            {#each story.careEvents as event, index (event.id)}
              <li><span class="care-number" aria-hidden="true">{index + 1}</span><span>{event.label}<time datetime={event.occurredAt}>{storyDateLabel(event.occurredAt)}</time></span></li>
            {/each}
          </ol>
        </details>
      {/if}
    </section>
    <section aria-labelledby="where-title">
      <div class="section-label"><span aria-hidden="true">02</span><h3 id="where-title">In your Sanctuary</h3></div>
      {#if !story.placementsAvailable}
        <p class="quiet">Current placement details aren’t available right now.</p>
      {:else if story.placements.length > 0}
        <ul class="placement-list" aria-label="Current spaces">
          {#each story.placements as placement (placement.id)}
            <li><MapPin size={15} aria-hidden="true" /><span>{placement.label}</span></li>
          {/each}
        </ul>
        <p class="quiet">{story.placements.length > 1 ? `${story.placements.length} copies placed in your personal Sanctuary.` : 'Placed in your personal Sanctuary.'}</p>
      {:else}
        <p class="fact">In your collection</p>
        <p class="quiet">{story.placeable ? 'Ready for a place of its own whenever you choose.' : 'This keepsake stays in your collection.'}</p>
      {/if}
      {#if story.placeable}
        <a class="story-link" href={sanctuaryHref}>{!story.placementsAvailable || story.placements.length > 0 ? 'View in Sanctuary' : 'Place in Sanctuary'}<ArrowUpRight size={16} aria-hidden="true" /></a>
      {/if}
    </section>
  </div>

  <section class="recorded" aria-labelledby="moments-title">
    <div class="recorded-heading">
      <div class="section-label"><span aria-hidden="true">03</span><h3 id="moments-title">Remembered moments</h3></div>
      {#if story.moments.length > 0}<EmotionalChip tone="muted">Recent recorded moments</EmotionalChip>{/if}
    </div>
    {#if story.historyState === 'unavailable'}
      <div class="quiet-state" role="status"><BookOpen size={22} aria-hidden="true" /><p>Recorded moments couldn’t be loaded right now. Your keepsake’s arrival is still here.</p></div>
    {:else if story.historyState === 'disabled'}
      <div class="quiet-state"><BookOpen size={22} aria-hidden="true" /><p>Journal moments aren’t shown here while memory is turned off.</p></div>
    {:else if story.moments.length === 0}
      <div class="quiet-state"><BookOpen size={22} aria-hidden="true" /><div><p>No recent recorded moments are available here.</p><span>Earlier moments may be unlinked or outside your current Journal view.</span></div></div>
    {:else}
      <ol class="moment-list">
        {#each story.moments as moment (moment.id)}
          <li>
            <span class="moment-dot" aria-hidden="true"></span>
            <div class="moment-meta"><span>{moment.label}</span><time datetime={moment.occurredAt}>{storyDateLabel(moment.occurredAt)}</time></div>
            <h4>{moment.title}</h4>
            <p>{moment.body}</p>
            <div class="moment-footer">
              {#if moment.slotLabel}<span>Recorded in {moment.slotLabel.toLowerCase()}</span>{/if}
              <a class="story-link" href={moment.href}>Open Journal<ArrowUpRight size={15} aria-hidden="true" /><span class="sr-only">: {moment.title}</span></a>
            </div>
          </li>
        {/each}
      </ol>
      <p class="history-note">Only recent moments linked to this exact keepsake and available in your Journal appear here.</p>
    {/if}
  </section>
  <footer class="story-footer"><span>Dates shown in UTC</span><a href={closeHref}>{fromSanctuary ? 'Back to Sanctuary' : 'Back to collection'}</a></footer>
</GlassCard>

<style>
  :global(.keepsake-story-card) { padding: clamp(1.15rem, 4vw, 2rem); border: 1px solid rgba(149, 211, 207, .25); background: linear-gradient(125deg, rgba(18, 39, 44, .72), rgba(15, 20, 42, .96) 55%); border-radius: 1.35rem; box-shadow: 0 20px 65px rgba(0, 0, 0, .16); color: #f3f7fb; }
  .story-header { display: flex; align-items: center; gap: 1rem; padding-bottom: 1.6rem; }
  .story-object { display: grid; place-items: center; flex: 0 0 4.2rem; height: 4.2rem; border-radius: 1.15rem; background: linear-gradient(145deg, rgba(141, 222, 189, .15), rgba(89, 161, 168, .06)); border: 1px solid rgba(166, 231, 204, .18); color: #b5e7d0; }
  .story-title { min-width: 0; flex: 1; }
  .eyebrow { margin: 0 0 .35rem; font-size: .66rem; text-transform: uppercase; letter-spacing: .16em; color: #b4d6cd; font-weight: 700; }
  h2 { margin: 0; font-size: clamp(1.4rem, 4vw, 1.9rem); line-height: 1.2; font-weight: 650; overflow-wrap: anywhere; }
  .companion { margin: .4rem 0 0; font-size: .8rem; color: #c1cddd; }
  .close-story { align-self: flex-start; display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; margin: -.5rem -.5rem 0 0; color: #c6d2df; border-radius: 50%; }
  a { text-decoration: none; }
  a:hover { color: #fff; background-color: rgba(202, 236, 255, .07); }
  a:focus-visible, summary:focus-visible { outline: 2px solid #adebe2; outline-offset: 4px; border-radius: .35rem; }
  .story-facts { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid rgba(184, 204, 223, .13); border-bottom: 1px solid rgba(184, 204, 223, .13); }
  .story-facts > section { padding: 1.4rem 1.4rem 1.4rem 0; min-width: 0; }
  .story-facts > section + section { border-left: 1px solid rgba(184, 204, 223, .13); padding: 1.4rem 0 1.4rem 1.4rem; }
  .section-label { display: flex; gap: .6rem; align-items: baseline; }
  .section-label > span { color: #92adbd; font-size: .65rem; letter-spacing: .1em; }
  h3 { margin: 0; font-size: .87rem; font-weight: 650; color: #e5edf6; }
  .fact { margin: .9rem 0 .35rem; font-size: .9rem; line-height: 1.5; }
  .date, .quiet { margin: .4rem 0; color: #b6c6d9; font-size: .78rem; line-height: 1.65; }
  .care-evidence { margin-top: .75rem; }
  summary { display: flex; align-items: center; gap: .5rem; min-height: 44px; color: #b8e3d7; font-size: .75rem; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  details[open] summary :global(svg) { transform: rotate(180deg); }
  .care-evidence ol { list-style: none; display: grid; gap: .85rem; padding: .35rem 0 0; margin: 0; }
  .care-evidence li { display: flex; align-items: center; gap: .65rem; font-size: .78rem; }
  .care-number { display: grid; place-items: center; width: 1.65rem; height: 1.65rem; border: 1px solid rgba(173, 217, 205, .21); border-radius: 50%; color: #b8e3d7; font-size: .65rem; }
  .care-evidence time { display: block; color: #aabdd0; font-size: .7rem; margin-top: .1rem; }
  .placement-list { margin: .9rem 0 .55rem; padding: 0; list-style: none; display: flex; gap: .5rem; flex-wrap: wrap; }
  .placement-list li { display: inline-flex; align-items: center; gap: .35rem; border: 1px solid rgba(179, 201, 239, .16); padding: .4rem .6rem; border-radius: .55rem; font-size: .78rem; color: #d7e4f5; }
  .story-link { display: inline-flex; align-items: center; gap: .25rem; color: #c3dafa; font-size: .76rem; font-weight: 650; min-height: 44px; width: fit-content; }
  .recorded { padding-top: 1.5rem; }
  .recorded-heading { display: flex; align-items: center; flex-wrap: wrap; gap: .65rem; justify-content: space-between; }
  .quiet-state { display: flex; align-items: flex-start; gap: .9rem; margin: 1rem 0 .25rem; padding: 1.1rem; background: rgba(135, 163, 197, .05); border: 1px dashed rgba(184, 204, 223, .17); border-radius: .8rem; color: #b8cbde; }
  .quiet-state :global(svg) { flex-shrink: 0; margin-top: .15rem; }
  .quiet-state p { margin: 0; font-size: .82rem; line-height: 1.7; }
  .quiet-state span { display: block; font-size: .74rem; margin-top: .35rem; line-height: 1.6; color: #a7b9cc; }
  .moment-list { list-style: none; margin: 1.3rem 0 0 .35rem; padding: 0; }
  .moment-list li { position: relative; padding: 0 0 1.4rem 1.4rem; margin: 0; border-left: 1px solid rgba(147, 191, 196, .2); }
  .moment-list li:last-child { border-left-color: transparent; padding-bottom: 0; }
  .moment-dot { position: absolute; width: .45rem; height: .45rem; background: #9ccabb; border-radius: 50%; top: .35rem; left: -.255rem; box-shadow: 0 0 0 4px #14232e; }
  .moment-meta { display: flex; flex-wrap: wrap; gap: .25rem .8rem; color: #a9bfd0; font-size: .68rem; line-height: 1.6; }
  .moment-meta > span { color: #bfdacd; }
  h4 { margin: .45rem 0 .35rem; font-size: .91rem; font-weight: 600; overflow-wrap: anywhere; }
  .moment-list p { margin: 0; color: #c1cddd; font-size: .8rem; line-height: 1.75; max-width: 65ch; overflow-wrap: anywhere; }
  .moment-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 0 1rem; }
  .moment-footer > span { font-size: .7rem; color: #9eb4c7; }
  .history-note { margin: .7rem 0 0; color: #a6b9cb; font-size: .71rem; line-height: 1.65; }
  .story-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .5rem; margin-top: 1.3rem; padding-top: .55rem; border-top: 1px solid rgba(184, 204, 223, .1); font-size: .7rem; color: #9aadc1; }
  .story-footer a { color: #c7d8e9; min-height: 44px; display: inline-flex; align-items: center; }
  @media (max-width: 540px) { .story-header { gap: .75rem; } .story-object { flex-basis: 3.3rem; height: 3.3rem; border-radius: .85rem; } .story-facts { grid-template-columns: 1fr; } .story-facts > section { padding: 1.2rem 0; } .story-facts > section + section { border-left: 0; border-top: 1px solid rgba(184, 204, 223, .1); padding: 1.2rem 0; } .eyebrow { font-size: .59rem; letter-spacing: .1em; } .recorded-heading { align-items: flex-start; } }
</style>
