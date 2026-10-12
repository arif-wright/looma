// Fabricated verifier input only. Never imported by the browser or saved as
// runtime evidence. Real source/mocked-observer tests live in courtyard.test.
import {COURTYARD_NAMES,expectedCourtyardCommands,expectedCourtyardPresentation} from './courtyard-graphics.mjs';
export function fabricateCourtyardSchema(gameplay,idBase=1000){
  const g=gameplay.townArt.ground;
  Object.assign(g,{worldGraphicsCount:6,baseGraphicsCount:2,graphicsOwnershipValid:true,
    originalGraphicsIds:[g.perimeter[0].objectId,g.backdrop[0].objectId],unknownGraphicsIds:[],
    courtyard:COURTYARD_NAMES.map((name,i)=>({name,objectId:idBase+i,isGraphics:true,inWorld:1,
      x:0,y:0,scaleX:1,scaleY:1,rotation:0,scrollFactorX:1,scrollFactorY:1,active:true,visible:true,
      ...expectedCourtyardPresentation(name,gameplay),commandCount:expectedCourtyardCommands(name).length,commands:expectedCourtyardCommands(name)}))});
}
