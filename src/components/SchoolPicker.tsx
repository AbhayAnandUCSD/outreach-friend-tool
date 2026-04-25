import { useState } from 'react'
import type { School } from '../lib/types'

type Props = {
  schools: School[]
  onPick: (s: School) => void
}

export function SchoolPicker({ schools, onPick }: Props) {
  const [slug, setSlug] = useState<string>(schools[0]?.slug ?? '')
  const picked = schools.find(s => s.slug === slug)

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6">
      <label className="block text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
        Which school are you at?
      </label>
      <select
        className="mt-3 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
        value={slug}
        onChange={e => setSlug(e.target.value)}
      >
        {schools.map(s => (
          <option key={s.slug} value={s.slug}>
            {s.name} — {s.count.toLocaleString()} researchers · @{s.domain}
          </option>
        ))}
      </select>
      <button
        className="mt-5 w-full rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#0B1020] transition hover:bg-[var(--accent-strong)] hover:text-white disabled:opacity-50"
        disabled={!picked}
        onClick={() => picked && onPick(picked)}
      >
        Continue with {picked?.name ?? '…'}
      </button>
    </div>
  )
}
