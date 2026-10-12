// Offline literal-source and mocked-native-call tests, never browser proof.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const source=read('./courtyard-navigation.ts');
const fn=(text,name)=>{const ast=ts.createSourceFile('fixture.ts',text,ts.ScriptTarget.Latest,true);return ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===name).getText(ast);};
const original=fn(read('./plaza-browser.ts'),'move'),extended=fn(source,'moveCourtyard');
const signature=', guard: (position: { x: number; y: number }, pulse: ReturnType<typeof waypointStep>) => void';
const check='      guard(p,pulse); // Additive courtyard checks may only reject this original pulse.\n';
test('historical move declaration and body retain exact independently pinned source hash',()=>assert.equal(createHash('sha256').update(original).digest('hex'),'bac2e8cf7fa8ac0db91a72fa3aebfda5533f20b0a61ce230c0ca052b77a122c8'));
test('dedicated wall move has only explicit rename, required parameter and one pre-press rejection line',()=>{
 assert.equal(extended.split(signature).length,2);assert.equal(extended.split(check).length,2);
 assert.equal(extended.replace('export async function moveCourtyard(','async function move(').replace(signature,'').replace(check,''),original);
 assert(extended.indexOf(check)>extended.indexOf('if(!pulse)return;'));
 assert(extended.indexOf(check)<extended.indexOf('await page.keyboard.press'));
 assert.equal((extended.match(/guard\(p,pulse\)/g)||[]).length,1);
});
test('native courtyard driver alone imports the extension and supplies only pulse budget/rejection checks',()=>{
 const driver=read('./courtyard-browser.ts');assert(driver.includes("import { moveCourtyard } from './courtyard-navigation';"));assert(driver.includes('await moveCourtyard(page,x,y,(_position,pulse)=>{'));
 const body=driver.slice(driver.indexOf('await moveCourtyard(page'),driver.indexOf('    });',driver.indexOf('await moveCourtyard(page')));
 assert.equal(body,`await moveCourtyard(page,x,y,(_position,pulse)=>{\n      if(++receipt.pulses>COURTYARD_LIMITS.pulses)throw Error('Courtyard native pulse budget exceeded');\n      if(!courtyardChordAllowed(pulse))throw Error('Original native chord refused by additional courtyard solids');\n`);
});
const js=ts.transpileModule(source,{fileName:'courtyard-navigation.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function mocked({pulses=[{key:'d',delay:30},null],positions=[{x:1,y:2},{x:3,y:2}],endpoint=true,pressError=null,frameError=null}={}){
 const events=[],steps=[],module={exports:{}};let pi=0,fi=0;
 const page={keyboard:{press:async(key,options)=>{events.push(['press',key,options.delay]);if(pressError)throw pressError;}}};
 const require=name=>name==='./plaza-navigation.mjs'?{
   waypointStep:(p,x,y,elapsed,missed,history)=>{steps.push({p,x,y,elapsed,missed,history:structuredClone(history)});events.push(['choose']);return pulses[pi++];},
   chordEndpointAllowed:()=>{events.push(['endpoint']);return endpoint;}
 }:name==='./plaza-browser'?{
   releasedFrame:async()=>{events.push(['frame']);if(frameError&&fi>0)throw frameError;return positions[fi++];},
   release:async()=>{events.push(['release']);}
 }:(()=>{throw Error(`Unexpected import ${name}`);})();
 vm.runInNewContext(js,{module,exports:module.exports,require,Date});
 return{run:guard=>module.exports.moveCourtyard(page,3,2,guard),events,steps};
}
test('required rejection callback executes before any native key press and rejects with original cleanup',async()=>{
 const m=mocked(),error=Error('wall chord rejected');await assert.rejects(m.run(()=>{m.events.push(['guard']);throw error;}),e=>e===error);
 assert.deepEqual(m.events,[['frame'],['choose'],['guard'],['release']]);
});
test('omitting required callback fails closed before a key press',async()=>{
 const m=mocked();await assert.rejects(m.run(undefined),/guard is not a function/);assert.deepEqual(m.events,[['frame'],['choose'],['release']]);
});
test('a completed original pulse-free leg makes no callback or key call',async()=>{
 const m=mocked({pulses:[null]});await m.run(()=>assert.fail('No chosen pulse'));assert.deepEqual(m.events,[['frame'],['choose']]);
});
test('one guard call precedes each original selected key press and preserves history',async()=>{
 const m=mocked();await m.run((p,pulse)=>{m.events.push(['guard',p.x,pulse.key]);});
 assert.deepEqual(m.events,[['frame'],['choose'],['guard',1,'d'],['press','d',30],['frame'],['endpoint'],['choose']]);
 assert.deepEqual(m.steps[1].history,[{key:'d',delay:30,before:{x:1,y:2},after:{x:3,y:2}}]);assert.equal(m.steps[1].missed,0);
});
test('native key failure propagates and keeps original exception release',async()=>{
 const error=Error('native key failed'),m=mocked({pressError:error});await assert.rejects(m.run(()=>{}),e=>e===error);assert.deepEqual(m.events.at(-1),['release']);
});
test('fresh-frame failure propagates and keeps original exception release',async()=>{
 const error=Error('frame watchdog'),m=mocked({frameError:error});await assert.rejects(m.run(()=>{}),e=>e===error);assert.deepEqual(m.events.at(-1),['release']);
});
test('original chord endpoint guard is still enforced after the native key press',async()=>{
 const m=mocked({endpoint:false});await assert.rejects(m.run(()=>{}),/independently safe envelope/);assert.deepEqual(m.events.slice(-2),[['endpoint'],['release']]);
});
