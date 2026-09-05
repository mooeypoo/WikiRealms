import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeCombo, registerBinding, resetKeymap, useKeymap } from '../../../src/ui/design/useKeymap.js'

afterEach(() => resetKeymap())

function press(key, { target = document.body, ...modifiers } = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers })
  Object.defineProperty(event, 'target', { value: target })
  window.dispatchEvent(event)
  return event
}

function field(tag = 'input') {
  const element = document.createElement(tag)
  document.body.appendChild(element)
  return element
}

describe('useKeymap', () => {
  it('normalizes combos so a binding is declared one way only', () => {
    expect(normalizeCombo('Mod+K')).toBe('mod+k')
    expect(normalizeCombo('shift+mod+p')).toBe('mod+shift+p')
    expect(normalizeCombo(' Escape ')).toBe('escape')
  })

  it('runs a binding when its key is pressed', () => {
    const run = vi.fn()
    registerBinding({ keys: 'h', run })

    press('h')

    expect(run).toHaveBeenCalledOnce()
  })

  it('matches a shifted printable key by its character', () => {
    // "?" arrives as key "?" with shiftKey set. Folding shift into the combo
    // would produce 'shift+?', which no declaration would ever match — and
    // "?" for help is the most conventional shortcut there is.
    const run = vi.fn()
    registerBinding({ keys: '?', run })

    press('?', { shiftKey: true })

    expect(run).toHaveBeenCalledOnce()
  })

  it('still distinguishes shift on a named key', () => {
    const plain = vi.fn()
    const shifted = vi.fn()
    registerBinding({ keys: 'tab', run: plain })
    registerBinding({ keys: 'shift+tab', run: shifted })

    press('Tab', { shiftKey: true })

    expect(shifted).toHaveBeenCalledOnce()
    expect(plain).not.toHaveBeenCalled()
  })

  it('does not fire a bare-letter shortcut while the viewer is typing', () => {
    const run = vi.fn()
    registerBinding({ keys: 'h', run })

    press('h', { target: field() })

    expect(run).not.toHaveBeenCalled()
  })

  it('fires a binding marked allowInField even in a text field', () => {
    // Escape has to work inside a search box, or the viewer is trapped.
    const run = vi.fn()
    registerBinding({ keys: 'escape', run, allowInField: true })

    press('Escape', { target: field() })

    expect(run).toHaveBeenCalledOnce()
  })

  it('treats contenteditable as typing too', () => {
    const run = vi.fn()
    registerBinding({ keys: 'h', run })

    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    document.body.appendChild(editable)

    press('h', { target: editable })

    expect(run).not.toHaveBeenCalled()
  })

  it('gives the highest priority binding the key', () => {
    const order = []
    registerBinding({ keys: 'x', run: () => order.push('app'), priority: 0 })
    registerBinding({ keys: 'x', run: () => order.push('overlay'), priority: 10 })

    press('x')

    expect(order).toEqual(['overlay'])
  })

  it('passes the key on when a binding declines it', () => {
    const order = []
    registerBinding({ keys: 'x', run: () => order.push('app'), priority: 0 })
    registerBinding({
      keys: 'x',
      priority: 10,
      run: () => {
        order.push('overlay')
        return false
      },
    })

    press('x')

    expect(order).toEqual(['overlay', 'app'])
  })

  it('skips a binding that is currently disabled', () => {
    const run = vi.fn()
    registerBinding({ keys: 'h', run, enabled: () => false })

    press('h')

    expect(run).not.toHaveBeenCalled()
  })

  it('stops firing once unregistered', () => {
    const run = vi.fn()
    const release = registerBinding({ keys: 'h', run })

    release()
    press('h')

    expect(run).not.toHaveBeenCalled()
  })

  it('is the single source for the shortcut list', () => {
    // The help modal used to restate shortcuts by hand and had drifted. It
    // now renders this, so a binding and its documentation cannot disagree.
    registerBinding({ keys: 'h', run: () => {}, label: 'Hide interface', group: 'View' })
    registerBinding({ keys: ['?', 'i'], run: () => {}, label: 'Open the field guide', group: 'View' })
    registerBinding({ keys: 'mod+k', run: () => {}, label: 'Search', group: 'Navigation' })
    registerBinding({ keys: 'ArrowLeft', run: () => {} }) // unlabelled: internal

    const { shortcuts } = useKeymap()

    expect(shortcuts.value).toEqual([
      {
        group: 'View',
        items: [
          { keys: ['h'], label: 'Hide interface' },
          { keys: ['?', 'i'], label: 'Open the field guide' },
        ],
      },
      { group: 'Navigation', items: [{ keys: ['mod+k'], label: 'Search' }] },
    ])
  })
})
