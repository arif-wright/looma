const SOUND_BASE = '/sounds';

export type SoundKey = 'jump' | 'hit' | 'shield' | 'shard' | 'bgm';

const soundMap: Record<SoundKey, string> = {
  jump: `${SOUND_BASE}/runner-jump.mp3`,
  hit: `${SOUND_BASE}/runner-hit.mp3`,
  shield: `${SOUND_BASE}/runner-shield.mp3`,
  shard: `${SOUND_BASE}/runner-shard.mp3`,
  bgm: `${SOUND_BASE}/runner-bgm.mp3`
};

let audioEnabled = true;
let masterVolume = 0.7;
const buffers = new Map<SoundKey, HTMLAudioElement>();
const loopingSounds = new Set<SoundKey>();
const canUseAudio = typeof window !== 'undefined' && typeof Audio !== 'undefined';
const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const ensureAudio = (key: SoundKey): HTMLAudioElement | null => {
  if (!canUseAudio) return null;
  let audio = buffers.get(key) ?? null;
  if (audio) return audio;
  try {
    audio = new Audio(soundMap[key]);
    audio.preload = 'auto';
    audio.volume = masterVolume;
    audio.addEventListener('error', () => {
      if (isDev) {
        console.warn(`[audio] Failed to load sound asset: ${soundMap[key]}`);
      }
    });
    buffers.set(key, audio);
    return audio;
  } catch (err) {
    if (isDev) {
      console.warn('[audio] Unable to create audio element', err);
    }
    return null;
  }
};

export function setAudioEnabled(enabled: boolean) {
  audioEnabled = enabled;
  if (!canUseAudio) return audioEnabled;
  buffers.forEach((audio, key) => {
    audio.volume = masterVolume;
    if (!audioEnabled) {
      audio.pause();
    } else if (loopingSounds.has(key)) {
      audio.loop = true;
      void audio.play().catch(() => {
        /* ignore autoplay restrictions */
      });
    }
  });
  return audioEnabled;
}

export function toggleAudioEnabled() {
  return setAudioEnabled(!audioEnabled);
}

export function setMasterVolume(value: number) {
  masterVolume = clamp(value, 0, 1);
  buffers.forEach((audio) => {
    audio.volume = masterVolume;
  });
}

type PlayOptions = { loop?: boolean };

export function playSound(key: SoundKey, options?: PlayOptions) {
  if (options?.loop) {
    loopingSounds.add(key);
  } else {
    loopingSounds.delete(key);
  }

  if (!audioEnabled) return;
  const audio = ensureAudio(key);
  if (!audio) return;

  audio.loop = Boolean(options?.loop);
  if (!audio.loop) {
    audio.currentTime = 0;
  }

  void audio.play().catch(() => {
    /* ignore autoplay restrictions */
  });
}

export function stopSound(key: SoundKey) {
  loopingSounds.delete(key);
  const audio = buffers.get(key);
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

export function isAudioEnabled() {
  return audioEnabled;
}

export { SOUND_BASE };
