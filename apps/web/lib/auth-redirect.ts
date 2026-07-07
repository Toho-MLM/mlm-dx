const REDIRECT_STORAGE_KEY = 'mlm-dx.redirect-after-login'

type SearchParamsLike = {
  toString: () => string
}

export function sanitizeRedirectPath(value: string | null | undefined): string | null {
  if (!value) return null

  let decodedValue = value
  try {
    decodedValue = decodeURIComponent(value)
  } catch {
    decodedValue = value
  }

  if (!decodedValue.startsWith('/') || decodedValue.startsWith('//')) return null

  try {
    const url = new URL(decodedValue, 'https://mlm-dx.local')
    if (url.origin !== 'https://mlm-dx.local') return null
    if (url.pathname === '/login' || url.pathname.startsWith('/auth/callback')) return null

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function getRedirectPath(pathname: string | null, searchParams?: SearchParamsLike | null): string | null {
  if (!pathname) return null

  const query = searchParams?.toString()
  return sanitizeRedirectPath(query ? `${pathname}?${query}` : pathname)
}

export function getLoginPath(pathname: string | null, searchParams?: SearchParamsLike | null): string {
  const redirectPath = getRedirectPath(pathname, searchParams)
  if (!redirectPath) return '/login'

  return `/login?redirect=${encodeURIComponent(redirectPath)}`
}

export function storeRedirectPath(path: string | null | undefined): string | null {
  const redirectPath = sanitizeRedirectPath(path)
  if (!redirectPath || typeof window === 'undefined') return redirectPath

  window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, redirectPath)
  return redirectPath
}

export function getStoredRedirectPath(): string | null {
  if (typeof window === 'undefined') return null

  const redirectPath = sanitizeRedirectPath(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY))
  if (!redirectPath) {
    window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY)
  }
  return redirectPath
}

export function clearStoredRedirectPath() {
  if (typeof window === 'undefined') return

  window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY)
}

export function consumeStoredRedirectPath(fallback: string = '/'): string {
  const redirectPath = getStoredRedirectPath()
  clearStoredRedirectPath()

  return redirectPath || fallback
}
