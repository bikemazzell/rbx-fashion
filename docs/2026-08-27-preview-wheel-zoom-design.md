# Preview Wheel Zoom

## Goal

Let desktop users zoom the 3D avatar with a mouse wheel or trackpad while keeping the existing touch pinch gesture.

## Behavior

- Scrolling up over the 3D preview zooms in.
- Scrolling down over the 3D preview zooms out.
- Zoom remains within the preview's existing minimum and maximum camera distances.
- The wheel event prevents page scrolling only while the pointer is over the preview canvas.
- Reset restores the existing default camera distance.
- Pinch zoom and drag rotation remain unchanged.

## Implementation

Add a non-passive `wheel` listener to the preview renderer's canvas. Convert the wheel delta into a smooth multiplicative distance change, clamp it with the same bounds used by pinch zoom, apply the camera orbit, and remove the listener during preview disposal. Do not add controls or dependencies.

## Verification

Add a real-browser preview test that dispatches wheel input over the canvas and confirms that the rendered avatar becomes larger when zooming in and smaller when zooming out. Run the preview test, the complete browser suite, type checking, linting, unit tests, and the production build.
