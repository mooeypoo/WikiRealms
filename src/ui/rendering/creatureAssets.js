/**
 * Loads Quaternius Cute Fish Pack GLBs into shared, Z-up geometries for
 * InstancedMesh.
 *
 * Assets are authored Y-up. WikiRealms foliage and creatures are authored
 * Z-up in grid space; `worldGroup` then rotates the whole realm into a
 * Y-up Three scene. Converting here once means the same instance matrices
 * work for both flat and planet projections.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CUTE_FISH_BASE, FISH_PETS, FISH_PET_IDS } from './kenneyPets.js'

const loader = new GLTFLoader()

/** @type {Map<string, { geometry: THREE.BufferGeometry, material: THREE.Material }>} */
const cache = new Map()

/** @type {Promise<void>|null} */
let preloadPromise = null

/**
 * Prefetch every curated fish. Safe to call more than once.
 * @returns {Promise<void>}
 */
export function preloadCreatureAssets() {
  if (!preloadPromise) {
    preloadPromise = Promise.all(FISH_PET_IDS.map((id) => loadCreatureAsset(id))).then(() => undefined)
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

  const pet = FISH_PETS[petId]
  if (!pet) throw new Error(`Unknown fish pet: ${petId}`)

  const url = `${CUTE_FISH_BASE}/${pet.file}`
  const gltf = await loader.loadAsync(url)
  const prepared = preparePetScene(gltf.scene)
  cache.set(petId, prepared)
  return prepared
}

/**
 * Remap near-black authored vertex colours into a bright readable range
 * while keeping relative light/dark pattern contrast.
 *
 * Quaternius MTL Kd values sit around 0.01–0.04 — fine under Blender's
 * studio lights, invisible under our globe lighting.
 *
 * @param {THREE.BufferGeometry} geometry
 */
export function brightenFishVertexColors(geometry) {
  const colors = geometry.getAttribute('color')
  if (!colors) return

  let minL = 1
  let maxL = 0
  for (let i = 0; i < colors.count; i += 1) {
    const r = colors.getX(i)
    const g = colors.getY(i)
    const b = colors.getZ(i)
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (l < minL) minL = l
    if (l > maxL) maxL = l
  }

  const span = Math.max(1e-5, maxL - minL)
  for (let i = 0; i < colors.count; i += 1) {
    let r = colors.getX(i)
    let g = colors.getY(i)
    let b = colors.getZ(i)
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const t = (l - minL) / span
    // Pattern contrast into a bright band; eyes (near min) stay darker.
    const targetL = 0.22 + t * 0.78
    const scale = l > 1e-6 ? targetL / l : 1
    // Mild chroma lift so markings (orange/cyan) read after the remap.
    const chroma = 1.35
    r = Math.min(1, r * scale * chroma)
    g = Math.min(1, g * scale * chroma)
    b = Math.min(1, b * scale * chroma)
    colors.setXYZ(i, r, g, b)
  }
  colors.needsUpdate = true
}

/**
 * Merges rest-pose meshes, rotates Y-up → Z-up, and normalises to unit
 * height with the belly on z = 0. Vertex colours from the convert step
 * are brightened so multi-material markings stay readable.
 *
 * @param {THREE.Object3D} scene
 */
export function preparePetScene(scene) {
  scene.updateMatrixWorld(true)

  const geometries = []
  /** @type {THREE.Material|null} */
  let sourceMaterial = null
  let hasVertexColors = false

  scene.traverse((child) => {
    if (!child.isMesh || !child.geometry) return
    const geometry = child.geometry.clone()
    geometry.applyMatrix4(child.matrixWorld)
    if (geometry.getAttribute('color')) hasVertexColors = true
    geometries.push(geometry)
    if (!sourceMaterial && child.material) {
      sourceMaterial = Array.isArray(child.material) ? child.material[0] : child.material
    }
  })

  if (geometries.length === 0) {
    throw new Error('Fish GLB had no meshes')
  }

  const merged = mergeGeometries(geometries, false)
  for (const geometry of geometries) geometry.dispose()
  if (!merged) throw new Error('Failed to merge fish meshes')

  // Authoring: +Y up, +Z forward. WikiRealms grid local: +Z up, +Y forward.
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

  if (hasVertexColors || merged.getAttribute('color')) {
    brightenFishVertexColors(merged)
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.02,
    // Soft fill so night-side / ambient-lit oceans still show markings.
    emissive: new THREE.Color(0x3a3a3a),
    emissiveIntensity: 0.35,
    vertexColors: Boolean(merged.getAttribute('color')),
    side: THREE.DoubleSide,
  })
  if (sourceMaterial?.map) {
    material.map = sourceMaterial.map
    material.map.colorSpace = THREE.SRGBColorSpace
    material.map.needsUpdate = true
  }
  material.needsUpdate = true

  return { geometry: merged, material }
}
