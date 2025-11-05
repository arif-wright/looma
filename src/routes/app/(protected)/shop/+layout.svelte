<script lang="ts">export let data;</script>

<div class="min-h-screen bg-gradient-to-b from-[#0B0E13] to-[#0B1620]">
  <header class="sticky top-0 z-40 border-b border-white/5 bg-black/40 backdrop-blur">
    <div class="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
      <nav class="flex items-center gap-5 text-sm text-white/70">
        <a class="font-semibold text-white">Shop</a>
        <a class="hover:text-white/90">Creatures</a>
        <a class="hover:text-white/90">Items</a>
        <a class="hover:text-white/90">Bundles</a>
      </nav>
      <input
        class="h-9 w-72 rounded-full border border-white/10 bg-white/5 px-3 text-sm text-white placeholder-white/50 focus:border-white/30 focus:outline-none"
        placeholder="Search the market…"
      />
    </div>
  </header>

  <main class="mx-auto max-w-screen-2xl px-4 py-6">
    <slot />
  </main>
</div>
