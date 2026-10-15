export const DIAGNOSTIC_KIND='arpg-prompt-timing-diagnostic';
export const WARMUP_FRAMES=120;
export const NEUTRAL_WINDOW_MS=10_000;
export const MAX_INPUT_CALLS=4096;
export const PREFIX_TIMEOUT_MS=180_000;
export const RUNS=[
  {id:1,mode:'candidate',role:'warmup'}, {id:2,mode:'bypass',role:'warmup'},
  {id:3,mode:'candidate',role:'measured'}, {id:4,mode:'bypass',role:'measured'},
  {id:5,mode:'bypass',role:'measured'}, {id:6,mode:'candidate',role:'measured'}
];
export const isNavigationGuardRejection=message=>[
  /^Unmodeled native fine-step quantum: [\d.]+$/,
  /^No independently safe native chord envelope near [\d.-]+,[\d.-]+$/,
  /^Native route stalled before [\d.-]+,[\d.-]+: /,
  /^Native chord exceeded its independently safe envelope: /
].some(pattern=>pattern.test(message));

export const CHECKPOINTS=['plaza-home','rear-front-ready','rear-front-walk-blocked','rear-front-dash-blocked','rear-side-ready','rear-side-dash-blocked','rear-back-cutaway','perimeter-ready','perimeter-wall-blocked','rear-front-restored','endcap-front-ready'];
