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
      if (!agency) location.assign('/dashboard')
      setAgency(result)
      setNotice({ text: agency ? 'Agency profile updated.' : 'Agency profile created.' })
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Please retry.', error: true }) }
    finally { setBusy(false) }
  }

  async function logout() {
    try { await api('/auth/logout', 'POST'); location.assign('/login') }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Please retry.', error: true }) }
  }

  return <Layout><div className="mx-auto w-full max-w-[1120px] ">
    <div className="mb-7 flex items-start justify-between gap-5 max-[600px]:block max-[600px]:[&_button]:mb-5"><div><p className="mb-2 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-accent">Owner workspace</p><h1>{agency ? 'Agency profile' : 'Set up your agency'}</h1><p className="mb-6 leading-[1.55] text-muted">{owner?.email ?? 'Loading your account…'}</p></div><button type="button" className="!border-line !bg-white !text-accent hover:!bg-[#edf5f1]" onClick={logout} disabled={loading}>Sign out</button></div>
    <Message notice={notice} />{loading ? <p role="status">Loading your workspace…</p> : !owner ? <button onClick={() => location.reload()}>Retry loading workspace</button> : <section className="max-w-[760px] rounded-2xl border border-line bg-white p-[clamp(24px,3vw,36px)] shadow-[0_8px_28px_#203d3108] max-[600px]:px-[18px] max-[600px]:py-[22px] [&_form+form]:mt-9 [&_form+form]:border-t [&_form+form]:border-line [&_form+form]:pt-6 [&_section+section]:mt-[30px]"><h2>{agency ? 'Your agency' : 'Create your agency profile'}</h2><p className="mb-6 leading-[1.55] text-muted">Your profile is private to this owner account. You can update these contact details later.</p><form onSubmit={save} key={agency?.id ?? 'new'}>
      <label>Agency name<input name="name" minLength={2} maxLength={120} defaultValue={agency?.name ?? ''} required /></label>
      <label>Owner contact name<input name="contact_name" minLength={2} maxLength={120} defaultValue={agency?.contact_name ?? ''} required /></label>
      <label>Owner contact email<input name="contact_email" type="email" defaultValue={agency?.contact_email ?? owner?.email ?? ''} required /></label>
      <button disabled={busy}>{busy ? 'Saving…' : agency ? 'Save changes' : 'Create agency'}</button>
    </form></section>}
  </div></Layout>
}
