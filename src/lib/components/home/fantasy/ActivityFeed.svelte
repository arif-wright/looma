<script lang="ts">
  import { Gem, Sparkles } from 'lucide-svelte';

  const items = [
    { name: 'Maya completed', detail: "Dragon's Trial", time: '2m ago', tone: '#a75cff', icon: Sparkles },
    { name: 'Zephyr summoned a', detail: 'legendary companion', time: '15m ago', tone: '#ff6fb8', icon: Sparkles },
    { name: 'Kai joined your world', detail: 'Looma Prime', time: '1h ago', tone: '#ffd36e', icon: Sparkles },
    { name: 'Nova sent you a gift', detail: '25', time: '2h ago', tone: '#62e8ff', icon: Gem }
  ];
</script>

<section class="side-panel" aria-labelledby="activity-title">
  <header>
    <h2 id="activity-title">Activity Feed</h2>
    <a href="/app/notifications">View All</a>
  </header>
  <div class="items">
    {#each items as item}
      <article>
        <span class="icon" style={`--tone: ${item.tone}`}>
          <svelte:component this={item.icon} size={17} />
        </span>
        <div>
          <p>{item.name}</p>
          <strong>{item.detail}</strong>
        </div>
        <time>{item.time}</time>
      </article>
    {/each}
  </div>
</section>

<style>
  .side-panel {
    border: 1px solid rgba(166, 145, 255, 0.2);
    border-radius: 1rem;
    background:
      radial-gradient(circle at 80% 0%, rgba(139, 92, 246, 0.12), transparent 38%),
      rgba(17, 16, 39, 0.66);
    padding: 1rem;
    color: white;
    backdrop-filter: blur(22px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  header,
  article {
    display: flex;
    align-items: center;
  }

  header {
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 0.96rem;
  }

  a,
  time,
  p {
    color: rgba(225, 222, 245, 0.66);
    font-size: 0.76rem;
    text-decoration: none;
  }

  .items {
    display: grid;
  }

  article {
    gap: 0.68rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    padding: 0.68rem 0;
  }

  article:first-child {
    padding-top: 0;
  }

  article:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .icon {
    display: grid;
    width: 2.32rem;
    height: 2.32rem;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tone), transparent 45%);
    border-radius: 0.8rem;
    background: radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--tone), white 10%), color-mix(in srgb, var(--tone), transparent 45%));
    color: white;
    box-shadow: 0 0 18px color-mix(in srgb, var(--tone), transparent 55%);
  }

  article div {
    min-width: 0;
    flex: 1;
  }

  strong {
    display: block;
    color: rgba(255, 255, 255, 0.92);
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
