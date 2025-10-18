import AerLumIcon from './icons/AerLumIcon.svelte';
import ThryxIcon from './icons/ThryxIcon.svelte';
import VireliaIcon from './icons/VireliaIcon.svelte';
import FallbackIcon from './icons/FallbackIcon.svelte';

export function speciesIcon(key?: string | null, name?: string | null) {
  const k = (key ?? name ?? '').toLowerCase();
  if (k.includes('aerlum') || k.includes('wisp')) {
    return { Icon: AerLumIcon, label: 'Aer’lüm' };
  }
  if (k.includes('thryx')) {
    return { Icon: ThryxIcon, label: 'Thryx' };
  }
  if (k.includes('virelia')) {
    return { Icon: VireliaIcon, label: 'Virelia' };
  }
  return { Icon: FallbackIcon, label: 'Unknown' };
}
