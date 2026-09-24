import { useEffect, useState, type FormEvent } from 'react'
import { api, type Agency, type Owner } from './api'
import { Layout, Message, type Notice } from './ui'
export function AgencyPage() {
  const [owner, setOwner] = useState<Owner | null>(null)
  const [agency, setAgency] = useState<Agency | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([api<Owner>('/auth/me'), api<Agency | null>('/agencies/me')])
      .then(([user, existing]) => { setOwner(user); setAgency(existing) })
      .catch(error => setNotice({ text: error.message, error: true }))
      .finally(() => setLoading(false))
  }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    const fields = new FormData(event.currentTarget)
    const payload = { name: String(fields.get('name')), contact_name: String(fields.get('contact_name')), contact_email: String(fields.get('contact_email')) }
    try {
      const result = await api<Agency>(agency ? `/agencies/${agency.id}` : '/agencies', agency ? 'PUT' : 'POST', payload)
      if (!agency) location.assign('/projects')
      setAgency(result)
      setNotice({ text: agency ? 'Agency profile updated.' : 'Agency profile created.' })
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Please retry.', error: true }) }
    finally { setBusy(false) }
  }

  async function logout() {
    try { await api('/auth/logout', 'POST'); location.assign('/login') }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Please retry.', error: true }) }
  }

  return <Layout><div className="workspace">
    <div className="workspace-head"><div><p className="eyebrow">Owner workspace</p><h1>{agency ? 'Agency profile' : 'Set up your agency'}</h1><p className="muted">{owner?.email ?? 'Loading your account…'}</p></div><button type="button" className="secondary" onClick={logout} disabled={loading}>Sign out</button></div>
    <Message notice={notice} />{loading ? <p role="status">Loading your workspace…</p> : !owner ? <button onClick={() => location.reload()}>Retry loading workspace</button> : <section className="card"><h2>{agency ? 'Your agency' : 'Create your agency profile'}</h2><p className="muted">Your profile is private to this owner account. You can update these contact details later.</p><form onSubmit={save} key={agency?.id ?? 'new'}>
      <label>Agency name<input name="name" minLength={2} maxLength={120} defaultValue={agency?.name ?? ''} required /></label>
      <label>Owner contact name<input name="contact_name" minLength={2} maxLength={120} defaultValue={agency?.contact_name ?? ''} required /></label>
      <label>Owner contact email<input name="contact_email" type="email" defaultValue={agency?.contact_email ?? owner?.email ?? ''} required /></label>
      <button disabled={busy}>{busy ? 'Saving…' : agency ? 'Save changes' : 'Create agency'}</button>
    </form></section>}
  </div></Layout>
}
