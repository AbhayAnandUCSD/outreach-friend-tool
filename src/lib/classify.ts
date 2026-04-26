// Routes a (DbRow, scored candidates) pair into either an auto-decided
// Resolution or a ReviewItem the friend must adjudicate.

import type { Candidate, DbRow, Resolution, ReviewItem } from './types'

export type ClassifyResult =
  | { kind: 'auto'; resolution: Resolution }
  | { kind: 'review'; item: ReviewItem }

// Score thresholds — calibrated for the name-centric scoring (no dept/title
// data from the directory for most schools). See scoring.ts.
const VERIFIED_SCORE = 30      // existing-email match (instant lock)
const STRONG_SCORE  = 25       // full-name token equality
const ACCEPT_GAP    = 10       // gap to runner-up needed for auto-pick
const SCORE_FLOOR   = 5        // below this = treat as no real match

function isResolution(x: ClassifyResult): x is { kind: 'auto'; resolution: Resolution } {
  return x.kind === 'auto'
}

void isResolution  // satisfy the unused-locals linter; kept for future readers

export function classify(row: DbRow, ranked: Candidate[], domain: string): ClassifyResult {
  const top3 = ranked.slice(0, 3)
  const hasDbEmail = Boolean(row.current_email)
  const dbConf = (row.current_email_confidence || '').toLowerCase()

  // No usable hits at all
  if (ranked.length === 0) {
    return {
      kind: 'auto',
      resolution: { researcher_id: row.researcher_id, decision: 'no_hit' },
    }
  }

  const top = ranked[0]!
  const second = ranked[1]
  const gap = second ? top.score - second.score : Infinity

  const sourceTag = `workspace_directory_${domain}`

  // Top is an exact email match to what we have — this is a verification.
  if (hasDbEmail && top.email.toLowerCase() === row.current_email.toLowerCase()) {
    return {
      kind: 'auto',
      resolution: {
        researcher_id: row.researcher_id,
        decision: 'verified',
        email: row.current_email,
        source: `${row.current_email_source || 'unknown'}+verified_directory`,
        score: VERIFIED_SCORE,
        confidence: 'high',
      },
    }
  }

  // Strong-score candidates (full-name match, etc.). Decide based on whether
  // this is a single clear winner or a same-name pile.
  if (top.score >= STRONG_SCORE) {
    const strongPeers = ranked.filter(c => c.score >= STRONG_SCORE)
    const isSingleClearWinner = strongPeers.length === 1 || gap >= ACCEPT_GAP

    if (isSingleClearWinner) {
      if (!hasDbEmail) {
        return {
          kind: 'auto',
          resolution: {
            researcher_id: row.researcher_id,
            decision: 'auto_accept',
            email: top.email,
            source: sourceTag,
            score: top.score,
            confidence: 'high',
          },
        }
      }
      // DB has an email but directory disagrees. Auto-replace only if the
      // existing email is low-confidence; otherwise friend review.
      if (dbConf === 'pattern_guess' || dbConf === 'low' || dbConf === '') {
        return {
          kind: 'auto',
          resolution: {
            researcher_id: row.researcher_id,
            decision: 'auto_replace',
            email: top.email,
            source: sourceTag,
            score: top.score,
            confidence: 'high',
            old_email: row.current_email,
            old_source: row.current_email_source,
            old_confidence: row.current_email_confidence,
          },
        }
      }
      return {
        kind: 'review',
        item: { row, candidates: top3, reason: 'high_conf_conflict' },
      }
    }

    // Multiple strong-score candidates. If their display_names are
    // identical (5× "Aarya Patel"), the friend has no signal in-browser to
    // disambiguate — kick to operator-side LLM triage. If display_names
    // differ ("Aaron Smith" vs "A. Smith"), friend can probably tell.
    const displayNames = new Set(
      strongPeers.map(c => c.display_name.trim().toLowerCase()).filter(Boolean),
    )
    if (displayNames.size <= 1) {
      return {
        kind: 'auto',
        resolution: {
          researcher_id: row.researcher_id,
          decision: 'operator_review',
          candidates: strongPeers.slice(0, 5),
        },
      }
    }
    return {
      kind: 'review',
      item: { row, candidates: top3, reason: 'multi_hit' },
    }
  }

  // Below STRONG_SCORE. Last-name-only matches and similar weak signals.
  if (top.score < SCORE_FLOOR) {
    return {
      kind: 'auto',
      resolution: { researcher_id: row.researcher_id, decision: 'no_hit' },
    }
  }

  // Weak match — friend confirms.
  const reason: ReviewItem['reason'] =
    hasDbEmail
      ? (dbConf === 'high' ? 'high_conf_conflict' : 'low_conf_conflict')
      : (top3.length > 1 ? 'multi_hit' : 'weak_score')

  return {
    kind: 'review',
    item: { row, candidates: top3, reason },
  }
}

/**
 * Build the final Resolution from a friend's choice on a ReviewItem.
 * `pickIndex`: 0..n-1 to accept that candidate; -1 for "none of these"; -2 for "skip → operator".
 */
export function applyReviewChoice(
  item: ReviewItem,
  pickIndex: number,
  domain: string,
  note?: string,
): Resolution {
  const { row, candidates } = item
  const sourceTag = `workspace_directory_${domain}+friend_disambiguated`

  if (pickIndex === -2) {
    return {
      researcher_id: row.researcher_id,
      decision: 'operator_review',
      candidates,
      friend_note: note,
    }
  }
  if (pickIndex === -1) {
    return {
      researcher_id: row.researcher_id,
      decision: 'no_hit',
      friend_note: note,
    }
  }
  const picked = candidates[pickIndex]
  if (!picked) {
    // Defensive: out-of-range index → treat like skip
    return {
      researcher_id: row.researcher_id,
      decision: 'skip',
      candidates,
      friend_note: note,
    }
  }
  if (row.current_email && picked.email.toLowerCase() !== row.current_email.toLowerCase()) {
    return {
      researcher_id: row.researcher_id,
      decision: 'friend_picked',
      email: picked.email,
      source: sourceTag,
      score: picked.score,
      confidence: 'high',
      old_email: row.current_email,
      old_source: row.current_email_source,
      old_confidence: row.current_email_confidence,
      friend_note: note,
    }
  }
  return {
    researcher_id: row.researcher_id,
    decision: 'friend_picked',
    email: picked.email,
    source: sourceTag,
    score: picked.score,
    confidence: 'high',
    friend_note: note,
  }
}
