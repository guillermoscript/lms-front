const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

/**
 * Accept only same-origin relative paths for post-auth navigation.
 *
 * Checking both the raw and decoded values prevents protocol-relative paths
 * and encoded backslashes from becoming cross-origin redirects after another
 * decoding or URL-normalization step.
 */
export function getSafeNextPath(value: string | null | undefined, fallback = '/') {
  if (!value) return fallback

  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return fallback
  }

  const isUnsafe =
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    decoded.startsWith('//') ||
    decoded.includes('\\') ||
    CONTROL_CHARACTERS.test(decoded)

  return isUnsafe ? fallback : value
}
