import { useEffect, useState } from 'react'
import { api, type Agency } from './api'
import { Message } from './ui'

export function useLoad<T>(load: () => Promise<T>, requireAgency = true) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [attempt, retry] = useState(0)
  useEffect(() => {
    let active = true
    setData(null); setError('')
    const request = requireAgency ? api<Agency | null>('/agencies/me').then(a => {
      if (!a) { location.assign('/agency'); return null }
      return load()
    }) : load()
    request.then(value => { if (active) setData(value) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [load, attempt, requireAgency])
  return { data, pending: !data, feedback: error ? <div className="max-w-[560px]"><Message notice={{ text: error, error: true }} /><button onClick={() => { setError(''); retry(attempt + 1) }}>Retry</button></div> : !data ? <div className="flex items-center gap-2.5 py-[18px] text-[.9rem] text-muted" role="status"><span className="size-[9px] shrink-0 rounded-full bg-accent" aria-hidden="true" />Loading this page…</div> : null }
}

export function DeleteRecord({ path, back, label }: { path: string; back: string; label: string }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function remove() {
    setBusy(true); setError('')
    try { await api(path, 'DELETE'); location.assign(back) }
    catch (e) { setError(e instanceof Error ? e.message : 'Please retry.'); setBusy(false) }
  }
  return <section className="mt-8 border-t border-line pt-6"><Message notice={error ? { text: error, error: true } : null} />{confirm ? <><p>Delete {label}? This cannot be undone.</p><div className="mt-6 flex flex-wrap items-center gap-3 max-[600px]:[&_button]:flex-1"><button disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Confirm deletion'}</button><button className="!border-line !bg-white !text-accent hover:!bg-[#edf5f1]" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button></div></> : <button className="!border-line !bg-white !text-accent hover:!bg-[#edf5f1]" onClick={() => setConfirm(true)}>Delete {label}</button>}</section>
}
export function Pagination({ offset, total, onChange }: { offset: number; total: number; onChange: (value: number) => void }) {
  return <div className="mt-6 flex flex-wrap items-center gap-3 max-[600px]:[&_button]:flex-1"><button disabled={!offset} onClick={() => onChange(offset - 25)}>Previous</button><span>{total ? offset + 1 : 0}–{Math.min(offset + 25, total)} of {total}</span><button disabled={offset + 25 >= total} onClick={() => onChange(offset + 25)}>Next</button></div>
}
