import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetKeymap } from '../../../src/ui/design/useKeymap.js'
import { close, closeAll, open, resetOverlays, useOverlays } from '../../../src/ui/design/useOverlays.js'

beforeEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

afterEach(() => {
  resetOverlays()
  resetKeymap()
})

function pressEscape(target = document.body) {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  Object.defineProperty(event, 'target', { value: target })
  window.dispatchEvent(event)
}

function focusableButton(id) {
  const button = document.createElement('button')
  button.id = id
  document.body.appendChild(button)
  return button
}

describe('useOverlays', () => {
  it('opens one surface at a time by default', () => {
    // "One summon at a time" (§3): opening settings while the guide is open
    // replaces it rather than stacking two peers over the world.
    const { stack, isOpen } = useOverlays()

    open('guide')
    open('settings')

    expect(stack.value.map((entry) => entry.id)).toEqual(['settings'])
    expect(isOpen('guide')).toBe(false)
  })

  it('layers when a surface explicitly asks to', () => {
    const { stack, isTopmost } = useOverlays()

    open('settings')
    open('confirm-reset', { exclusive: false })

    expect(stack.value.map((entry) => entry.id)).toEqual(['settings', 'confirm-reset'])
    expect(isTopmost('confirm-reset')).toBe(true)
    expect(isTopmost('settings')).toBe(false)
  })

  it('closes the topmost surface on Escape, one layer at a time', () => {
    const { stack } = useOverlays()

    open('settings')
    open('confirm-reset', { exclusive: false })

    pressEscape()
    expect(stack.value.map((entry) => entry.id)).toEqual(['settings'])

    pressEscape()
    expect(stack.value).toEqual([])
  })

  it('closes on Escape even while a field inside it has focus', () => {
    const { stack } = useOverlays()
    open('search')

    const input = document.createElement('input')
    document.body.appendChild(input)
    pressEscape(input)

    expect(stack.value).toEqual([])
  })

  it('leaves a non-dismissible surface alone on Escape', () => {
    const { stack } = useOverlays()

    open('travelling', { dismissible: false })
    pressEscape()

    expect(stack.value.map((entry) => entry.id)).toEqual(['travelling'])
  })

  it('returns focus to wherever the viewer was', () => {
    const opener = focusableButton('opener')
    opener.focus()
    expect(document.activeElement).toBe(opener)

    open('settings')
    focusableButton('inside').focus()

    close('settings')

    expect(document.activeElement).toBe(opener)
  })

  it('does not throw when the element to restore has gone away', () => {
    const opener = focusableButton('opener')
    opener.focus()

    open('settings')
    opener.remove()

    expect(() => close('settings')).not.toThrow()
  })

  it('locks page scroll only while a modal surface is open', () => {
    open('ledger', { modal: false })
    expect(document.body.style.overflow).toBe('')

    open('settings', { exclusive: false })
    expect(document.body.style.overflow).toBe('hidden')

    close('settings')
    expect(document.body.style.overflow).toBe('')
  })

  it('notifies a surface when something else closes it', () => {
    const onClose = vi.fn()

    open('guide', { onClose })
    open('settings')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ignores a second open of the same surface', () => {
    const { depth } = useOverlays()

    open('settings')
    open('settings')

    expect(depth.value).toBe(1)
  })

  it('closes everything from the top down', () => {
    const order = []
    open('a', { onClose: () => order.push('a') })
    open('b', { exclusive: false, onClose: () => order.push('b') })
    open('c', { exclusive: false, onClose: () => order.push('c') })

    closeAll()

    expect(order).toEqual(['c', 'b', 'a'])
  })

  it('stops listening for Escape once nothing is open', () => {
    // The listener is attached lazily and released again, so a bare Escape
    // never reaches an empty stack.
    open('settings')
    close('settings')

    expect(() => pressEscape()).not.toThrow()
    expect(useOverlays().depth.value).toBe(0)
  })
})
