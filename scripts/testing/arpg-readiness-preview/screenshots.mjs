export const DESKTOP_TOWN_SCREENSHOT = 'desktop-town-painterly-preview';
export const PHONE_TOWN_SCREENSHOT = 'phone-sized-390x844-town-painterly-preview';
// Preserve the existing five attachments and add the desktop and narrow preview.
export const SCREENSHOTS = [
  'initialized-town-real-decoded-assets', 'actual-route-image-download-failure',
  'actual-route-image-decode-failure', 'actual-route-native-30-second-asset-timeout',
  ...Array(6).fill(null), 'returned-town-synthetic-zero-value-receipt', PHONE_TOWN_SCREENSHOT
];
export const requiredScreenshots = index => [SCREENSHOTS[index], ...(index === 10 ? [DESKTOP_TOWN_SCREENSHOT] : [])].filter(Boolean);
