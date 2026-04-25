export type School = {
  slug: string
  name: string
  domain: string
  count: number
  csv: string
  generated_at: string
}

export type DbRow = {
  researcher_id: number
  name: string
  first_name: string
  last_name: string
  role: string
  lab_name: string
  current_email: string
  current_email_source: string
  current_email_confidence: string
  profile_url: string
  image_url: string
}

export type Candidate = {
  email: string
  department: string
  title: string
  photo_url: string
  display_name: string
  score: number
}

export type Decision =
  | 'auto_accept'
  | 'auto_replace'
  | 'verified'
  | 'friend_picked'
  | 'operator_review'
  | 'no_hit'
  | 'skip'

export type Resolution = {
  researcher_id: number
  decision: Decision
  email?: string
  source?: string
  score?: number
  confidence?: 'high' | 'medium' | 'low'
  old_email?: string
  old_source?: string
  old_confidence?: string
  candidates?: Candidate[]
  friend_note?: string
}

export type ReviewItem = {
  row: DbRow
  candidates: Candidate[]
  reason: 'multi_hit' | 'weak_score' | 'high_conf_conflict' | 'low_conf_conflict'
}

export type ResolveBuckets = {
  auto: Resolution[]              // already-decided (auto_accept, auto_replace, verified, no_hit)
  needs_review: ReviewItem[]
}
