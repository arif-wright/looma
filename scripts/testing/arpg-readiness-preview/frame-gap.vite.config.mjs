import {mergeConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import base from './vite.config.mjs';
import {instrumentMain,instrumentFixtureObserver} from './frame-gap-plan.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
export default mergeConfig(base,{plugins:[{name:'frame-gap-diagnostic-only',enforce:'pre',transform(source,id){const path=id.split('?')[0];
  if(path===`${root}main.ts`)return{code:instrumentMain(source),map:null};
  if(path===`${root}observe-scene.ts`)return{code:instrumentFixtureObserver(source),map:null};return null;
}}],build:{outDir:`${root}.frame-gap-build`,emptyOutDir:true}});
