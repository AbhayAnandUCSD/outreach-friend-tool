// Score one directory candidate against one DB row. Higher = more likely
// the same person.
//
// Empirical note: third-party OAuth apps querying the People API only get
// `name` + `email` for most Workspace tenants. `organizations` (department,
// title) and `photos` come back empty. So the original dept/title/photo
// signals were dead weight and silently rejected almost every real hit by
// stranding the score at +5 (last-name baseline). This rewrite leans on
// name-token comparisons and the email local-part instead.

import type { Candidate, DbRow } from './types'

const STOPWORDS = new Set([
  'jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'dr',
])

function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(t => t && !STOPWORDS.has(t))
}

function dbNameTokens(row: DbRow): string[] {
  return tokenize(row.name || `${row.first_name} ${row.last_name}`)
}

function candidateNameTokens(c: Candidate): string[] {
  return tokenize(c.display_name)
}

function hasLastNameOverlap(row: DbRow, candidate: Candidate): boolean {
  const dbLast = (row.last_name || '').trim().toLowerCase()
  const candTokens = new Set(candidateNameTokens(candidate))
  if (dbLast) {
    return tokenize(dbLast).some(t => candTokens.has(t))
  }
  // Fall back to last token of full name
  const fallback = dbNameTokens(row).pop()
  return fallback ? candTokens.has(fallback) : false
}

function fullNameEqual(row: DbRow, candidate: Candidate): boolean {
  const dbToks = new Set(dbNameTokens(row).filter(t => t.length > 1))
  const cToks  = new Set(candidateNameTokens(candidate).filter(t => t.length > 1))
  if (dbToks.size === 0 || cToks.size === 0) return false
  // Bidirectional subset: every meaningful token on each side appears on
  // the other. Allows ordering differences ("Jane Q. Doe" ≡ "Doe, Jane Q")
  // but rejects extra surnames or different first names.
  for (const t of dbToks) if (!cToks.has(t)) return false
  for (const t of cToks) if (!dbToks.has(t)) return false
  return true
}

function firstAndLastMatch(row: DbRow, candidate: Candidate): boolean {
  const first = (row.first_name || '').trim().toLowerCase()
  const last  = (row.last_name  || '').trim().toLowerCase()
  if (!first || !last) return false
  const cTokens = new Set(candidateNameTokens(candidate))
  const firstHit = tokenize(first).some(t => cTokens.has(t))
  const lastHit  = tokenize(last).some(t => cTokens.has(t))
  return firstHit && lastHit
}

function emailLocalContainsLastName(row: DbRow, candidate: Candidate): boolean {
  const last = (row.last_name || '').trim().toLowerCase()
  if (!last) return false
  const local = (candidate.email.split('@')[0] || '').toLowerCase()
  if (!local) return false
  return tokenize(last).some(t => t.length >= 3 && local.includes(t))
}

export function scoreCandidate(row: DbRow, candidate: Candidate): number {
  if (!hasLastNameOverlap(row, candidate)) return Number.NEGATIVE_INFINITY

  let score = 5  // baseline for last-name match

  if (row.current_email && candidate.email
      && row.current_email.toLowerCase() === candidate.email.toLowerCase()) {
    score += 30
  }

  if (fullNameEqual(row, candidate)) {
    score += 25
  } else if (firstAndLastMatch(row, candidate)) {
    score += 15
  }

  if (emailLocalContainsLastName(row, candidate)) {
    score += 5
  }

  return score
}

export function scoreAll(row: DbRow, candidates: Candidate[]): Candidate[] {
  return candidates
    .map(c => ({ ...c, score: scoreCandidate(row, c) }))
    .filter(c => c.score !== Number.NEGATIVE_INFINITY)
    .sort((a, b) => b.score - a.score)
}
