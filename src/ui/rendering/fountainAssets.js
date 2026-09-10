/**
 * Kenney Fantasy Town fountain prop for portal markers.
 *
 * Kept as a Group (stone + translucent water), not a merged mesh — the
 * water material is a separate blend colour and must survive. Orientation
 * matches Kenney Y-up → WikiRealms Z-up so flat and planet
 * share one placement path.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export const FOUNTAIN_ASSET_URL = '/assets/kenney/fantasy-town/fountain-round.glb'

/**
 * How large the unit-height fountain is relative to PORTAL_MARKERS.baseScale.
 * Kept well under 1 so a crowded section stays walkable — the prop marks
 * a destination without carpeting the summit.
 */
export const FOUNTAIN_SCALE_MUL = 0.16

/**
 * How far above the surface the fountain floats after undoing the
 * vortex hoverOffset. Enough to clear z-fighting and read as "sitting
 * on the slope", not hovering like an orb.
 */
export const FOUNTAIN_GROUND_CLEARANCE = 0.22

/**
 * Soft vertical beacon that rises out of the fountain so portals stay
 * findable through canopy without growing the prop itself.
 *
 * Heights are in unit-fountain space (before FOUNTAIN_SCALE_MUL × baseScale).
 */
export const FOUNTAIN_BEAM = Object.freeze({
  height: 40,
  width: 4.8,
  /** Additive opacity at rest / under the cursor. */
  idleOpacity: 0.38,
  hoverOpacity: 0.82,
  /** Ground aura / rim also lift a little on hover. */
  glowIdle: 0.18,
  glowHover: 0.42,
  rimIdle: 0.34,
  rimHover: 0.6,
})

const loader = new GLTFLoader()

/** @type {{ template: THREE.Group }|null} */
let cache = null

/** @type {Promise<{ template: THREE.Group }>|null} */
let loadPromise = null

export function getFountainAsset() {
  return cache
}

/**
 * @returns {Promise<{ template: THREE.Group }>}
 */
export function preloadFountainAsset() {
  if (cache) return Promise.resolve(cache)
  if (!loadPromise) {
    loadPromise = loader
      .loadAsync(FOUNTAIN_ASSET_URL)
      .then((gltf) => {
        cache = { template: prepareFountainProp(gltf.scene) }
        return cache
      })
      .catch((error) => {
        loadPromise = null
        throw error
      })
  }
  return loadPromise
}

/**
 * Rotate, normalise to unit height with feet on z = 0, and harden materials
 * for portal use (no fog fade — destinations must stay findable).
 *
 * @param {THREE.Object3D} scene
 * @returns {THREE.Group}
 */
export function prepareFountainProp(scene) {
  const model = scene.clone(true)
  model.rotation.x = Math.PI / 2

  const pivot = new THREE.Group()
  pivot.add(model)

  const root = new THREE.Group()
  root.add(pivot)
  root.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(root)
  const center = new THREE.Vector3()
  box.getCenter(center)
  pivot.position.set(-center.x, -center.y, -box.min.z)
  root.updateMatrixWorld(true)

  const fitted = new THREE.Box3().setFromObject(root)
  const height = Math.max(1e-6, fitted.max.z - fitted.min.z)
  root.scale.setScalar(1 / height)
  root.updateMatrixWorld(true)

  root.traverse((child) => {
    if (!child.isMesh) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!material) continue
      material.fog = false
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace
        material.map.needsUpdate = true
      }
      material.transparent = true
      material.needsUpdate = true
    }
  })

  return root
}
