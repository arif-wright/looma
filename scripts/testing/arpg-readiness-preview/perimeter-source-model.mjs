// Test-only extraction of unchanged production methods. This is an offline
// source model, not a browser run or invocation of a live production callback.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sceneSource=read('../../../src/lib/games/arpg/scenes/GameScene.ts');
const ast=ts.createSourceFile('GameScene.ts',sceneSource,ts.ScriptTarget.Latest,true);
const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='GameScene');
const methods=['handleInput','worldToTile','isBlocked','resolveCollisions'].map(name=>cls.members.find(m=>m.name?.getText(ast)===name).getText(ast)).join('\n');
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const run=(source,extra={})=>{const module={exports:{}};vm.runInNewContext(transpile(source),{module,exports:module.exports,require:()=>({}),Math,Number,Map,...extra});return module.exports;};
const {movementSystem}=run(read('../../../src/lib/games/arpg/ecs/systems.ts'));
const {SourceScene}=run(`export class SourceScene {${methods}}`,{ROOM_WIDTH:28,ROOM_HEIGHT:18,ROOM_ORIGIN_X:1152,ROOM_ORIGIN_Y:-200,HALF_TILE_WIDTH:64,HALF_TILE_HEIGHT:32,Phaser:{Input:{Keyboard:{JustDown:()=>false}},Math:{Distance:{Between:(a,b,c,d)=>Math.hypot(c-a,d-b)}}}});
export function sourceNorthFrames(x,y,quanta) {
  const scene=new SourceScene(),position={x,y},velocity={vx:0,vy:0,speed:220};
  const vector={x:0,y:0,set(x,y){this.x=x;this.y=y;},lengthSq(){return this.x*this.x+this.y*this.y;},normalize(){const length=Math.hypot(this.x,this.y);this.x/=length;this.y/=length;}};
  const wallTiles=new Set();for(let tx=0;tx<28;tx++)for(let ty=0;ty<18;ty++)if(tx===0||tx===27||ty===0||ty===17)wallTiles.add(`${tx},${ty}`);
  Object.assign(scene,{movementInput:vector,isKeyDown:key=>key==='w',cursors:Object.fromEntries(['left','right','up','down'].map(k=>[k,{isDown:false}])),lastMoveDir:{copy(){}},heroFacingVec:{copy(){}},directionFromVector:()=> 'N',updateHeroAnimation(){},dashKeys:[],playerId:1,skeletons:[],wallTiles,townCorner:null,props:[],world:{getTransform:()=>position,getVelocity:()=>velocity,forEachMovement:fn=>fn(1,position,velocity)}});
  return quanta.map(q=>{
    const before={...position},delta=q/220*1000;
    scene.handleInput();movementSystem(scene.world,delta);
    const attempted={...position},blocked=scene.isBlocked(position.x,position.y,38);
    scene.resolveCollisions(new Map([[1,before]]));
    return {before,attempted,blocked,after:{...position},velocity:{...velocity},delta};
  });
}
