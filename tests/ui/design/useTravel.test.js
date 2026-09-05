import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TRAVEL_PHASES, useTravel } from '../../../src/ui/design/useTravel.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** useTravel hooks onBeforeUnmount, so it needs a component to live in. */
function harness(options = {}) {
  let travel
  const wrapper = mount({
    setup() {
      travel = useTravel(options)
      return () => null
    },
  })
  return { travel, wrapper }
}

const PORTAL = { targetTitle: 'Titan' }

describe('useTravel', () => {
  it('is idle until asked to travel', () => {
    const { travel } = harness()

    expect(travel.phase.value).toBe('idle')
    expect(travel.isTravelling.value).toBe(false)
  })

  it('dives, then washes, then rises', async () => {
    const { travel } = harness({ prefersReducedMotion: () => false })
    travel.travel(PORTAL, { onArrive: vi.fn() })

    expect(travel.phase.value).toBe('diving')

    await vi.advanceTimersByTimeAsync(TRAVEL_PHASES.DIVE)
    expect(travel.phase.value).toBe('washing')

    await vi.advanceTimersByTimeAsync(TRAVEL_PHASES.WASH_MIN)
    expect(travel.phase.value).toBe('rising')

    await vi.advanceTimersByTimeAsync(TRAVEL_PHASES.RISE)
    expect(travel.phase.value).toBe('idle')
  })

  it('does the blocking work behind the wash, not during the dive', async () => {
    // The whole shape of this exists because generateWorld blocks for
    // ~120ms on a laptop and more on a phone. Doing it while the camera
    // moves would stutter the camera; doing it behind a static hold is
    // indistinguishable from a held frame.
    const onArrive = vi.fn()
    const { travel } = harness({ prefersReducedMotion: () => false })

    travel.travel(PORTAL, { onArrive })
    expect(onArrive).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(TRAVEL_PHASES.DIVE)

    expect(onArrive).toHaveBeenCalledWith(PORTAL)
    expect(travel.phase.value).toBe('washing')
  })

  it('holds the wash for a floor, so it cannot flash', async () => {
    const { travel } = harness({ prefersReducedMotion: () => false })
    travel.travel(PORTAL, { onArrive: () => {} })

    await vi.advanceTimersByTimeAsync(TRAVEL_PHASES.DIVE)
    await vi.advanceTimersByTimeAsync(TRAVEL_PHASES.WASH_MIN - 20)

    expect(travel.phase.value).toBe('washing')
  })

  it('blocks stage interaction while the world is being replaced', async () => {
    const { travel } = harness({ prefersReducedMotion: () => false })
    travel.travel(PORTAL, { onArrive: () => {} })

    expect(travel.isBusy.value).toBe(true)

    await vi.advanceTimersByTimeAsync(TRAVEL_PHASES.DIVE + TRAVEL_PHASES.WASH_MIN)

    // Rising happens on the new world, which is ready: let them touch it.
    expect(travel.phase.value).toBe('rising')
    expect(travel.isBusy.value).toBe(false)
  })

  describe('when motion is unwanted', () => {
    it('arrives without any of it', async () => {
      const onArrive = vi.fn()
      const onDive = vi.fn()
      const { travel } = harness({ prefersReducedMotion: () => true })

      travel.travel(PORTAL, { onArrive, onDive })
      await vi.advanceTimersByTimeAsync(0)

      // Not a shorter dive — none. A viewer who asked for no movement is
      // not asking for less of it.
      expect(onDive).not.toHaveBeenCalled()
      expect(onArrive).toHaveBeenCalledWith(PORTAL)
      expect(travel.phase.value).toBe('idle')
    })

    it('does the same when the setting is off, whatever the system says', async () => {
      const onDive = vi.fn()
      const { travel } = harness({ prefersReducedMotion: () => false })

      travel.travel(PORTAL, { onArrive: vi.fn(), onDive, animate: false })
      await vi.advanceTimersByTimeAsync(0)

      expect(onDive).not.toHaveBeenCalled()
      expect(travel.phase.value).toBe('idle')
    })
  })

  describe('cancelling', () => {
    it('ends immediately, at the destination', async () => {
      const { travel } = harness({ prefersReducedMotion: () => false })
      travel.travel(PORTAL, { onArrive: () => {} })

      await vi.advanceTimersByTimeAsync(TRAVEL_PHASES.DIVE)
      travel.cancel()

      expect(travel.phase.value).toBe('idle')
      expect(travel.isTravelling.value).toBe(false)
    })

    it('leaves no phase running behind it', async () => {
      const { travel } = harness({ prefersReducedMotion: () => false })
      travel.travel(PORTAL, { onArrive: () => {} })

      travel.cancel()
      await vi.advanceTimersByTimeAsync(2000)

      expect(travel.phase.value).toBe('idle')
    })

    it('a second journey abandons the first rather than racing it', async () => {
      const first = vi.fn()
      const second = vi.fn()
      const { travel } = harness({ prefersReducedMotion: () => false })

      travel.travel(PORTAL, { onArrive: first })
      travel.travel({ targetTitle: 'Rhea' }, { onArrive: second })
      await vi.advanceTimersByTimeAsync(TRAVEL_PHASES.DIVE)

      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledOnce()
    })
  })

  it('names where it is going, for whatever is drawn over the wash', async () => {
    const { travel } = harness({ prefersReducedMotion: () => false })
    travel.travel(PORTAL, { onArrive: () => {} })

    expect(travel.target.value).toEqual(PORTAL)

    await vi.advanceTimersByTimeAsync(TRAVEL_PHASES.DIVE + TRAVEL_PHASES.WASH_MIN + TRAVEL_PHASES.RISE)

    expect(travel.target.value).toBeNull()
  })
})
