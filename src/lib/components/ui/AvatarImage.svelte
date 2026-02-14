<script lang="ts">
  export let src: string | null | undefined = null;
  export let name: string | null | undefined = null;
  export let handle: string | null | undefined = null;
  export let email: string | null | undefined = null;
  export let alt = '';
  export let className = '';
  export let loading: 'eager' | 'lazy' = 'lazy';
  export let decoding: 'auto' | 'sync' | 'async' = 'async';
  export let width: number | undefined = undefined;
  export let height: number | undefined = undefined;
  export let ariaHidden = false;

  let failed = false;
  let lastKey = '';

  const toText = (value: string | null | undefined) => (typeof value === 'string' ? value.trim() : '');

  const deriveInitials = () => {
    const primary = toText(name) || toText(handle).replace(/^@/, '') || toText(email).split('@')[0] || 'U';
    const parts = primary.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || 'U';
    }
    return (parts[0]?.slice(0, 2) ?? 'U').toUpperCase();
  };

  const makeFallbackDataUrl = (initials: string) => {
    const safe = initials.replace(/[^A-Z0-9]/gi, '').slice(0, 2) || 'U';
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#67e8f9'/><stop offset='100%' stop-color='#0ea5e9'/></linearGradient></defs><rect width='96' height='96' rx='48' fill='url(#g)'/><text x='50%' y='53%' text-anchor='middle' dominant-baseline='middle' font-family='Arial, Helvetica, sans-serif' font-size='34' font-weight='700' fill='#082f49'>${safe}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  $: initials = deriveInitials();
  $: fallbackSrc = makeFallbackDataUrl(initials);
  $: normalizedSrc = toText(src) || fallbackSrc;
  $: sourceKey = `${toText(src)}|${toText(name)}|${toText(handle)}|${toText(email)}`;
  $: if (sourceKey !== lastKey) {
    lastKey = sourceKey;
    failed = false;
  }
  $: currentSrc = failed ? fallbackSrc : normalizedSrc;

  function onError() {
    if (currentSrc !== fallbackSrc) failed = true;
  }
</script>

<img
  src={currentSrc}
  {alt}
  class={className}
  {loading}
  {decoding}
  {width}
  {height}
  aria-hidden={ariaHidden ? 'true' : undefined}
  on:error={onError}
/>
