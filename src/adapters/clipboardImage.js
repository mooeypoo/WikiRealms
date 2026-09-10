/**
 * Rasterize an in-DOM SVG to a PNG blob, then hand it to the clipboard or
 * a download. Lives in adapters/ — canvas, ClipboardItem, and object URLs
 * are platform surface, not presentation.
 *
 * Fonts: the SVG should set font-family explicitly. When the card is inline
 * in a page that already loaded Space Grotesk / IBM Plex Mono, preview is
 * correct; the PNG pass re-serializes the SVG, so we inject an @import for
 * those faces before drawing. If the import fails (offline), the stack
 * falls back to Helvetica / monospace — still readable.
 */

const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');"

/**
 * @param {SVGSVGElement} svgEl
 * @param {{ scale?: number }} [options]
 * @returns {Promise<Blob>}
 */
export async function pngBlobFromSvg(svgEl, { scale = 2 } = {}) {
  if (!svgEl || typeof XMLSerializer === 'undefined') {
    throw new Error('No SVG to rasterize')
  }

  const viewBox = svgEl.viewBox?.baseVal
  const width = viewBox?.width || Number(svgEl.getAttribute('width')) || 840
  const height = viewBox?.height || Number(svgEl.getAttribute('height')) || 1100

  const clone = svgEl.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  // Ensure the serialized SVG can resolve the same faces the live preview uses.
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = FONT_IMPORT
  clone.insertBefore(style, clone.firstChild)

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* offline / unsupported — proceed with fallbacks */
    }
  }

  const xml = new XMLSerializer().serializeToString(clone)
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))

  try {
    const image = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.fillStyle = '#05070d'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = await canvasToPng(canvas)
    if (!blob) throw new Error('Could not encode PNG')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * @param {Blob} blob
 * @returns {Promise<'copied'|'failed'>}
 */
export async function copyImageBlob(blob) {
  if (!blob || typeof navigator === 'undefined') return 'failed'

  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      // Safari wants a Promise-wrapped blob; Chromium accepts either.
      const item = new ClipboardItem({ [blob.type]: Promise.resolve(blob) })
      await navigator.clipboard.write([item])
      return 'copied'
    }
  } catch {
    /* fall through */
  }
  return 'failed'
}

/**
 * @param {Blob} blob
 * @param {string} [filename]
 */
export function downloadBlob(blob, filename = 'wikirealms-expedition.png') {
  if (!blob || typeof document === 'undefined') return false
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoke after the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return true
}

/**
 * Prefer sharing a PNG file when the platform allows it; otherwise share
 * the text letter + URL (same as shareLink).
 *
 * @param {{ blob: Blob, filename?: string, title: string, text: string, url: string, clipboardText?: string }} payload
 * @param {(args: object) => Promise<'shared'|'copied'|'failed'>} shareLink
 * @returns {Promise<'shared'|'copied'|'failed'>}
 */
export async function sharePostcardImage(payload, shareLink) {
  const { blob, filename = 'wikirealms-expedition.png', title, text, url, clipboardText } = payload
  if (blob && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
    try {
      const file = new File([blob], filename, { type: blob.type || 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text, url })
        return 'shared'
      }
    } catch (error) {
      if (error?.name === 'AbortError') return 'shared'
    }
  }
  return shareLink({ title, text, url, clipboardText })
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load SVG for rasterize'))
    image.src = url
  })
}

function canvasToPng(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}
