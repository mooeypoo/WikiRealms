import { computed, getCurrentInstance, onUnmounted, ref } from 'vue'
import { escapeHtml, t } from '../i18n/banana.js'

/**
 * One keyboard registry for the whole app.
 *
 * The first-pass UI had two independent keydown listeners — useUIState bound
 * bare s/i/?/Escape while App.vue bound h/arrows/1/3 — so neither could see
 * the other's bindings, Escape reached only two of the four dismissible
 * surfaces, and the shortcut list in the help modal was maintained by hand
 * and had already drifted from the code.
 *
 * Here every binding is declared once, with the label it should be shown
 * under, and the Field Guide renders `shortcuts` rather than restating them.
 * A shortcut that is not in this registry does not exist.
 *
 * `label` and `group` are banana message keys (resolved when the Field Guide
 * lists them) so a locale switch updates the list without re-registering.
 */

const bindings = ref([])
let nextId = 0
let detach = null

const FIELD_SELECTOR = 'input, textarea, select'

/** Typing must never trigger a bare-letter shortcut. */
function isTypingTarget(target) {
  if (!target || typeof target.closest !== 'function') return false
  if (target.isContentEditable) return true
  return Boolean(target.closest(FIELD_SELECTOR))
}

/**
 * Canonical form of a key combination: lowercase, modifiers in a fixed
 * order, `mod` standing for Cmd on Apple platforms and Ctrl elsewhere so a
 * binding never has to be declared twice.
 */
export function normalizeCombo(combo) {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)

  const key = parts.pop()
  const modifiers = new Set(parts)
  const ordered = ['mod', 'ctrl', 'alt', 'shift'].filter((name) => modifiers.has(name))
  return [...ordered, key].join('+')
}

function isApplePlatform() {
  return /mac|iphone|ipad/i.test(globalThis.navigator?.platform ?? globalThis.navigator?.userAgent ?? '')
}

/**
 * Visible shortcut label. Always Latin / symbols from the binding — never
 * a translation string. Letter keys are US-QWERTY positions (KeyL is L
 * even when another layout prints a different character there).
 * @param {string} combo canonical combo from `normalizeCombo`
 * @param {{ apple?: boolean }} [options]
 */
export function formatKeyLabel(combo, { apple = isApplePlatform() } = {}) {
  const parts = normalizeCombo(combo).split('+')
  const named = {
    escape: 'Esc',
    arrowleft: '←',
    arrowright: '→',
    arrowup: '↑',
    arrowdown: '↓',
    mod: apple ? '⌘' : 'Ctrl',
    ctrl: 'Ctrl',
    alt: apple ? '⌥' : 'Alt',
    shift: apple ? '⇧' : 'Shift',
  }
  const shown = parts.map((part) => {
    if (named[part]) return named[part]
    if (part.length === 1) return part.toUpperCase()
    return part.charAt(0).toUpperCase() + part.slice(1)
  })
  // Apple modifier glyphs sit against the key (⌘K); everything else uses +.
  const glue = apple && parts.includes('mod') ? '' : '+'
  return shown.join(glue)
}

/** Isolated `<kbd>` wrapping `formatKeyLabel`, for HTML message placeholders. */
export function formatKeyHtml(combo, options) {
  return `<bdi><kbd>${escapeHtml(formatKeyLabel(combo, options))}</kbd></bdi>`
}

function letterFromCode(code) {
  const match = /^Key([A-Z])$/.exec(code ?? '')
  return match ? match[1].toLowerCase() : null
}

function comboFromKeyName(keyName, event) {
  const key = keyName.toLowerCase()
  const modifiers = []
  const isApple = isApplePlatform()
  const modPressed = isApple ? event.metaKey : event.ctrlKey
  if (modPressed) modifiers.push('mod')
  if (event.ctrlKey && !modPressed) modifiers.push('ctrl')
  if (event.altKey) modifiers.push('alt')
  if (event.shiftKey && key.length > 1) modifiers.push('shift')
  return [...modifiers, key].join('+')
}

/**
 * Combos this event should match: the character produced (`event.key`) and,
 * for letter keys, the physical US-QWERTY position (`event.code`). UI
 * language does not move the L key; a Hebrew layout still fires `l` from
 * KeyL.
 */
function combosFromEvent(event) {
  const combos = new Set([comboFromKeyName(event.key, event)])
  const letter = letterFromCode(event.code)
  if (letter) combos.add(comboFromKeyName(letter, event))
  return combos
}

function handleKeydown(event) {
  const pressed = combosFromEvent(event)
  const typing = isTypingTarget(event.target)

  const candidates = bindings.value
    .filter((binding) => binding.combos.some((combo) => pressed.has(combo)))
    .filter((binding) => binding.allowInField || !typing)
    .filter((binding) => binding.enabled())
    .sort((a, b) => b.priority - a.priority)

  for (const binding of candidates) {
    // Returning false lets a binding decline — the next candidate gets it,
    // which is how an overlay yields a key it cannot act on right now.
    if (binding.run(event) === false) continue
    if (binding.preventDefault) event.preventDefault()
    return
  }
}

function attach() {
  if (detach) return
  window.addEventListener('keydown', handleKeydown)
  detach = () => {
    window.removeEventListener('keydown', handleKeydown)
    detach = null
  }
}

function releaseIfIdle() {
  if (bindings.value.length === 0) detach?.()
}

/**
 * @param {object} binding
 * @param {string|string[]} binding.keys combos, e.g. 'mod+k' or ['?', 'i']
 * @param {() => void} binding.run
 * @param {string} [binding.label] banana key shown in the Field Guide; omit to hide
 * @param {string} [binding.group] banana key for the heading to list it under
 * @param {number} [binding.priority] higher wins; overlays sit above the app
 * @param {() => boolean} [binding.enabled]
 * @param {boolean} [binding.allowInField] fires even while typing (Escape)
 * @returns {() => void} unregister
 */
export function registerBinding({
  keys,
  run,
  label = null,
  group = 'wikirealms-keymap-group-general',
  priority = 0,
  enabled = () => true,
  allowInField = false,
  preventDefault = true,
}) {
  const combos = (Array.isArray(keys) ? keys : [keys]).map(normalizeCombo)
  const id = nextId++

  bindings.value = [...bindings.value, { id, combos, run, label, group, priority, enabled, allowInField, preventDefault }]
  attach()

  let released = false
  return () => {
    if (released) return
    released = true
    bindings.value = bindings.value.filter((binding) => binding.id !== id)
    releaseIfIdle()
  }
}

/**
 * Component-facing wrapper: bindings registered through it are released when
 * the component unmounts, so a surface cannot leave a live shortcut behind.
 */
export function useKeymap() {
  const owned = []
  const instance = getCurrentInstance()

  const register = (binding) => {
    const release = registerBinding(binding)
    owned.push(release)
    return release
  }

  if (instance) {
    onUnmounted(() => {
      for (const release of owned.splice(0)) release()
    })
  }

  /** Everything with a label, grouped — the Field Guide's only source. */
  const shortcuts = computed(() => {
    const groups = new Map()
    for (const binding of bindings.value) {
      if (!binding.label) continue
      const groupLabel = t(binding.group)
      if (!groups.has(groupLabel)) groups.set(groupLabel, [])
      groups.get(groupLabel).push({ keys: binding.combos, label: t(binding.label) })
    }
    return [...groups].map(([group, items]) => ({ group, items }))
  })

  return { register, shortcuts, bindings: computed(() => bindings.value) }
}

/** Test seam: drops every binding and the listener with them. */
export function resetKeymap() {
  bindings.value = []
  detach?.()
  nextId = 0
}
