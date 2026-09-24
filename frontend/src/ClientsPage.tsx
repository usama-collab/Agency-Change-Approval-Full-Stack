import { useCallback, useState, type FormEvent } from 'react'
import { api, type Client, type Page } from './api'
import { Layout, Message, type Notice } from './ui'
import { DeleteRecord, Pagination, useLoad } from './record-ui'

function ClientList() {
  const [offset, setOffset] = useState(0)
  const load = useCallback(() => api<Page<Client>>(`/clients?limit=25&offset=${offset}`), [offset])
  const { data, feedback } = useLoad(load)
  return <>{feedback}{data && <><ul className="records">{data.items.map(c => <li key={c.id}><a href={`/clients/${c.id}`}>{c.name}</a><span>{c.company} · {c.email}</span></li>)}</ul>{!data.total && <p>No clients yet. Add your first client to create a project.</p>}<Pagination offset={offset} total={data.total} onChange={setOffset} /></>}</>
}
function ClientForm({ client }: { client?: Client }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setNotice(null)
    const fields = new FormData(e.currentTarget)
    try {
      const saved = await api<Client>(client ? `/clients/${client.id}` : '/clients', client ? 'PUT' : 'POST', { name: fields.get('name'), email: fields.get('email'), company: fields.get('company') || null })
      if (!client) location.assign(`/clients/${saved.id}`)
      setNotice({ text: 'Client saved.' })
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Please retry.', error: true }) }
    finally { setBusy(false) }
  }
  return <><Message notice={notice} /><form onSubmit={submit}><label>Client name<input name="name" defaultValue={client?.name} required maxLength={120} /></label><label>Company (optional)<input name="company" defaultValue={client?.company ?? ''} maxLength={120} /></label><label>Email<input name="email" type="email" defaultValue={client?.email} required /></label><button disabled={busy}>{busy ? 'Saving…' : 'Save client'}</button></form>{client && <><p><a href={`/projects?client_id=${client.id}`}>View client projects</a></p><DeleteRecord path={`/clients/${client.id}`} back="/clients" label="client" /></>}</>
}
function ClientDetail({ id }: { id: string }) {
  const load = useCallback(() => api<Client>(`/clients/${id}`), [id])
  const { data, feedback } = useLoad(load)
  return <>{feedback}{data && <ClientForm client={data} />}</>
}
function NewClient() {
  const load = useCallback(async () => true, [])
  const { data, feedback } = useLoad(load)
  return <>{feedback}{data && <ClientForm />}</>
}
export function ClientsPage({ id }: { id?: string }) {
  return <Layout><div className="workspace"><h1>{id === 'new' ? 'Add client' : id ? 'Client details' : 'Clients'}</h1><p className="links"><a href="/clients">All clients</a><a href="/clients/new">Add client</a></p><section className="card">{!id ? <ClientList /> : id === 'new' ? <NewClient /> : <ClientDetail id={id} />}</section></div></Layout>
}
