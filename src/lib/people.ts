// Calls Google People API `searchDirectoryPeople` directly from the browser
// using the friend's OAuth access token.
//
// Throttled to ~85 req/min (under the 90/min/user limit) via a serial queue.

import type { Candidate, DbRow } from './types'
import { getToken, signIn } from './auth'

const ENDPOINT = 'https://people.googleapis.com/v1/people:searchDirectoryPeople'
const READ_MASK = 'names,emailAddresses,organizations,photos'
const SOURCES = 'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'
const PAGE_SIZE = 20
const MIN_INTERVAL_MS = 720  // ~83 req/min, under 90/min cap

let lastCallAt = 0

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function throttle() {
  const now = Date.now()
  const elapsed = now - lastCallAt
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed)
  }
  lastCallAt = Date.now()
}

type RawPerson = {
  names?: { displayName?: string; givenName?: string; familyName?: string }[]
  emailAddresses?: { value?: string; type?: string }[]
  organizations?: { department?: string; title?: string; current?: boolean; name?: string }[]
  photos?: { url?: string; default?: boolean }[]
}

function pickEmail(p: RawPerson, domain?: string): string | null {
  const addrs = (p.emailAddresses ?? []).map(e => (e.value || '').trim()).filter(Boolean)
  if (!addrs.length) return null
  if (domain) {
    const onDomain = addrs.find(a => a.toLowerCase().endsWith(`@${domain.toLowerCase()}`))
    if (onDomain) return onDomain
  }
  return addrs[0] ?? null
}

function pickOrg(p: RawPerson): { department: string; title: string } {
  const orgs = p.organizations ?? []
  const current = orgs.find(o => o.current) ?? orgs[0]
  return {
    department: (current?.department || current?.name || '').trim(),
    title: (current?.title || '').trim(),
  }
}

function pickPhoto(p: RawPerson): string {
  const ph = (p.photos ?? []).find(x => !x.default) ?? (p.photos ?? [])[0]
  return ph?.url ?? ''
}

function pickName(p: RawPerson): string {
  return p.names?.[0]?.displayName ?? ''
}

export type SearchResult = {
  candidates: Candidate[]
  /** raw count returned by API, useful for debugging */
  raw_count: number
}

export async function searchPerson(row: DbRow, domain: string): Promise<SearchResult> {
  await throttle()

  const query = (row.name || '').trim()
  if (!query) return { candidates: [], raw_count: 0 }

  const url = new URL(ENDPOINT)
  url.searchParams.set('query', query)
  url.searchParams.set('readMask', READ_MASK)
  url.searchParams.set('sources', SOURCES)
  url.searchParams.set('pageSize', String(PAGE_SIZE))

  let token = getToken()
  if (!token) {
    const auth = await signIn()
    token = auth.token
  }

  console.debug('[people] token prefix:', token?.slice(0, 12), 'query:', query)

  let resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (resp.status === 401) {
    console.warn('[people] 401, retrying with fresh token')
    const auth = await signIn()
    resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
  }

  // Read body once, parse, and surface error JSON even if HTTP status is 200.
  const bodyText = await resp.text()
  let data: { people?: ({ person?: RawPerson } & RawPerson)[]; error?: { code?: number; message?: string; status?: string } }
  try {
    data = JSON.parse(bodyText)
  } catch {
    throw new Error(`People API ${resp.status} non-JSON body: ${bodyText.slice(0, 200)}`)
  }

  if (data.error) {
    console.error('[people] API error', { httpStatus: resp.status, error: data.error })
    throw new Error(`People API ${data.error.status || resp.status}: ${data.error.message}`)
  }

  if (!resp.ok) {
    throw new Error(`People API ${resp.status}: ${bodyText.slice(0, 200)}`)
  }
  // searchDirectoryPeople returns flat person objects; older docs/SDKs
  // sometimes wrap each in { person: ... } so accept both shapes.
  const people: RawPerson[] = (data.people ?? [])
    .map(p => (p && 'person' in p && p.person ? p.person : (p as unknown as RawPerson)))
    .filter((p): p is RawPerson => Boolean(p))

  const candidates: Candidate[] = []
  for (const p of people) {
    const email = pickEmail(p, domain)
    if (!email) continue
    const { department, title } = pickOrg(p)
    candidates.push({
      email,
      department,
      title,
      photo_url: pickPhoto(p),
      display_name: pickName(p),
      score: 0,  // filled by scoring step
    })
  }

  return { candidates, raw_count: people.length }
}
