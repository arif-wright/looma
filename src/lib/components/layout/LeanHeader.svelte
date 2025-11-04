<script lang="ts">
  // Optional props – wire these up to your stores if you have them
  export let level = 1;
  export let xp = 97; // current XP
  export let xpMax = 100; // XP to next
  export let energy = 50; // current energy
  export let energyMax = 50;
  export let shards = 115;
  export let email = 'liquidsilver@gmail.com';

  // derived
  $: xpPct = Math.min(100, Math.round((xp / xpMax) * 100));
</script>

<header class="sticky top-0 z-50 border-b border-white/5 bg-[#0B0E13]/70 backdrop-blur-md" data-testid="lean-header">
  <div class="relative mx-auto max-w-screen-2xl px-3 sm:px-4">
    <!-- Bar -->
    <div class="h-14 flex items-center justify-between">
      <!-- LEFT: logo + search (flush left) -->
      <div class="flex min-w-0 items-center gap-3">
        <!-- Logo placeholder (slim) -->
        <a href="/" class="flex items-center gap-2">
          <div class="h-6 w-6 rounded-md bg-gradient-to-br from-cyan-400/80 to-fuchsia-400/80 ring-1 ring-white/10" aria-hidden="true"></div>
          <span class="hidden sm:block text-sm tracking-[0.25em] text-white/80">LOOMA</span>
        </a>

        <!-- Search pill -->
        <div class="hidden md:flex items-center h-9 rounded-full border border-white/10 bg-white/5 px-3">
          <!-- search icon -->
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-4.35-4.35M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"/></svg>
          <input
            class="ml-2 w-56 bg-transparent text-sm text-white/80 placeholder-white/50 outline-none"
            placeholder="Search Looma"
            type="search"
            aria-label="Search Looma"
          />
        </div>
      </div>

      <!-- CENTER: icon nav (true center, regardless of side widths) -->
      <nav class="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div class="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
          {#each [
            {label:'Games', icon:'🎮'},
            {label:'Gallery', icon:'🖼️'},
            {label:'Inbox', icon:'💬'},
            {label:'Trophies', icon:'🏆'},
            {label:'Profile', icon:'👤'}
          ] as item}
            <button
              class="group inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-inset ring-white/5 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
              aria-label={item.label}
              title={item.label}
            >
              <span class="text-[15px]">{item.icon}</span>
            </button>
          {/each}
        </div>
      </nav>

      <!-- RIGHT: slim status capsule (flush right) -->
      <div class="flex items-center gap-3">
        <!-- Slim capsule -->
        <div class="hidden sm:flex items-center h-10 rounded-full border border-white/10 bg-white/5 pl-3 pr-2">
          <!-- Level + XP bar (tight) -->
          <div class="flex items-center gap-2">
            <span class="text-[11px] uppercase tracking-wide text-white/60">Level</span>
            <span class="text-sm font-semibold text-white">{level}</span>
          </div>
          <div class="mx-3 h-1.5 w-24 rounded-full bg-white/10 overflow-hidden">
            <div class="h-full" style={`width:${xpPct}%`}
                 class="bg-gradient-to-r from-cyan-400/80 to-fuchsia-400/80"></div>
          </div>
          <!-- Energy -->
          <div class="flex items-center gap-1 text-xs text-white/70">
            <span>⚡</span><span>{energy}/{energyMax}</span>
          </div>
          <!-- Shards -->
          <div class="ml-3 flex items-center gap-1 text-xs text-white/70">
            <span>💎</span><span>{shards} SHARDS</span>
          </div>
          <!-- Separator dot -->
          <span class="mx-2 h-1 w-1 rounded-full bg-white/20" aria-hidden="true"></span>
          <!-- Email pill -->
          <div class="hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 h-7">
            <div class="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[11px]">L</div>
            <span class="text-[12px] text-white/70 truncate max-w-[200px]">{email}</span>
          </div>
          <!-- Bell -->
          <button class="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-inset ring-white/5 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/60" aria-label="Notifications">🔔</button>
        </div>

        <!-- Compact menu for xs screens -->
        <button class="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5">⋯</button>
      </div>
    </div>
  </div>
</header>

<style>
  /* Keep the bar slim & crisp on high-DPI */
  :global(header) { -webkit-font-smoothing: antialiased; }
</style>
