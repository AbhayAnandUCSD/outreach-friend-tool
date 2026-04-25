import { useEffect } from 'react'
import type { ReviewItem } from '../lib/types'

type Props = {
  item: ReviewItem
  index: number
  total: number
  onPick: (i: number) => void   // 0..n-1 = candidate, -1 = none, -2 = skip
}

const REASON_LABEL: Record<ReviewItem['reason'], string> = {
  multi_hit: 'Multiple matches — pick the right one',
  weak_score: 'Weak match — verify it\'s the same person',
  high_conf_conflict: 'Conflict — DB email differs from directory',
  low_conf_conflict: 'Possible upgrade — directory found a different email',
}

export function ReviewCard({ item, index, total, onPick }: Props) {
  const { row, candidates } = item

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '1') onPick(0)
      else if (e.key === '2' && candidates[1]) onPick(1)
      else if (e.key === '3' && candidates[2]) onPick(2)
      else if (e.key.toLowerCase() === 'n') onPick(-1)
      else if (e.key.toLowerCase() === 's') onPick(-2)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPick, candidates])

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6">
      <div className="mb-1 flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          Review {index + 1} of {total} · {REASON_LABEL[item.reason]}
        </div>
        <div className="text-xs text-[var(--ink-muted)]">1/2/3 pick · N none · S skip</div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
        {/* DB row */}
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">our DB says</div>
          <div className="mt-3 flex gap-3">
            {row.image_url ? (
              <img
                src={row.image_url}
                alt=""
                className="h-16 w-16 rounded-md object-cover"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="h-16 w-16 rounded-md bg-[var(--canvas-alt)]" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium leading-tight">{row.name}</div>
              <div className="text-xs text-[var(--ink-muted)]">{row.role}</div>
              {row.lab_name && (
                <div className="mt-1 truncate text-xs text-[var(--ink-muted)]" title={row.lab_name}>
                  {row.lab_name}
                </div>
              )}
            </div>
          </div>
          {row.current_email && (
            <div className="mt-3 rounded border border-[var(--border)] bg-[var(--canvas)] p-2 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">current email</div>
              <div className="font-mono text-[12px]">{row.current_email}</div>
              <div className="text-[10px] text-[var(--ink-muted)]">
                {row.current_email_source} · {row.current_email_confidence}
              </div>
            </div>
          )}
          {row.profile_url && (
            <a
              href={row.profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block text-xs underline"
            >
              open lab page →
            </a>
          )}
        </div>

        {/* Candidates */}
        <div className="space-y-3">
          {candidates.map((c, i) => (
            <button
              key={c.email + i}
              onClick={() => onPick(i)}
              className="flex w-full items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-left transition hover:border-[var(--accent)] hover:bg-[var(--canvas-alt)]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--canvas)] text-xs font-mono text-[var(--ink-muted)]">
                {i + 1}
              </div>
              {c.photo_url ? (
                <img
                  src={c.photo_url}
                  alt=""
                  className="h-12 w-12 rounded-md object-cover"
                  referrerPolicy="no-referrer"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="h-12 w-12 rounded-md bg-[var(--canvas-alt)]" />
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate font-mono text-sm">{c.email}</div>
                <div className="truncate text-xs text-[var(--ink-muted)]">
                  {c.display_name || '—'}
                </div>
                <div className="mt-1 text-[11px] text-[var(--ink-muted)]">
                  {c.department || 'no dept'} · {c.title || 'no title'}
                </div>
              </div>
              <div className="text-[10px] text-[var(--ink-muted)]">
                score {c.score}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onPick(-1)}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--canvas-alt)]"
        >
          (N) None of these
        </button>
        <button
          onClick={() => onPick(-2)}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--canvas-alt)]"
        >
          (S) Skip — operator review
        </button>
      </div>
    </div>
  )
}
