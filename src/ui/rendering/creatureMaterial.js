/**
 * Cute pudding / leviathan meshes: soft icosphere with baked-in eyes,
 * optional dorsal bump and forward stretch for sea whales.
 *
 * Appearance uses the shared stylized material (same Half-Lambert / fog /
 * instancing path as the canopy). Squash-stretch, hop and breach live in
 * the instance matrix (creatureMotion.js).
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { NO_SNOWLINE, createStylizedMaterial } from './stylizedMaterial.js'

/**
 * @param {{ eyeSize?: number, spherical?: boolean }} [options]
 * @returns {THREE.ShaderMaterial}
 */
export function createCreatureMaterial({ spherical = false } = {}) {
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
 * @param {{ eyeSize?: number, elongate?: number, dorsal?: boolean }} [options]
 * @returns {THREE.BufferGeometry}
 */
export function createCreatureGeometry({ eyeSize = 0.14, elongate = 1, dorsal = false } = {}) {
  const body = new THREE.IcosahedronGeometry(0.5, 3)
  // Stretch along forward (+Y) before flipping to Z-up.
  if (elongate !== 1) body.scale(1, elongate, 1)
  body.rotateX(Math.PI / 2)

  const eyeY = 0.35 * Math.min(elongate, 1.4)
  const eyeGeo = (x) => {
    const g = new THREE.IcosahedronGeometry(eyeSize, 1)
    g.rotateX(Math.PI / 2)
    g.translate(x, eyeY, 0.28)
    return g
  }
  const left = eyeGeo(-0.18)
  const right = eyeGeo(0.18)

  const parts = [body, left, right]
  if (dorsal) {
    const bump = new THREE.IcosahedronGeometry(0.14, 1)
    bump.rotateX(Math.PI / 2)
    bump.translate(0, -0.05 * elongate, 0.48)
    parts.push(bump)
  }

  const counts = parts.map((g) => g.attributes.position.count)
  const total = counts.reduce((a, b) => a + b, 0)
  const colors = new Float32Array(total * 3)
  let offset = 0
  parts.forEach((part, partIndex) => {
    const n = counts[partIndex]
    // Body + dorsal stay white for instance tint; eyes stay near-black.
    const isEye = partIndex === 1 || partIndex === 2
    for (let i = 0; i < n; i += 1) {
      const base = (offset + i) * 3
      if (isEye) {
        colors[base] = 0.08
        colors[base + 1] = 0.07
        colors[base + 2] = 0.1
      } else {
        colors[base] = 1
        colors[base + 1] = 1
        colors[base + 2] = 1
      }
    }
    offset += n
  })

  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!merged) {
    const fallback = new THREE.IcosahedronGeometry(0.5, 3)
    fallback.rotateX(Math.PI / 2)
    return fallback
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return merged
}
