export const TITLES = [
  'town assets and a valid departure response gate the first expedition',
  'HTTP image failure rejects startup and explicit retry creates an independent scene',
  'undecodable image rejects startup without false route readiness',
  'the actual 30-second asset deadline cancels loading and ignores a late response',
  'account switch during asset loading interrupts the actual route',
  'sign out during asset loading interrupts the actual route',
  'unmount during asset loading destroys the owned game and ignores late images',
  'navigation back during asset loading cannot revive the obsolete page',
  'same-owner token refresh during loading preserves the original town',
  'an older page cleanup cannot destroy its replacement scene',
  'real movement and return preserve untimed town around a bounded expedition',
  'phone-sized viewport renders decoded town art without starting an expedition'
];

// Exact injected errors only. Every other console error remains a gate failure.
export function isExpectedConsoleError(title, message) {
  if (title === TITLES[1] && message.url === 'http://127.0.0.1:4281/games/arpg/tiles/ground_stone1.png' &&
    /^Failed to load resource: the server responded with a status of 503(?: \(.*\))?$/.test(message.text)) return true;
  return title === TITLES[2] && message.url.startsWith('http://127.0.0.1:4281/assets/') &&
    ['Failed to process file: image "floor_0"', 'Failed to process file: %s "%s" image floor_0'].includes(message.text);
}
