<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { detectWebGLSupport } from '../rendering/webglSupport.js'
import { computePeakFlagPosition, computeVertexColors } from '../rendering/terrainMesh.js'
import { FLAT_VIEW, SPHERE_VIEW, getProjection, planetRadius } from '../rendering/projection.js'
import { buildArchetypeGeometry } from '../rendering/canopyGeometry.js'
import {
  buildHaloFillArrays,
  buildHaloRingArrays,
  buildHaloWallArrays,
  computeMarkerRadii,
  updateHaloWallHeights,
} from '../rendering/haloGeometry.js'
import {
  SECTION_MARKERS,
  computeBreathingPulse,
  computeRingRadii,
  computeWallHeight,
  computeWallRadius,
  ringMarginFor,
  pickHaloOpacity,
  pickWallHeightScale,
  relationshipToHover,
  resolveHoveredTopLevel,
} from '../rendering/sectionHalos.js'
import { buildTooltipModel, projectClipToScreen } from '../rendering/sectionTooltip.js'
import { facesCamera, shouldShowCard } from '../rendering/anchorPlacement.js'
import SectionTooltip from './SectionTooltip.vue'
import {
  PORTAL_MARKERS,
  computePortalPulse,
  computePortalScale,
  isPortalRelated,
  pickPortalHoverScale,
  pickPortalOpacity,
} from '../rendering/portalMarkers.js'
import { placePortals } from '../rendering/portalPlacement.js'
import { DEFAULT_PORTAL_FORM, createPortalForm } from '../rendering/portalForms.js'
import { CANOPY_ARCHETYPES, shouldShowCanopy } from '../rendering/foliage.js'
import { scatterFoliage } from '../rendering/foliageScatter.js'
import { useHoverState } from '../composables/useHoverState.js'
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'

const props = defineProps({
  world: { type: Object, required: true },
  showPortals: { type: Boolean, default: true },
  showSections: { type: Boolean, default: true },
  showFoliage: { type: Boolean, default: true },
  // 'flat' | 'sphere' — a pure presentation choice over the SAME
  // generated world. Switching rebuilds the scene; it never regenerates
  // terrain. Defaults to match useUIState's stored preference, so a
  // mount without the prop shows what the app shows.
  worldShape: { type: String, default: 'flat' },
  /**
   * Peaks-array index selected in the Ledger, or null — the other half of
   * the link `section-click` starts.
   *
   * It stands in for a hover, which is what makes the whole marker layer
   * reachable without a pointer: hover is how a summit lights up, raises
   * its wall, reveals its siblings and labels itself, and a touch device
   * has none. Live hover still wins while it lasts, so pointing at the
   * map is never overridden by something selected minutes ago.
   */
  selectedPeak: { type: Number, default: null },
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

/**
 * Which peak the marker layer is currently answering to: whatever the
 * pointer is on, or failing that whatever the Ledger has selected.
 *
 * One function rather than four call sites reading hoverState directly,
 * so the halos, the summit label and the portal context cannot disagree
 * about which section is being attended to.
 */
function attentionIndex() {
  return hoverState.sectionIndex.value ?? props.selectedPeak ?? null
}

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
let understoryGroup = null
let canopyGroup = null
let animationFrameId = null
let raycaster = null
let pointer = null
let ambientLight = null

// Active grid → 3D mapping, re-resolved on every rebuildScene from the
// worldShape prop. Every position in this component goes through it, so
// the flat map and the planet share one code path.
let projection = getProjection('flat')

// Marker geometry is authored in the mesh's local frame with +Z as "up".
// On the planet each marker rotates that axis onto its own surface
// normal; on the flat map the normal IS +Z, so the rotation is identity
// and behavior is unchanged.

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

// Which shape portals take. A constant rather than a prop for now: there
// is one form, and inventing a setting for a choice of one is how a
// setting nobody wants gets shipped. createPortalForm falls back to the
// default for an unknown id, so this can become a prop or a preference
// the day a second form exists.
const PORTAL_FORM = DEFAULT_PORTAL_FORM

// The live form for the current portal layer, holding the resources it
// shares between objects. Rebuilt with the layer, disposed with it.
let portalForm = null

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
 * Builds the portal layer: one object per portal, in whatever shape the
 * active form draws.
 *
 * The component knows where portals go (portalPlacement.js) and that
 * they pulse, grow under the cursor and recede when another section is
 * hovered (portalMarkers.js). It does not know what one looks like —
 * that is portalForms.js's business, and it is why the shape can become
 * a stone arch later without this file changing.
 *
 * The form is held for the layer's lifetime so it can own shared
 * resources: the aperture's texture is one canvas for the whole world
 * now rather than one per portal.
 *
 * @param {object} world
 * @param {object} terrain
 * @param {number} heightScale
 * @returns {THREE.Group}
 */
function buildPortalLayer(world, terrain, heightScale) {
  const placements = placePortals(world.portals, terrain, heightScale, projection)
  portalForm = createPortalForm(PORTAL_FORM, { accentColor })

  const group = new THREE.Group()
  for (const placement of placements) group.add(portalForm.build(placement))
  return group
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
  } else {
    // Fern: a fan of fronds. The understory's job is to break up bare
    // ground under a canopy, so it needs a silhouette distinct from
    // grass without pretending to be a plant you could identify.
    for (let frond = -2; frond <= 2; frond += 1) {
      const lean = frond * 9
      ctx.moveTo(center, center + 22)
      ctx.lineTo(center + lean - 4, center - 14)
      ctx.lineTo(center + lean + 4, center - 12)
      ctx.closePath()
    }
  }
  ctx.fill()

  return new THREE.CanvasTexture(canvas)
}

function buildTerrainMesh(world) {
  const terrain = world.terrain
  const { width, height, heightMap } = terrain
  const heightScale = projection.heightScale(terrain)

  // Vertices are laid out row-major in the SAME index space as heightMap
  // and biomeMap, so per-vertex colors need no remapping regardless of
  // which projection placed the positions.
  const { positions, indices } = projection.buildSurfaceArrays(terrain, heightScale)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.setAttribute('color', new THREE.BufferAttribute(computeVertexColors(terrain), 3))
  geometry.computeVertexNormals()

  // Smooth normals soften the grid's artificial triangular facets while the
  // section-derived height field preserves the world's distinct peak layout.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  const mesh = new THREE.Mesh(geometry, material)

  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e5fae,
    transparent: true,
    opacity: 0.55,
    roughness: 0.15,
    metalness: 0.1,
  })

  let water
  if (projection.isSpherical) {
    // Segment counts are independent of the grid — a sea-level sphere has
    // no detail to resolve, it only has to read as round at the horizon.
    // Backfaces are culled by default, so only the near hemisphere
    // blends over the terrain beneath it.
    water = new THREE.Mesh(new THREE.SphereGeometry(projection.waterSurface(terrain, heightScale), 96, 48), waterMaterial)
  } else {
    // width-1 / height-1: the surface spans integer cell spacing, so the
    // water plane has to match its footprint exactly.
    water = new THREE.Mesh(new THREE.PlaneGeometry(width - 1, height - 1), waterMaterial)
    water.position.z = projection.waterSurface(terrain, heightScale)
  }

  // Built whether or not the layer is showing, so the toggle is a
  // visibility flip like Sections and Foliage rather than a rebuild of
  // the whole world. See the layer watch at the bottom of this file.
  const portals = buildPortalLayer(world, terrain, heightScale)

  const halos = buildSectionHalos(world, heightScale)

  const { understory, canopy } = buildFoliage(world, heightScale)

  return { mesh, water, portals, halos, understory, canopy, heightScale }
}

/**
 * Turns the scatter's attribute buffers into the two vegetation layers:
 * ground-cover sprites, and instanced tree meshes.
 *
 * WHERE things grow is foliageScatter.js's decision and is tested without
 * a renderer; everything here is the part that needs a GL context —
 * materials, textures, and the instance matrices three wants.
 *
 * They are separate groups so the canopy can be hidden on its own — from
 * orbit it says nothing and costs a lot (see shouldShowCanopy), while the
 * understory reads as ground texture at any distance and is cheap enough
 * to leave on.
 *
 * @param {object} world
 * @param {number} heightScale
 * @returns {{ understory: THREE.Group, canopy: THREE.Group }}
 */
function buildFoliage(world, heightScale) {
  // Foliage proportions are in grid cells, and one cell is one world unit
  // of arc in both projections — but the RELIEF those cells rise through
  // is compressed on the planet, so a tree sized for the flat map
  // out-scales the range it stands on there. See SPHERE_VIEW.foliageScale.
  const cellScale = projection.foliageScale ?? 1
  const scatter = scatterFoliage(world.terrain, world.seed, { projection, heightScale, cellScale })

  // === Understory: one Points cloud per variant ===
  const understory = new THREE.Group()
  for (const layer of scatter.understory) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(layer.positions, 3))
    understory.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: layer.variant.color,
          map: makeFoliageTexture(layer.variant.kind),
          size: layer.variant.size * cellScale,
          sizeAttenuation: true,
          transparent: true,
          alphaTest: 0.1,
          opacity: 0.9,
          depthWrite: false,
        }),
      ),
    )
  }

  // === Canopy: one InstancedMesh per archetype ===
  const canopy = new THREE.Group()
  const up = new THREE.Vector3(0, 0, 1)
  const normal = new THREE.Vector3()
  const position = new THREE.Vector3()
  const scaleVec = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const yawQuaternion = new THREE.Quaternion()
  const matrix = new THREE.Matrix4()
  const instanceColor = new THREE.Color()

  for (const layer of scatter.canopy) {
    const geometry = buildArchetypeGeometry(CANOPY_ARCHETYPES[layer.archetype], cellScale)
    // Lit, so a tree has a shaded side and reads as an object. The point
    // sprites this replaces took no light at all, which is why two bands
    // of trees were distinguishable only by hue and count.
    const material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true })
    const mesh = new THREE.InstancedMesh(geometry, material, layer.count)
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)

    for (let instance = 0; instance < layer.count; instance += 1) {
      const base = instance * 3
      position.set(layer.positions[base], layer.positions[base + 1], layer.positions[base + 2])

      // Trees stand up out of the ground they are on. On the flat map
      // that is +Z everywhere; on the planet it is the surface normal, so
      // a tree at the far side of the globe is not lying on its side.
      normal.set(layer.normals[base], layer.normals[base + 1], layer.normals[base + 2]).normalize()
      quaternion.setFromUnitVectors(up, normal)
      yawQuaternion.setFromAxisAngle(normal, layer.yaws[instance])
      quaternion.premultiply(yawQuaternion)

      scaleVec.setScalar(layer.scales[instance])
      mesh.setMatrixAt(instance, matrix.compose(position, quaternion, scaleVec))

      mesh.setColorAt(instance, instanceColor.setRGB(layer.colors[base], layer.colors[base + 1], layer.colors[base + 2]))
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    canopy.add(mesh)
  }

  return { understory, canopy }
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
  const terrain = world.terrain
  const peaks = terrain.peaks ?? []
  const hidden = !props.showSections

  // Subsection markers are shrunk to fit the gaps between their siblings,
  // and a section's boundary is then traced around the outside of those
  // discs — so the markers are sized before any geometry is built.
  const markerRadii = computeMarkerRadii(peaks, terrain.width, SECTION_MARKERS.ring.subsectionMargin)
  const sized = peaks.map((peak, index) => ({ ...peak, markerRadius: markerRadii[index] }))
  const outlineContext = {
    width: terrain.width,
    smoothing: SECTION_MARKERS.ring.outlineSmoothing,
    childrenOf: (peak) => sized.filter((other) => (other.depth ?? 0) > 1 && other.sectionIndex === peak.peakIndex),
  }

  for (let i = 0; i < peaks.length; i++) {
    const peak = { ...sized[i], peakIndex: i }
    const isTopLevel = (peak.depth ?? 0) <= 1

    const local = computePeakFlagPosition(peak, terrain, heightScale, 0, projection)
    // Sections hold their subsections at arm's length; a subsection's own
    // boundary hugs it, or neighbouring markers merge on a dense ridge.
    const ringMargin = ringMarginFor(isTopLevel)
    const ringRadii = computeRingRadii(ringMargin)
    const wallRadiusGrid = computeWallRadius(ringMargin)
    const wallHeightGrid = computeWallHeight(peak.amplitude)

    // The wall's world height is grid-height units, matched to the
    // terrain's own heightScale so visual proportions stay consistent
    // regardless of grid size — and, because the planet's height scale is
    // a fraction of its radius, so the wall keeps the same ratio to the
    // mountain it marks in both projections.
    const wallHeightWorld = wallHeightGrid * (heightScale / 40)

    // Initial opacity/height match this peak's idle state (0 for
    // subsections so they don't flash in on first render, low for
    // top-level).
    const initialOpacity = pickHaloOpacity(null, !isTopLevel)
    const initialHeightScale = pickWallHeightScale(null, !isTopLevel)

    // Both markers are built in grid space and draped over the terrain by
    // the projection, so they follow the ground and the planet's
    // curvature instead of being flat primitives parked at the summit.
    // See haloGeometry.js for why that matters.
    const ringArrays = buildHaloRingArrays(
      peak,
      terrain,
      heightScale,
      projection,
      ringRadii,
      SECTION_MARKERS.ring.hoverOffset,
      outlineContext,
    )
    const ringGeo = new THREE.BufferGeometry()
    ringGeo.setAttribute('position', new THREE.BufferAttribute(ringArrays.positions, 3))
    ringGeo.setIndex(new THREE.BufferAttribute(ringArrays.indices, 1))

    const ringMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: initialOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)

    const wallArrays = buildHaloWallArrays(
      peak,
      terrain,
      heightScale,
      projection,
      wallRadiusGrid,
      wallHeightWorld,
      SECTION_MARKERS.ring.hoverOffset,
      initialHeightScale,
      outlineContext,
    )
    const wallGeo = new THREE.BufferGeometry()
    wallGeo.setAttribute('position', new THREE.BufferAttribute(wallArrays.positions, 3))
    wallGeo.setIndex(new THREE.BufferAttribute(wallArrays.indices, 1))

    const wallMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: initialOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const wall = new THREE.Mesh(wallGeo, wallMat)

    // Invisible hit area over the whole footprint, so pointing anywhere
    // inside a marker selects it rather than only its outline. Never
    // rendered — three.js's raycaster tests layers, not visibility, which
    // is what makes this work (and keeps it out of the draw call list).
    const fillArrays = buildHaloFillArrays(
      peak,
      terrain,
      heightScale,
      projection,
      ringRadii.outer,
      SECTION_MARKERS.ring.hoverOffset,
      outlineContext,
    )
    const fillGeo = new THREE.BufferGeometry()
    fillGeo.setAttribute('position', new THREE.BufferAttribute(fillArrays.positions, 3))
    fillGeo.setIndex(new THREE.BufferAttribute(fillArrays.indices, 1))
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    fill.visible = false

    // Vertices are already in the mesh's local frame, so the group is a
    // plain container at the origin; the summit is carried in userData
    // for the tooltip to project.
    const peakGroup = new THREE.Group()
    peakGroup.add(ring, wall, fill)
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
    // The curtain's base ring and up vectors, so the height animation can
    // move only its top edge (see updateHaloWallHeights).
    peakGroup.userData.wallArrays = wallArrays
    peakGroup.userData.wallHeight = wallHeightWorld
    peakGroup.userData.wallScale = initialHeightScale
    // Summit in mesh-local space. The group itself is at the origin now
    // that its children carry absolute positions, so the tooltip can't
    // just read the group's world position.
    peakGroup.userData.summitLocal = new THREE.Vector3(local.x, local.y, local.z)
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
  const hoveredIdx = attentionIndex()
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
    // focus reads as a silhouette and not just as brightness.
    //
    // The curtain follows the ground, so this can't be a mesh scale — it
    // rewrites the top edge, leaving the base pinned to the terrain.
    // Skipped once a wall has settled, so only the few mid-animation
    // actually touch their vertex buffers.
    const targetScale = pickWallHeightScale(rel, isSubsection)
    const previousScale = peakGroup.userData.wallScale
    const scale = previousScale + (targetScale - previousScale) * alpha
    if (Math.abs(scale - previousScale) > 1e-4) {
      peakGroup.userData.wallScale = scale
      updateHaloWallHeights(peakGroup.userData.wallArrays, peakGroup.userData.wallHeight, scale)
      peakGroup.userData.wallMesh.geometry.attributes.position.needsUpdate = true
    }
  }
}

/**
 * Per-frame section tooltip position + content update. Projects the
 * hovered peak's summit into DOM pixel coords and pushes into the
 * reactive refs the <SectionTooltip> template reads.
 *
 * The summit is stored in mesh-local space and carried into world space
 * through worldGroup, rather than read off a marker mesh: the halo
 * children are draped over the terrain, so none of them sits at the
 * summit any more.
 */
const occlusionCameraLocal = new THREE.Vector3()

/**
 * Whether a point on the world is on the FAR side of it.
 *
 * Projection alone cannot answer this: a marker behind the planet still
 * lands at valid screen coordinates, so its label used to appear on top of
 * the markers actually in front of it. Only the sphere occludes — the flat
 * map is seen from above, where nothing hides behind anything.
 */
function isOccluded(localPoint) {
  if (!projection.isSpherical || !camera) return false

  occlusionCameraLocal.copy(camera.position)
  worldGroup.worldToLocal(occlusionCameraLocal)
  // A small bias also drops the grazing band at the limb, where a label is
  // technically visible and practically unreadable.
  return !facesCamera(localPoint, occlusionCameraLocal, 0.12)
}

/** Where a marker sits on screen, for a card that has to point at it. */
function screenPositionOf(localPoint) {
  if (!camera || !renderer) return null

  const vector = new THREE.Vector3().copy(localPoint)
  worldGroup.localToWorld(vector)
  vector.project(camera)

  const rect = renderer.domElement.getBoundingClientRect()
  const projected = projectClipToScreen(vector, { width: rect.width, height: rect.height })
  return { x: rect.left + projected.screenX, y: rect.top + projected.screenY }
}

function updateSectionTooltip() {
  const hoveredIdx = attentionIndex()
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

  // Local summit -> world (via worldGroup's rotation) -> NDC.
  summitProjectionVec.copy(peakGroup.userData.summitLocal)
  const occluded = isOccluded(peakGroup.userData.summitLocal)
  worldGroup.localToWorld(summitProjectionVec)
  summitProjectionVec.project(camera)

  const rect = renderer.domElement.getBoundingClientRect()
  const projected = projectClipToScreen(summitProjectionVec, { width: rect.width, height: rect.height })
  if (!shouldShowCard(projected, occluded)) {
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
  // The portal form owns resources its objects share — one texture for
  // the whole layer — so it is disposed as a unit rather than per child.
  portalForm?.dispose()
  portalForm = null

  for (const group of [portalGroup, haloGroup, understoryGroup, canopyGroup]) {
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

  // Resolve the projection BEFORE building anything — every position in
  // the scene goes through it.
  projection = getProjection(props.worldShape)
  if (ambientLight) ambientLight.intensity = projection.ambientLightIntensity

  const { mesh, water, portals, halos, understory, canopy, heightScale } = buildTerrainMesh(props.world)
  terrainMesh = mesh
  waterMesh = water
  portalGroup = portals
  haloGroup = halos
  understoryGroup = understory
  canopyGroup = canopy
  // Apply the current layer toggles so a rebuild respects the user's
  // last on/off state without waiting for the layer-watch to fire.
  portalGroup.visible = props.showPortals
  haloGroup.visible = props.showSections
  understoryGroup.visible = props.showFoliage
  canopyGroup.visible = props.showFoliage
  worldGroup.add(terrainMesh, waterMesh, portalGroup, haloGroup, understoryGroup, canopyGroup)

  currentHeightScale = heightScale
  frameCamera(props.world.terrain, heightScale)
}

/**
 * Points the camera at the world and constrains OrbitControls for the
 * active projection. Both are re-applied on every rebuild, so switching
 * views resets the constraints the other one set rather than inheriting
 * them.
 */
let currentHeightScale = 1

function frameCamera(terrain, heightScale) {
  if (projection.isSpherical) {
    const radius = planetRadius(terrain)
    const distance = radius * SPHERE_VIEW.cameraDistanceRatio
    // Slightly above the equatorial plane so the globe reads as a sphere
    // on arrival rather than as a flat lit disc.
    camera.position.set(0, distance * 0.35, distance)
    if (controls) {
      controls.minDistance = radius * SPHERE_VIEW.minDistanceRatio
      controls.maxDistance = radius * SPHERE_VIEW.maxDistanceRatio
      // No polar clamp on a planet — flying over the poles is the point.
      controls.maxPolarAngle = Math.PI
      // Panning slides the orbit target off the planet's centre, which
      // turns "orbit the globe" into "swing around empty space".
      controls.enablePan = false
    }
  } else {
    const { width, height } = terrain
    camera.position.set(0, heightScale * 3, Math.max(width, height) * FLAT_VIEW.cameraDistanceRatio)
    if (controls) {
      controls.minDistance = 0
      controls.maxDistance = Infinity
      controls.maxPolarAngle = FLAT_VIEW.maxPolarAngle
      controls.enablePan = true
    }
  }

  camera.lookAt(0, 0, 0)
  controls?.target.set(0, 0, 0)
  controls?.update()
}

/**
 * The portal objects a raycast may hit, or none while the layer is off.
 *
 * The gate is explicit because three.js's raycaster tests layers rather
 * than Object3D.visible — the same reason the invisible halo fills work
 * as hit areas. Portals used not to exist at all when the layer was off,
 * so hiding them without this would leave them clickable.
 */
function portalTargets() {
  if (!portalGroup?.visible) return []
  return portalGroup.children
}

/**
 * Resolves a raycast hit to the portal object it belongs to, walking up
 * to the nearest ancestor that claims to be one.
 *
 * The walk is what lets a form return a group rather than a single mesh
 * — an arch with a lintel and two posts would hit on a child. Both the
 * click and the hover come through here, so a form whose objects cannot
 * be identified this way (a single InstancedMesh, where a hit reports an
 * instanceId instead) has this and findPortalObject to change, and
 * nothing else.
 */
function resolvePortalObject(hit) {
  let node = hit?.object ?? null
  while (node && node.userData.markerType === undefined) node = node.parent
  return node?.userData.markerType === 'portal' ? node : null
}

/**
 * The object standing for a given portal, whether or not the layer is
 * showing — this answers "where is it", not "can it be clicked", and the
 * dive is camera choreography that should still land somewhere sensible
 * with the markers turned off.
 */
function findPortalObject(portalId) {
  return portalGroup?.children.find((child) => child.userData.portal?.portalId === portalId) ?? null
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

  // Portal hit takes priority — a portal in front of a halo still reads
  // as "I meant to travel", not "I meant to focus".
  const [portalHit] = raycaster.intersectObjects(portalTargets())
  const clickedPortal = resolvePortalObject(portalHit)
  if (clickedPortal) {
    emit('portal-click', {
      portal: clickedPortal.userData.portal,
      anchor: screenPositionOf(clickedPortal.position),
    })
    return
  }

  // Otherwise: same halo-priority raycast the hover logic uses — a click
  // resolves to the same section the user was already visually focusing on.
  const clickTarget = pickHaloClickTarget()
  if (clickTarget) emit('section-click', clickTarget)
}

/**
 * Same subsection-first raycast prioritization as tryHoverHalo, but
 * returns the peak metadata a click consumer needs instead of pushing
 * into hoverState.
 *
 * It reports the peak that was clicked, full stop. It used to also
 * resolve that peak to its owning top-level range's anchor, because the
 * article panel only listed top-level sections — so pointing at a
 * subsection summit and clicking it selected its parent. That was the
 * renderer compensating for a limitation of a panel it should know
 * nothing about; the Ledger lists summits now and decides for itself
 * what it can show.
 */
function pickHaloClickTarget() {
  // three.js's raycaster ignores Object3D.visible, so the Sections layer
  // being toggled off has to be checked explicitly — otherwise hidden
  // halos would stay clickable with no visual affordance behind them.
  if (!haloGroup?.visible) return null
  const { subMeshes, topMeshes } = collectHaloTargets()

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
  }
}

function onPointerMove(event) {
  if (!raycaster) return

  const rect = pointerToNdc(event)
  raycaster.setFromCamera(pointer, camera)
  const [hit] = raycaster.intersectObjects(portalTargets(), true)
  const node = resolvePortalObject(hit)
  const portal = node?.userData.portal ?? null

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
 * Splits every visible halo's meshes into subsection-level and
 * top-level buckets, for a two-pass raycast.
 *
 * Each marker contributes an invisible fill covering its whole footprint
 * as well as its ring and wall, so "inside the marker" is a hit and not
 * just "on its outline".
 *
 * There is deliberately no opacity gate. It used to keep idle subsection
 * halos (opacity 0) from being hovered, which meant pointing at a
 * subsection fell through to the terrain and selected its SECTION — you
 * could only reach a subsection by first hovering its parent to reveal
 * it, then landing exactly on its ring. A subsection now reveals itself
 * by being pointed at.
 */
function collectHaloTargets() {
  const subMeshes = []
  const topMeshes = []
  for (const peakGroup of haloGroup.children) {
    if (!peakGroup.visible) continue
    const bucket = peakGroup.userData.isTopLevel ? topMeshes : subMeshes
    for (const child of peakGroup.children) bucket.push(child)
  }
  return { subMeshes, topMeshes }
}

/**
 * Raycasts the halo meshes and sets the hovered peak. Returns true if a
 * halo was hovered, so the caller knows to skip the terrain fallback.
 *
 * Subsections are tested first: inside a section, its subsections' fills
 * win, and the section itself is left to the gaps between them and to
 * its own boundary — which is how pointing at a map is expected to work.
 */
function tryHoverHalo() {
  if (!haloGroup || !raycaster) return false

  const { subMeshes, topMeshes } = collectHaloTargets()

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

  const cell = projection.fromLocal(localHitPoint.x, localHitPoint.y, localHitPoint.z, props.world.terrain)
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

  advanceDive()

  const nowSec = performance.now() * 0.001
  const peaks = props.world?.terrain?.peaks
  const hoveredTopLevel = resolveHoveredTopLevel(attentionIndex(), peaks)

  // Individual trees are meaningless from orbit and expensive to draw
  // there, so the canopy fades in on descent. The understory stays on:
  // it reads as ground texture at any distance and costs one draw call
  // per variant. On the flat map the gate is always open.
  if (canopyGroup && props.showFoliage) {
    const radius = projection.isSpherical ? planetRadius(props.world.terrain) : 0
    canopyGroup.visible = shouldShowCanopy(camera.position.length(), radius)
  }

  // Only the numbers are computed here; how a portal wears them is the
  // form's business (see portalForms.js). Skipped while the layer is
  // hidden — a portal nobody can see does not need animating.
  if (portalGroup?.visible && portalForm) {
    const alpha = PORTAL_MARKERS.lerpAlpha
    for (const object of portalGroup.children) {
      const state = object.userData
      const portal = state.portal
      const isHovered = hoveredPortalId !== null && portal?.portalId === hoveredPortalId

      // Hover growth eases in via the same lerp as the opacity fade, so
      // the portal swells under the cursor instead of snapping.
      const targetHoverScale = pickPortalHoverScale(isHovered)
      state.hoverScale += (targetHoverScale - state.hoverScale) * alpha

      // Section-link: dim portals whose section isn't the hovered one.
      // Nothing hovered → all at full presence.
      const isRelated = isPortalRelated(portal?.sectionIndex ?? -1, hoveredTopLevel)
      state.opacity += (pickPortalOpacity(isRelated, isHovered) - state.opacity) * alpha

      portalForm.apply(object, {
        scale: computePortalScale(state.baseScale, computePortalPulse(nowSec, state.pulsePhase), state.hoverScale),
        opacity: state.opacity,
      })
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

  // Transparent, so the CSS starfield and the body's nebula gradient show
  // through instead of a black canvas painted over them. This is why the
  // sky costs nothing: no skybox, no star geometry, no texture — the
  // backdrop is a gradient the compositor already had to draw. It also
  // means the stars hold still while the world turns under them, which is
  // what reads as "far away".
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0)
  containerRef.value.appendChild(renderer.domElement)

  // A single rotated group so terrain/water/portals/halos/vegetation all
  // share one consistent transform from grid-space (XY, Z-up) to
  // world-space (Y-up).
  worldGroup = new THREE.Group()
  worldGroup.rotation.x = -Math.PI / 2
  scene.add(worldGroup)

  // Intensity is set per projection in rebuildScene: on a globe the
  // directional sun produces a real day/night terminator, and the flat
  // view's ambient level leaves the night side unreadably black.
  ambientLight = new THREE.AmbientLight(0xffffff, FLAT_VIEW.ambientLightIntensity)
  scene.add(ambientLight)
  const sun = new THREE.DirectionalLight(0xffffff, 0.9)
  sun.position.set(60, 120, 40)
  scene.add(sun)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

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

// Rebuild when the world or the projection changes: every vertex
// position depends on the projection, though a view-mode switch only
// re-renders the SAME world and never regenerates terrain.
//
// Every layer toggle is a .visible flip on an existing group. Portals
// used to be in the watch above, because the layer was only built when
// it was showing — so turning the markers off discarded and rebuilt the
// terrain mesh, all 131k of its vertex colours, every halo and all of
// the vegetation, to stop drawing 24 sprites.
/**
 * Puts the camera back where a rebuild would have left it. Exposed rather
 * than driven by a prop because it is an EVENT — "do this now" — and a
 * prop would need a counter or a flag to say it happened twice.
 */
function recenter() {
  cancelDive()
  if (!props.world) return
  frameCamera(props.world.terrain, currentHeightScale)
}

/* ── the dive ──────────────────────────────────────────────────────────
 * The cheap half of the travel transition: a camera tween and nothing
 * else, which is why it can run as motion at all. The expensive half —
 * fetching and generating the next world — happens afterwards, behind a
 * static wash, because it blocks the main thread and would stutter this.
 */

let dive = null

function diveTo(portal) {
  const marker = findPortalObject(portal?.portalId)
  if (!marker || !camera) return

  const destination = marker.getWorldPosition(new THREE.Vector3())
  dive = {
    from: camera.position.clone(),
    // Not all the way in: stopping short of the marker leaves the wash to
    // cover the last of the distance, and going through it would clip the
    // near plane through the terrain.
    to: camera.position.clone().lerp(destination, 0.72),
    lookFrom: controls ? controls.target.clone() : new THREE.Vector3(),
    lookTo: destination,
    startedAt: performance.now(),
    duration: 260,
  }
  if (controls) controls.enabled = false
}

function cancelDive() {
  dive = null
  if (controls) controls.enabled = true
}

function advanceDive() {
  if (!dive) return

  const elapsed = (performance.now() - dive.startedAt) / dive.duration
  const t = Math.min(1, Math.max(0, elapsed))
  // Ease-in: the camera gathers speed toward the portal rather than
  // drifting off at a constant rate.
  const eased = t * t

  camera.position.lerpVectors(dive.from, dive.to, eased)
  if (controls) {
    controls.target.lerpVectors(dive.lookFrom, dive.lookTo, eased)
    controls.update()
  }

  if (t >= 1) cancelDive()
}

/**
 * Screen anchors for a couple of features the viewer can actually SEE, so
 * the legend can point at the real thing rather than at a diagram of it.
 * Occluded and off-screen candidates are skipped: pointing at something
 * behind the planet is how the tooltips became unreadable in the first
 * place, and a legend repeating that mistake would be worse.
 */
function legendAnchors() {
  const anchors = {}

  const range = haloGroup?.children.find(
    (child) => child.userData.summitLocal && !isOccluded(child.userData.summitLocal),
  )
  if (range) {
    const point = screenPositionOf(range.userData.summitLocal)
    const peak = props.world?.terrain?.peaks?.[range.userData.peakIndex]
    if (point) anchors.range = { ...point, label: peak?.title ? `${peak.title} is a section` : undefined }
  }

  const portal = portalTargets().find((marker) => marker.visible && !isOccluded(marker.position))
  if (portal) {
    const point = screenPositionOf(portal.position)
    const title = portal.userData.portal?.targetTitle
    if (point) anchors.portal = { ...point, label: title ? `A portal to ${title}` : undefined }
  }

  return anchors
}

defineExpose({ recenter, diveTo, cancelDive, legendAnchors })

watch(() => [props.world, props.worldShape], rebuildScene)

watch(
  () => [props.showPortals, props.showSections, props.showFoliage],
  () => {
    if (portalGroup) portalGroup.visible = props.showPortals
    if (haloGroup) haloGroup.visible = props.showSections
    if (understoryGroup) understoryGroup.visible = props.showFoliage
    if (canopyGroup) canopyGroup.visible = props.showFoliage
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
  color: var(--ink-3);
  text-align: center;
  padding: 2rem;
}

.world-view-3d__tooltip {
  position: absolute;
  /* Above the section label: hovering a portal that happens to sit on a
     summit must not bury "Click to travel" under the summit's description. */
  z-index: var(--z-stage-portal);
  transform: translate(-50%, calc(-100% - 12px));
  background: var(--surface-1-solid);
  border: 1px solid var(--edge-hair);
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  color: var(--ink-1);
  pointer-events: none;
  white-space: nowrap;
}

.world-view-3d__tooltip strong,
.world-view-3d__tooltip span {
  display: block;
}

.world-view-3d__tooltip span {
  margin-top: 0.1rem;
  color: var(--ink-3);
  font-size: 0.72rem;
}
</style>
