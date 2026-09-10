/**
 * Per-frame pose for instanced blobs: wander, hop, face travel, stick to
 * the heightfield. Uses three.js because it writes instance matrices.
 */
import * as THREE from 'three'
import { creaturePose, creatureWander } from './creatures.js'
import { sampleHeight } from './creatureScatter.js'

const GEOMETRY_UP = new THREE.Vector3(0, 0, 1)
const position = new THREE.Vector3()
const normal = new THREE.Vector3()
const scale = new THREE.Vector3()
const quaternion = new THREE.Quaternion()
const yawQuat = new THREE.Quaternion()
const leanQuat = new THREE.Quaternion()
const matrix = new THREE.Matrix4()
const forward = new THREE.Vector3()
const scratch = new THREE.Vector3()

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
  const { width, height, heightMap } = terrain
  const count = mesh.count

  for (let i = 0; i < count; i += 1) {
    const homeX = layer.homes[i * 2]
    const homeY = layer.homes[i * 2 + 1]
    const phase = layer.phases[i]
    const gaitSpeed = layer.gaitSpeeds[i]
    const creature = {
      phase,
      gaitSpeed,
      hopHeight: layer.hopHeights[i],
      gait: layer.gaits[i] === 1 ? 'waddle' : 'hop',
      scale: layer.scales[i] * cellScale,
      squat: layer.squats[i],
    }

    let gx = homeX
    let gy = homeY
    let heading = phase * Math.PI * 2

    if (animated) {
      const wander = creatureWander(timeSec, phase, gaitSpeed)
      gx = homeX + wander.dx
      gy = homeY + wander.dy
      // Face roughly along the wander tangent.
      const next = creatureWander(timeSec + 0.05, phase, gaitSpeed)
      heading = Math.atan2(next.dy - wander.dy, next.dx - wander.dx)
    }

    // Stay on land cells; clamp into the interior so we never sample the rim.
    gx = Math.min(width - 2, Math.max(1, gx))
    gy = Math.min(height - 2, Math.max(1, gy))

    const h01 = sampleHeight(heightMap, width, height, gx, gy)
    const local = projection.toLocal(gx, gy, h01, terrain, heightScale, 0)
    const surface = projection.normalAt(gx, gy, terrain)
    normal.set(surface.x, surface.y, surface.z).normalize()

    const pose = animated
      ? creaturePose(timeSec, creature)
      : {
          lift: 0,
          squashX: creature.scale,
          squashY: creature.scale * creature.squat,
          squashZ: creature.scale,
          lean: 0,
        }

    // Root sits on the ground; lift along the surface normal. Body radius
    // keeps the pudding from burying into the mesh.
    const radius = 0.5 * Math.max(pose.squashX, pose.squashZ)
    position.set(local.x, local.y, local.z).addScaledVector(normal, radius + pose.lift)

    quaternion.setFromUnitVectors(GEOMETRY_UP, normal)
    yawQuat.setFromAxisAngle(normal, heading)
    quaternion.premultiply(yawQuat)

    if (pose.lean !== 0) {
      // Lean around the local "forward" tangent for a waddle.
      forward.set(Math.cos(heading), Math.sin(heading), 0)
      scratch.copy(normal).cross(forward).normalize()
      if (scratch.lengthSq() > 1e-6) {
        leanQuat.setFromAxisAngle(scratch, pose.lean)
        quaternion.premultiply(leanQuat)
      }
    }

    scale.set(pose.squashX, pose.squashZ, pose.squashY)
    mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale))
  }

  mesh.instanceMatrix.needsUpdate = true
}
