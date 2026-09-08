import { describe, expect, it } from 'vitest'
import {
  QUALITY_TIERS,
  detectQualityTier,
  readDeviceProfile,
  resolvePixelRatio,
} from '../../../src/ui/rendering/quality.js'

describe('QUALITY_TIERS', () => {
  it('gets cheaper on every axis as the tier drops', () => {
    // A tier that lowered one cost and raised another would be a
    // preference rather than a quality level.
    const order = [QUALITY_TIERS.high, QUALITY_TIERS.medium, QUALITY_TIERS.low]
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i].pixelRatio, order[i].name).toBeLessThan(order[i - 1].pixelRatio)
      expect(order[i].foliageDensity, order[i].name).toBeLessThan(order[i - 1].foliageDensity)
    }
  })

  it('never asks for more than a 2x buffer', () => {
    // 3x costs another 125% of the fragments over 2x for a difference
    // that is close to invisible at arm's length — and 3x screens are
    // phones, which are exactly the devices that cannot afford it.
    for (const tier of Object.values(QUALITY_TIERS)) {
      expect(tier.pixelRatio, tier.name).toBeLessThanOrEqual(2)
      expect(tier.pixelRatio, tier.name).toBeGreaterThanOrEqual(1)
      expect(tier.foliageDensity, tier.name).toBeGreaterThan(0)
      expect(tier.foliageDensity, tier.name).toBeLessThanOrEqual(1)
    }
  })
})

describe('detectQualityTier', () => {
  it('puts a desktop on the top tier', () => {
    expect(detectQualityTier({ coarsePointer: false, hardwareConcurrency: 20, deviceMemory: 32 })).toBe(
      QUALITY_TIERS.high,
    )
  })

  it('never puts a touch device on the top tier', () => {
    // Even a phone claiming plenty of cores is running a mobile GPU with
    // a shared memory bus, and it is the device most likely to be
    // running at a 3x pixel ratio.
    const tier = detectQualityTier({ coarsePointer: true, hardwareConcurrency: 16, deviceMemory: 8 })
    expect(tier).toBe(QUALITY_TIERS.medium)
    expect(tier).not.toBe(QUALITY_TIERS.high)
  })

  it('drops a thin phone to the bottom tier', () => {
    expect(detectQualityTier({ coarsePointer: true, hardwareConcurrency: 4, deviceMemory: 4 })).toBe(
      QUALITY_TIERS.low,
    )
    expect(detectQualityTier({ coarsePointer: true, hardwareConcurrency: 8, deviceMemory: 2 })).toBe(
      QUALITY_TIERS.low,
    )
  })

  it('reads the pointer rather than the screen size', () => {
    // A narrow window on a desktop is still a desktop, and a tablet in
    // landscape is still a tablet. What correlates with a mobile GPU is
    // that the primary pointer is a finger.
    expect(detectQualityTier({ coarsePointer: false, hardwareConcurrency: 8, deviceMemory: 8 })).toBe(
      QUALITY_TIERS.high,
    )
    expect(detectQualityTier({ coarsePointer: true, hardwareConcurrency: 8, deviceMemory: 8 })).toBe(
      QUALITY_TIERS.medium,
    )
  })

  it('assumes a browser that tells us nothing is capable', () => {
    // Safari reports neither deviceMemory nor a useful concurrency, and
    // a Mac is not the device this protects. Treating silence as
    // weakness would put every Safari user on the low tier.
    expect(detectQualityTier({})).toBe(QUALITY_TIERS.high)
    expect(detectQualityTier()).toBe(QUALITY_TIERS.high)
    expect(detectQualityTier({ coarsePointer: true })).toBe(QUALITY_TIERS.medium)
  })

  it('steps a genuinely thin desktop down one', () => {
    expect(detectQualityTier({ coarsePointer: false, hardwareConcurrency: 2 })).toBe(QUALITY_TIERS.medium)
  })
})

describe('resolvePixelRatio', () => {
  it('caps the screen rather than replacing it', () => {
    // Asking for more pixels than the screen has renders detail that the
    // downscale then averages away.
    expect(resolvePixelRatio(QUALITY_TIERS.high, 1)).toBe(1)
    expect(resolvePixelRatio(QUALITY_TIERS.high, 2)).toBe(2)
    expect(resolvePixelRatio(QUALITY_TIERS.high, 3)).toBe(2)
    expect(resolvePixelRatio(QUALITY_TIERS.medium, 3)).toBe(1.5)
    expect(resolvePixelRatio(QUALITY_TIERS.low, 3)).toBe(1)
  })

  it('survives a browser with a nonsense pixel ratio', () => {
    // A zero or a NaN here would size the drawing buffer to nothing,
    // which is a blank canvas rather than a slow one.
    for (const nonsense of [0, -1, Number.NaN, undefined, null]) {
      expect(resolvePixelRatio(QUALITY_TIERS.high, nonsense), String(nonsense)).toBe(1)
    }
  })
})

describe('readDeviceProfile', () => {
  it('returns the three signals the decision needs', () => {
    const profile = readDeviceProfile()
    expect(Object.keys(profile).sort()).toEqual(['coarsePointer', 'deviceMemory', 'hardwareConcurrency'])
    expect(typeof profile.coarsePointer).toBe('boolean')
  })

  it('feeds detectQualityTier without throwing under jsdom', () => {
    // The globals it reads are all optional, and jsdom provides some and
    // not others — which is the same situation as a real browser.
    expect(Object.values(QUALITY_TIERS)).toContain(detectQualityTier(readDeviceProfile()))
  })
})
