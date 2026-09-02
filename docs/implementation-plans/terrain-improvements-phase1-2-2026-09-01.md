# Terrain Improvements: Phase 1 & 2 Implementation Plan

**Date:** 2026-09-01  
**Version:** 1.0  
**Based on:** Brainstorming session on terrain realism and charm

## Purpose

This plan implements citation-driven terrain lushness (Phase 1) and cute boats (Phase 2) to make article worlds feel more alive, more representative of article content, and more inviting to explore.

## Vision

Transform the procedurally generated article worlds from abstract terrain into living, story-driven landscapes:
- **Lushness reflects importance**: Citation-dense subsections feel lush and vibrant; sparse sections feel barren
- **Character and charm**: Cute blobby creatures inhabit the landscape; boats float on waters representing citations
- **Explorable depth**: Zoom in to reveal detail; visual abundance tells the story of the article

## Phase 1: Citation-Driven Terrain Lushness

### Goals

Replace the ambient moisture-based biome system with a citation-density-based system. Each subsection's lushness is derived from its share of total article citations.

### Architecture alignment

- **Domain**: Procedural generation engine (pure data transformation)
- **Files affected**: `config.js` (new biome thresholds), `sectionTerrain.js` (citation density calculation)
- **No UI changes**: Rendering layer consumes the same `biomeMap` output; colors remain presentation-only

### Tasks

1. Add citation configuration to `config.js`:
   - `CITATION_LUSHNESS` thresholds (10%, 25%, 50%, 75% per-section-citation-share)
   - Biome variant IDs (DESERT, LIGHT_VEG, MEADOW, WOODLAND, JUNGLE)

2. Modify `sectionTerrain.js`:
   - Track total citations from all peaks in the world
   - For each cell, compute which peak(s) contribute to height
   - Calculate that peak's citation % of total
   - Map citation % to a lushness biome variant

3. Update `biomeColor.js`:
   - Add color palettes for each lushness variant
   - Desert: warm sand/tan yellows
   - Light veg: pale greens
   - Meadow: mid greens
   - Woodland: deep forest greens
   - Jungle: vibrant emerald

4. Tests:
   - Verify citation density is correctly normalized (0–1)
   - Verify biome classification respects citation thresholds
   - Verify high-citation sections produce forest/jungle colors

### Deliverables

- Citation-aware biome classification
- Visual lushness progression tied to article structure
- Tests covering citation density calculation

### Acceptance criteria

- High-citation subsections render noticeably greener/lusher
- Low-citation subsections render noticeably more desert-like
- The lushness pattern is deterministic (same article → same result)
- All existing tests still pass

## Phase 2: Cute Boats for Citations

### Goals

Visualize citation count per section as cute stylized boats bobbing near their section peaks in water.

### Architecture alignment

- **Domain**: UI/presentation layer (pure rendering)
- **Files affected**: `WorldView3D.vue` (new boat group), `citationBoats.js` (new boat rendering helpers)
- **No generation changes**: Consumes existing `world.peaks[].citationCount` data

### Tasks

1. Create boat sprite system (`citationBoats.js`):
   - Boat SVG templates (sailboat, speedboat, ship)
   - Canvas-to-texture converter (same pattern as beacons)
   - Boat sizing/type based on citation count thresholds (configurable)

2. Modify `WorldView3D.vue`:
   - Create boat group and add to world group
   - For each peak with citations, spawn boats above water surface
   - Boats float near peak's lateral position, but always on water
   - Bobbing animation (sine wave, configurable amplitude/frequency)

3. Configuration (`config.js`):
   - `CITATION_BOATS` thresholds (e.g., 1–3 citations → sailboat, 4–7 → speedboat, 8+ → ship)
   - Bobbing amplitude and frequency

4. Interaction:
   - Boats are clickable (raycaster, same as portals)
   - Click navigates to that peak's section in the article
   - Visual feedback on hover (glow intensifies)

5. Tests:
   - Verify boat placement is above water
   - Verify boat type matches citation count
   - Verify boat click detection works

### Deliverables

- Boat sprite system
- Animated bobbing boats near peaks
- Clickable boat interaction

### Acceptance criteria

- High-citation sections have large boats; low-citation sections have small boats
- Boats bob gently and continuously
- Boats are clearly clickable and respond to clicks
- Boats render without WebGL errors (gracefully skip in jsdom tests)

## Phase 2.5: Portal and Peak Label Re-examination

### Goals

Ensure portals and section circles remain clear and clickable given the new visual layers (lushness, boats).

### Tasks

1. Review current portal rendering:
   - Check visibility against new background complexity
   - Adjust glow/color if needed
   - Verify click targets are still precise

2. Review peak beacon rendering:
   - Confirm beacons are visually distinct from boats
   - Adjust sizing/color if beacons get lost in new world

3. Consider:
   - Should boats and beacons be on different depth/layers?
   - Should portal labels be more prominent?
   - Do we need hover-to-highlight for clarity?

### Deliverables

- Visibility audit and adjustments
- Confirmation that interaction layer remains intuitive

## Implementation notes

- All configuration is in `config.js` to allow iteration without redeploying code
- Citation thresholds are configurable to tune visual impact
- Boat types are configurable to experiment with visual variety
- Tests use fixtures with known citation distributions to verify behavior

## Timeline estimate

- Phase 1: 2–3 hours (mostly config + color work, straightforward logic)
- Phase 2: 3–4 hours (boat sprite system + animation + interaction)
- Phase 2.5 (portal/beacon audit): 1–2 hours
- **Total: 6–9 hours** of focused work

## Next steps after Phase 1 & 2

Once these are visually validated:
- Phase 3: Foliage system (instanced trees based on lushness)
- Phase 4: Blobby creatures (biome-specific cute life)
- Future: Animation enhancements (boats sailing between peaks, seasonal effects)
