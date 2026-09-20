import { describe, expect, it } from 'vitest'
import {
  APP_AUTHOR_NAME,
  APP_DESCRIPTION,
  APP_NAME,
  APP_VERSION,
  CC0_LICENSE,
  WIKIMEDIA_USER_AGENT,
} from '../src/appInfo.js'

describe('appInfo', () => {
  it('builds a User-Agent that includes the app name, version, and a contact URL', () => {
    expect(WIKIMEDIA_USER_AGENT).toContain(APP_NAME)
    expect(WIKIMEDIA_USER_AGENT).toContain(APP_VERSION)
    expect(WIKIMEDIA_USER_AGENT).toMatch(/^WikiRealms\/\d+\.\d+\.\d+ \(https?:\/\//)
  })

  it('exposes a pitch suitable for meta description / share text', () => {
    expect(APP_DESCRIPTION).toMatch(/Wikipedia article is a world/i)
  })

  it('locks the author name and CC0 deed to English originals', () => {
    expect(APP_AUTHOR_NAME).toBe('Moriel Schottlender')
    expect(CC0_LICENSE.code).toBe('CC0')
    expect(CC0_LICENSE.url).toBe('https://creativecommons.org/publicdomain/zero/1.0/')
  })
})
