/**
 * Handing a link to the outside world: the platform's share sheet where
 * there is one, the clipboard otherwise.
 *
 * Lives in adapters/ because it is entirely platform surface — navigator,
 * the clipboard, a DOM fallback. It used to sit in a UI composable, which
 * put browser plumbing in the presentation layer and, more practically, made
 * it impossible to test the sharing decision without mounting something.
 */

/**
 * @returns {Promise<'shared'|'copied'|'failed'>} what actually happened, so
 *   the caller can say so — a native share needs no toast, a copy does.
 */
export async function shareLink({ title, text, url }) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (error) {
      // A viewer dismissing the share sheet is not a failure; anything else
      // falls through to the clipboard rather than dead-ending.
      if (error?.name === 'AbortError') return 'shared'
    }
  }

  return (await copyText(url)) ? 'copied' : 'failed'
}

export async function copyText(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    return legacyCopy(text)
  } catch {
    return false
  }
}

/** For browsers without the async clipboard API, and for insecure origins. */
function legacyCopy(text) {
  if (typeof document === 'undefined') return false

  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}
