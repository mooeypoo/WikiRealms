/**
 * Loads Kenney Cube Pets GLBs into shared, Z-up geometries for InstancedMesh.
 *
 * Kenney assets are authored Y-up. WikiRealms foliage and creatures are
 * authored Z-up in grid space; `worldGroup` then rotates the whole realm
 * into a Y-up Three scene. Converting here once means the same instance
 * matrices work for both flat and planet projections — the projection
 * supplies the surface normal; we only plant +Z local up on that normal.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CUBE_PETS_BASE, KENNEY_PETS, KENNEY_PET_IDS } from './kenneyPets.js'

const loader = new GLTFLoader()

/** @type {Map<string, { geometry: THREE.BufferGeometry, material: THREE.Material }>} */
const cache = new Map()

/** @type {Promise<void>|null} */
let preloadPromise = null

/**
 * Prefetch every curated pet. Safe to call more than once.
 * @returns {Promise<void>}
 */
export function preloadCreatureAssets() {
  if (!preloadPromise) {
    preloadPromise = Promise.all(KENNEY_PET_IDS.map((id) => loadCreatureAsset(id))).then(() => undefined)
  }
  return preloadPromise
}

/**
 * @param {string} petId
 * @returns {{ geometry: THREE.BufferGeometry, material: THREE.Material }|null}
 */
export function getCreatureAsset(petId) {
  return cache.get(petId) ?? null
}

/**
 * @param {string} petId
 * @returns {Promise<{ geometry: THREE.BufferGeometry, material: THREE.Material }>}
 */
export async function loadCreatureAsset(petId) {
  const hit = cache.get(petId)
  if (hit) return hit

  const pet = KENNEY_PETS[petId]
  if (!pet) throw new Error(`Unknown Kenney pet: ${petId}`)

  const url = `${CUBE_PETS_BASE}/${pet.file}`
  const gltf = await loader.loadAsync(url)
  const prepared = preparePetScene(gltf.scene)
  cache.set(petId, prepared)
  return prepared
}

/**
 * Merges rest-pose meshes, rotates Y-up → Z-up, and normalises to unit
 * height with the feet on z = 0.
 *
 * @param {THREE.Object3D} scene
 */
export function preparePetScene(scene) {
  scene.updateMatrixWorld(true)

  const geometries = []
  /** @type {THREE.Material|null} */
  let sourceMaterial = null

  scene.traverse((child) => {
    if (!child.isMesh || !child.geometry) return
    const geometry = child.geometry.clone()
    geometry.applyMatrix4(child.matrixWorld)
    geometries.push(geometry)
    if (!sourceMaterial && child.material) {
      sourceMaterial = Array.isArray(child.material) ? child.material[0] : child.material
    }
  })

  if (geometries.length === 0) {
    throw new Error('Kenney pet GLB had no meshes')
  }

  const merged = mergeGeometries(geometries, false)
  for (const geometry of geometries) geometry.dispose()
  if (!merged) throw new Error('Failed to merge Kenney pet meshes')

  // Kenney: +Y up, +Z forward. WikiRealms grid local: +Z up, +Y forward
  // (see creatureMotion scale axes). rotateX maps up; rotateZ turns the
  // nose from −Y to +Y so yaw matches wander heading on flat and planet.
  merged.rotateX(Math.PI / 2)
  merged.rotateZ(Math.PI)
  merged.computeBoundingBox()

  const box = merged.boundingBox
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const height = Math.max(1e-6, size.z)
  merged.translate(-center.x, -center.y, -box.min.z)
  merged.scale(1 / height, 1 / height, 1 / height)
  merged.computeBoundingBox()
  merged.computeVertexNormals()

  const material = sourceMaterial ? sourceMaterial.clone() : new THREE.MeshStandardMaterial({ color: 0xffffff })
  material.side = THREE.DoubleSide
  material.transparent = false

  return { geometry: merged, material }
}
