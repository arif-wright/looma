export type Accent = {
  glow: string;
  chipBg: string;
  chipRing: string;
  text?: string;
};

export function speciesAccent(key?: string | null, name?: string | null): Accent {
  const k = (key ?? name ?? '').toLowerCase();
  if (k.includes('aerlum') || k.includes('wisp') || k === 'aerlum') {
    return {
      glow: 'from-cyan-400/25 via-cyan-300/15 to-sky-400/20',
      chipBg: 'bg-cyan-400/10',
      chipRing: 'ring-cyan-300/20',
      text: 'text-cyan-200'
    };
  }
  if (k.includes('thryx') || k === 'thryx') {
    return {
      glow: 'from-amber-400/25 via-amber-300/15 to-yellow-400/20',
      chipBg: 'bg-amber-400/10',
      chipRing: 'ring-amber-300/20',
      text: 'text-amber-200'
    };
  }
  if (k.includes('virelia') || k === 'virelia') {
    return {
      glow: 'from-emerald-400/25 via-green-300/15 to-teal-400/20',
      chipBg: 'bg-emerald-400/10',
      chipRing: 'ring-emerald-300/20',
      text: 'text-emerald-200'
    };
  }
  return {
    glow: 'from-violet-400/25 via-fuchsia-300/15 to-indigo-400/20',
    chipBg: 'bg-violet-400/10',
    chipRing: 'ring-violet-300/20',
    text: 'text-violet-200'
  };
}
