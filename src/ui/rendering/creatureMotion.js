/**
 * Per-frame pose for instanced blobs: wander along the heightfield or
 * sea surface, with gait as body squash rather than vertical bounce.
 */
import * as THREE from 'three'
import {
  CREATURE_HABITAT,
  CREATURE_SAMPLING,
  creaturePose,
  creatureWander,
  gaitFromCode,
  isSeaBiome,
} from './creatures.js'
import { sampleHeight } from './creatureScatter.js'
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
 * Writes instance matrices for one family layer.
 *
 * @param {THREE.InstancedMesh} mesh
 * @param {object} layer from scatterCreatures
 * @param {{ timeSec: number, animated: boolean, terrain: object,
 *   projection: object, heightScale: number, cellScale?: number }} ctx
 */
export function updateCreatureLayer(mesh, layer, ctx) {
  const { timeSec, animated, terrain, projection, heightScale, cellScale = 1 } = ctx
  const { width, height, heightMap, biomeMap } = terrain
  const count = mesh.count
  const sea = layer.habitat === CREATURE_HABITAT.sea
  const wanderRadius = sea ? CREATURE_SAMPLING.seaWanderRadius : CREATURE_SAMPLING.wanderRadius
  const seaLevel = BIOME_THRESHOLDS.oceanMaxHeight

  for (let i = 0; i < count; i += 1) {
    const homeX = layer.homes[i * 2]
    const homeY = layer.homes[i * 2 + 1]
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

    let gx = homeX
    let gy = homeY
    let heading = phase * Math.PI * 2

    if (animated) {
      const wander = creatureWander(timeSec, phase, gaitSpeed, wanderRadius)
      gx = homeX + wander.dx
      gy = homeY + wander.dy
      const next = creatureWander(timeSec + 0.05, phase, gaitSpeed, wanderRadius)
      heading = Math.atan2(next.dy - wander.dy, next.dx - wander.dx)
    }

    gx = Math.min(width - 2, Math.max(1, gx))
    gy = Math.min(height - 2, Math.max(1, gy))

    // Sea creatures stay over ocean; if wander drifts ashore, snap home.
    if (sea && biomeMap) {
      const ix = Math.min(width - 1, Math.max(0, Math.round(gx)))
      const iy = Math.min(height - 1, Math.max(0, Math.round(gy)))
      if (!isSeaBiome(biomeMap[iy * width + ix])) {
        gx = homeX
        gy = homeY
      }
    }

    const h01 = sea ? seaLevel : sampleHeight(heightMap, width, height, gx, gy)
    const local = projection.toLocal(gx, gy, h01, terrain, heightScale, 0)
    const surface = projection.normalAt(gx, gy, terrain)
    normal.set(surface.x, surface.y, surface.z).normalize()

    const pose = animated
      ? creaturePose(timeSec, creature)
      : {
          lift: sea ? creature.scale * 0.08 : 0,
          squashX: creature.scale,
          squashY: creature.scale * creature.squat,
          squashZ: creature.scale,
          lean: 0,
          pitch: 0,
        }

    // Root on ground / sea; lift along the surface normal. Half-height
    // keeps land puddings from burying; sea leviathans sit slightly proud.
    const radius = 0.5 * pose.squashY
    const surfaceBias = sea ? radius * 0.35 : radius
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
      // Pitch around the local side axis so a breach arcs nose-up.
      forward.set(Math.cos(heading), Math.sin(heading), 0)
      pitchAxis.copy(forward).cross(normal).normalize()
      if (pitchAxis.lengthSq() > 1e-6) {
        pitchQuat.setFromAxisAngle(pitchAxis, pose.pitch)
        quaternion.premultiply(pitchQuat)
      }
    }

    // Local: X width, Y forward (elongate), Z up.
    scale.set(pose.squashX, pose.squashZ * elongate, pose.squashY)
    mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale))
  }

  mesh.instanceMatrix.needsUpdate = true
}
