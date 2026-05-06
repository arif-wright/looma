<script lang="ts">
  import { MessageCircle } from 'lucide-svelte';

  const friends = [
    { name: 'Maya', status: 'In Game', tone: '#a75cff' },
    { name: 'Zephyr', status: 'In World', tone: '#62e8ff' },
    { name: 'Kai', status: 'Online', tone: '#ffd36e' },
    { name: 'Nova', status: 'In Game', tone: '#ff6fb8' }
  ];
</script>

<section class="side-panel" aria-labelledby="friends-title">
  <header>
    <h2 id="friends-title">Friends Online</h2>
    <a href="/app/friends">View All</a>
  </header>
  <div class="friends">
    {#each friends as friend}
      <div class="friend">
        <span class="avatar" style={`--tone: ${friend.tone}`}></span>
        <div>
          <strong>{friend.name}</strong>
          <small>{friend.status}</small>
        </div>
        <button type="button" aria-label={`Message ${friend.name}`}><MessageCircle size={15} /></button>
      </div>
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
  .friend {
    display: flex;
    align-items: center;
  }

  header {
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 0.96rem;
  }

  a {
    color: rgba(225, 222, 245, 0.66);
    font-size: 0.76rem;
    text-decoration: none;
  }

  .friends {
    display: grid;
    gap: 0.75rem;
  }

  .friend {
    gap: 0.75rem;
  }

  .avatar {
    width: 2.35rem;
    height: 2.35rem;
    flex: 0 0 auto;
    border-radius: 50%;
    background:
      radial-gradient(circle at 34% 35%, rgba(255, 255, 255, 0.8), transparent 9%),
      radial-gradient(circle at 64% 36%, rgba(255, 255, 255, 0.8), transparent 9%),
      linear-gradient(135deg, var(--tone), #1a143d);
    box-shadow: 0 0 20px color-mix(in srgb, var(--tone), transparent 45%);
  }

  .friend div {
    min-width: 0;
    flex: 1;
  }

  strong,
  small {
    display: block;
  }

  strong {
    font-size: 0.87rem;
  }

  small {
    color: #7cff9e;
    font-size: 0.78rem;
  }

  button {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(240, 237, 255, 0.78);
  }
</style>
