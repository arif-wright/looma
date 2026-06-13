<script lang="ts">
  import {
    BookOpen,
    Home,
    Sparkles,
    UserRound
  } from 'lucide-svelte';
  import MemvoyaBrand from '$lib/components/brand/MemvoyaBrand.svelte';

  type NavItem = {
    label: string;
    href: string;
    icon: typeof Home;
  };

  export let playerName = 'Alex';
  export let activePath = '/app/home';

  const navItems: NavItem[] = [
    { label: 'Home', href: '/app/home', icon: Home },
    { label: 'Companion', href: '/app/companions', icon: Sparkles },
    { label: 'Journal', href: '/app/memory', icon: BookOpen },
    { label: 'Profile', href: '/app/profile', icon: UserRound }
  ];
</script>

<aside class="fantasy-sidebar" aria-label="Memvoya navigation">
  <MemvoyaBrand href="/app/home" size="sm" ariaLabel="Memvoya home" />

  <nav class="nav-list" aria-label="Primary">
    {#each navItems as item}
      <a class:active={activePath === item.href || (item.href !== '/app/home' && activePath.startsWith(item.href))} href={item.href}>
        <svelte:component this={item.icon} size={18} />
        <span>{item.label}</span>
      </a>
    {/each}
  </nav>

  <div class="player-card">
    <div class="player-copy">
      <strong>{playerName}</strong>
      <span>Your shared place in Memvoya</span>
    </div>
  </div>
</aside>

<style>
  .fantasy-sidebar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    min-height: 100vh;
    flex-direction: column;
    gap: 1.12rem;
    border-right: 1px solid rgba(174, 145, 255, 0.16);
    background:
      linear-gradient(90deg, rgba(7, 7, 20, 0.99) 0%, rgba(8, 8, 23, 0.985) 82%, rgba(8, 8, 23, 0.98) 100%),
      linear-gradient(180deg, rgba(13, 12, 32, 0.98), rgba(7, 8, 20, 0.99));
    padding: 1rem;
    color: rgba(247, 244, 255, 0.94);
    box-shadow:
      18px 0 52px rgba(3, 6, 20, 0.66),
      inset -1px 0 0 rgba(174, 145, 255, 0.1);
    isolation: isolate;
  }

  .fantasy-sidebar::after {
    content: '';
    position: absolute;
    top: 0;
    right: -1.15rem;
    bottom: 0;
    width: 1.15rem;
    background: linear-gradient(90deg, rgba(7, 7, 20, 0.82), transparent);
    pointer-events: none;
  }

  .nav-list {
    display: grid;
    gap: 0.34rem;
  }

  .nav-list a {
    display: flex;
    min-height: 2.65rem;
    align-items: center;
    gap: 0.8rem;
    border: 1px solid transparent;
    border-radius: 0.75rem;
    color: rgba(237, 234, 255, 0.82);
    padding: 0 0.72rem;
    text-decoration: none;
    transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease;
  }

  .nav-list a:hover,
  .nav-list a.active {
    border-color: rgba(181, 130, 255, 0.34);
    background: linear-gradient(90deg, rgba(143, 83, 255, 0.28), rgba(77, 244, 255, 0.08));
    color: white;
    transform: translateX(2px);
  }

  .player-card {
    border: 1px solid rgba(164, 139, 255, 0.18);
    border-radius: 0.9rem;
    background: rgba(255, 255, 255, 0.045);
    padding: 0.78rem;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .player-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .player-copy strong {
    display: block;
    color: white;
    font-size: 0.92rem;
  }

  .player-copy span {
    color: rgba(224, 223, 244, 0.68);
    font-size: 0.78rem;
  }

  .player-card {
    margin-top: auto;
  }

  .player-copy {
    min-width: 0;
    flex: 1;
  }

  @media (max-width: 1180px) {
    .fantasy-sidebar {
      display: none;
    }
  }
</style>
