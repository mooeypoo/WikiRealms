import { ref } from 'vue'
import { copyText, shareLink } from '../../adapters/shareTarget.js'
import { realmUrl } from '../../adapters/urlState.js'

/**
 * Sharing, as the UI sees it: a link, and a word about what happened.
 *
 * The platform work — navigator.share, the clipboard, the legacy fallback —
 * moved to adapters/shareTarget.js, and the link itself now comes from
 * adapters/urlState.js, which is also what READS it on arrival.
 *
 * Graphic trail postcards live in TrailPostcard.vue (SVG preview + image
 * copy); this composable keeps the simple realm-link path and the toast.
 */
export function useShare() {
  const toastMessage = ref('')
  const toastVisible = ref(false)
  let hideTimer = null

  function showToast(message) {
    toastMessage.value = message
    toastVisible.value = true
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      toastVisible.value = false
    }, 2600)
  }

  function hideToast() {
    clearTimeout(hideTimer)
    toastVisible.value = false
  }

  async function shareArticle(title) {
    if (!title) return

    const outcome = await shareLink({
      title: 'WikiRealms',
      text: `Explore ${title} as a world on WikiRealms`,
      url: realmUrl(title),
    })

    // A native share sheet already told the viewer what happened; saying so
    // again over the top of it is noise.
    if (outcome === 'copied') showToast('Link copied')
    else if (outcome === 'failed') showToast('Could not share that link')
  }

  async function copyLink(title) {
    if (!title) return
    showToast((await copyText(realmUrl(title))) ? 'Link copied' : 'Could not copy that link')
  }

  return { toastMessage, toastVisible, shareArticle, copyLink, showToast, hideToast }
}
