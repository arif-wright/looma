/** Offline native-canvas exercise of the real renderer with synthetic state.
 * This is NOT a browser screenshot or proof of device/input behavior.
 * Requires esbuild and @napi-rs/canvas in the execution environment; never makes network calls.
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const esbuild = require('esbuild');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'artifacts/runner/lanternway-review');
await mkdir(output, { recursive: true });
const bundle = path.join(output, 'renderer-bundle.mjs');
await esbuild.build({ entryPoints: [path.join(root, 'src/lib/games/runnerLanternwaySkin.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'esm' });
const { drawRunnerLanternway, RUNNER_LANTERNWAY_URLS } = await import(pathToFileURL(bundle).href);
const assets = Object.fromEntries(await Promise.all(Object.entries(RUNNER_LANTERNWAY_URLS).map(async ([key, url]) => [key, await loadImage(path.join(root, 'static', url))])));
const frame = { width:960, height:540, groundY:405, elapsedMs:3840, distanceMeters:840, playerX:192, playerY:352, playerVy:-.25, hasShield:true, shieldPulse:0, magnetTimer:0, doubleShardsTimer:0, slowMoTimer:0, dashTimer:0, dreamSurgeTimer:0, obstacles:[{x:402,width:44,height:72},{x:806,width:53,height:105}], shards:[{x:562,y:346}], powerups:[{type:'shield',x:692,y:337}], shardPopups:[] };
const canvas = createCanvas(960,540);
if (!drawRunnerLanternway(canvas.getContext('2d'), frame, assets, false)) throw Error('Renderer requested fallback');
await writeFile(path.join(output,'Lanternway-real-renderer-synthetic-frame-960.png'), canvas.toBuffer('image/png'));
for (const width of [320,390]) {
  const scaled = createCanvas(width, Math.round(540*width/960));
  scaled.getContext('2d').drawImage(canvas,0,0,scaled.width,scaled.height);
  await writeFile(path.join(output,`Lanternway-synthetic-scale-${width}.png`),scaled.toBuffer('image/png'));
}
const all = {...frame, obstacles:[], shards:[], powerups:['shield','magnet','doubleShards','slowMo','dash','dreamSurge'].map((type,index)=>({type,x:310+index*100,y:348})), playerY:405};
drawRunnerLanternway(canvas.getContext('2d'),all,assets,true);
await writeFile(path.join(output,'Lanternway-six-pickups-synthetic-reduced-motion.png'),canvas.toBuffer('image/png'));
await writeFile(path.join(output,'verification-scope.json'),JSON.stringify({kind:'offline native-canvas render',browserVerified:false,mobileBrowserVerified:false,inputVerified:false,fixtureState:frame,outputs:['960 composition','320 and 390 mathematical downscales','six-pickup reduced-motion fixture']},null,2)+'\n');
console.log(output);
