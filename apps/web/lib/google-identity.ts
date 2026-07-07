const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services'
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

export type GoogleCredentialResponse = {
  credential?: string
  select_by?: string
}

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string
        callback: (response: GoogleCredentialResponse) => void
        auto_select?: boolean
        cancel_on_tap_outside?: boolean
      }) => void
      prompt: () => void
      cancel: () => void
      disableAutoSelect: () => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentity
  }
}

let googleIdentityScriptPromise: Promise<void> | null = null

export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Identity Services requires a browser'))
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve()
  }

  if (googleIdentityScriptPromise) {
    return googleIdentityScriptPromise
  }

  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = GOOGLE_IDENTITY_SCRIPT_ID
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })

  return googleIdentityScriptPromise
}

export async function disableGoogleAutoSelect(): Promise<void> {
  try {
    await loadGoogleIdentityScript()
    window.google?.accounts.id.disableAutoSelect()
  } catch (error) {
    console.error('Failed to disable Google auto select:', error)
  }
}
