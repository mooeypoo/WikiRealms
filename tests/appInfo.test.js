import { describe, expect, it } from 'vitest'
import { APP_DESCRIPTION, APP_NAME, APP_VERSION, WIKIMEDIA_USER_AGENT } from '../src/appInfo.js'

describe('appInfo', () => {
  it('builds a User-Agent that includes the app name, version, and a contact URL', () => {
    expect(WIKIMEDIA_USER_AGENT).toContain(APP_NAME)
    expect(WIKIMEDIA_USER_AGENT).toContain(APP_VERSION)
    expect(WIKIMEDIA_USER_AGENT).toMatch(/^WikiRealms\/\d+\.\d+\.\d+ \(https?:\/\//)
  })

  it('exposes a pitch suitable for meta description / share text', () => {
    expect(APP_DESCRIPTION).toMatch(/Wikipedia article is a world/i)
  })
})
