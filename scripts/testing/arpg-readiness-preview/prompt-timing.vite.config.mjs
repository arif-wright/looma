import { mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import base from './vite.config.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
// Only this dedicated diagnostic build adds the observer. The acceptance
// config/entrypoint and real application source are never rewritten on disk.
export default mergeConfig(base,{
  plugins:[{name:'prompt-timing-diagnostic-only',enforce:'pre',
    transform(source,id){
      if(id.split('?')[0]!==`${root}main.ts`)return null;
      return {code:`import './prompt-timing-observer';\n${source}`,map:null};
    }}],
  build:{outDir:`${root}.timing-build`,emptyOutDir:true}
});
