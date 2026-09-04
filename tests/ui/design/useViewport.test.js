import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { BREAKPOINTS, SHORT_MAX_HEIGHT, useViewport } from '../../../src/ui/design/useViewport.js'

function atSize(width, height = 900) {
  window.innerWidth = width
  window.innerHeight = height

  let viewport
  const wrapper = mount({
    setup() {
      viewport = useViewport()
      viewport.measure()
      return () => null
    },
  })
  return { viewport, wrapper }
}

const mounted = []
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

function viewportAt(width, height) {
  const { viewport, wrapper } = atSize(width, height)
  mounted.push(wrapper)
  return viewport
}

describe('useViewport', () => {
  it.each([
    [320, 'xs'],
    [479, 'xs'],
    [480, 'sm'],
    [767, 'sm'],
    [768, 'md'],
    [1023, 'md'],
    [1024, 'lg'],
    [1439, 'lg'],
    [1440, 'xl'],
    [2560, 'xl'],
  ])('resolves %ipx to %s', (width, expected) => {
    expect(viewportAt(width).breakpoint.value).toBe(expected)
  })

  it('reports the short case by height, not width', () => {
    // A landscape phone is 844px wide — wider than an md tablet — so width
    // alone would put it in a layout that assumes vertical room it lacks.
    const landscapePhone = viewportAt(844, 390)
    expect(landscapePhone.isShort.value).toBe(true)
    expect(landscapePhone.breakpoint.value).toBe('md')

    expect(viewportAt(844, 900).isShort.value).toBe(false)
  })

  it('answers atLeast against the ladder', () => {
    const viewport = viewportAt(1024)

    expect(viewport.atLeast('md')).toBe(true)
    expect(viewport.atLeast('lg')).toBe(true)
    expect(viewport.atLeast('xl')).toBe(false)
  })

  it('tracks a resize', () => {
    const viewport = viewportAt(1440)
    expect(viewport.breakpoint.value).toBe('xl')

    window.innerWidth = 390
    window.dispatchEvent(new Event('resize'))

    expect(viewport.breakpoint.value).toBe('xs')
  })

  it('keeps the CSS density breakpoint in step with the ladder', () => {
    // CSS cannot read these constants — media queries cannot use custom
    // properties, which is why the old --breakpoint-* tokens were useless.
    // So the two are pinned to each other here instead.
    const tokens = readFileSync(resolve(process.cwd(), 'src/ui/design/tokens.css'), 'utf8')
    const densityQuery = tokens.match(/@media \(max-width: (\d+)px\)\s*{\s*:root\s*{\s*--density/)

    expect(densityQuery, 'tokens.css should scale density below the sm breakpoint').not.toBeNull()
    expect(Number(densityQuery[1])).toBe(BREAKPOINTS.sm - 1)
  })

  it('states the short threshold once', () => {
    expect(SHORT_MAX_HEIGHT).toBe(520)
  })
})
