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
 * what depth it is total. The colour lives in the stylesheet next to the
 * backdrop it has to agree with (see --surface-haze), and the mixing is
 * three's own fog, so the terrain, both vegetation layers and the
 * water's standard material all recede together.
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
 * extent out would erase the back of the world rather than veil it. At 2
 * the far edge lands about a third of the way into the haze, and since
 * three's Fog smoothsteps rather than ramps linearly, the near half of
 * the world stays almost clear and the change happens over the depth
 * where the cue is wanted.
 *
 * Measured on the default flat view against the water, which is one
 * uniform colour and so isolates depth from albedo: the far edge loses
 * 20% of its brightness and the near edge 4%, taking the near-to-far
 * brightness ratio from 1.11 — which is only the sun's own falloff — to
 * 1.32. At 2.5 the far edge lost 13%, which measured as a gradient but
 * did not read as one.
 */
export const AERIAL_PERSPECTIVE = Object.freeze({
  fullHazeExtents: 2,
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
