// Score one directory candidate against one DB row. Higher = more likely
// the same person. Caller filters out candidates that don't share a
// last-name token (returns -Infinity).

import type { Candidate, DbRow } from './types'

const TITLE_ALIASES: Record<string, string[]> = {
  'phd student':   ['graduate student', 'phd', 'doctoral', 'phd candidate', 'graduate research assistant', 'gra'],
  'postdoc':       ['postdoctoral', 'post-doc', 'post doc', 'postdoctoral fellow', 'postdoctoral researcher', 'postdoctoral scholar'],
  'masters':       ['master', 'msc', 'm.s.'],
  'undergrad':     ['undergraduate', 'undergrad', 'b.s.', 'bachelor'],
  'faculty':       ['professor', 'lecturer', 'instructor', 'assistant professor', 'associate professor'],
  'research scientist': ['researcher', 'scientist'],
}

// Lab-name keywords that strongly signal a humanities/non-CS dept mismatch
const HARD_DEPT_MISMATCH = [
  'music', 'theatre', 'theater', 'religion', 'classics',
  'art history', 'philosophy', 'theology', 'dance', 'poetry',
]

function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
}

function hasLastNameOverlap(row: DbRow, candidate: Candidate): boolean {
  const dbLast = (row.last_name || '').trim().toLowerCase()
  if (!dbLast) {
    // Fall back to last token of full name
    const fallback = tokenize(row.name).pop() || ''
    if (!fallback) return false
    return tokenize(candidate.display_name).includes(fallback)
  }
  // Allow multi-word last names (e.g. "Van Houten")
  const dbLastTokens = tokenize(dbLast)
  const candTokens = new Set(tokenize(candidate.display_name))
  return dbLastTokens.some(t => candTokens.has(t))
}

function deptMatchesLab(department: string, labName: string): boolean {
  if (!department || !labName) return false
  const deptTokens = new Set(tokenize(department))
  const labTokens = tokenize(labName).filter(t => t.length > 2 && !STOPWORDS.has(t))
  // Lab names often contain a PI surname + "Lab" or "Group". Look for overlap
  // on the substantive content tokens.
  return labTokens.some(t => deptTokens.has(t))
    || (labName.toLowerCase().includes('comput') && department.toLowerCase().includes('comput'))
    || (labName.toLowerCase().includes('ai') && /artificial|machine learning|computer/i.test(department))
}

const STOPWORDS = new Set([
  'lab', 'group', 'laboratory', 'the', 'and', 'of', 'for', 'in', 'on',
  'a', 'an', 'university', 'department',
])

function titleMatchesRole(title: string, role: string): boolean {
  if (!title || !role) return false
  const t = title.toLowerCase()
  const r = role.toLowerCase()
  if (t.includes(r) || r.includes(t)) return true
  for (const [canon, aliases] of Object.entries(TITLE_ALIASES)) {
    if (r.includes(canon) || aliases.some(a => r.includes(a))) {
      if (t.includes(canon) || aliases.some(a => t.includes(a))) return true
    }
  }
  return false
}

function deptHardMismatch(department: string, labName: string): boolean {
  if (!department) return false
  const d = department.toLowerCase()
  const labTechy = /comput|engineer|robot|ai\b|machine|learn|vision|nlp|crypto|theory|systems|graphics/i.test(labName || '')
  if (!labTechy) return false
  return HARD_DEPT_MISMATCH.some(w => d.includes(w))
}

export function scoreCandidate(row: DbRow, candidate: Candidate): number {
  if (!hasLastNameOverlap(row, candidate)) return Number.NEGATIVE_INFINITY

  let score = 5  // baseline for last-name match

  if (row.current_email && candidate.email
      && row.current_email.toLowerCase() === candidate.email.toLowerCase()) {
    score += 30
  }

  if (deptMatchesLab(candidate.department, row.lab_name)) {
    score += 20
  } else if (deptHardMismatch(candidate.department, row.lab_name)) {
    score -= 20
  }

  if (titleMatchesRole(candidate.title, row.role)) {
    score += 15
  }

  return score
}

export function scoreAll(row: DbRow, candidates: Candidate[]): Candidate[] {
  return candidates
    .map(c => ({ ...c, score: scoreCandidate(row, c) }))
    .filter(c => c.score !== Number.NEGATIVE_INFINITY)
    .sort((a, b) => b.score - a.score)
}
