import { describe, expect, it, vi } from 'vitest'
import { useWorld } from '../../../src/ui/composables/useWorld.js'

describe('useWorld', () => {
  it('starts idle with no world', () => {
    const { world, status } = useWorld({ generateWorldFn: vi.fn() })

    expect(world.value).toBeNull()
    expect(status.value).toBe('idle')
  })

  it('builds a world successfully', () => {
    const fakeWorld = { worldId: 'en:1@1:v1', terrain: {}, portals: [] }
    const generateWorldFn = vi.fn().mockReturnValue(fakeWorld)
    const { world, status, buildWorld } = useWorld({ generateWorldFn })

    buildWorld({ articleId: 'en:1' })

    expect(generateWorldFn).toHaveBeenCalledWith({ articleId: 'en:1' })
    expect(status.value).toBe('success')
    expect(world.value).toEqual(fakeWorld)
  })

  it('exposes an error message when generation throws', () => {
    const generateWorldFn = vi.fn().mockImplementation(() => {
      throw new Error('boom')
    })
    const { world, status, errorMessage, buildWorld } = useWorld({ generateWorldFn })

    buildWorld({ articleId: 'en:1' })

    expect(status.value).toBe('error')
    expect(errorMessage.value).toBe('boom')
    expect(world.value).toBeNull()
  })

  it('clear() resets state', () => {
    const generateWorldFn = vi.fn().mockReturnValue({ worldId: 'en:1@1:v1' })
    const { world, status, buildWorld, clear } = useWorld({ generateWorldFn })

    buildWorld({ articleId: 'en:1' })
    clear()

    expect(world.value).toBeNull()
    expect(status.value).toBe('idle')
  })
})
