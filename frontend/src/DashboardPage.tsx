import { useCallback, useState } from 'react'
import { api, type DashboardSummary, type Page, type Project, type RequestRow } from './api'
import { aggregatePriceText, priceText } from './money'
import { timeText } from './ProposalView'
import { Pagination, useLoad } from './record-ui'
import { Layout } from './ui'

const statuses = ['draft', 'pending', 'approved', 'rejected', 'withdrawn', 'expired']
const currencies = ['PKR', 'USD', 'GBP', 'EUR']
async function allProjects(): Promise<Project[]> {
  const items: Project[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await api<Page<Project>>(`/projects?limit=100&offset=${offset}`)
    items.push(...page.items)
    if (items.length >= page.total || !page.items.length) return items
  }
}
function initial() {
  const params = new URLSearchParams(location.search)
  return { status: params.get('status') || '', project_id: params.get('project_id') || '', currency: params.get('currency') || '', offset: Math.max(0, Number(params.get('offset') || '0') || 0) }
}

export function DashboardPage() {
  const [filters, setFilters] = useState(initial)
  const update = (next: typeof filters) => {
    const params = new URLSearchParams()
    if (next.status) params.set('status', next.status)
    if (next.project_id) params.set('project_id', next.project_id)
    if (next.currency) params.set('currency', next.currency)
    if (next.offset) params.set('offset', String(next.offset))
    history.replaceState(null, '', `/dashboard${params.size ? `?${params}` : ''}`)
    setFilters(next)
  }
  const load = useCallback(async () => {
    const params = new URLSearchParams({ offset: String(filters.offset) })
    if (filters.status) params.set('status', filters.status)
    if (filters.project_id) params.set('project_id', filters.project_id)
    if (filters.currency) params.set('currency', filters.currency)
    const [summary, requests, projects] = await Promise.all([
      api<DashboardSummary>('/dashboard'),
      api<Page<RequestRow>>(`/requests?${params}`),
      allProjects(),
    ])
    return { summary, requests, projects }
  }, [filters])
  const { data, feedback } = useLoad(load)
  return <Layout><div className="workspace"><h1>Dashboard</h1>{feedback}{data && <>
    <section className="card"><h2>Agency overview — all projects</h2><p className="muted">As of {timeText(data.summary.as_of)}. Approved charges are agreed additions, not payments or recovered revenue. Tax and billing are handled externally.</p><div className="summary-grid">{data.summary.currencies.map(row => <section key={row.currency} className="summary-card"><h3>{row.currency} · {row.project_count} {row.project_count === 1 ? 'project' : 'projects'}</h3><dl><dt>Original project amounts</dt><dd>{row.currency} {aggregatePriceText(row.original_minor)}</dd><dt>Approved additions</dt><dd>{row.currency} {aggregatePriceText(row.approved_minor)}</dd><dt>Current agreed total</dt><dd>{row.currency} {aggregatePriceText(row.current_minor)}</dd><dt>Pending additions</dt><dd>{row.currency} {aggregatePriceText(row.pending_minor)}</dd></dl></section>)}</div></section>
    <section className="card"><h2>Requests</h2><p>{statuses.map(status => `${status}: ${data.summary.status_counts[status]}`).join(' · ')}</p><div className="columns dashboard-filters"><label>Status<select value={filters.status} onChange={e => update({ ...filters, status: e.target.value, offset: 0 })}><option value="">All statuses</option>{statuses.map(s => <option key={s}>{s}</option>)}</select></label><label>Project<select value={filters.project_id} onChange={e => update({ ...filters, project_id: e.target.value, offset: 0 })}><option value="">All projects</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>Currency<select value={filters.currency} onChange={e => update({ ...filters, currency: e.target.value, offset: 0 })}><option value="">All currencies</option>{currencies.map(c => <option key={c}>{c}</option>)}</select></label></div>
      {data.requests.items.length ? <ul className="request-list">{data.requests.items.map(row => <li key={row.id}><a href={`/requests/${row.id}`}>{row.project_title}: {row.description}</a><span>{row.client_name} · {row.status} · {row.currency} {priceText(row.additional_price_minor)} · {timeText(row.issued_at || row.created_at)}</span></li>)}</ul> : <p>No requests match these filters.</p>}
      <Pagination offset={filters.offset} total={data.requests.total} onChange={offset => update({ ...filters, offset })} />
    </section>
  </>}</div></Layout>
}
