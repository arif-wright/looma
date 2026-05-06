<script lang="ts">
  import {
    Box,
    Gamepad2,
    Gem,
    Home,
    Map,
    MessageCircle,
    Sparkles,
    Store,
    Users,
    WandSparkles
  } from 'lucide-svelte';

  type NavItem = {
    label: string;
    href: string;
    icon: typeof Home;
  };

  export let playerName = 'Alex';
  export let level = 24;
  export let xp = 3200;
  export let xpNext = 5000;
  export let activePath = '/app/home';

  const navItems: NavItem[] = [
    { label: 'Home', href: '/app/home', icon: Home },
    { label: 'Companions', href: '/app/companions', icon: Sparkles },
    { label: 'Games', href: '/app/games', icon: Gamepad2 },
    { label: 'Worlds', href: '/app/worlds', icon: Map },
    { label: 'Quests', href: '/app/missions', icon: WandSparkles },
    { label: 'Inventory', href: '/app/inventory', icon: Box },
    { label: 'Market', href: '/app/shop', icon: Store },
    { label: 'Messages', href: '/app/messages', icon: MessageCircle },
    { label: 'Friends', href: '/app/friends', icon: Users }
  ];

  const quickActions = [
    { label: 'Play a game', href: '/app/games', icon: Gamepad2 },
    { label: 'Summon companion', href: '/app/companions', icon: Sparkles },
    { label: 'Start a quest', href: '/app/missions', icon: WandSparkles },
    { label: 'Create a world', href: '/app/worlds', icon: Store }
  ];

  $: xpPercent = xpNext > 0 ? Math.min(100, Math.round((xp / xpNext) * 100)) : 0;
</script>

<aside class="fantasy-sidebar" aria-label="Looma navigation">
  <a class="brand" href="/app/home" aria-label="Looma home">
    <span class="brand-mark"><Gem size={25} /></span>
    <span>looma</span>
  </a>

  <nav class="nav-list" aria-label="Primary">
    {#each navItems as item}
      <a class:active={activePath === item.href || (item.href !== '/app/home' && activePath.startsWith(item.href))} href={item.href}>
        <svelte:component this={item.icon} size={18} />
        <span>{item.label}</span>
      </a>
    {/each}
  </nav>

  <div class="world-card">
    <span class="eyebrow">Your World</span>
    <div class="world-row">
      <div class="world-thumb" aria-hidden="true"></div>
      <div>
        <strong>Looma Prime</strong>
        <span>Level {level}</span>
      </div>
    </div>
    <div class="meter"><span style={`width: ${xpPercent}%`}></span></div>
  </div>

  <div class="quick-actions">
    <span class="eyebrow">Quick Actions</span>
    {#each quickActions as action}
      <a href={action.href}>
        <svelte:component this={action.icon} size={16} />
        <span>{action.label}</span>
      </a>
    {/each}
  </div>

  <div class="player-card">
    <div class="crest"><Gem size={25} /></div>
    <div class="player-copy">
      <strong>{playerName}</strong>
      <span>Level {level}</span>
      <div class="meter"><span style={`width: ${xpPercent}%`}></span></div>
      <small>{xp.toLocaleString()} / {xpNext.toLocaleString()} XP</small>
    </div>
  </div>
</aside>

<style>
  .fantasy-sidebar {
    position: sticky;
    top: 0;
    display: flex;
    min-height: 100vh;
    flex-direction: column;
    gap: 1.12rem;
    border-right: 1px solid rgba(174, 145, 255, 0.16);
    background: linear-gradient(180deg, rgba(13, 12, 32, 0.88), rgba(7, 8, 20, 0.94));
    padding: 1rem;
    color: rgba(247, 244, 255, 0.94);
    box-shadow: 16px 0 60px rgba(3, 6, 20, 0.34);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: white;
    font-size: 1.18rem;
    font-weight: 800;
    text-decoration: none;
  }

  .brand-mark,
  .crest {
    display: grid;
    place-items: center;
    border: 1px solid rgba(186, 153, 255, 0.44);
    background:
      radial-gradient(circle at 50% 34%, rgba(126, 246, 255, 0.55), transparent 35%),
      linear-gradient(135deg, rgba(153, 85, 255, 0.96), rgba(64, 30, 136, 0.76));
    box-shadow: 0 0 26px rgba(155, 92, 255, 0.52);
  }

  .brand-mark {
    width: 2.55rem;
    height: 2.55rem;
    border-radius: 0.9rem;
  }

  .nav-list,
  .quick-actions {
    display: grid;
    gap: 0.34rem;
  }

  .nav-list a,
  .quick-actions a {
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
  .quick-actions a:hover,
  .nav-list a.active {
    border-color: rgba(181, 130, 255, 0.34);
    background: linear-gradient(90deg, rgba(143, 83, 255, 0.28), rgba(77, 244, 255, 0.08));
    color: white;
    transform: translateX(2px);
  }

  .world-card,
  .player-card {
    border: 1px solid rgba(164, 139, 255, 0.18);
    border-radius: 0.9rem;
    background: rgba(255, 255, 255, 0.045);
    padding: 0.78rem;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .eyebrow {
    display: block;
    color: rgba(216, 213, 238, 0.64);
    font-size: 0.72rem;
    font-weight: 700;
    margin-bottom: 0.75rem;
  }

  .world-row,
  .player-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .world-thumb {
    width: 2.75rem;
    height: 2.75rem;
    flex: 0 0 auto;
    border-radius: 0.8rem;
    background:
      linear-gradient(180deg, transparent, rgba(3, 6, 22, 0.36)),
      radial-gradient(circle at 58% 22%, rgba(255, 94, 216, 0.58), transparent 21%),
      linear-gradient(135deg, #352b83, #153f6b 46%, #0b112c);
  }

  .world-row strong,
  .player-copy strong {
    display: block;
    color: white;
    font-size: 0.92rem;
  }

  .world-row span,
  .player-copy span,
  .player-copy small {
    color: rgba(224, 223, 244, 0.68);
    font-size: 0.78rem;
  }

  .meter {
    height: 0.28rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.09);
    margin-top: 0.65rem;
  }

  .meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #62e8ff, #a75cff, #ff5cdc);
    box-shadow: 0 0 14px rgba(155, 92, 255, 0.72);
  }

  .quick-actions {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 1.1rem;
  }

  .quick-actions a {
    min-height: 2.25rem;
    color: rgba(229, 225, 244, 0.7);
    font-size: 0.86rem;
  }

  .player-card {
    margin-top: auto;
  }

  .crest {
    width: 3rem;
    height: 3rem;
    flex: 0 0 auto;
    border-radius: 1rem;
  }

  .player-copy {
    min-width: 0;
    flex: 1;
  }

  @media (max-width: 1180px) {
    .fantasy-sidebar {
      position: relative;
      min-height: auto;
      border-right: 0;
      border-bottom: 1px solid rgba(174, 145, 255, 0.16);
    }

    .nav-list {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 700px) {
    .fantasy-sidebar {
      padding: 1rem;
    }

    .nav-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
