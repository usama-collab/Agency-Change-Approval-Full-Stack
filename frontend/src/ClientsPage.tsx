import { useCallback, useState, type FormEvent } from 'react'
import { api, type Client, type Page } from './api'
import { Layout, Message, type Notice } from './ui'
import { DeleteRecord, Pagination, useLoad } from './record-ui'

function ClientList() {
  const [offset, setOffset] = useState(0)
  const load = useCallback(() => api<Page<Client>>(`/clients?limit=25&offset=${offset}`), [offset])
  const { data, feedback } = useLoad(load)
  return <>{feedback}{data && <><ul className="list-none p-0 [&_li]:grid [&_li]:gap-2 [&_li]:break-words [&_li]:border-b [&_li]:border-line [&_li]:py-[18px] [&_span]:text-[.9rem] [&_span]:text-muted">{data.items.map(c => <li key={c.id}><a href={`/clients/${c.id}`}>{c.name}</a><span>{c.company} · {c.email}</span></li>)}</ul>{!data.total && <p>No clients yet. Add your first client to create a project.</p>}<Pagination offset={offset} total={data.total} onChange={setOffset} /></>}</>
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
  return <Layout><div className="mx-auto w-full max-w-[1120px] "><h1>{id === 'new' ? 'Add client' : id ? 'Client details' : 'Clients'}</h1><p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[.9rem]"><a href="/clients">All clients</a><a href="/clients/new">Add client</a></p><section className="max-w-[760px] rounded-2xl border border-line bg-white p-[clamp(24px,3vw,36px)] shadow-[0_8px_28px_#203d3108] max-[600px]:px-[18px] max-[600px]:py-[22px] [&_form+form]:mt-9 [&_form+form]:border-t [&_form+form]:border-line [&_form+form]:pt-6 [&_section+section]:mt-[30px]">{!id ? <ClientList /> : id === 'new' ? <NewClient /> : <ClientDetail id={id} />}</section></div></Layout>
}
