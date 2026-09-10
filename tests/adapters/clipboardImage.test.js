import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyImageBlob,
  downloadBlob,
  sharePostcardImage,
} from '../../src/adapters/clipboardImage.js'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('copyImageBlob', () => {
  it('writes a ClipboardItem when the platform supports image copy', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { write },
      configurable: true,
    })
    // jsdom may lack ClipboardItem; the adapter constructs one.
    if (typeof ClipboardItem === 'undefined') {
      globalThis.ClipboardItem = class ClipboardItem {
        constructor(items) {
          this.items = items
        }
      }
    }
    const blob = new Blob(['png'], { type: 'image/png' })

    expect(await copyImageBlob(blob)).toBe('copied')
    expect(write).toHaveBeenCalledTimes(1)
    const items = write.mock.calls[0][0]
    expect(items).toHaveLength(1)
    expect(items[0]).toBeInstanceOf(ClipboardItem)
  })

  it('reports failure when clipboard image write is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {},
      configurable: true,
    })
    expect(await copyImageBlob(new Blob(['png'], { type: 'image/png' }))).toBe('failed')
  })
})

describe('downloadBlob', () => {
  it('clicks a temporary download anchor', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    URL.createObjectURL = vi.fn(() => 'blob:postcard')
    URL.revokeObjectURL = vi.fn()

    expect(downloadBlob(new Blob(['png'], { type: 'image/png' }), 'card.png')).toBe(true)
    expect(click).toHaveBeenCalled()
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(document.querySelector('a')).toBeNull()
  })
})

describe('sharePostcardImage', () => {
  beforeEach(() => {
    delete navigator.share
    delete navigator.canShare
  })

  it('shares a PNG file when the platform accepts files', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    navigator.share = share
    navigator.canShare = vi.fn().mockReturnValue(true)
    const shareLink = vi.fn()

    const blob = new Blob(['png'], { type: 'image/png' })
    expect(
      await sharePostcardImage(
        {
          blob,
          title: 'WikiRealms expedition',
          text: 'Hello',
          url: 'https://example.test/?realm=A',
        },
        shareLink,
      ),
    ).toBe('shared')

    expect(share).toHaveBeenCalled()
    expect(share.mock.calls[0][0].files[0]).toBeInstanceOf(File)
    expect(shareLink).not.toHaveBeenCalled()
  })

  it('falls back to the text letter when files cannot be shared', async () => {
    navigator.share = vi.fn()
    navigator.canShare = vi.fn().mockReturnValue(false)
    const shareLink = vi.fn().mockResolvedValue('copied')

    expect(
      await sharePostcardImage(
        {
          blob: new Blob(['png'], { type: 'image/png' }),
          title: 't',
          text: 'letter',
          url: 'https://example.test/',
          clipboardText: 'letter\nhttps://example.test/',
        },
        shareLink,
      ),
    ).toBe('copied')
    expect(shareLink).toHaveBeenCalled()
  })
})
