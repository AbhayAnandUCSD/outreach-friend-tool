import { useEffect, useMemo, useState } from 'react'
import type { DbRow, Resolution, ResolveBuckets, ReviewItem, School } from '../lib/types'
import { getIdentity, isConfigured, onIdentityChange, signIn, signOut } from '../lib/auth'
import { loadSchoolCsv, downloadJson } from '../lib/csv'
import { searchPerson } from '../lib/people'
import { scoreAll } from '../lib/scoring'
import { applyReviewChoice, classify } from '../lib/classify'
import { ReviewCard } from './ReviewCard'

const BASE = import.meta.env.BASE_URL

type Phase = 'sign-in' | 'ready' | 'resolving' | 'reviewing' | 'done'

type Counters = {
  auto_accept: number
  auto_replace: number
  verified: number
  no_hit: number
  needs_review: number
  errors: number
}

function emptyCounters(): Counters {
  return { auto_accept: 0, auto_replace: 0, verified: 0, no_hit: 0, needs_review: 0, errors: 0 }
}

function bumpCounter(c: Counters, decision: string): Counters {
  switch (decision) {
    case 'auto_accept':  return { ...c, auto_accept:  c.auto_accept  + 1 }
    case 'auto_replace': return { ...c, auto_replace: c.auto_replace + 1 }
    case 'verified':     return { ...c, verified:     c.verified     + 1 }
    case 'no_hit':       return { ...c, no_hit:       c.no_hit       + 1 }
    default:             return c
  }
}

export function ResolvePanel({ school, onReset }: { school: School; onReset: () => void }) {
  const [phase, setPhase] = useState<Phase>('sign-in')
  const [identity, setIdentity] = useState(getIdentity())
  const [rows, setRows] = useState<DbRow[] | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [counters, setCounters] = useState<Counters>(emptyCounters())
  const [buckets, setBuckets] = useState<ResolveBuckets>({ auto: [], needs_review: [] })
  const [reviewIdx, setReviewIdx] = useState(0)
  const [reviewResults, setReviewResults] = useState<Resolution[]>([])
  const [error, setError] = useState<string | null>(null)
  const [limit30, setLimit30] = useState(false)

  // Subscribe to auth changes
  useEffect(() => {
    return onIdentityChange(() => setIdentity(getIdentity()))
  }, [])

  // Load CSV after sign-in
  useEffect(() => {
    if (!identity.email || rows) return
    let cancelled = false
    loadSchoolCsv(`${BASE}${school.csv}`)
      .then(loaded => {
        if (cancelled) return
        setRows(loaded)
        setProgress({ done: 0, total: loaded.length })
        setPhase('ready')
      })
      .catch(e => !cancelled && setError(`load csv: ${e}`))
    return () => { cancelled = true }
  }, [identity.email, school.csv, rows])

  const domainHint = useMemo(() => school.domain, [school])

  async function handleSignIn() {
    if (!isConfigured()) {
      setError('OAuth client not configured. Set VITE_GOOGLE_CLIENT_ID — see README.')
      return
    }
    try {
      await signIn()
    } catch (e) {
      setError(`sign-in: ${e}`)
    }
  }

  async function startResolve() {
    if (!rows) return
    const work = limit30 ? rows.slice(0, 30) : rows
    setPhase('resolving')
    setProgress({ done: 0, total: work.length })
    setCounters(emptyCounters())
    const buck: ResolveBuckets = { auto: [], needs_review: [] }
    let errs = 0
    for (let i = 0; i < work.length; i++) {
      const row = work[i]!
      try {
        const { candidates: raw } = await searchPerson(row, school.domain)
        const ranked = scoreAll(row, raw)
        const result = classify(row, ranked, school.domain)
        if (result.kind === 'auto') {
          buck.auto.push(result.resolution)
          const dec = result.resolution.decision
          setCounters(c => bumpCounter(c, dec))
        } else {
          buck.needs_review.push(result.item)
          setCounters(c => ({ ...c, needs_review: c.needs_review + 1 }))
        }
      } catch (e) {
        errs++
        console.error('resolve error', row.researcher_id, e)
      }
      setProgress({ done: i + 1, total: work.length })
    }
    setCounters(c => ({ ...c, errors: errs }))
    setBuckets(buck)
    if (buck.needs_review.length > 0) {
      setPhase('reviewing')
    } else {
      setPhase('done')
    }
  }

  function handleReviewPick(pickIdx: number) {
    const item: ReviewItem | undefined = buckets.needs_review[reviewIdx]
    if (!item) return
    const res = applyReviewChoice(item, pickIdx, school.domain)
    setReviewResults(rs => [...rs, res])
    if (reviewIdx + 1 >= buckets.needs_review.length) {
      setPhase('done')
    } else {
      setReviewIdx(reviewIdx + 1)
    }
  }

  function handleDownload() {
    const all = [...buckets.auto, ...reviewResults]
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    downloadJson(`decisions_${school.slug}_${stamp}.json`, all)
  }

  // Render

  if (error) {
    return (
      <div className="rounded-md border border-[var(--bad)]/40 bg-[var(--bad)]/10 p-4 text-sm">
        <div className="font-medium">Error</div>
        <div className="mt-1 text-[var(--ink-muted)]">{error}</div>
        <button
          onClick={() => { setError(null); onReset() }}
          className="mt-3 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--canvas-alt)]"
        >
          Start over
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">School</div>
          <div className="font-medium">{school.name} · @{domainHint}</div>
        </div>
        <div className="text-right">
          {identity.email ? (
            <>
              <div className="text-xs text-[var(--ink-muted)]">signed in as</div>
              <div className="font-mono text-xs">{identity.email}</div>
              <button
                onClick={() => { signOut(); onReset() }}
                className="mt-1 text-[10px] text-[var(--ink-muted)] underline"
              >
                sign out / change
              </button>
            </>
          ) : (
            <button
              onClick={handleSignIn}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0B1020] hover:bg-[var(--accent-strong)] hover:text-white"
            >
              Sign in with @{domainHint}
            </button>
          )}
        </div>
      </div>

      {phase === 'ready' && rows && (() => {
        const effective = limit30 ? Math.min(30, rows.length) : rows.length
        return (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6">
            <div className="text-sm">
              Loaded <span className="font-medium">{rows.length.toLocaleString()}</span> researchers from{' '}
              <span className="font-mono text-xs">{school.csv}</span>.
            </div>
            <div className="mt-1 text-xs text-[var(--ink-muted)]">
              About {Math.ceil((effective * 0.72) / 60)} min for {effective.toLocaleString()} lookups at the API rate limit.
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={limit30}
                onChange={e => setLimit30(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span>Limit to first 30 rows (test mode)</span>
            </label>
            <button
              onClick={startResolve}
              className="mt-4 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#0B1020] hover:bg-[var(--accent-strong)] hover:text-white"
            >
              Start lookup ({effective.toLocaleString()})
            </button>
          </div>
        )
      })()}

      {phase === 'resolving' && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            <span>Resolving</span>
            <span>{progress.done} / {progress.total}</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--canvas-alt)]">
            <div
              className="h-full bg-[var(--accent)] transition-all"
              style={{ width: progress.total ? `${(100 * progress.done) / progress.total}%` : '0%' }}
            />
          </div>
          <CounterRow counters={counters} />
        </div>
      )}

      {phase === 'reviewing' && buckets.needs_review[reviewIdx] && (
        <ReviewCard
          item={buckets.needs_review[reviewIdx]!}
          index={reviewIdx}
          total={buckets.needs_review.length}
          onPick={handleReviewPick}
        />
      )}

      {phase === 'done' && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6">
          <div className="text-sm font-medium">All done.</div>
          <CounterRow counters={counters} />
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleDownload}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#0B1020] hover:bg-[var(--accent-strong)] hover:text-white"
            >
              Download decisions JSON
            </button>
            <a
              href={mailtoLink(school)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--canvas-alt)]"
            >
              Open email to send back
            </a>
            <button
              onClick={onReset}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--canvas-alt)]"
            >
              Start over
            </button>
          </div>
          <p className="mt-3 text-xs text-[var(--ink-muted)]">
            Send the JSON file to whoever asked you to do this. They'll merge it into the database.
          </p>
        </div>
      )}
    </div>
  )
}

function mailtoLink(school: School): string {
  const subject = encodeURIComponent(`Directory results for ${school.name}`)
  const body = encodeURIComponent(
    `Attached: decisions_${school.slug}_*.json\n\nLet me know if anything looks off.\n`
  )
  return `mailto:?subject=${subject}&body=${body}`
}

function CounterRow({ counters }: { counters: Counters }) {
  const items: { label: string; value: number; tone?: string }[] = [
    { label: 'auto-accept', value: counters.auto_accept, tone: 'good' },
    { label: 'verified', value: counters.verified, tone: 'good' },
    { label: 'replace', value: counters.auto_replace, tone: 'warn' },
    { label: 'review', value: counters.needs_review, tone: 'warn' },
    { label: 'no hit', value: counters.no_hit },
    { label: 'errors', value: counters.errors, tone: counters.errors ? 'bad' : undefined },
  ]
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
      {items.map(i => (
        <div key={i.label} className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">{i.label}</div>
          <div
            className={
              'mt-0.5 font-mono text-base ' +
              (i.tone === 'good' ? 'text-[var(--good)]' :
               i.tone === 'warn' ? 'text-[var(--warn)]' :
               i.tone === 'bad'  ? 'text-[var(--bad)]'  : '')
            }
          >
            {i.value}
          </div>
        </div>
      ))}
    </div>
  )
}
