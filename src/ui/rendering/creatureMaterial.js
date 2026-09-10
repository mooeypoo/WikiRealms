/**
 * Cute pudding-blob mesh: soft icosphere with baked-in eye dots.
 *
 * Appearance uses the shared stylized material (same Half-Lambert / fog /
 * instancing path as the canopy) rather than a one-off shader — a custom
 * ShaderMaterial here previously failed to compile under USE_INSTANCING_COLOR
 * and rendered as inert rectangles in Storybook.
 *
 * Squash-stretch and hop live in the instance matrix (creatureMotion.js).
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { NO_SNOWLINE, createStylizedMaterial } from './stylizedMaterial.js'

/**
 * @param {{ eyeSize?: number, spherical?: boolean }} [options]
 * @returns {THREE.ShaderMaterial}
 */
export function createCreatureMaterial({ spherical = false } = {}) {
  // No snow, no wind sway — blobs are animals, not plants. Instance
  // colour from setColorAt carries the family tint; vertex colours on
  // the geometry keep the eyes dark.
  return createStylizedMaterial({
    vertexColors: true,
    spherical,
    snowline: NO_SNOWLINE,
    swayHeight: 0,
    flatShading: false,
  })
}

/**
 * Soft body with two dark eye discs on the front (+Y) face.
 * Z-up to match foliage instance orientation.
 *
 * @param {{ eyeSize?: number }} [options]
 * @returns {THREE.BufferGeometry}
 */
export function createCreatureGeometry({ eyeSize = 0.14 } = {}) {
  const body = new THREE.IcosahedronGeometry(0.5, 3)
  body.rotateX(Math.PI / 2)

  // Eyes as tiny spheres, slightly proud of the surface so they read at
  // a distance. Painted dark via vertex colours so one draw call keeps
  // the family albedo on the body and the pupils separate.
  const eyeGeo = (x) => {
    const g = new THREE.IcosahedronGeometry(eyeSize, 1)
    g.rotateX(Math.PI / 2)
    g.translate(x, 0.42, 0.28)
    return g
  }
  const left = eyeGeo(-0.2)
  const right = eyeGeo(0.2)

  const bodyCount = body.attributes.position.count
  const leftCount = left.attributes.position.count
  const rightCount = right.attributes.position.count
  const colors = new Float32Array((bodyCount + leftCount + rightCount) * 3)
  // Body stays white so instanceColor multiplies cleanly; eyes stay near-black.
  for (let i = 0; i < bodyCount; i += 1) {
    colors[i * 3] = 1
    colors[i * 3 + 1] = 1
    colors[i * 3 + 2] = 1
  }
  const eyeStart = bodyCount * 3
  for (let i = 0; i < leftCount + rightCount; i += 1) {
    colors[eyeStart + i * 3] = 0.08
    colors[eyeStart + i * 3 + 1] = 0.07
    colors[eyeStart + i * 3 + 2] = 0.1
  }

  const merged = mergeGeometries([body, left, right], false)
  body.dispose()
  left.dispose()
  right.dispose()
  if (!merged) {
    // mergeGeometries returns null only if inputs disagree — fall back to body.
    const fallback = new THREE.IcosahedronGeometry(0.5, 3)
    fallback.rotateX(Math.PI / 2)
    return fallback
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return merged
}
