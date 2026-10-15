// One explicit visual setup, never a native movement endpoint or ±8 box.
export const WALK_MODE='controlled-walk-frame-visual';
export const WALK_POSE=Object.freeze({id:'south-walk-frame4-east-cap',x:2007.5,y:698.5});
export const WALK_FRAME=Object.freeze({animation:'hero-knight_armed_walk-S',arrayIndex:4,animationFrameIndex:5,
  textureKey:'_games_arpg_characters_hero_knight_knight_armed_walk_S_knight_armed_walk_S_270_0_4_png',frameName:'__BASE',
  sourcePixel:Object.freeze([132,135]),rgba:Object.freeze([26,23,27,232])});
export const WALK_LIMITS=Object.freeze({caseMs:180000,framesPerPose:64,stableComparisons:3,cameraTolerance:.01,
  requests:1,captures:1,maxSelectedFrames:128,width:2048,height:2048,pixels:2500000,base64Chars:8000000});
export const WALK_TITLES=Object.freeze(['desktop controlled S4 walking-frame body-edge observation','phone controlled S4 walking-frame body-edge observation']);
export const walkViewport=index=>index===1?{width:390,height:844}:{width:1280,height:900};
export const walkScreenshot=index=>`${index===1?'phone':'desktop'}-courtyard-walk-frame4`;
