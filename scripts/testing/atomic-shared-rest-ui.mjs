// Real Sanctuary component/browser regression with mocked endpoint responses.
// No login, remote APIs, or production data. Run after `svelte-kit sync`.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const root = process.cwd();
const dir = await mkdtemp(resolve(root,'.svelte-kit/rest-ui-'));
let server, browser;
try {
  await writeFile(resolve(dir,'index.html'),'<div id="app"></div><script type="module" src="/main.js"></script>');
  await writeFile(resolve(dir,'blank.html'),'<p>Temporary navigation</p>');
  await writeFile(resolve(dir,'navigation.js'),'export const invalidateAll = async () => {};');
  await writeFile(resolve(dir,'stores.js'),"import { writable } from 'svelte/store'; export const page = writable({url:new URL(location.href)});");
  await writeFile(resolve(dir,'main.js'),`
    import { mount } from 'svelte';
    import Page from '${root}/src/routes/app/(protected)/sanctuary/+page.svelte';
    const item={id:'40000000-0000-0000-0000-000000000001',item_key:'care-moss-seat',title:'Moss Seat',tone:'bond',visual_key:'moss_seat',capabilities:['placeable','interactive']};
    const empty=new URLSearchParams(location.search).has('empty');
    mount(Page,{target:document.querySelector('#app'),props:{data:{
      companion:{id:'20000000-0000-0000-0000-000000000001',name:'Root'},
      items:[{id:'30000000-0000-0000-0000-000000000001',item,source_type:'care_milestone'}],
      placements:empty?[]:[{id:'60000000-0000-0000-0000-000000000001',slot_key:'center_glade',item}],
      restAvailable:!empty,nextRestAvailableAt:null,latestReaction:null,error:null
    }}});
  `);
  server=await createServer({configFile:false,root:dir,plugins:[svelte({configFile:false,preprocess:vitePreprocess()})],
    resolve:{alias:{'$lib':resolve(root,'src/lib'),'$app/navigation':resolve(dir,'navigation.js'),'$app/stores':resolve(dir,'stores.js')}},
    server:{host:'127.0.0.1',port:0,fs:{allow:[root]}},logLevel:'error'});
  await server.listen();
  const url=server.resolvedUrls.local[0];
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  const calls=[];
  let held;
  let mode='hold';
  await page.route('**/api/sanctuary/interact', async route => {
    calls.push(route.request().postDataJSON());
    if(mode==='hold'){held=route;return;}
    if(mode==='auth'){await route.fulfill({status:401,json:{error:'unauthorized'}});return;}
    if(mode==='uncertain'){await route.fulfill({status:503,json:{error:'gateway_unavailable'}});return;}
    await route.fulfill({status:200,json:{ok:true,replayed:true,reaction:'A remembered rest.',restoredEnergy:35,nextAvailableAt:'2030-01-01T00:00:00Z',
      memory:{id:'70000000-0000-0000-0000-000000000001',companion_id:'20000000-0000-0000-0000-000000000001',title:'Our quiet rest'}}});
  });
  await page.goto(url);
  const rest=page.getByRole('button',{name:'Rest Together',exact:true});
  await rest.click();
  await page.waitForFunction(()=>document.querySelector('button:disabled')?.textContent.includes('Resting'));
  assert.equal(calls.length,1,'repeated activation should not produce a second pending request');
  await page.getByRole('button',{name:'Resting...'}).evaluate(button=>button.click());
  assert.equal(calls.length,1);
  await held.fulfill({status:500,json:{error:'interaction_failed'}});
  const recover=page.getByRole('button',{name:'Recover quiet moment'});
  await recover.waitFor();
  mode='auth'; await recover.click(); await recover.waitFor();
  assert.equal(calls.length,2);
  mode='uncertain'; await page.goto(`${url}?empty=1`);
  await recover.waitFor();
  assert.equal(calls.length,3,'reload should recover pending UUID despite no current seat');
  await page.goto(`${url}blank.html`); await page.goBack();
  await recover.waitFor();
  mode='success'; await recover.click();
  await page.getByRole('link',{name:'Revisit “Our quiet rest” in your Journal'}).waitFor();
  assert.ok(calls.length>=4);
  assert.equal(new Set(calls.map(call=>call.requestId)).size,1,'all retries/reloads must reuse the original UUID');
  assert.ok(calls.every(call=>call.companionId==='20000000-0000-0000-0000-000000000001'));
  assert.equal(await page.evaluate(()=>sessionStorage.length),0,'confirmed result clears pending request');
  assert.equal(await recover.count(),0,'no duplicate rest action after confirmed replay with seat removed');
  console.log('PASS: real Sanctuary UI repeat click, 500/401 uncertainty, reload/back, removed-seat recovery, stable UUID, exact Journal link');
} finally { await browser?.close(); await server?.close(); await rm(dir,{recursive:true,force:true}); }
