<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  computeHeightScale,
  computePeakFlagPosition,
  computePortalLocalPosition,
  computeVertexColors,
  computeWaterSurfaceHeight,
} from '../rendering/terrainMesh.js'
import { computeFaerieGridPosition, makeFaerieSprite } from '../rendering/citationFaeries.js'
import { CITATION_FAERIES } from '../../engine/generation/config.js'
import { BIOME } from '../../engine/generation/terrain.js'

const props = defineProps({
  world: { type: Object, required: true },
  showPortals: { type: Boolean, default: true },
  showPeakFlags: { type: String, default: 'main' },
})

const emit = defineEmits(['portal-click'])

const containerRef = ref(null)
const isWebGLSupported = ref(true)
const hoveredMarker = ref(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

let renderer = null
let scene = null
let camera = null
let controls = null
let worldGroup = null
let terrainMesh = null
let waterMesh = null
let portalGroup = null
let flagGroup = null
let faerieGroup = null
let foliageGroup = null
let animationFrameId = null
let raycaster = null
let pointer = null

function detectWebGLSupport() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Draws an emoji onto a canvas texture, used for the whirlpool portal sprites. */
function makeEmojiSprite(emoji, size = 96) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.font = `${size * 0.8}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.05)

  const material = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  return new THREE.Sprite(material)
}

/** Creates an animated beacon for a top-level article section. */
function makeSectionBeaconMain() {
  const canvas = document.createElement('canvas')
  const size = 128
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true

  const center = size / 2
  const glow = ctx.createRadialGradient(center, center, 4, center, center, 46)
  glow.addColorStop(0, 'rgba(255, 224, 130, 1)')
  glow.addColorStop(0.38, 'rgba(255, 174, 56, 0.8)')
  glow.addColorStop(1, 'rgba(255, 174, 56, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(center, center, 46, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255, 240, 190, 0.95)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(center, center, 23, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255, 250, 225, 1)'
  ctx.beginPath()
  ctx.arc(center, center, 8, 0, Math.PI * 2)
  ctx.fill()

  const material = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const sprite = new THREE.Sprite(material)
  sprite.userData.isSubsectionBeacon = false
  return sprite
}

/** Creates an animated beacon for a nested article section. */
function makeSectionBeaconSubsection() {
  const canvas = document.createElement('canvas')
  const size = 96
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true

  const center = size / 2
  const glow = ctx.createRadialGradient(center, center, 3, center, center, 34)
  glow.addColorStop(0, 'rgba(255, 250, 213, 0.95)')
  glow.addColorStop(0.4, 'rgba(255, 213, 117, 0.7)')
  glow.addColorStop(1, 'rgba(255, 213, 117, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(center, center, 34, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255, 248, 207, 0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(center, center, 16, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255, 255, 242, 1)'
  ctx.beginPath()
  ctx.arc(center, center, 5, 0, Math.PI * 2)
  ctx.fill()

  const material = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const sprite = new THREE.Sprite(material)
  sprite.userData.isSubsectionBeacon = true
  return sprite
}

function makeFoliageTexture(kind) {
  const canvas = document.createElement('canvas')
  const size = 64
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const center = size / 2

  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  if (kind === 'scrub') {
    ctx.arc(center - 10, center + 8, 10, Math.PI, 0)
    ctx.arc(center + 4, center + 4, 13, Math.PI, 0)
    ctx.arc(center + 15, center + 10, 9, Math.PI, 0)
  } else if (kind === 'grass') {
    ctx.moveTo(center - 18, center + 20)
    ctx.lineTo(center - 12, center - 10)
    ctx.lineTo(center - 3, center + 17)
    ctx.lineTo(center + 4, center - 18)
    ctx.lineTo(center + 10, center + 16)
    ctx.lineTo(center + 20, center - 8)
    ctx.lineTo(center + 17, center + 20)
    ctx.closePath()
  } else if (kind === 'tree') {
    ctx.moveTo(center, 5)
    ctx.lineTo(10, 42)
    ctx.lineTo(23, 40)
    ctx.lineTo(7, 57)
    ctx.lineTo(57, 57)
    ctx.lineTo(41, 40)
    ctx.lineTo(54, 42)
    ctx.closePath()
  } else {
    ctx.arc(center - 10, center + 2, 17, 0, Math.PI * 2)
    ctx.arc(center + 8, center - 5, 20, 0, Math.PI * 2)
    ctx.arc(center + 18, center + 12, 15, 0, Math.PI * 2)
  }
  ctx.fill()

  return new THREE.CanvasTexture(canvas)
}

const FOLIAGE_BY_BIOME = {
  [BIOME.DESERT]: { color: 0x9a7d42, kind: 'scrub', density: 0.1, size: 1.5 },
  [BIOME.LIGHT_VEG]: { color: 0xa7c86b, kind: 'grass', density: 0.3, size: 1.8 },
  [BIOME.MEADOW]: { color: 0x75ba55, kind: 'grass', density: 0.5, size: 2.1 },
  [BIOME.WOODLAND]: { color: 0x3f793f, kind: 'tree', density: 0.7, size: 3.8 },
  [BIOME.JUNGLE]: { color: 0x1f6937, kind: 'canopy', density: 0.85, size: 4.8 },
}

function buildTerrainMesh(world) {
  const { width, height, heightMap } = world.terrain
  const heightScale = computeHeightScale(width, height)

  const geometry = new THREE.PlaneGeometry(width, height, width - 1, height - 1)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    position.setZ(i, heightMap[i] * heightScale)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(computeVertexColors(world.terrain), 3))
  geometry.computeVertexNormals()

  // Smooth normals soften the grid's artificial triangular facets while the
  // section-derived height field preserves the world's distinct peak layout.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  const mesh = new THREE.Mesh(geometry, material)

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      color: 0x1e5fae,
      transparent: true,
      opacity: 0.55,
      roughness: 0.15,
      metalness: 0.1,
    }),
  )
  water.position.z = computeWaterSurfaceHeight(heightScale)

  const portals = new THREE.Group()
  if (props.showPortals) {
    for (const portal of world.portals) {
      const local = computePortalLocalPosition(portal, world.terrain, heightScale)
      const sprite = makeEmojiSprite('🌀')
      sprite.scale.set(5, 5, 1)
      sprite.position.set(local.x, local.y, local.z)
      sprite.userData.portal = portal
      sprite.userData.baseScale = 5
      portals.add(sprite)
    }
  }

  const flags = new THREE.Group()
  for (const peak of world.terrain.peaks ?? []) {
    if (props.showPeakFlags !== 'none' && (props.showPeakFlags === 'all' || peak.depth <= 1)) {
      const local = computePeakFlagPosition(peak, world.terrain, heightScale)
      const isSubsection = peak.depth > 1
      const sprite = isSubsection ? makeSectionBeaconSubsection() : makeSectionBeaconMain()
      const spriteScale = isSubsection ? 10 : 14

      sprite.scale.set(spriteScale, spriteScale, 1)
      sprite.position.set(local.x, local.y, local.z)
      sprite.userData.peakTitle = local.title
      sprite.userData.peakDepth = peak.depth
      sprite.userData.citationCount = peak.citationCount
      sprite.userData.baseScale = spriteScale
      flags.add(sprite)
    }

  }

  const foliage = new THREE.Group()
  const foliagePositions = new Map()
  for (let gridY = 2; gridY < height - 2; gridY += 4) {
    for (let gridX = 2; gridX < width - 2; gridX += 4) {
      const index = gridY * width + gridX
      const definition = FOLIAGE_BY_BIOME[world.terrain.biomeMap[index]]
      if (!definition) continue

      const sample = ((gridX * 73856093) ^ (gridY * 19349663) ^ world.seed) >>> 0
      if ((sample % 100) / 100 >= definition.density) continue

      const positions = foliagePositions.get(definition) ?? []
      positions.push(gridX - width / 2, gridY - height / 2, heightMap[index] * heightScale + 0.8)
      foliagePositions.set(definition, positions)
    }
  }

  for (const [definition, positions] of foliagePositions) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: definition.color,
      map: makeFoliageTexture(definition.kind),
      size: definition.size,
      sizeAttenuation: true,
      transparent: true,
      alphaTest: 0.1,
      opacity: 0.9,
      depthWrite: false,
    })
    foliage.add(new THREE.Points(geometry, material))
  }

  // Citation faeries hover within the terrain footprint of their cited section.
  const faeries = new THREE.Group()
  for (const peak of world.terrain.peaks ?? []) {
    if (!peak.ownCitationCount) continue

    const { gridX, gridY } = computeFaerieGridPosition(peak, world.seed, width, height)
    const localX = gridX - width / 2
    const localY = gridY - height / 2
    const baseHeight = heightMap[gridY * width + gridX] * heightScale + 5
    const faerieSprite = makeFaerieSprite(peak.ownCitationCount)
    const faerieScale = Math.min(7 + peak.ownCitationCount * 0.35, 13)
    faerieSprite.scale.set(faerieScale, faerieScale, 1)
    faerieSprite.position.set(localX, localY, baseHeight)
    faerieSprite.userData.baseHeight = baseHeight
    faerieSprite.userData.hoverPhase = Math.random() * Math.PI * 2
    faerieSprite.userData.peakTitle = peak.title
    faerieSprite.userData.citationCount = peak.ownCitationCount
    faerieSprite.userData.markerType = 'faerie'
    faeries.add(faerieSprite)
  }

  return { mesh, water, portals, flags, faeries, foliage, heightScale }
}

function clearScene() {
  if (terrainMesh) {
    worldGroup.remove(terrainMesh)
    terrainMesh.geometry.dispose()
    terrainMesh.material.dispose()
  }
  if (waterMesh) {
    worldGroup.remove(waterMesh)
    waterMesh.geometry.dispose()
    waterMesh.material.dispose()
  }
  for (const group of [portalGroup, flagGroup, faerieGroup, foliageGroup]) {
    if (!group) continue
    worldGroup.remove(group)
    group.traverse((child) => {
      child.geometry?.dispose()
      child.material?.map?.dispose()
      child.material?.dispose()
    })
  }
}

function rebuildScene() {
  if (!scene) return
  clearScene()

  const { mesh, water, portals, flags, faeries, foliage, heightScale } = buildTerrainMesh(props.world)
  terrainMesh = mesh
  waterMesh = water
  portalGroup = portals
  flagGroup = flags
  faerieGroup = faeries
  foliageGroup = foliage
  worldGroup.add(terrainMesh, waterMesh, portalGroup, flagGroup, faerieGroup, foliageGroup)

  const { width, height } = props.world.terrain
  const cameraDistance = Math.max(width, height) * 0.9
  camera.position.set(0, heightScale * 3, cameraDistance)
  camera.lookAt(0, 0, 0)
  controls?.target.set(0, 0, 0)
  controls?.update()
}

function pointerToNdc(event) {
  const rect = containerRef.value.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  return rect
}

function onPointerClick(event) {
  if (!portalGroup || !raycaster) return

  pointerToNdc(event)
  raycaster.setFromCamera(pointer, camera)
  const [hit] = raycaster.intersectObjects(portalGroup.children)
  if (hit?.object?.userData?.portal) {
    emit('portal-click', hit.object.userData.portal)
  }
}

function onPointerMove(event) {
  if (!raycaster || (!flagGroup && !faerieGroup)) return

  const rect = pointerToNdc(event)
  raycaster.setFromCamera(pointer, camera)
  const markers = [...(faerieGroup?.children ?? []), ...(flagGroup?.children ?? [])]
  const [hit] = raycaster.intersectObjects(markers, true)

  let node = hit?.object ?? null
  while (node && node.userData.peakTitle === undefined) node = node.parent
  hoveredMarker.value = node?.userData.peakTitle
    ? {
        title: node.userData.peakTitle,
        citationCount: node.userData.citationCount ?? 0,
        type: node.userData.markerType ?? 'peak',
      }
    : null

  tooltipX.value = event.clientX - rect.left
  tooltipY.value = event.clientY - rect.top
}

function resizeToContainer() {
  if (!renderer || !camera || !containerRef.value) return
  const { clientWidth, clientHeight } = containerRef.value
  if (clientWidth === 0 || clientHeight === 0) return

  renderer.setSize(clientWidth, clientHeight)
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
}

function animate() {
  animationFrameId = requestAnimationFrame(animate)

  if (portalGroup) {
    const t = performance.now() * 0.003
    portalGroup.children.forEach((sprite, index) => {
      const pulse = 1 + Math.sin(t + index) * 0.15
      const base = sprite.userData.baseScale
      sprite.scale.set(base * pulse, base * pulse, 1)
    })
  }

  if (flagGroup) {
    const t = performance.now() * 0.002
    flagGroup.children.forEach((sprite) => {
      const pulse = 1 + Math.sin(t + sprite.userData.peakDepth) * 0.12
      const base = sprite.userData.baseScale
      sprite.scale.set(base * pulse, base * pulse, 1)
    })
  }

  if (faerieGroup) {
    const t = (performance.now() * 0.001) * CITATION_FAERIES.hoverFrequency
    faerieGroup.children.forEach((sprite) => {
      const hoverPhase = sprite.userData.hoverPhase || 0
      const hoverOffset = Math.sin(t + hoverPhase) * CITATION_FAERIES.hoverAmplitude
      sprite.position.z = sprite.userData.baseHeight + hoverOffset
    })
  }

  controls?.update()
  renderer?.render(scene, camera)
}

onMounted(() => {
  isWebGLSupported.value = detectWebGLSupport()
  if (!isWebGLSupported.value) return

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  containerRef.value.appendChild(renderer.domElement)

  // A single rotated group so terrain/water/portals/flags all share one
  // consistent transform from grid-space (XY, Z-up) to world-space (Y-up).
  worldGroup = new THREE.Group()
  worldGroup.rotation.x = -Math.PI / 2
  scene.add(worldGroup)

  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const sun = new THREE.DirectionalLight(0xffffff, 0.9)
  sun.position.set(60, 120, 40)
  scene.add(sun)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI / 2.1

  raycaster = new THREE.Raycaster()
  pointer = new THREE.Vector2()

  resizeToContainer()
  rebuildScene()
  animate()

  renderer.domElement.addEventListener('click', onPointerClick)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  window.addEventListener('resize', resizeToContainer)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeToContainer)
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  renderer?.domElement.removeEventListener('click', onPointerClick)
  renderer?.domElement.removeEventListener('pointermove', onPointerMove)
  clearScene()
  controls?.dispose()
  renderer?.dispose()
})

watch(() => [props.world, props.showPortals, props.showPeakFlags], rebuildScene)
</script>

<template>
  <div ref="containerRef" class="world-view-3d">
    <p v-if="!isWebGLSupported" class="world-view-3d__fallback">3D view isn't supported in this browser.</p>
    <div
      v-if="hoveredMarker"
      class="world-view-3d__tooltip"
      :style="{ left: `${tooltipX}px`, top: `${tooltipY}px` }"
    >
      <strong>{{ hoveredMarker.type === 'faerie' ? `Citations in ${hoveredMarker.title}` : hoveredMarker.title }}</strong>
      <span>{{ hoveredMarker.citationCount }} references</span>
    </div>
  </div>
</template>

<style scoped>
.world-view-3d {
  width: 100%;
  height: 100%;
  position: relative;
}

.world-view-3d :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.world-view-3d__fallback {
  color: var(--text-muted, #999);
  text-align: center;
  padding: 2rem;
}

.world-view-3d__tooltip {
  position: absolute;
  transform: translate(-50%, calc(-100% - 12px));
  background: var(--panel-bg, rgba(18, 22, 40, 0.85));
  border: 1px solid var(--panel-border, rgba(120, 140, 255, 0.28));
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  color: var(--text-primary, #eef0ff);
  pointer-events: none;
  white-space: nowrap;
}

.world-view-3d__tooltip strong,
.world-view-3d__tooltip span {
  display: block;
}

.world-view-3d__tooltip span {
  margin-top: 0.1rem;
  color: var(--text-muted, #9aa3c7);
  font-size: 0.72rem;
}
</style>
