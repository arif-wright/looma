# Mobile world controls

The direction pad owns movement. Camera rotation, zoom, reset, and presets use the separate lower-right camera control cluster, so a movement finger never changes the camera. The game viewport and canvas use `touch-action: none`; wheel/context-menu behavior is suppressed only inside the active surface. Navigation, Return Home, and page accessibility outside the surface remain normal browser behavior.

Controls are rotate left/right, zoom in/out, reset, and a preset selector. Landscape is recommended for more scene visibility but is not locked. Browser orientation APIs and global pinch-zoom suppression are deliberately avoided outside the world surface.

Future gesture experiments must reserve an explicit camera zone, keep the direction pad independent, remain keyboard-equivalent, and never intercept Return Home or surrounding application navigation.

## Compact Three layout

At widths up to 640px, the optional Three renderer uses separate 44px movement
and camera buttons, with a reserved gap above the taller camera cluster for the
gather or portal prompt. A 25rem minimum game height leaves room for feedback on
short portrait screens. In coarse-pointer phone landscape (at least 480px wide,
at most 500px high), the camera buttons become one row with the preset below;
feedback and the interaction prompt keep their own space above both controls.
Safe-area offsets are retained, and the minimum game height also reserves the
bottom inset so a home indicator cannot push the prompt into feedback. Phaser's layout rules are unchanged.

The credential-free Moonberry browser fixture verifies narrow portrait, common
phone landscape, interrupted movement, repeated camera taps, feedback links,
and delayed renderer imports during unmount. These are local synthetic UI
checks, not a claim about live multiplayer rewards or real-device performance.
