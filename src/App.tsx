import { useEffect, useState } from 'react'
import type { School } from './lib/types'
import { SchoolPicker } from './components/SchoolPicker'
import { ResolvePanel } from './components/ResolvePanel'

const BASE = import.meta.env.BASE_URL

export function App() {
  const [schools, setSchools] = useState<School[] | null>(null)
  const [picked, setPicked] = useState<School | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${BASE}schools.json`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(`schools.json ${r.status}`)
        return r.json() as Promise<School[]>
      })
      .then(setSchools)
      .catch(e => setError(String(e)))
  }, [])

  return (
    <div className="min-h-full px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            Outreach · directory resolver
          </div>
          <h1 className="mt-2 text-3xl font-semibold leading-tight">
            Help find emails at your school
          </h1>
          <p className="mt-3 max-w-xl text-sm text-[var(--ink-muted)]">
            Sign in with your school Google account. The page queries your university's
            internal directory for the names below and writes back a JSON file. No data
            leaves your browser unless you download and send it.
          </p>
        </header>

        {error && (
          <div className="rounded-md border border-[var(--bad)]/40 bg-[var(--bad)]/10 p-3 text-sm">
            Failed to load: {error}
          </div>
        )}

        {!picked && schools && (
          <SchoolPicker schools={schools} onPick={setPicked} />
        )}

        {picked && (
          <ResolvePanel school={picked} onReset={() => setPicked(null)} />
        )}

        {!schools && !error && (
          <div className="text-sm text-[var(--ink-muted)]">Loading schools…</div>
        )}
      </div>
    </div>
  )
}
