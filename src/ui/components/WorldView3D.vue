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

const props = defineProps({
  world: { type: Object, required: true },
  showPortals: { type: Boolean, default: true },
  showPeakFlags: { type: String, default: 'main' },
})

const emit = defineEmits(['portal-click'])

const containerRef = ref(null)
const isWebGLSupported = ref(true)
const hoveredPeakTitle = ref(null)
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

  // flatShading gives the terrain a faceted, rugged/rocky look instead of a
  // smoothed-over dome — much more legible as distinct peaks.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true })
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
    if (props.showPeakFlags === 'none' || (props.showPeakFlags === 'main' && peak.depth > 1)) continue
    const local = computePeakFlagPosition(peak, world.terrain, heightScale)
    const isSubsection = peak.depth > 1
    const sprite = isSubsection ? makeSectionBeaconSubsection() : makeSectionBeaconMain()
    
    const spriteScale = isSubsection ? 10 : 14
    sprite.scale.set(spriteScale, spriteScale, 1)
    
    sprite.position.set(local.x, local.y, local.z)
    sprite.userData.peakTitle = local.title
    sprite.userData.peakDepth = peak.depth
    sprite.userData.baseScale = spriteScale
    flags.add(sprite)
  }

  return { mesh, water, portals, flags, heightScale }
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
  for (const group of [portalGroup, flagGroup]) {
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

  const { mesh, water, portals, flags, heightScale } = buildTerrainMesh(props.world)
  terrainMesh = mesh
  waterMesh = water
  portalGroup = portals
  flagGroup = flags
  worldGroup.add(terrainMesh, waterMesh, portalGroup, flagGroup)

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
  if (!flagGroup || !raycaster) return

  const rect = pointerToNdc(event)
  raycaster.setFromCamera(pointer, camera)
  const [hit] = raycaster.intersectObjects(flagGroup.children, true)

  let node = hit?.object ?? null
  while (node && node.userData.peakTitle === undefined) node = node.parent
  hoveredPeakTitle.value = node?.userData.peakTitle ?? null

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
      v-if="hoveredPeakTitle"
      class="world-view-3d__tooltip"
      :style="{ left: `${tooltipX}px`, top: `${tooltipY}px` }"
    >
      {{ hoveredPeakTitle }}
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
</style>
