/**
 * Turns a ground-cover form (see foliage.js UNDERSTORY_FORMS) into one
 * BufferGeometry: a clump of a few tapered, arching blades.
 *
 * WHAT THIS REPLACES, AND WHY
 *
 * The understory was a THREE.Points cloud wearing a canvas texture.
 * Three separate things were wrong with that, and only one of them was
 * cosmetic:
 *
 *   - Point sprites are screen-aligned on EVERY axis. Tilt the camera
 *     down toward the ground and the grass tilts with it, so it lies
 *     flat instead of standing up. A billboard that only yaws around
 *     the surface normal is the usual fix, and Points structurally
 *     cannot do it.
 *   - `gl_PointSize` is driver-capped, commonly between 63 and 255
 *     pixels. On the flat map, where the camera can come right down to
 *     the ground, the grass simply stopped growing past some arbitrary
 *     zoom.
 *   - A point is ONE vertex. It has no interior to displace, so it
 *     cannot bend, so it could not take the wind. Moving it translates
 *     the whole tuft, which reads as sliding rather than swaying — the
 *     reason the wind pass shipped covering trees and not grass.
 *
 * Real geometry fixes all three at once, and costs less per pixel than
 * the sprites did: these are opaque triangles with no texture, no
 * alphaTest and no discard, where the sprites were alpha-cut quads in
 * the densest layer of the scene.
 *
 * SAME CONVENTIONS AS canopyGeometry.js
 *
 * +Z is up, the base sits at the origin, and everything merges into one
 * geometry per variant so a whole world of ground cover is one draw
 * call. The base at the origin is what lets the wind shader weight its
 * bend by `transformed.z` and leave the roots planted.
 *
 * It imports three for the same reason that module does: three's
 * geometry classes need no WebGL context, so a shape can be asserted
 * under jsdom, while nothing inside the component's render path can be.
 *
 * VERTEX COLOURS ARE PART OF THE SHAPE
 *
 * Each blade carries a dark-at-the-root gradient in its `color`
 * attribute. It is what sells depth in a stylized look: without it a
 * clump is one flat green and reads as a cardboard cutout, however
 * good its silhouette. It multiplies with the per-instance tint, since
 * three's color_vertex chunk folds both the vertex `color` and
 * `instanceColor` into vColor — so the gradient shades the blade and
 * the instance colour says which green it is, with no shader change.
 */
import * as THREE from 'three'
import { mergeGeometries } from './canopyGeometry.js'

/**
 * How dark the base of a blade is against its tip.
 *
 * Shadow at the root of a clump is ambient occlusion by another name —
 * the light really is blocked down there — which is why a fairly strong
 * value reads as depth rather than as dirt.
 */
const ROOT_SHADE = 0.45

/**
 * Builds one blade as a tapered strip lying in its own local XZ plane,
 * rising along +Z, arching toward +X.
 *
 * Two triangles per segment, and the width shrinks to a point at the
 * tip, so a blade ends in a spike rather than a cut-off rectangle.
 *
 * @param {{ segments: number, height: number, width: number, arch: number }} blade
 * @returns {THREE.BufferGeometry}
 */
function buildBlade({ segments, height, width, arch }) {
  const rows = segments + 1
  const positions = []
  const colors = []
  const indices = []

  for (let row = 0; row < rows; row += 1) {
    const along = row / segments
    // Quadratic, so the curve tightens toward the tip the way a stem
    // does: a linear lean is a straight blade held at an angle.
    const bend = arch * height * along * along
    const halfWidth = (width / 2) * (1 - along)
    const z = height * along

    // Across the blade, not along it, so the taper is symmetric.
    positions.push(bend, -halfWidth, z, bend, halfWidth, z)

    const shade = ROOT_SHADE + (1 - ROOT_SHADE) * along
    colors.push(shade, shade, shade, shade, shade, shade)
  }

  for (let row = 0; row < segments; row += 1) {
    const base = row * 2
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Builds one clump of ground cover.
 *
 * Blades are spaced evenly around a small base ring and tilted outward,
 * which is what gives the clump a footprint. That footprint matters: the
 * sprite this replaces was a disc the full width of the variant's
 * `size`, so a tight bunch of verticals would read as the whole layer
 * having thinned out.
 *
 * @param {object} form from UNDERSTORY_FORMS
 * @param {number} size the variant's size in grid cells
 * @param {number} [scale] world units per grid cell for the active
 *   projection (see FLAT_VIEW/SPHERE_VIEW foliageScale)
 * @returns {THREE.BufferGeometry}
 */
export function buildUnderstoryGeometry(form, size, scale = 1) {
  const unit = size * scale
  const blades = []

  for (let index = 0; index < form.blades; index += 1) {
    const blade = buildBlade({
      segments: form.segments,
      height: form.height * unit,
      width: form.width * unit,
      arch: form.arch,
    })

    // Tilt outward first, in the blade's own frame, then swing the whole
    // thing to its place in the ring. Doing it in this order is what
    // makes every blade lean AWAY from the centre rather than all of
    // them leaning the same way, which is a bush rather than a comb.
    blade.rotateY(form.lean)
    // An offset half-step so the ring does not line up with the
    // instance's own yaw and produce a visible radial pattern where
    // clumps happen to share a rotation.
    const bearing = ((index + 0.5) / form.blades) * Math.PI * 2
    blade.rotateZ(bearing)
    blade.translate(Math.cos(bearing) * form.spread * unit, Math.sin(bearing) * form.spread * unit, 0)
    blades.push(blade)
  }

  const merged = mergeGeometries(blades)
  for (const blade of blades) blade.dispose()
  return merged
}

/**
 * Height of the tallest vertex in a clump, in world units.
 *
 * `form.height` is the length of a blade ALONG ITSELF, which is not how
 * high it reaches: the outward lean and the arch both tilt it over, and
 * on scrub — leaning 0.5 radians with a low arch — they cost 22% of it.
 *
 * The distinction is not pedantry, because this number is what the wind
 * divides a vertex's own z by to decide how far to lean it. Reporting
 * the blade's length instead means the tallest vertex in the clump only
 * ever reaches a fraction of the way up its own weighting curve, and
 * since that curve is squared, scrub bent at less than half the
 * intended amount while claiming to be at full stretch.
 *
 * Derived rather than measured: rotating a blade by `lean` about Y sends
 * its tip from (arch*h, 0, h) to z = h*(cos(lean) - arch*sin(lean)), and
 * neither the ring rotation nor the translation touches z. The tip is
 * the tallest point as long as cos(lean) > 2*arch*sin(lean), which every
 * form here satisfies with room to spare — and which the geometry test
 * checks against the built vertices rather than trusting this comment.
 *
 * @param {object} form from UNDERSTORY_FORMS
 * @param {number} size the variant's size in grid cells
 * @param {number} [scale]
 */
export function understoryHeight(form, size, scale = 1) {
  const tilt = Math.cos(form.lean) - form.arch * Math.sin(form.lean)
  return form.height * size * scale * tilt
}

/**
 * Triangles in one clump. Exported because it is the cost of this layer
 * in one number, and the layer is the densest in the scene.
 *
 * @param {object} form from UNDERSTORY_FORMS
 */
export function understoryTriangleCount(form) {
  return form.blades * form.segments * 2
}
