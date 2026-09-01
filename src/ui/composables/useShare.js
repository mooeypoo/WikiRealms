import { ref } from 'vue';

/**
 * useShare - Handle sharing functionality
 * Generates shareable URLs and manages clipboard operations
 */
export const useShare = () => {
  const toastMessage = ref('');
  const toastVisible = ref(false);

  /**
   * Generate a share URL for a specific article (current session only, no history)
   */
  const generateShareUrl = (articleTitle) => {
    if (!articleTitle) return '';
    const baseUrl = window.location.origin;
    const params = new URLSearchParams();
    params.set('article', articleTitle);
    return `${baseUrl}?${params.toString()}`;
  };

  /**
   * Copy text to clipboard and show toast
   */
  const copyToClipboard = async (text, message = 'Copied!') => {
    try {
      // Try modern Clipboard API first
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      showToast(message);
      return true;
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      showToast('Failed to copy', 'error');
      return false;
    }
  };

  /**
   * Share current article
   */
  const shareArticle = async (articleTitle) => {
    const shareUrl = generateShareUrl(articleTitle);

    // Try navigator.share API first (native share on mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'WikiRealms',
          text: `Explore ${articleTitle} as a world on WikiRealms`,
          url: shareUrl,
        });
        return;
      } catch (err) {
        // User cancelled or error; fall through to clipboard
        if (err.name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    }

    // Fallback: copy to clipboard
    await copyToClipboard(shareUrl, 'Link copied!');
  };

  /**
   * Show toast notification
   */
  const showToast = (message, type = 'success') => {
    toastMessage.value = message;
    toastVisible.value = true;

    // Auto-hide after 2 seconds
    setTimeout(() => {
      toastVisible.value = false;
    }, 2000);
  };

  /**
   * Hide toast manually
   */
  const hideToast = () => {
    toastVisible.value = false;
  };

  return {
    toastMessage,
    toastVisible,
    generateShareUrl,
    copyToClipboard,
    shareArticle,
    showToast,
    hideToast,
  };
};
