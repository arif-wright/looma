// Credential-free, exact request shapes for this fixture only. No live fallback.
export const FLOW_CAP_MS = 5000;
export const SIGNATURE = 'fixture-only-not-a-real-signature';
export const PLAYER_STATE = { xp: 0, currency: 0 };
export const RECEIPT = { settlementVersion: 1, sessionId: 'fixture-arpg-1', xpDelta: 0, currencyDelta: 0, achievements: [] };
export const expectedStart = {
  slug: 'arpg', clientVersion: '1.0.0',
  metadata: { clientVersion: '1.0.0', source: 'arpg_page', gameId: 'arpg', mode: 'standard' },
  gameId: 'arpg', mode: 'standard', clientMeta: { clientVersion: '1.0.0', source: 'arpg_page' }
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) => object(value) && Object.keys(value).sort().join('|') === [...expected].sort().join('|');
export function sameJson(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => sameJson(item, b[i]));
  return object(a) && object(b) && keys(a, Object.keys(b)) && Object.keys(a).every(key => sameJson(a[key], b[key]));
}
export function validSign(body) {
  return keys(body, ['sessionId', 'slug', 'nonce', 'score', 'durationMs', 'clientVersion']) &&
    body.sessionId === 'fixture-arpg-1' && body.slug === 'arpg' && body.nonce === 'nonce-fixture-arpg-1' &&
    body.clientVersion === '1.0.0' && Number.isSafeInteger(body.score) && body.score >= 0 && body.score <= 150000 &&
    Number.isSafeInteger(body.durationMs) && body.durationMs >= 1000 && body.durationMs <= FLOW_CAP_MS;
}
export function validComplete(body, signed) {
  return validSign(signed) && keys(body, ['sessionId', 'nonce', 'score', 'durationMs', 'clientVersion', 'signature', 'success', 'stats']) &&
    ['sessionId', 'nonce', 'score', 'durationMs', 'clientVersion'].every(key => body[key] === signed[key]) &&
    body.signature === SIGNATURE && body.success === true && keys(body.stats, ['mode', 'expeditionDurationMs']) &&
    body.stats.mode === 'standard' && Number.isSafeInteger(body.stats.expeditionDurationMs) &&
    body.stats.expeditionDurationMs >= 0 && body.stats.expeditionDurationMs <= body.durationMs;
}
export const EXPECTED_REWARD_MUTATIONS = [
  { type: 'reward', value: { xpDelta: 0, baseXpDelta: null, xpMultiplier: null, baseXp: 0, finalXp: 0, xpFromCompanion: 0, xpFromStreak: null, companionBonus: null, currencyDelta: 0, baseCurrencyDelta: null, currencyMultiplier: null, game: 'arpg', gameName: 'Memvoya ARPG' } },
  { type: 'player', value: PLAYER_STATE }
];
