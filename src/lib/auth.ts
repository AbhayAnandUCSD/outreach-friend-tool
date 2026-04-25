// Google Identity Services (GIS) token client. Pops a Google sign-in window,
// returns an access_token to call People API directly from the browser.
//
// Token is held in module state and exposed via getToken/onTokenChange. It
// is never persisted (refresh by re-calling signIn).

const SCOPE = 'https://www.googleapis.com/auth/directory.readonly openid email profile'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

type PendingResolver = {
  resolve: (v: { token: string; email: string; domain: string }) => void
  reject: (e: Error) => void
}

let tokenClient: google.accounts.oauth2.TokenClient | null = null
let currentToken: string | null = null
let currentEmail: string | null = null
let currentDomain: string | null = null
let pending: PendingResolver | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach(fn => fn())
}

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

export function getToken(): string | null {
  return currentToken
}

export function getIdentity(): { email: string | null; domain: string | null } {
  return { email: currentEmail, domain: currentDomain }
}

export function onIdentityChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function ensureClient(): google.accounts.oauth2.TokenClient {
  if (!CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not set. See README.')
  }
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: handleTokenResponse,
    })
  }
  return tokenClient
}

async function handleTokenResponse(resp: google.accounts.oauth2.TokenResponse) {
  const p = pending
  pending = null
  if (!p) return
  if (resp.error || !resp.access_token) {
    p.reject(new Error(resp.error_description || resp.error || 'sign-in failed'))
    return
  }
  const token = resp.access_token
  currentToken = token
  try {
    const userinfo = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()) as { email?: string; hd?: string }
    currentEmail = userinfo.email ?? null
    currentDomain = userinfo.hd ?? (userinfo.email?.split('@')[1] ?? null)
  } catch {
    currentEmail = null
    currentDomain = null
  }
  notify()
  p.resolve({
    token,
    email: currentEmail ?? '',
    domain: currentDomain ?? '',
  })
}

export function signIn(): Promise<{ token: string; email: string; domain: string }> {
  return new Promise((resolve, reject) => {
    let client: google.accounts.oauth2.TokenClient
    try {
      client = ensureClient()
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)))
      return
    }
    if (pending) {
      pending.reject(new Error('superseded by new sign-in'))
    }
    pending = { resolve, reject }
    client.requestAccessToken({ prompt: '' })
  })
}

export function signOut() {
  if (currentToken) {
    google.accounts.oauth2.revoke(currentToken, () => { /* noop */ })
  }
  currentToken = null
  currentEmail = null
  currentDomain = null
  notify()
}
