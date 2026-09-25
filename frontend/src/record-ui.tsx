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
  return { data, pending: !data, feedback: error ? <><Message notice={{ text: error, error: true }} /><button onClick={() => { setError(''); retry(attempt + 1) }}>Retry</button></> : !data ? <p role="status">Loading…</p> : null }
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
  return <section className="delete-area"><Message notice={error ? { text: error, error: true } : null} />{confirm ? <><p>Delete {label}? This cannot be undone.</p><div className="actions"><button disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Confirm deletion'}</button><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button></div></> : <button className="secondary" onClick={() => setConfirm(true)}>Delete {label}</button>}</section>
}
export function Pagination({ offset, total, onChange }: { offset: number; total: number; onChange: (value: number) => void }) {
  return <div className="actions"><button disabled={!offset} onClick={() => onChange(offset - 25)}>Previous</button><span>{total ? offset + 1 : 0}–{Math.min(offset + 25, total)} of {total}</span><button disabled={offset + 25 >= total} onClick={() => onChange(offset + 25)}>Next</button></div>
}
