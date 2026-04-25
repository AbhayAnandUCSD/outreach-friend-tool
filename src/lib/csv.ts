import Papa from 'papaparse'
import type { DbRow } from './types'

export async function loadSchoolCsv(url: string): Promise<DbRow[]> {
  const resp = await fetch(url, { cache: 'no-store' })
  if (!resp.ok) throw new Error(`csv fetch ${url}: ${resp.status}`)
  const text = await resp.text()
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })
  if (parsed.errors.length) {
    console.warn('csv parse warnings', parsed.errors.slice(0, 3))
  }
  return parsed.data.map(row => ({
    researcher_id: Number(row.researcher_id),
    name: row.name ?? '',
    first_name: row.first_name ?? '',
    last_name: row.last_name ?? '',
    role: row.role ?? '',
    lab_name: row.lab_name ?? '',
    current_email: row.current_email ?? '',
    current_email_source: row.current_email_source ?? '',
    current_email_confidence: row.current_email_confidence ?? '',
    profile_url: row.profile_url ?? '',
    image_url: row.image_url ?? '',
  })).filter(r => Number.isFinite(r.researcher_id))
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 0)
}
