/**
 * Per-frame pose for instanced fish: wide ocean wander, soft separation,
 * and a slow bob that can crest partly out of the water.
 */
import * as THREE from 'three'
import {
  CREATURE_HABITAT,
  CREATURE_SAMPLING,
  creaturePose,
  creatureWander,
  gaitFromCode,
} from './creatures.js'
import { seaPetCanStand } from './creatureScatter.js'
import { FISH_PETS, seaSubmerge } from './kenneyPets.js'
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'

const GEOMETRY_UP = new THREE.Vector3(0, 0, 1)
const position = new THREE.Vector3()
const normal = new THREE.Vector3()
const scale = new THREE.Vector3()
const quaternion = new THREE.Quaternion()
const yawQuat = new THREE.Quaternion()
const leanQuat = new THREE.Quaternion()
const pitchQuat = new THREE.Quaternion()
const matrix = new THREE.Matrix4()
const forward = new THREE.Vector3()
const scratch = new THREE.Vector3()
const pitchAxis = new THREE.Vector3()

/**
 * Pull a wander point back toward home until it sits on ocean, so fish
 * cruise along the coast instead of snapping home and looking stuck.
 *
 * @returns {{ gx: number, gy: number }}
 */
export function clampWanderToOcean(gx, gy, homeX, homeY, biomeMap, width, height, petId) {
  const sample = (x, y) => {
    const ix = Math.min(width - 1, Math.max(0, Math.round(x)))
    const iy = Math.min(height - 1, Math.max(0, Math.round(y)))
    return seaPetCanStand(biomeMap[iy * width + ix], petId)
  }

  if (sample(gx, gy)) return { gx, gy }

  let lo = 0
  let hi = 1
  for (let k = 0; k < 8; k += 1) {
    const t = (lo + hi) * 0.5
    const x = homeX + (gx - homeX) * t
    const y = homeY + (gy - homeY) * t
    if (sample(x, y)) lo = t
    else hi = t
  }

  return {
    gx: homeX + (gx - homeX) * lo,
    gy: homeY + (gy - homeY) * lo,
  }
}

/**
 * Soft pairwise push so fish in one layer do not occupy the same cell.
 *
 * @param {Float32Array} xs
 * @param {Float32Array} ys
 * @param {number} count
 * @param {number} minSep
 */
export function separateSwimPositions(xs, ys, count, minSep = CREATURE_SAMPLING.swimSeparation) {
  if (count < 2 || minSep <= 0) return
  const minSep2 = minSep * minSep
  for (let iter = 0; iter < 2; iter += 1) {
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        let dx = xs[j] - xs[i]
        let dy = ys[j] - ys[i]
        let dist2 = dx * dx + dy * dy
        if (dist2 >= minSep2) continue
        if (dist2 < 1e-8) {
          const angle = (i + 1) * 2.399963 + j
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          dist2 = 1
        }
        const dist = Math.sqrt(dist2)
        const push = (minSep - dist) * 0.5
        const ux = dx / dist
        const uy = dy / dist
        xs[i] -= ux * push
        ys[i] -= uy * push
        xs[j] += ux * push
        ys[j] += uy * push
      }
    }
  }
}

/**
 * Writes instance matrices for one fish layer.
 *
 * @param {THREE.InstancedMesh} mesh
 * @param {object} layer from scatterCreatures
 * @param {{ timeSec: number, animated: boolean, terrain: object,
 *   projection: object, heightScale: number, cellScale?: number }} ctx
 */
export function updateCreatureLayer(mesh, layer, ctx) {
  const { timeSec, animated, terrain, projection, heightScale, cellScale = 1 } = ctx
  const { width, height, biomeMap } = terrain
  const count = mesh.count
  const sea = layer.habitat === CREATURE_HABITAT.sea
  const petId = layer.petId
  const size = FISH_PETS[petId]?.size ?? 'medium'
  const reefFish = size === 'small' || size === 'medium'
  const wanderRadius = sea
    ? reefFish
      ? CREATURE_SAMPLING.shoreWanderRadius
      : CREATURE_SAMPLING.seaWanderRadius
    : CREATURE_SAMPLING.wanderRadius
  const seaLevel = BIOME_THRESHOLDS.oceanMaxHeight
  const submerge = sea ? seaSubmerge(petId) : 0

  const xs = new Float32Array(count)
  const ys = new Float32Array(count)
  const headings = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    const homeX = layer.homes[i * 2]
    const homeY = layer.homes[i * 2 + 1]
    const phase = layer.phases[i]
    const gaitSpeed = layer.gaitSpeeds[i]

    let gx = homeX
    let gy = homeY
    let heading = phase * Math.PI * 2

    if (animated) {
      const wander = creatureWander(timeSec, phase, gaitSpeed, wanderRadius)
      gx = homeX + wander.dx
      gy = homeY + wander.dy
      const next = creatureWander(timeSec + 0.08, phase, gaitSpeed, wanderRadius)
      heading = Math.atan2(next.dy - wander.dy, next.dx - wander.dx)
    }

    gx = Math.min(width - 2, Math.max(1, gx))
    gy = Math.min(height - 2, Math.max(1, gy))

    if (sea && biomeMap) {
      const clamped = clampWanderToOcean(gx, gy, homeX, homeY, biomeMap, width, height, petId)
      gx = clamped.gx
      gy = clamped.gy
    }

    xs[i] = gx
    ys[i] = gy
    headings[i] = heading
  }

  if (sea && animated) {
    separateSwimPositions(xs, ys, count)
    // Re-clamp after separation so pushes cannot walk fish onto land.
    if (biomeMap) {
      for (let i = 0; i < count; i += 1) {
        const homeX = layer.homes[i * 2]
        const homeY = layer.homes[i * 2 + 1]
        const clamped = clampWanderToOcean(xs[i], ys[i], homeX, homeY, biomeMap, width, height, petId)
        xs[i] = clamped.gx
        ys[i] = clamped.gy
      }
    }
  }

  for (let i = 0; i < count; i += 1) {
    const phase = layer.phases[i]
    const gaitSpeed = layer.gaitSpeeds[i]
    const elongate = layer.elongates?.[i] ?? layer.archetype?.elongate ?? 1
    const creature = {
      phase,
      gaitSpeed,
      hopHeight: layer.hopHeights[i],
      gait: gaitFromCode(layer.gaits[i]),
      scale: layer.scales[i] * cellScale,
      squat: layer.squats[i],
    }

    const gx = xs[i]
    const gy = ys[i]
    const heading = headings[i]

    const h01 = seaLevel - submerge
    const local = projection.toLocal(gx, gy, h01, terrain, heightScale, 0)
    const surface = projection.normalAt(gx, gy, terrain)
    normal.set(surface.x, surface.y, surface.z).normalize()

    const pose = animated
      ? creaturePose(timeSec, creature)
      : {
          lift: sea ? creature.scale * 0.06 : 0,
          squashX: creature.scale,
          squashY: creature.scale * creature.squat,
          squashZ: creature.scale,
          lean: 0,
          pitch: 0,
        }

    // Sit near the waterline so the bob can crest partly into air.
    const radius = 0.5 * pose.squashY
    const surfaceBias = sea ? -radius * 0.08 : radius
    position.set(local.x, local.y, local.z).addScaledVector(normal, surfaceBias + pose.lift)

    quaternion.setFromUnitVectors(GEOMETRY_UP, normal)
    yawQuat.setFromAxisAngle(normal, heading)
    quaternion.premultiply(yawQuat)

    if (pose.lean !== 0) {
      forward.set(Math.cos(heading), Math.sin(heading), 0)
      scratch.copy(normal).cross(forward).normalize()
      if (scratch.lengthSq() > 1e-6) {
        leanQuat.setFromAxisAngle(scratch, pose.lean)
        quaternion.premultiply(leanQuat)
      }
    }

    if (pose.pitch) {
      forward.set(Math.cos(heading), Math.sin(heading), 0)
      pitchAxis.copy(forward).cross(normal).normalize()
      if (pitchAxis.lengthSq() > 1e-6) {
        pitchQuat.setFromAxisAngle(pitchAxis, pose.pitch)
        quaternion.premultiply(pitchQuat)
      }
    }

    scale.set(pose.squashX, pose.squashZ * elongate, pose.squashY)
    mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale))
  }

  mesh.instanceMatrix.needsUpdate = true
}
