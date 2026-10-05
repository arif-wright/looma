import { createServer } from 'vite';
import { resolve } from 'node:path';
const root = process.cwd();
const server = await createServer({configFile:false,root,publicDir:'static',resolve:{alias:{$lib:resolve(root,'src/lib')}},server:{host:'127.0.0.1',port:4317,strictPort:true}});
await server.listen();
console.log('Local visual fixture: http://127.0.0.1:4317/scripts/testing/connected-wilds-preview/index.html');
