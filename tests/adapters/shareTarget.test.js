import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyText, shareLink } from '../../src/adapters/shareTarget.js'

const LINK = { title: 'WikiRealms', text: 'Explore Titan', url: 'https://wikirealms.test/?realm=Titan' }

beforeEach(() => {
  delete navigator.share
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
  // jsdom has no execCommand of its own, so tests that need one add it.
  delete document.execCommand
})

function withClipboard(writeText) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

describe('shareTarget', () => {
  it('uses the platform share sheet when there is one', async () => {
    navigator.share = vi.fn().mockResolvedValue(undefined)

    expect(await shareLink(LINK)).toBe('shared')
    expect(navigator.share).toHaveBeenCalledWith(LINK)
  })

  it('treats a dismissed share sheet as done, not as a failure', async () => {
    // Falling back to the clipboard here would copy a link the viewer just
    // decided not to send, and then claim success at them.
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    navigator.share = vi.fn().mockRejectedValue(abort)
    const writeText = vi.fn().mockResolvedValue(undefined)
    withClipboard(writeText)

    expect(await shareLink(LINK)).toBe('shared')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to the clipboard when the share sheet actually fails', async () => {
    navigator.share = vi.fn().mockRejectedValue(new Error('nope'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    withClipboard(writeText)

    expect(await shareLink(LINK)).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(LINK.url)
  })

  it('copies when there is no share sheet at all', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    withClipboard(writeText)

    expect(await shareLink(LINK)).toBe('copied')
  })

  it('copies the postcard letter when clipboardText is provided', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    withClipboard(writeText)

    expect(
      await shareLink({
        ...LINK,
        clipboardText: 'Expedition…\nhttps://wikirealms.test/?realm=Titan',
      }),
    ).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('Expedition…\nhttps://wikirealms.test/?realm=Titan')
  })

  it('reports failure rather than pretending', async () => {
    withClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    document.execCommand = vi.fn(() => {
      throw new Error('unsupported')
    })

    expect(await shareLink(LINK)).toBe('failed')
  })

  describe('copyText', () => {
    it('uses the async clipboard when available', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      withClipboard(writeText)

      expect(await copyText('hello')).toBe(true)
      expect(writeText).toHaveBeenCalledWith('hello')
    })

    it('falls back to a detached field on older browsers and insecure origins', async () => {
      document.execCommand = vi.fn().mockReturnValue(true)

      expect(await copyText('hello')).toBe(true)
      expect(document.execCommand).toHaveBeenCalledWith('copy')
    })

    it('leaves no stray element behind when the fallback fails', async () => {
      document.execCommand = vi.fn().mockReturnValue(false)

      expect(await copyText('hello')).toBe(false)
      expect(document.querySelector('textarea')).toBeNull()
    })
  })
})
