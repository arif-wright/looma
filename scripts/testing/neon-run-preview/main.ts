import { mount } from 'svelte';
import Preview from './Preview.svelte';
import { fixture } from './runtime';

// This synthetic component fixture must never contact an API, account or database.
window.fetch = async (input) => {
  fixture.blocked.push(`fetch: ${String(input)}`);
  throw new Error('Neon Run preview forbids network API calls.');
};
XMLHttpRequest.prototype.open = function () {
  fixture.blocked.push('XMLHttpRequest');
  throw new Error('Neon Run preview forbids XMLHttpRequest.');
};
navigator.sendBeacon = () => {
  fixture.blocked.push('sendBeacon');
  return false;
};
// Passive canvas evidence: forward every draw unchanged and note which actual artwork was drawn.
const drawImage = CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, source: CanvasImageSource, ...coordinates: number[]) {
  if (source instanceof HTMLImageElement) {
    const url = new URL(source.currentSrc || source.src, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/games/runner/skins/lanternway/') && !fixture.drawnImages.includes(url.pathname)) fixture.drawnImages.push(url.pathname);
  }
  Reflect.apply(drawImage, this, [source, ...coordinates]);
};
mount(Preview, { target: document.getElementById('app')! });
