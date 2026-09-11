import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onHistoryPop, pushRealm, readLanguage, readRealm, realmUrl } from '../../src/adapters/urlState.js'

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
      // honouring the spelling rescues any link already pasted somewhere.
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

  describe('readLanguage', () => {
    it('reads a known Wikipedia edition code', () => {
      expect(readLanguage('?lang=he&realm=שבתאי')).toBe('he')
    })

    it('returns null for missing or unknown codes', () => {
      expect(readLanguage('?realm=Saturn')).toBeNull()
      expect(readLanguage('?lang=not-a-wiki')).toBeNull()
    })
  })

  describe('realmUrl', () => {
    it('builds a shareable link', () => {
      expect(realmUrl('Cassini Division', 'https://wikirealms.test', '/')).toBe(
        'https://wikirealms.test/?realm=Cassini+Division',
      )
    })

    it('includes lang for non-English editions', () => {
      expect(realmUrl('שבתאי', { language: 'he', origin: 'https://wikirealms.test', pathname: '/' })).toBe(
        'https://wikirealms.test/?realm=%D7%A9%D7%91%D7%AA%D7%90%D7%99&lang=he',
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

      expect(history.state).toMatchObject({ nodeId: 'n4', title: 'Titan', language: 'en' })
    })

    it('writes lang into the query for non-English editions', () => {
      pushRealm('שבתאי', 'r:he:שבתאי', { language: 'he' })

      expect(readLanguage(window.location.search)).toBe('he')
      expect(readRealm(window.location.search)).toBe('שבתאי')
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

      expect(handler).toHaveBeenCalledWith({ nodeId: 'n2', title: 'Saturn' }, 'Saturn', null)
      stop()
    })

    it('copes with an entry that has no state of ours', () => {
      const handler = vi.fn()
      const stop = onHistoryPop(handler)

      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))

      expect(handler).toHaveBeenCalledWith({}, null, null)
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
