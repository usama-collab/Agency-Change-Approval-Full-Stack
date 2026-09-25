import { useCallback, useState, type FormEvent } from 'react'
import { api, type ChangeRequest, type Client, type Page, type Project } from './api'
import { Layout, Message, type Notice } from './ui'
import { DeleteRecord, Pagination, useLoad } from './record-ui'
import { parsePrice, priceText } from './money'
import { timeText } from './ProposalView'

type Draft = Pick<Project, 'client_id' | 'title' | 'baseline_deliverables' | 'exclusions' | 'original_price_minor' | 'currency' | 'delivery_date'>
function ProjectList() {
  const [offset, setOffset] = useState(0)
  const client = new URLSearchParams(location.search).get('client_id')
  const load = useCallback(() => api<Page<Project>>(`/projects?limit=25&offset=${offset}${client ? `&client_id=${encodeURIComponent(client)}` : ''}`), [offset, client])
  const { data, feedback } = useLoad(load)
  return <>{feedback}{data && <>{client && <p>Projects for the selected client. <a href="/projects">Show all</a></p>}<ul className="records">{data.items.map(p => <li key={p.id}><a href={`/projects/${p.id}`}>{p.title}</a><span>{p.currency} {priceText(p.original_price_minor)} · Due {p.delivery_date}</span></li>)}</ul>{!data.total && <p>No projects yet. Create a project to record an existing agreement.</p>}<Pagination offset={offset} total={data.total} onChange={setOffset} /></>}</>
}
async function allClients(): Promise<Client[]> {
  const items: Client[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await api<Page<Client>>(`/clients?limit=100&offset=${offset}`)
    items.push(...page.items)
    if (items.length >= page.total || !page.items.length) return items
  }
}
function ProjectForm({ project, clients }: { project?: Project; clients: Client[] }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [preview, setPreview] = useState<Draft | null>(null)
  const [draft, setDraft] = useState<Draft | undefined>(project)
  async function save(payload: Draft) {
    setBusy(true); setNotice(null)
    try {
      const saved = await api<Project>(project ? `/projects/${project.id}` : '/projects', project ? 'PUT' : 'POST', payload)
      if (!project) location.assign(`/projects/${saved.id}`)
      setNotice({ text: 'Baseline saved.' })
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Please retry.', error: true }) }
    finally { setBusy(false) }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setNotice(null)
    const f = new FormData(e.currentTarget)
    const text = (key: string) => String(f.get(key) ?? '').trim()
    try {
      if (!text('title') || !text('baseline_deliverables')) throw new Error('Title and baseline deliverables cannot be blank.')
      const payload: Draft = { client_id: text('client_id'), title: text('title'), baseline_deliverables: text('baseline_deliverables'), exclusions: text('exclusions') || null, original_price_minor: parsePrice(text('price')), currency: text('currency'), delivery_date: text('delivery_date') }
      setDraft(payload)
      if (project) void save(payload)
      else setPreview(payload)
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Please retry.', error: true }) }
  }
  if (!clients.length) return <p>Add a client before creating a project. <a href="/clients/new">Add client</a></p>
  if (project?.first_issued_at) return <><p className="muted">This baseline is the agency’s record of the original agreement. It is locked because a request has been issued.</p><dl><dt>Client</dt><dd>{clients.find(c => c.id === project.client_id)?.name}</dd><dt>Project</dt><dd>{project.title}</dd><dt>Baseline deliverables</dt><dd>{project.baseline_deliverables}</dd><dt>Exclusions</dt><dd>{project.exclusions || 'None'}</dd><dt>Original price and date</dt><dd>{project.currency} {priceText(project.original_price_minor)} · {project.delivery_date}</dd><dt>Current agreed total and date</dt><dd>{project.currency} {priceText(project.current_price_minor)} · {project.current_delivery_date}</dd></dl></>
  return <><p className="muted">This baseline is your record of an existing agreement. It does not record client approval in this product. Tax and billing are handled externally. The baseline locks after the first request is issued.</p><Message notice={notice} />{preview ? <section aria-label="Review project"><h2 tabIndex={-1} ref={node => node?.focus()}>Review project</h2><dl><dt>Client</dt><dd>{clients.find(c => c.id === preview.client_id)?.name}</dd><dt>Title</dt><dd>{preview.title}</dd><dt>Baseline deliverables</dt><dd>{preview.baseline_deliverables}</dd><dt>Exclusions</dt><dd>{preview.exclusions || 'None'}</dd><dt>Original price</dt><dd>{preview.currency} {priceText(preview.original_price_minor)}</dd><dt>Delivery date</dt><dd>{preview.delivery_date}</dd></dl><div className="actions"><button disabled={busy} onClick={() => save(preview)}>{busy ? 'Saving…' : 'Save project'}</button><button disabled={busy} className="secondary" onClick={() => setPreview(null)}>Back to edit</button></div></section> : <form onSubmit={submit}>
    <label>Client<select name="client_id" defaultValue={draft?.client_id} required>{clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}</select></label>
    <label>Project title<input name="title" defaultValue={draft?.title} required maxLength={120} /></label>
    <label>Baseline deliverables<textarea name="baseline_deliverables" defaultValue={draft?.baseline_deliverables} required rows={5} /></label>
    <label>Exclusions (optional)<textarea name="exclusions" defaultValue={draft?.exclusions ?? ''} rows={3} /></label>
    <div className="columns"><label>Original price<input name="price" inputMode="decimal" defaultValue={draft ? priceText(draft.original_price_minor) : ''} required placeholder="0.00" /><small>Up to two decimal places; tax handled externally.</small></label><label>Currency<select name="currency" defaultValue={draft?.currency ?? 'PKR'}>{['PKR', 'USD', 'GBP', 'EUR'].map(c => <option key={c}>{c}</option>)}</select></label></div>
    <label>Delivery date<input name="delivery_date" type="date" defaultValue={draft?.delivery_date} required /></label><button disabled={busy}>{busy ? 'Saving…' : project ? 'Save changes' : 'Review project'}</button>
  </form>}{project && <DeleteRecord path={`/projects/${project.id}`} back="/projects" label="project" />}</>
}
function ProjectDetail({ id }: { id: string }) {
  const [requestOffset, setRequestOffset] = useState(0)
  const load = useCallback(async () => ({ clients: await allClients(), project: id === 'new' ? undefined : await api<Project>(`/projects/${id}`), requests: id === 'new' ? undefined : await api<Page<ChangeRequest>>(`/projects/${id}/requests?limit=25&offset=${requestOffset}`), pending: id === 'new' ? undefined : await api<Page<ChangeRequest>>(`/requests?project_id=${id}&status=pending&limit=1`) }), [id, requestOffset])
  const { data, feedback } = useLoad(load)
  return <>{feedback}{data && <><ProjectForm {...data} />{data.project && <section><h2>Agreed and pending additions</h2><dl><dt>Approved additions</dt><dd>{data.project.currency} {priceText(data.project.current_price_minor - data.project.original_price_minor)}</dd><dt>Current agreed total and deadline</dt><dd>{data.project.currency} {priceText(data.project.current_price_minor)} · {data.project.current_delivery_date}</dd><dt>Pending addition</dt><dd>{data.project.currency} {priceText(data.pending?.items[0]?.additional_price_minor || 0)}</dd></dl><h2>Change requests</h2><p><a href={`/requests/new?project_id=${data.project.id}`}>New change request</a></p>{!data.requests?.total ? <p>No requests yet.</p> : <><ul className="records">{data.requests.items.map(r => <li key={r.id}><a href={`/requests/${r.id}`}>{r.description}</a><span>{r.status} · {data.project!.currency} {priceText(r.additional_price_minor)}{r.expires_at ? ` · Expires ${timeText(r.expires_at)}` : ''}</span></li>)}</ul><Pagination offset={requestOffset} total={data.requests.total} onChange={setRequestOffset} /></>}</section>}</>}</>
}
export function ProjectsPage({ id }: { id?: string }) {
  return <Layout><div className="workspace"><h1>{id === 'new' ? 'Create project' : id ? 'Project baseline' : 'Projects'}</h1><p className="links"><a href="/projects">All projects</a><a href="/projects/new">Create project</a></p><section className="card">{id ? <ProjectDetail id={id} /> : <ProjectList />}</section></div></Layout>
}
