/**
 * One-shot: Cute Fish Pack OBJ+MTL → GLB in public/assets/quaternius/cute-fish/.
 *
 * Run: node scripts/convertCuteFish.mjs
 *
 * Bakes each material's Kd into vertex colours so InstancedMesh can use a
 * single merged geometry (same path as Cube Pets).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// GLTFExporter touches FileReader when packing binary buffers.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    result = null
    onloadend = null
    onerror = null
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer())
        .then((buffer) => {
          this.result = buffer
          this.onloadend?.({ target: this })
        })
        .catch((error) => this.onerror?.(error))
    }
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OBJ_DIR = path.join(ROOT, 'models/Cute Fish Pack - Feb 2020/OBJ')
const OUT_DIR = path.join(ROOT, 'public/assets/quaternius/cute-fish')

const SKIP = new Set([
  'Boat',
  'Dock_Long',
  'Dock_Long_NoRope',
  'Dock_Stairs',
  'Dock_Wide',
  'FishingRod_Lvl1',
  'FishingRod_Lvl2',
  'FishingRod_Lvl3',
  'FishingRod_Lvl4',
  'FishingRod_Lvl5',
  'Lure_1',
  'Lure_2',
  'Lure_3',
  'Lure_4',
  'Lure_5',
  'Lure_6',
  'Worm',
])

function bakeVertexColors(object) {
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry) return
    const geometry = child.geometry
    const material = Array.isArray(child.material) ? child.material[0] : child.material
    const color = material?.color ?? new THREE.Color(0xffffff)
    const count = geometry.attributes.position.count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    child.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.05,
    })
  })
}

function loadObj(name) {
  const mtlText = fs.readFileSync(path.join(OBJ_DIR, `${name}.mtl`), 'utf8')
  const objText = fs.readFileSync(path.join(OBJ_DIR, `${name}.obj`), 'utf8')
  const materials = new MTLLoader().parse(mtlText, '')
  materials.preload()
  const objLoader = new OBJLoader()
  objLoader.setMaterials(materials)
  return objLoader.parse(objText)
}

function exportGlb(object) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter()
    exporter.parse(
      object,
      (result) => resolve(Buffer.from(result)),
      reject,
      { binary: true, onlyVisible: true },
    )
  })
}

async function convertOne(name) {
  const group = loadObj(name)
  bakeVertexColors(group)
  const glb = await exportGlb(group)
  const out = path.join(OUT_DIR, `${name}.glb`)
  fs.writeFileSync(out, glb)
  return { name, bytes: glb.length }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const names = fs
    .readdirSync(OBJ_DIR)
    .filter((f) => f.endsWith('.obj'))
    .map((f) => f.replace(/\.obj$/, ''))
    .filter((name) => !SKIP.has(name))
    .sort()

  console.log(`Converting ${names.length} fish → ${OUT_DIR}`)
  for (const name of names) {
    try {
      const { bytes } = await convertOne(name)
      console.log(`  ✓ ${name}.glb (${(bytes / 1024).toFixed(1)} KiB)`)
    } catch (error) {
      console.error(`  ✗ ${name}:`, error)
      process.exitCode = 1
    }
  }
}

main()
