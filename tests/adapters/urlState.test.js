import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onHistoryPop, pushRealm, readRealm, realmUrl } from '../../src/adapters/urlState.js'

beforeEach(() => {
  history.replaceState(null, '', '/')
})

afterEach(() => {
  history.replaceState(null, '', '/')
})

describe('urlState', () => {
  describe('readRealm', () => {
    it('reads the realm from the query string', () => {
      expect(readRealm('?realm=Cassini%20Division')).toBe('Cassini Division')
    })

    it('accepts the parameter the broken share links used', () => {
      // Those links never worked, since nothing read the parameter — but
      // honouring the spelling rescues any already pasted somewhere.
      expect(readRealm('?article=Saturn')).toBe('Saturn')
    })

    it('prefers the current spelling when a URL somehow carries both', () => {
      expect(readRealm('?article=Saturn&realm=Titan')).toBe('Titan')
    })

    it('returns null for no realm, an empty one, or whitespace', () => {
      expect(readRealm('')).toBeNull()
      expect(readRealm('?other=1')).toBeNull()
      expect(readRealm('?realm=')).toBeNull()
      expect(readRealm('?realm=%20%20')).toBeNull()
    })
  })

  describe('realmUrl', () => {
    it('builds a shareable link', () => {
      expect(realmUrl('Cassini Division', 'https://wikirealms.test', '/')).toBe(
        'https://wikirealms.test/?realm=Cassini+Division',
      )
    })

    it('escapes a title that would otherwise break the query string', () => {
      const url = realmUrl('Rock & roll', 'https://wikirealms.test', '/')

      expect(url).toContain('Rock+%26+roll')
      expect(readRealm(new URL(url).search)).toBe('Rock & roll')
    })
  })

  describe('pushRealm', () => {
    it('puts the realm in the address bar', () => {
      pushRealm('Titan', 'n4')

      expect(readRealm(window.location.search)).toBe('Titan')
    })

    it('carries the node id in history state, not just the title', () => {
      // A realm can be reached twice by different routes, so the title alone
      // cannot say WHERE in the journey a back button should land.
      pushRealm('Titan', 'n4')

      expect(history.state).toMatchObject({ nodeId: 'n4', title: 'Titan' })
    })

    it('replaces rather than pushes when asked', () => {
      const before = history.length
      pushRealm('Titan', 'n4', { replace: true })

      expect(history.length).toBe(before)
      expect(readRealm(window.location.search)).toBe('Titan')
    })

    it('clears the query when there is no realm yet', () => {
      pushRealm('Titan', 'n4')
      pushRealm(null, null)

      expect(readRealm(window.location.search)).toBeNull()
    })
  })

  describe('onHistoryPop', () => {
    it('reports the state and realm of the entry returned to', () => {
      const handler = vi.fn()
      const stop = onHistoryPop(handler)

      history.replaceState({ nodeId: 'n2', title: 'Saturn' }, '', '?realm=Saturn')
      window.dispatchEvent(new PopStateEvent('popstate', { state: { nodeId: 'n2', title: 'Saturn' } }))

      expect(handler).toHaveBeenCalledWith({ nodeId: 'n2', title: 'Saturn' }, 'Saturn')
      stop()
    })

    it('copes with an entry that has no state of ours', () => {
      const handler = vi.fn()
      const stop = onHistoryPop(handler)

      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))

      expect(handler).toHaveBeenCalledWith({}, null)
      stop()
    })

    it('stops listening when unsubscribed', () => {
      const handler = vi.fn()
      onHistoryPop(handler)()

      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))

      expect(handler).not.toHaveBeenCalled()
    })
  })
})
