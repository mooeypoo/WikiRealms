/**
 * Single source of truth for the app's own identity — used to build a
 * valid User-Agent for Wikimedia API requests (required by MediaWiki's
 * API:Etiquette — requests must identify the client with contact info)
 * and to stamp exported snapshots. Bump APP_VERSION here only; nothing
 * else should hardcode it.
 */
export const APP_NAME = 'WikiRealms'
export const APP_VERSION = '0.1.0'
export const APP_REPOSITORY_URL = 'https://github.com/mooeypoo/WikiRealms'

/**
 * User-Agent identifying this app to Wikimedia APIs. Browsers block
 * scripts from setting the real `User-Agent` header, so this must be
 * sent via the `Api-User-Agent` header instead — MediaWiki's documented
 * workaround for browser-based JS clients (see API:Etiquette).
 */
export const WIKIMEDIA_USER_AGENT = `${APP_NAME}/${APP_VERSION} (${APP_REPOSITORY_URL})`
