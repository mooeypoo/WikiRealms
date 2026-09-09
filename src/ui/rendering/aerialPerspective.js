/**
 * How distance is turned into haze.
 *
 * Air is not perfectly clear, so a far ridge is partly the colour of the
 * sky between you and it. That single fact is most of what tells an eye
 * how big a landscape is, and without it a world reads as a model of
 * itself — every ridge equally crisp, so nothing is far, so the whole
 * thing is small and close and made of painted plaster.
 *
 * This module owns only the RANGE: at what depth the haze starts and at
 * what depth it is total. The colour is a design token (--atmosphere,
 * which explains at length why it is a sky rather than a shadow), and
 * the mixing is three's own fog, so the terrain, both vegetation layers
 * and the water's standard material all recede together.
 *
 * WHY THE RANGE FOLLOWS THE CAMERA
 *
 * Real aerial perspective is absolute: a ridge fifty miles off is hazy
 * no matter where you stand. That model fails here, because the camera
 * is enormously far from the world by the world's own standards — the
 * flat map opens 460 units back from terrain 512 across. Absolute fog at
 * any density that showed on the far hills would veil the near ones just
 * as much, and the whole frame would come out flat and grey.
 *
 * So the range is anchored to the near edge of the world and spans the
 * world, which is what a painter does rather than what an atmosphere
 * does: the near-to-far gradient reads at every zoom, and no camera
 * position washes the picture out.
 *
 * The cost of that choice, stated plainly because it is a real one:
 * haze here is not a measure of absolute distance, so it cannot be read
 * as one. Two ridges the same distance apart are separated more strongly
 * when the camera is close. That is the trade a painter makes too, and
 * for a view whose job is to be legible at every zoom it is the right
 * way round.
 */

/**
 * How far past the world's far edge the haze reaches full strength, in
 * world extents.
 *
 * Deliberately more than 1. Fog is total at `far`, so putting `far` one
 * extent out would erase the back of the world rather than veil it. At
 * 1.6 the far edge lands a little under halfway into the haze, and since
 * three's Fog smoothsteps rather than ramps linearly, the near edge of
 * the world sits at 8% and the change happens over the depth where the
 * cue is wanted.
 *
 * HOW THIS WAS TUNED, since the first attempt measured well and could
 * not be seen. Comparing each frame against the same frame with fog off
 * cancels albedo, so the numbers below are the haze's own contribution
 * at two depths, on grass, on the default flat view.
 *
 *   extents   far shift toward sky   mid-ground   detail kept (far/mid)
 *      2.5           7.1                 3.6           96% / 96%
 *      2.0          10.7                 5.5           95% / 94%
 *      1.6          15.9                 8.2           92% / 91%
 *      1.3          22.7                12.0           89% / 87%
 *      1.0          34.6                18.9           85% / 79%
 *
 * "Detail kept" is the spread of luminance across the band as a fraction
 * of its unhazed spread — how much of the terrain's own modelling
 * survives. It is the thing that stops this going further: at 1.0 the
 * mid-ground has lost a fifth of its contrast, which is the whole
 * picture going milky rather than the distance receding. 1.6 buys half
 * again the cue of 2.0 for 3 points of it.
 */
export const AERIAL_PERSPECTIVE = Object.freeze({
  fullHazeExtents: 1.6,
})

/**
 * The near and far depths of the haze, for a camera this far out over a
 * world this big.
 *
 * `cameraDistance` is measured from the world's centre, because that is
 * what an orbit camera's position length is. Half an extent comes off it
 * to get the distance to the world's SURFACE — the same correction the
 * vegetation LOD makes, and for the same reason: the near edge of what
 * you can see is half a world nearer than the middle of it, and fog
 * starting at the middle would leave the whole front half unhazed and
 * the gradient sitting in the wrong place.
 *
 * Returns a range even when the inputs are degenerate, so a caller can
 * assign it unconditionally: fog with near === far is a hard cut at one
 * depth, which is wrong but harmless, where a NaN would black the frame.
 *
 * @param {object} view
 * @param {number} view.cameraDistance Camera's distance from the world's centre.
 * @param {number} view.worldExtent The world's width; a globe's is its diameter.
 * @returns {{ near: number, far: number }} Depths in world units.
 */
export function hazeRange({ cameraDistance, worldExtent }) {
  const extent = Number.isFinite(worldExtent) && worldExtent > 0 ? worldExtent : 0
  const distance = Number.isFinite(cameraDistance) ? cameraDistance : 0

  const near = Math.max(0, distance - extent * 0.5)
  return { near, far: near + extent * AERIAL_PERSPECTIVE.fullHazeExtents }
}
