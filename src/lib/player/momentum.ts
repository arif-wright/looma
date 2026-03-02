import { computeEffectiveEnergyMax } from '$lib/player/energy';

export const SANCTUARY_PLUS_MOMENTUM_CAP_BONUS = 5;

export const getSubscriptionMomentumBonus = (subscriptionActive: boolean | null | undefined) =>
  subscriptionActive ? SANCTUARY_PLUS_MOMENTUM_CAP_BONUS : 0;

export const computeEffectiveMomentumMax = (
  baseMax: number | null | undefined,
  companionBonus: number | null | undefined,
  subscriptionActive: boolean | null | undefined
) =>
  computeEffectiveEnergyMax(
    baseMax,
    (typeof companionBonus === 'number' ? companionBonus : 0) + getSubscriptionMomentumBonus(subscriptionActive)
  );
