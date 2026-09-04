<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  computeGridCellFromLocalPosition,
  computeHeightScale,
  computePeakFlagPosition,
  computePortalLocalPosition,
  computeVertexColors,
  computeWaterSurfaceHeight,
} from '../rendering/terrainMesh.js'
import {
  SECTION_MARKERS,
  computeBreathingPulse,
  computeRingRadii,
  computeWallHeight,
  computeWallRadius,
  pickHaloOpacity,
  pickWallHeightScale,
  relationshipToHover,
  resolveHoveredTopLevel,
  resolveSectionAnchor,
} from '../rendering/sectionHalos.js'
import { buildTooltipModel, projectClipToScreen } from '../rendering/sectionTooltip.js'
import SectionTooltip from './SectionTooltip.vue'
import {
  PORTAL_MARKERS,
  computePortalPulse,
  computePortalScale,
  isPortalRelated,
  pickPortalHoverScale,
  pickPortalOpacity,
} from '../rendering/portalMarkers.js'
import {
  cellFoliageRolls,
  computeArticleAverageCps,
  computeFoliageDensityScale,
  pickFoliageVariant,
} from '../rendering/foliage.js'
import { useHoverState } from '../composables/useHoverState.js'
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'

const props = defineProps({
  world: { type: Object, required: true },
  showPortals: { type: Boolean, default: true },
  showSections: { type: Boolean, default: true },
  showFoliage: { type: Boolean, default: true },
})

const emit = defineEmits(['portal-click', 'section-click'])

const containerRef = ref(null)
const isWebGLSupported = ref(true)
const hoveredMarker = ref(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

// Reactive "which top-level section is under the cursor" — consumed by
// upcoming marker layers (halos, labels, tooltip) in later phases.
const hoverState = useHoverState()
const localHitPoint = new THREE.Vector3()

// Section tooltip: DOM overlay anchored to the projected summit position
// of the currently hovered top-level section. Updated every frame in
// animate() so it follows OrbitControls camera moves.
const sectionTooltipModel = ref(null)
const sectionTooltipX = ref(0)
const sectionTooltipY = ref(0)
const sectionTooltipVisible = ref(false)
const summitProjectionVec = new THREE.Vector3()

let renderer = null
let scene = null
let camera = null
let controls = null
let worldGroup = null
let terrainMesh = null
let waterMesh = null
let portalGroup = null
let haloGroup = null
let foliageGroup = null
let animationFrameId = null
let raycaster = null
let pointer = null

// Where the last press started, so a camera drag that happens to end over
// a marker doesn't read as a click on it. OrbitControls captures the
// pointer on the canvas, so every orbit/pan still ends in a `click` event.
let pointerDownPosition = null
// Movement (CSS px) below which a press/release pair still counts as a click.
const CLICK_DRAG_TOLERANCE = 5

// Cached accent color for section halos and portal auras — sourced from
// the app's --accent CSS variable at rebuildScene time so a theme swap
// picks up automatically.
let accentColor = new THREE.Color(0xffd58c)

// portalId currently under the cursor, read by the animate loop to grow
// that sprite. Plain variable, not a ref — it's per-frame render state.
let hoveredPortalId = null

function detectWebGLSupport() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Reads the app's --accent CSS variable and returns it as a THREE.Color. */
function resolveAccentColor() {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    if (value) return new THREE.Color(value)
  } catch {
    // ignore — fall through to default warm hue
  }
  return new THREE.Color(0xffd58c)
}

/**
 * Portal sprite: the whirlpool glyph sitting inside a soft accent-tinted
 * aura. The aura is what makes a portal read as a light source on the
 * map at exploration zoom — a bare emoji at this scale disappears into
 * the terrain colors, especially over bright biomes.
 */
function makePortalSprite() {
  const { size, glyphRatio, coreRatio, auraRatio } = PORTAL_MARKERS.texture
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const center = size / 2
  const { r, g, b } = accentColor
  const rgb = `${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}`

  const aura = ctx.createRadialGradient(center, center, size * coreRatio, center, center, center)
  aura.addColorStop(0, 'rgba(255, 255, 255, 0.85)')
  aura.addColorStop(auraRatio, `rgba(${rgb}, 0.4)`)
  aura.addColorStop(1, `rgba(${rgb}, 0)`)
  ctx.fillStyle = aura
  ctx.beginPath()
  ctx.arc(center, center, center, 0, Math.PI * 2)
  ctx.fill()

  ctx.font = `${size * glyphRatio}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🌀', center, center + size * 0.02)

  const material = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  return new THREE.Sprite(material)
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
    world.portals.forEach((portal, index) => {
      const local = computePortalLocalPosition(portal, world.terrain, heightScale)
      const sprite = makePortalSprite()
      const baseScale = PORTAL_MARKERS.baseScale
      sprite.scale.set(baseScale, baseScale, 1)
      sprite.position.set(local.x, local.y, local.z)
      sprite.userData.portal = portal
      sprite.userData.markerType = 'portal'
      sprite.userData.destinationTitle = portal.targetTitle ?? portal.targetArticleId
      sprite.userData.baseScale = baseScale
      // Per-portal phase so a cluster shimmers instead of beating in unison.
      sprite.userData.pulsePhase = index * 0.7
      // Current (lerped) hover growth — 1 at rest, see animate().
      sprite.userData.hoverScale = 1
      portals.add(sprite)
    })
  }

  const halos = buildSectionHalos(world, heightScale)

  const foliage = new THREE.Group()
  const foliagePositions = new Map()
  const articleAvgCps = computeArticleAverageCps(world.terrain.peaks ?? [])
  for (let gridY = 2; gridY < height - 2; gridY += 4) {
    for (let gridX = 2; gridX < width - 2; gridX += 4) {
      const index = gridY * width + gridX
      const { variantRoll, densityRoll } = cellFoliageRolls(gridX, gridY, world.seed)
      const variant = pickFoliageVariant(world.terrain.biomeMap[index], variantRoll)
      if (!variant) continue
      const densityScale = computeFoliageDensityScale(world.terrain.moistureMap[index], articleAvgCps)
      if (densityRoll >= variant.density * densityScale) continue

      const positions = foliagePositions.get(variant) ?? []
      // Y is flipped to match three.js PlaneGeometry vertex layout (see terrainMesh.js).
      positions.push(gridX - width / 2, height / 2 - gridY, heightMap[index] * heightScale + 0.8)
      foliagePositions.set(variant, positions)
    }
  }

  for (const [variant, positions] of foliagePositions) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: variant.color,
      map: makeFoliageTexture(variant.kind),
      size: variant.size,
      sizeAttenuation: true,
      transparent: true,
      alphaTest: 0.1,
      opacity: 0.9,
      depthWrite: false,
    })
    foliage.add(new THREE.Points(geometry, material))
  }

  return { mesh, water, portals, halos, foliage, heightScale }
}

/**
 * Builds one THREE.Group per world containing a "ground ring" + "energy
 * wall" pair for every top-level and subsection peak. Positioned in the
 * mesh's local frame — the shared worldGroup rotation carries them into
 * world-Y-up along with the terrain.
 *
 * Halo opacities are animated per-frame from hoverState in updateHalos();
 * this function only allocates geometry and initial idle opacity.
 */
function buildSectionHalos(world, heightScale) {
  const group = new THREE.Group()
  const peaks = world.terrain.peaks ?? []
  const hidden = !props.showSections

  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i]
    const isTopLevel = (peak.depth ?? 0) <= 1

    const local = computePeakFlagPosition(peak, world.terrain, heightScale, 0)
    const ringRadii = computeRingRadii(peak.radius)
    const wallRadiusGrid = computeWallRadius(peak.radius)
    const wallHeightGrid = computeWallHeight(peak.amplitude)

    // The wall's world Z-height is grid-height units, matched to the
    // terrain's own heightScale so visual proportions stay consistent
    // regardless of grid size.
    const wallHeightWorld = wallHeightGrid * (heightScale / 40)

    // Initial opacity/height match this peak's idle state (0 for
    // subsections so they don't flash in on first render, low for
    // top-level).
    const initialOpacity = pickHaloOpacity(null, !isTopLevel)
    const initialHeightScale = pickWallHeightScale(null, !isTopLevel)

    const ringGeo = new THREE.RingGeometry(ringRadii.inner, ringRadii.outer, 48)
    const ringMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: initialOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.set(local.x, local.y, local.z + SECTION_MARKERS.ring.hoverOffset)

    // Open cylinder (lateral surface only) — the "energy wall".
    const wallGeo = new THREE.CylinderGeometry(
      wallRadiusGrid,
      wallRadiusGrid,
      wallHeightWorld,
      SECTION_MARKERS.wall.radialSegments,
      1,
      true,
    )
    const wallMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: initialOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const wall = new THREE.Mesh(wallGeo, wallMat)
    // three.js CylinderGeometry is Y-axis-aligned; we want its axis to be
    // the world-up axis, which is Z BEFORE worldGroup rotation, so rotate π/2 on X.
    wall.rotation.x = Math.PI / 2
    // Scaling happens along the cylinder's own axis (its local Y). The
    // mesh's position is its CENTER, so the base only stays pinned to the
    // terrain if the center moves with the height — see updateHalos.
    wall.scale.y = initialHeightScale
    wall.position.set(local.x, local.y, local.z + (wallHeightWorld * initialHeightScale) / 2)

    const peakGroup = new THREE.Group()
    peakGroup.add(ring, wall)
    peakGroup.userData.peakIndex = i
    peakGroup.userData.peak = peak
    peakGroup.userData.isTopLevel = isTopLevel
    // Per-peak phase so adjacent halos don't beat in unison.
    peakGroup.userData.pulsePhase = (peak.x * 0.7 + peak.y * 1.3) % (Math.PI * 2)
    peakGroup.userData.ringMaterial = ringMat
    peakGroup.userData.wallMaterial = wallMat
    // Wall mesh + the geometry it was built from, so the per-frame height
    // animation can rescale it about its base instead of its center.
    peakGroup.userData.wallMesh = wall
    peakGroup.userData.wallBaseZ = local.z
    peakGroup.userData.wallHeight = wallHeightWorld
    // Every halo is scene-graph visible; opacity does the LOD work.
    // Subsections idle at 0 opacity so they hide until their parent is
    // hovered (see pickHaloOpacity/relationshipToHover). 'none' hides
    // the whole group; 'all' just clamps subsection idle floor (unused
    // for now — Phase 6 filter toggles will formalize this).
    peakGroup.visible = !hidden
    group.add(peakGroup)
  }

  return group
}

/**
 * Per-frame halo opacity + pulse update. Reads hoverState reactively (via
 * .value) inside the animate loop — that's the seam where Phase 2's
 * plumbing meets rendering. Kept out of animate() itself so it's easy
 * to swap out or extend when Phase 4 adds LOD/breadcrumb.
 */
function updateHalos(nowSeconds) {
  if (!haloGroup) return
  const hoveredIdx = hoverState.sectionIndex.value
  const peaks = props.world?.terrain?.peaks

  for (const peakGroup of haloGroup.children) {
    if (!peakGroup.visible) continue
    const isSubsection = !peakGroup.userData.isTopLevel
    const rel = relationshipToHover(peakGroup.userData.peak, hoveredIdx, peakGroup.userData.peakIndex, peaks)
    let targetOpacity = pickHaloOpacity(rel, isSubsection)
    // Only the hovered peak itself pulses — related peaks stay steady
    // so the pulsing summit reads as the anchor of the hover context.
    if (rel === 'self') {
      targetOpacity += computeBreathingPulse(nowSeconds, peakGroup.userData.pulsePhase)
    }

    const ringMat = peakGroup.userData.ringMaterial
    const wallMat = peakGroup.userData.wallMaterial
    // Simple exponential lerp toward target for smooth in/out.
    const alpha = 0.15
    ringMat.opacity += (targetOpacity - ringMat.opacity) * alpha
    wallMat.opacity += (targetOpacity - wallMat.opacity) * alpha

    // Height animation: the hovered section's wall rises to full height
    // while its parent/siblings/unrelated neighbors sit lower, so the
    // focus reads as a silhouette and not just as brightness. Recentering
    // by half the scaled height keeps the wall's base on the terrain.
    const wall = peakGroup.userData.wallMesh
    const targetScale = pickWallHeightScale(rel, isSubsection)
    const scale = wall.scale.y + (targetScale - wall.scale.y) * alpha
    wall.scale.y = scale
    wall.position.z = peakGroup.userData.wallBaseZ + (peakGroup.userData.wallHeight * scale) / 2
  }
}

/**
 * Per-frame section tooltip position + content update. Projects the
 * hovered top-level peak's summit position (via its halo group's ring
 * mesh, which sits ON the terrain summit) into DOM pixel coords and
 * pushes into the reactive refs the <SectionTooltip> template reads.
 *
 * We use the halo ring's world position rather than recomputing the
 * summit from the heightMap because the ring already accounts for the
 * Y-flip and worldGroup rotation via its scene-graph parent chain.
 */
function updateSectionTooltip() {
  const hoveredIdx = hoverState.sectionIndex.value
  if (hoveredIdx === null || hoveredIdx < 0 || !haloGroup || !camera || !renderer) {
    if (sectionTooltipVisible.value) sectionTooltipVisible.value = false
    return
  }

  // Find the halo peakGroup for the hovered peak — top-level OR subsection.
  const peakGroup = haloGroup.children.find((c) => c.userData.peakIndex === hoveredIdx)
  if (!peakGroup) {
    if (sectionTooltipVisible.value) sectionTooltipVisible.value = false
    return
  }

  // Ring's world position is the summit. Project to NDC via the camera.
  const ring = peakGroup.children[0]
  ring.getWorldPosition(summitProjectionVec)
  summitProjectionVec.project(camera)

  const rect = renderer.domElement.getBoundingClientRect()
  const projected = projectClipToScreen(summitProjectionVec, { width: rect.width, height: rect.height })
  if (projected.isBehindCamera) {
    if (sectionTooltipVisible.value) sectionTooltipVisible.value = false
    return
  }

  const peaks = props.world?.terrain?.peaks ?? []
  const peak = peaks[hoveredIdx]
  if (!peak) {
    if (sectionTooltipVisible.value) sectionTooltipVisible.value = false
    return
  }

  sectionTooltipModel.value = buildTooltipModel(peak, peaks, hoveredIdx)
  sectionTooltipX.value = projected.screenX
  sectionTooltipY.value = projected.screenY
  sectionTooltipVisible.value = true
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
  for (const group of [portalGroup, haloGroup, foliageGroup]) {
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

  // Pull the accent color from CSS so a theme change gets picked up on
  // the next world rebuild without any three.js code touching styling.
  accentColor = resolveAccentColor()

  const { mesh, water, portals, halos, foliage, heightScale } = buildTerrainMesh(props.world)
  terrainMesh = mesh
  waterMesh = water
  portalGroup = portals
  haloGroup = halos
  foliageGroup = foliage
  // Apply the current layer toggles so a rebuild respects the user's
  // last on/off state without waiting for the layer-watch to fire.
  haloGroup.visible = props.showSections
  foliageGroup.visible = props.showFoliage
  worldGroup.add(terrainMesh, waterMesh, portalGroup, haloGroup, foliageGroup)

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

function onPointerDown(event) {
  pointerDownPosition = { x: event.clientX, y: event.clientY }
}

function onPointerClick(event) {
  if (!raycaster) return

  // Suppress the click that closes a camera drag — section halos cover
  // most of the map, so without this every orbit would focus a section.
  const downAt = pointerDownPosition
  pointerDownPosition = null
  if (downAt && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > CLICK_DRAG_TOLERANCE) return

  pointerToNdc(event)
  raycaster.setFromCamera(pointer, camera)

  // Portal hit takes priority — a portal sprite in front of a halo
  // still reads as "I meant to travel", not "I meant to focus".
  if (portalGroup) {
    const [portalHit] = raycaster.intersectObjects(portalGroup.children)
    if (portalHit?.object?.userData?.portal) {
      emit('portal-click', portalHit.object.userData.portal)
      return
    }
  }

  // Otherwise: same halo-priority raycast the hover logic uses — a click
  // resolves to the same section the user was already visually focusing on.
  const clickTarget = pickHaloClickTarget()
  if (clickTarget) emit('section-click', clickTarget)
}

/**
 * Same subsection-first raycast prioritization as tryHoverHalo, but
 * returns the peak metadata a click consumer needs (index, title,
 * anchor) instead of pushing into hoverState. The anchor is the source
 * Wikipedia section heading id, used both as a scroll target in the
 * article panel and as the URL fragment on the "View on Wikipedia" link.
 */
function pickHaloClickTarget() {
  // three.js's raycaster ignores Object3D.visible, so the Sections layer
  // being toggled off has to be checked explicitly — otherwise hidden
  // halos would stay clickable with no visual affordance behind them.
  if (!haloGroup?.visible) return null
  const subMeshes = []
  const topMeshes = []
  for (const peakGroup of haloGroup.children) {
    if (!peakGroup.visible) continue
    const opacity = peakGroup.userData.ringMaterial?.opacity ?? 0
    // Lower threshold than hover: idle top-level halos (opacity ~0.08)
    // are visible enough to be legitimate click targets, even if the
    // user didn't hover first. Subsections at opacity 0 stay unclickable.
    if (opacity < 0.03) continue
    const bucket = peakGroup.userData.isTopLevel ? topMeshes : subMeshes
    for (const child of peakGroup.children) bucket.push(child)
  }

  let hit = null
  if (subMeshes.length > 0) [hit] = raycaster.intersectObjects(subMeshes, false)
  if (!hit && topMeshes.length > 0) [hit] = raycaster.intersectObjects(topMeshes, false)
  if (!hit) return null

  let node = hit.object
  while (node && node.userData.peakIndex === undefined) node = node.parent
  if (!node) return null

  const peak = node.userData.peak
  return {
    peakIndex: node.userData.peakIndex,
    title: peak?.title ?? null,
    anchor: peak?.anchor ?? null,
    depth: peak?.depth ?? null,
    sectionIndex: peak?.sectionIndex ?? -1,
    // Owning top-level's anchor — the granularity the article panel
    // lists, so a subsection click resolves to its parent's card.
    sectionAnchor: resolveSectionAnchor(node.userData.peakIndex, props.world?.terrain?.peaks),
  }
}

function onPointerMove(event) {
  if (!raycaster) return

  const rect = pointerToNdc(event)
  raycaster.setFromCamera(pointer, camera)
  const [hit] = raycaster.intersectObjects(portalGroup?.children ?? [], true)

  let node = hit?.object ?? null
  while (node && node.userData.markerType === undefined) node = node.parent
  const portal = node?.userData.markerType === 'portal' ? node.userData.portal : null

  hoveredMarker.value = portal ? { title: node.userData.destinationTitle, type: 'portal' } : null
  hoveredPortalId = portal?.portalId ?? null
  // Portals are the one marker a click navigates through, so say so.
  if (renderer) renderer.domElement.style.cursor = portal ? 'pointer' : ''

  tooltipX.value = event.clientX - rect.left
  tooltipY.value = event.clientY - rect.top

  // Halo hit takes priority over terrain — a visible subsection halo
  // sitting on top of its parent's terrain should resolve to the
  // subsection, not the terrain-owned top-level.
  if (!tryHoverHalo()) {
    updateSectionHoverFromTerrain()
  }
}

/**
 * Raycasts the halo group's meshes and, if a hit lands on a peakGroup
 * whose ring material is currently visible enough to read, sets that
 * peak as the hovered index. Returns true if a halo was hovered so the
 * caller knows to skip the terrain fallback.
 *
 * Subsection halos get first-pass priority so a user aiming at a
 * specific subsection ring doesn't get caught by their parent's much
 * larger outer ring. Only when nothing subsection-level is hit do we
 * check top-level halos.
 *
 * Opacity threshold (0.1) prevents accidentally hovering a subsection
 * halo whose parent isn't hovered yet (its opacity is still ~0).
 */
function tryHoverHalo() {
  if (!haloGroup || !raycaster) return false

  const subMeshes = []
  const topMeshes = []
  for (const peakGroup of haloGroup.children) {
    if (!peakGroup.visible) continue
    const opacity = peakGroup.userData.ringMaterial?.opacity ?? 0
    if (opacity < 0.1) continue
    const bucket = peakGroup.userData.isTopLevel ? topMeshes : subMeshes
    for (const child of peakGroup.children) bucket.push(child)
  }

  let hit = null
  if (subMeshes.length > 0) [hit] = raycaster.intersectObjects(subMeshes, false)
  if (!hit && topMeshes.length > 0) [hit] = raycaster.intersectObjects(topMeshes, false)
  if (!hit) return false

  let node = hit.object
  while (node && node.userData.peakIndex === undefined) node = node.parent
  if (!node) return false

  hoverState.setHovered(node.userData.peakIndex, 'halo')
  return true
}

// Terrain-raycast → grid cell → sectionOwnershipMap → hoverState. Kept
// separate from marker hover so Phase 2+ can drive halo/label reactions
// off hoverState without touching marker tooltip logic.
function updateSectionHoverFromTerrain() {
  if (!terrainMesh || !props.world?.terrain?.sectionOwnershipMap) {
    hoverState.clear()
    return
  }
  const [terrainHit] = raycaster.intersectObject(terrainMesh, false)
  if (!terrainHit) {
    hoverState.clear()
    return
  }

  // Convert world-space intersection to the mesh's LOCAL frame (pre-rotation).
  localHitPoint.copy(terrainHit.point)
  terrainMesh.worldToLocal(localHitPoint)

  const cell = computeGridCellFromLocalPosition(localHitPoint.x, localHitPoint.y, props.world.terrain)
  if (!cell) {
    hoverState.clear()
    return
  }
  const { width, heightMap, sectionOwnershipMap } = props.world.terrain
  const cellIdx = cell.gridY * width + cell.gridX

  // Ocean cells still have a "nearest section" in the ownership map (used
  // for biome derivation), but the user shouldn't count as hovering a
  // section when they're pointing at open water — filter by water level.
  if (heightMap[cellIdx] < BIOME_THRESHOLDS.oceanMaxHeight) {
    hoverState.clear()
    return
  }

  const ownerIdx = sectionOwnershipMap[cellIdx]
  if (ownerIdx < 0) {
    hoverState.clear()
    return
  }
  hoverState.setHovered(ownerIdx, 'terrain')
}

function onPointerLeave() {
  hoverState.clearNow()
  hoveredMarker.value = null
  hoveredPortalId = null
  if (renderer) renderer.domElement.style.cursor = ''
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

  const nowSec = performance.now() * 0.001
  const peaks = props.world?.terrain?.peaks
  const hoveredTopLevel = resolveHoveredTopLevel(hoverState.sectionIndex.value, peaks)

  if (portalGroup) {
    const alpha = PORTAL_MARKERS.lerpAlpha
    for (const sprite of portalGroup.children) {
      const portal = sprite.userData.portal
      const isHovered = hoveredPortalId !== null && portal?.portalId === hoveredPortalId

      // Hover growth eases in via the same lerp as the opacity fade, so
      // the sprite swells under the cursor instead of snapping.
      const targetHoverScale = pickPortalHoverScale(isHovered)
      const hoverScale = sprite.userData.hoverScale + (targetHoverScale - sprite.userData.hoverScale) * alpha
      sprite.userData.hoverScale = hoverScale

      const pulse = computePortalPulse(nowSec, sprite.userData.pulsePhase)
      const scale = computePortalScale(sprite.userData.baseScale, pulse, hoverScale)
      sprite.scale.set(scale, scale, 1)

      // Section-link: dim portals whose section isn't the hovered one.
      // Nothing hovered → all at full presence.
      const isRelated = isPortalRelated(portal?.sectionIndex ?? -1, hoveredTopLevel)
      const target = pickPortalOpacity(isRelated, isHovered)
      sprite.material.opacity += (target - sprite.material.opacity) * alpha
      sprite.material.transparent = true
    }
  }

  if (haloGroup) {
    updateHalos(nowSec)
    updateSectionTooltip()
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

  // A single rotated group so terrain/water/portals/halos/foliage all
  // share one consistent transform from grid-space (XY, Z-up) to
  // world-space (Y-up).
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

  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('click', onPointerClick)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('resize', resizeToContainer)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeToContainer)
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  renderer?.domElement.removeEventListener('pointerdown', onPointerDown)
  renderer?.domElement.removeEventListener('click', onPointerClick)
  renderer?.domElement.removeEventListener('pointermove', onPointerMove)
  renderer?.domElement.removeEventListener('pointerleave', onPointerLeave)
  clearScene()
  controls?.dispose()
  renderer?.dispose()
})

// Rebuild when the world or portal-inclusion changes (portals are
// generated at build-time from world data). Other layer toggles just
// flip .visible on their existing groups — no rebuild needed.
watch(() => [props.world, props.showPortals], rebuildScene)

watch(
  () => [props.showSections, props.showFoliage],
  () => {
    if (haloGroup) haloGroup.visible = props.showSections
    if (foliageGroup) foliageGroup.visible = props.showFoliage
  },
  { immediate: false },
)
</script>

<template>
  <div ref="containerRef" class="world-view-3d">
    <p v-if="!isWebGLSupported" class="world-view-3d__fallback">3D view isn't supported in this browser.</p>
    <div
      v-if="hoveredMarker"
      class="world-view-3d__tooltip"
      :style="{ left: `${tooltipX}px`, top: `${tooltipY}px` }"
    >
      <strong>Portal to {{ hoveredMarker.title }}</strong>
      <span>Click to travel</span>
    </div>
    <SectionTooltip
      :model="sectionTooltipModel"
      :screen-x="sectionTooltipX"
      :screen-y="sectionTooltipY"
      :visible="sectionTooltipVisible"
    />
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
