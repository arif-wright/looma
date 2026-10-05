import { fixture } from './runtime';
export type SoundKey = 'jump' | 'hit' | 'shield' | 'shard' | 'bgm';
let enabled = true;
export const isAudioEnabled = () => enabled;
export const setAudioEnabled = (value: boolean) => { enabled = value; fixture.audioEvents.push(`enabled:${value}`); return value; };
export const toggleAudioEnabled = () => setAudioEnabled(!enabled);
export const playSound = (key: SoundKey, options?: { loop?: boolean }) => { fixture.audioEvents.push(`play:${key}:${Boolean(options?.loop)}`); };
export const stopSound = (key: SoundKey) => { fixture.audioEvents.push(`stop:${key}`); };
export const setMasterVolume = (_value: number) => {};
