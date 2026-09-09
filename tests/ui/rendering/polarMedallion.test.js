import { describe, expect, it } from 'vitest'
import { BIOME_THRESHOLDS, GRID, POLAR_CAPS } from '../../../src/engine/generation/config.js'
import {
  POLAR_MEDALLION,
  buildPolarMedallions,
  polarMedallionHalfAngle,
  polarMedallionRadial,
  polarMedallionRadius,
  polarSinkRows,
  sphereSurfaceHeightAt,
} from '../../../src/ui/rendering/polarMedallion.js'

describe('polarSinkRows', () => {
  it('matches the authored reach on the real grid', () => {
    expect(polarSinkRows(GRID.height)).toBe(POLAR_CAPS.reachRows)
  })

  it('scales down on fixture grids so a tiny planet is not all ice', () => {
    expect(polarSinkRows(8)).toBe(0)
  })
})

describe('sphereSurfaceHeightAt', () => {
  it('leaves mid-latitudes alone', () => {
    expect(sphereSurfaceHeightAt(128, GRID.height, 0.7)).toBe(0.7)
  })

  it('sinks the polar band to sea level under the medallion', () => {
    expect(sphereSurfaceHeightAt(0, GRID.height, 0.7)).toBe(BIOME_THRESHOLDS.oceanMaxHeight)
    expect(sphereSurfaceHeightAt(GRID.height - 1, GRID.height, 0.55)).toBe(
      BIOME_THRESHOLDS.oceanMaxHeight,
    )
    expect(sphereSurfaceHeightAt(POLAR_CAPS.reachRows, GRID.height, 0.8)).toBe(
      BIOME_THRESHOLDS.oceanMaxHeight,
    )
    expect(sphereSurfaceHeightAt(POLAR_CAPS.reachRows + 1, GRID.height, 0.8)).toBe(0.8)
  })
})

describe('polarMedallion sizing', () => {
  it('grows with the planet and clears sea level', () => {
    const radius = 100
    const heightScale = 15
    const disc = polarMedallionRadius(radius, GRID.height)
    const radial = polarMedallionRadial(radius, heightScale)

    expect(disc).toBeGreaterThan(0)
    expect(disc).toBeLessThan(radius)
    expect(polarMedallionHalfAngle(GRID.height)).toBeGreaterThan(0)
    expect(radial).toBeCloseTo(
      radius + BIOME_THRESHOLDS.oceanMaxHeight * heightScale + POLAR_MEDALLION.waterClearance,
      10,
    )
  })
})

describe('buildPolarMedallions', () => {
  it('builds a north and south faceted plate outside the sea', () => {
    const group = buildPolarMedallions({
      radius: 80,
      heightScale: 12,
      gridHeight: GRID.height,
    })

    expect(group.name).toBe('polarMedallions')
    expect(group.children).toHaveLength(2)
    expect(group.children.map((c) => c.name).sort()).toEqual([
      'polarMedallionNorth',
      'polarMedallionSouth',
    ])

    const north = group.getObjectByName('polarMedallionNorth')
    const south = group.getObjectByName('polarMedallionSouth')
    const discRadius = polarMedallionRadius(80, GRID.height)
    const thickness = discRadius * POLAR_MEDALLION.thicknessRatio
    const radial = polarMedallionRadial(80, 12)
    expect(north.position.z).toBeCloseTo(radial + thickness * 0.5, 10)
    expect(south.position.z).toBeCloseTo(-(radial + thickness * 0.5), 10)
    expect(north.position.z).toBeGreaterThan(0)
    expect(south.position.z).toBeLessThan(0)

    expect(north.geometry.type).toBe('CylinderGeometry')
    expect(north.geometry.parameters.radiusTop).toBeCloseTo(discRadius, 10)
    expect(north.geometry.parameters.radialSegments).toBe(POLAR_MEDALLION.segments)
    expect(north.material.defines.FLAT_SHADED).toBeDefined()
    expect(north.material.defines.USE_SPECULAR).toBeDefined()
  })

  it('paints ice vertex colours and full snow eligibility', () => {
    const group = buildPolarMedallions({ radius: 50, heightScale: 7, gridHeight: GRID.height })
    const north = group.getObjectByName('polarMedallionNorth')
    const colors = north.geometry.attributes.color
    const snow = north.geometry.attributes.snowHeight

    expect(colors.getX(0)).toBeCloseTo(245 / 255, 5)
    expect(snow.getX(0)).toBe(1)
    expect(north.material.vertexColors).toBe(true)
  })
})
