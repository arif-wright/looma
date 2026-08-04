# Mobile world controls

The direction pad owns movement. Camera rotation, zoom, reset, and presets use the separate lower-right camera control cluster, so a movement finger never changes the camera. The game viewport and canvas use `touch-action: none`; wheel/context-menu behavior is suppressed only inside the active surface. Navigation, Return Home, and page accessibility outside the surface remain normal browser behavior.

Controls are rotate left/right, zoom in/out, reset, and a preset selector. Landscape is recommended for more scene visibility but is not locked. Browser orientation APIs and global pinch-zoom suppression are deliberately avoided outside the world surface.

Future gesture experiments must reserve an explicit camera zone, keep the direction pad independent, remain keyboard-equivalent, and never intercept Return Home or surrounding application navigation.
