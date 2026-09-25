import { useCallback, useState } from 'react'
import { api, type DashboardSummary, type Page, type Project, type RequestRow } from './api'
import { aggregatePriceText, priceText } from './money'
import { timeText } from './ProposalView'
import { Pagination, useLoad } from './record-ui'
import { EmptyState, Layout, StatusBadge } from './ui'

const statuses = ['draft', 'pending', 'approved', 'rejected', 'withdrawn', 'expired']
const currencies = ['PKR', 'USD', 'GBP', 'EUR']
const statusNames: Record<string, string> = { draft: 'Draft', pending: 'Awaiting decision', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn', expired: 'Expired' }
function groupedMoney(value: string) {
  const [whole, decimal] = value.split('.')
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimal}`
}
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
  const hasFilters = Boolean(filters.status || filters.project_id || filters.currency)
  return <Layout><div className="mx-auto w-full max-w-[1120px] max-w-[1120px]">
    <div className="mt-2 mb-7 flex items-end justify-between gap-6 max-[600px]:block [&_h1]:mb-1.5 "><div><p className="mb-2 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-accent">Workspace overview</p><h1>Dashboard</h1><p className="m-0 text-base leading-[1.55] text-muted">Track additional work and client decisions across your projects.</p></div><a className="inline-flex min-h-11 items-center justify-center rounded-[9px] border border-accent bg-accent px-[18px] py-2.5 font-bold leading-[1.3] text-white no-underline hover:bg-accent-hover hover:text-white max-[600px]:mt-5" href="/projects/new">Create project</a></div>
    {feedback}{data && <>
      <section className="max-w-[760px] rounded-2xl border border-line bg-white p-[clamp(24px,3vw,36px)] shadow-[0_8px_28px_#203d3108] max-[600px]:px-[18px] max-[600px]:py-[22px] [&_form+form]:mt-9 [&_form+form]:border-t [&_form+form]:border-line [&_form+form]:pt-6 [&_section+section]:mt-[30px] !max-w-none [&+section]:mt-5" aria-labelledby="overview-title"><div className="mb-6 flex items-start justify-between gap-[18px] [&_p]:m-0 [&_p]:leading-normal [&_p]:text-muted"><div><h2 id="overview-title">Agreed project totals</h2><p>Each currency is shown separately. Updated {timeText(data.summary.as_of)}.</p></div></div>
        {data.projects.length ? <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,330px),1fr))] gap-4 max-[600px]:grid-cols-1">{data.summary.currencies.filter(row => row.project_count > 0).map(row => <section key={row.currency} className="min-w-0 rounded-xl border border-line bg-white p-[22px]" aria-label={`${row.currency} summary`}>
          <div className="flex items-center justify-between gap-2.5 text-[.82rem] text-muted"><span className="text-[.85rem] font-extrabold tracking-[.04em] text-[#235951]">{row.currency}</span><span>{row.project_count} {row.project_count === 1 ? 'project' : 'projects'}</span></div>
          <p className="mt-[22px] mb-1 text-[.83rem] text-muted">Current agreed total</p><p className="mt-0 mb-[21px] break-words text-[clamp(1.4rem,2.3vw,1.85rem)] font-bold tracking-[-.035em] tabular-nums text-ink">{row.currency} {groupedMoney(aggregatePriceText(row.current_minor))}</p>
          <dl className="m-0 grid gap-3 [&_div]:flex [&_div]:flex-wrap [&_div]:items-baseline [&_div]:justify-between [&_div]:gap-x-4 [&_div]:gap-y-1 [&_dt]:m-0 [&_dt]:text-[.82rem] [&_dt]:font-medium [&_dt]:text-muted [&_dd]:m-0 [&_dd]:text-[.86rem] [&_dd]:font-semibold [&_dd]:tabular-nums"><div><dt>Original project amounts</dt><dd>{row.currency} {groupedMoney(aggregatePriceText(row.original_minor))}</dd></div><div><dt>Approved additions</dt><dd>{row.currency} {groupedMoney(aggregatePriceText(row.approved_minor))}</dd></div></dl>
          <div className="mt-5 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-line pt-3.5 text-[.85rem] text-[#775424] [&_strong]:tabular-nums"><span>Awaiting decision</span><strong>{row.currency} {groupedMoney(aggregatePriceText(row.pending_minor))}</strong></div>
        </section>)}</div> : <EmptyState title="No projects yet" description="Create your first project to start tracking agreed terms and additional work." action={<a className="inline-flex min-h-11 items-center justify-center rounded-[9px] border border-accent bg-accent px-[18px] py-2.5 font-bold leading-[1.3] text-white no-underline hover:bg-accent-hover hover:text-white max-[600px]:mt-5" href="/projects/new">Create project</a>} />}
        <p className="mt-5 mb-0 text-[.85rem] leading-normal text-muted">Approved additions are agreed charges, not payments. Pending amounts are separate from agreed totals. Tax and billing are handled outside this workspace.</p>
      </section>
      <section className="max-w-[760px] rounded-2xl border border-line bg-white p-[clamp(24px,3vw,36px)] shadow-[0_8px_28px_#203d3108] max-[600px]:px-[18px] max-[600px]:py-[22px] [&_form+form]:mt-9 [&_form+form]:border-t [&_form+form]:border-line [&_form+form]:pt-6 [&_section+section]:mt-[30px] !max-w-none [&+section]:mt-5" aria-labelledby="requests-title"><div className="mb-6 flex items-start justify-between gap-[18px] [&_p]:m-0 [&_p]:leading-normal [&_p]:text-muted"><div><h2 id="requests-title">Change requests</h2><p>Find a request or check where a decision stands.</p></div><span className="whitespace-nowrap rounded-full border border-line px-2.5 py-[5px] text-[.78rem] text-muted">{data.requests.total} {data.requests.total === 1 ? 'result' : 'results'}</span></div>
        <div className="mb-[26px] grid grid-cols-6 gap-2 max-[800px]:grid-cols-3 max-[600px]:grid-cols-2" aria-label="Request counts by status">{statuses.map(status => <div key={status} className="grid gap-[5px] rounded-[9px] border border-line bg-soft p-3 [&_span]:text-xs [&_span]:leading-[1.35] [&_span]:text-muted [&_strong]:text-[1.12rem] [&_strong]:tabular-nums"><span>{statusNames[status]}</span><strong>{data.summary.status_counts[status] ?? 0}</strong></div>)}</div>
        <div className="mb-[22px] grid grid-cols-3 gap-3.5 max-[600px]:grid-cols-1 [&_label]:text-[.82rem]"><label>Status<select value={filters.status} onChange={e => update({ ...filters, status: e.target.value, offset: 0 })}><option value="">All statuses</option>{statuses.map(s => <option key={s} value={s}>{statusNames[s]}</option>)}</select></label><label>Project<select value={filters.project_id} onChange={e => update({ ...filters, project_id: e.target.value, offset: 0 })}><option value="">All projects</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>Currency<select value={filters.currency} onChange={e => update({ ...filters, currency: e.target.value, offset: 0 })}><option value="">All currencies</option>{currencies.map(c => <option key={c}>{c}</option>)}</select></label></div>
        {data.requests.items.length ? <ul className="m-0 list-none border-t border-line p-0 [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:gap-5 [&_li]:border-b [&_li]:border-line [&_li]:px-0.5 [&_li]:py-[18px] max-[600px]:[&_li]:flex-col max-[600px]:[&_li]:items-start max-[600px]:[&_li]:gap-3">{data.requests.items.map(row => <li key={row.id}><div className="grid min-w-0 gap-[5px] [&_a]:font-bold [&_a]:text-ink [&_a]:no-underline [&_a:hover]:text-accent [&_a:hover]:underline [&_span]:text-[.82rem] [&_span]:leading-[1.45] [&_span]:text-muted"><a href={`/requests/${row.id}`}>{row.description}</a><span>{row.project_title} · {row.client_name}</span></div><div className="flex flex-wrap items-center justify-end gap-x-3.5 gap-y-2 text-right max-[600px]:justify-start max-[600px]:text-left [&_strong]:whitespace-nowrap [&_strong]:text-[.88rem] [&_strong]:tabular-nums [&_time]:whitespace-nowrap [&_time]:text-[.82rem] [&_time]:leading-[1.45] [&_time]:text-muted"><StatusBadge status={row.status} /><strong>{row.currency} {groupedMoney(priceText(row.additional_price_minor))}</strong><time dateTime={row.issued_at || row.created_at}>{timeText(row.issued_at || row.created_at)}</time></div></li>)}</ul> : <EmptyState title={hasFilters ? 'No matching requests' : 'No change requests yet'} description={hasFilters ? 'Try a different status, project, or currency.' : 'Open a project to prepare your first change request.'} action={hasFilters ? <button className="!border-line !bg-white !text-accent hover:!bg-[#edf5f1]" type="button" onClick={() => update({ status: '', project_id: '', currency: '', offset: 0 })}>Clear filters</button> : <a className="inline-flex min-h-11 items-center justify-center rounded-[9px] border border-accent bg-accent px-[18px] py-2.5 font-bold leading-[1.3] text-white no-underline hover:bg-accent-hover hover:text-white" href="/projects">View projects</a>} />}
        {data.requests.total > 25 && <Pagination offset={filters.offset} total={data.requests.total} onChange={offset => update({ ...filters, offset })} />}
      </section>
    </>}
  </div></Layout>
}
