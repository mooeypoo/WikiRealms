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
} from './creatures.js'
import { sampleHeight, seaPetCanStand } from './creatureScatter.js'
import { seaSubmerge } from './kenneyPets.js'
import { BIOME } from '../../engine/generation/terrain.js'
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
  const petId = layer.petId
  const shoreHugger = sea && petId !== 'fish'
  const wanderRadius = sea
    ? shoreHugger
      ? CREATURE_SAMPLING.shoreWanderRadius
      : CREATURE_SAMPLING.seaWanderRadius
    : CREATURE_SAMPLING.wanderRadius
  const seaLevel = BIOME_THRESHOLDS.oceanMaxHeight
  const submerge = sea ? seaSubmerge(petId) : 0

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

    // Sea creatures stay over water (fish) or water+beach (shore pets).
    // Never sample rising land height for ocean cells — that climbs the
    // shore as the waterline drops away.
    if (sea && biomeMap) {
      const ix = Math.min(width - 1, Math.max(0, Math.round(gx)))
      const iy = Math.min(height - 1, Math.max(0, Math.round(gy)))
      if (!seaPetCanStand(biomeMap[iy * width + ix], petId)) {
        gx = homeX
        gy = homeY
      }
    }

    const ix = Math.min(width - 1, Math.max(0, Math.round(gx)))
    const iy = Math.min(height - 1, Math.max(0, Math.round(gy)))
    const standBiome = biomeMap?.[iy * width + ix]
    const onBeach = sea && standBiome === BIOME.BEACH

    const h01 = sea
      ? onBeach
        ? sampleHeight(heightMap, width, height, gx, gy)
        : seaLevel - submerge
      : sampleHeight(heightMap, width, height, gx, gy)
    const local = projection.toLocal(gx, gy, h01, terrain, heightScale, 0)
    const surface = projection.normalAt(gx, gy, terrain)
    normal.set(surface.x, surface.y, surface.z).normalize()

    const pose = animated
      ? creaturePose(timeSec, creature)
      : {
          lift: sea && !onBeach ? creature.scale * (shoreHugger ? 0.02 : 0.05) : 0,
          squashX: creature.scale,
          squashY: creature.scale * creature.squat,
          squashZ: creature.scale,
          lean: 0,
          pitch: 0,
        }

    // Quiet shore pets: less breach so they do not leap out of shallows.
    if (sea && shoreHugger && pose.lift) {
      pose.lift *= 0.35
    }

    // Root on ground / under the water plane. Ocean pets sit slightly
    // submerged; beach standers use a normal ground bias.
    const radius = 0.5 * pose.squashY
    const surfaceBias = sea
      ? onBeach
        ? radius * 0.9
        : -radius * (shoreHugger ? 0.12 : 0.28)
      : radius
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
