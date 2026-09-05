/**
 * Placing a DOM card against a point in the 3D world.
 *
 * Two problems the existing tooltip has, and which the portal preview would
 * have inherited:
 *
 * 1. OCCLUSION. A marker on the far side of the planet still projects to
 *    perfectly valid screen coordinates — projectClipToScreen only rejects
 *    points behind the CAMERA, not points behind the world. So labels
 *    appeared for markers the viewer could not see, sitting on top of ones
 *    they could, which is what makes them unreadable.
 *
 * 2. EDGES. The card is positioned from its top-left with no bounds, so near
 *    the right or bottom edge it runs off the viewport and gets clipped.
 *
 * Pure numbers: no three.js, no DOM. The renderer hands over a projected
 * point and the sizes involved.
 */

/**
 * Whether a point on a sphere centred at the origin faces the camera.
 *
 * The surface normal at a point on a sphere IS the point (normalised), so
 * this is just: does the outward normal have a component toward the eye?
 * Points on the far limb fail, which is exactly the set that should have no
 * label.
 *
 * @param {{x:number,y:number,z:number}} point local position on the sphere
 * @param {{x:number,y:number,z:number}} camera local camera position
 * @param {number} [bias] positive hides points near the limb too, where a
 *   label would be technically visible but grazing and illegible
 */
export function facesCamera(point, camera, bias = 0) {
  const toCamera = {
    x: camera.x - point.x,
    y: camera.y - point.y,
    z: camera.z - point.z,
  }
  const dot = point.x * toCamera.x + point.y * toCamera.y + point.z * toCamera.z
  const scale = Math.hypot(point.x, point.y, point.z) * Math.hypot(toCamera.x, toCamera.y, toCamera.z)

  if (scale === 0) return true
  return dot / scale > bias
}

/**
 * Places a card near an anchor without letting it leave the viewport or sit
 * on top of the marker it describes.
 *
 * Preferred position is above and centred, because a marker is a thing you
 * are pointing at and a card covering it answers a question by hiding its
 * subject. When there is no room above, it flips below; the caller draws
 * its leader from the anchor to whichever side came back.
 *
 * @param {{
 *   anchor: {x: number, y: number},
 *   card: {width: number, height: number},
 *   viewport: {width: number, height: number},
 *   gap?: number, margin?: number,
 * }} options
 * @returns {{ x: number, y: number, side: 'above'|'below', clamped: boolean }}
 */
export function placeCard({ anchor, card, viewport, gap = 14, margin = 12 }) {
  const roomAbove = anchor.y - gap - margin
  const side = roomAbove >= card.height ? 'above' : 'below'

  const idealX = anchor.x - card.width / 2
  const idealY = side === 'above' ? anchor.y - gap - card.height : anchor.y + gap

  const maxX = Math.max(margin, viewport.width - card.width - margin)
  const maxY = Math.max(margin, viewport.height - card.height - margin)

  const x = Math.min(Math.max(idealX, margin), maxX)
  const y = Math.min(Math.max(idealY, margin), maxY)

  return { x, y, side, clamped: x !== idealX || y !== idealY }
}

/**
 * Whether a card should be shown at all: on screen, in front of the camera,
 * and — on a sphere — on the near face.
 *
 * @param {{isBehindCamera: boolean, isOnScreen: boolean}} projected
 * @param {boolean} [occluded]
 */
export function shouldShowCard(projected, occluded = false) {
  return Boolean(projected?.isOnScreen) && !projected.isBehindCamera && !occluded
}
