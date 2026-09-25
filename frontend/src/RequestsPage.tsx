import { useCallback, useState, type FormEvent } from 'react'
import { api, type ChangeRequest, type Project } from './api'
import { parsePrice, priceText } from './money'
import { ClientProposalView, timeText } from './ProposalView'
import { allEvents, EventHistory } from './History'
import { useLoad } from './record-ui'
import { Layout, Message, StatusBadge, type Notice } from './ui'

type DraftInput = Pick<ChangeRequest, 'description' | 'reason' | 'extra_deliverables' | 'additional_price_minor' | 'proposed_delivery_date'>
type Preview = { request: ChangeRequest; project_title: string; client_name: string; recipient_email: string; currency: string; original_price_minor: number; current_price_minor: number; new_total_minor: number; original_delivery_date: string; current_delivery_date: string; stale: boolean; amount_valid: boolean }

const secondaryButton = '!border-line !bg-white !text-accent hover:!bg-[#edf5f1]'

function PreviewPanel({ preview, project }: { preview: Preview; project: Project }) {
  const rows = [
    ['Original agreement recorded by agency', preview.original_price_minor],
    ['Earlier approved additions', preview.current_price_minor - preview.original_price_minor],
    ['Current agreed total', preview.current_price_minor],
    ['Additional charge for this request', preview.request.additional_price_minor],
  ] as const
  return <div className="space-y-5">
    <div className="border-b border-line pb-5"><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-accent">Step 2 of 2 · Review</p><h2 tabIndex={-1} ref={node => node?.focus()}>Review before issue</h2><p className="m-0 text-sm text-muted">{preview.project_title} · {preview.client_name} · {preview.recipient_email}</p></div>
    <div className="grid gap-4 md:grid-cols-2"><section className="min-w-0 rounded-xl border border-line bg-soft p-5"><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-muted">Before this request</p><h3>Existing work</h3><p className="whitespace-pre-wrap leading-relaxed">{project.baseline_deliverables}</p><p className="mb-0 text-sm text-muted"><strong className="text-ink">Exclusions:</strong> {project.exclusions || 'None'}</p></section><section className="min-w-0 rounded-xl border border-[#b9d8cd] bg-[#f2f8f5] p-5"><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-accent">For the client’s decision</p><h3>Additional work</h3><p className="whitespace-pre-wrap leading-relaxed">{preview.request.description}</p><p className="mb-1 text-sm font-bold">Reason</p><p className="whitespace-pre-wrap text-sm">{preview.request.reason}</p><p className="mb-1 text-sm font-bold">Extra deliverables</p><p className="mb-0 whitespace-pre-wrap text-sm">{preview.request.extra_deliverables}</p></section></div>
    <section aria-labelledby="preview-terms" className="rounded-xl border border-line p-5 sm:p-6"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h3 id="preview-terms">Price and delivery</h3><span className="text-xs font-semibold text-muted">All amounts in {preview.currency}</span></div><dl className="m-0 divide-y divide-line">{rows.map(([label, minor]) => <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"><dt className="m-0 font-medium text-muted">{label}</dt><dd className="m-0 font-semibold tabular-nums">{preview.currency} {priceText(minor)}</dd></div>)}<div className="-mx-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg bg-[#e7f2ed] px-2 py-4"><dt className="m-0 font-bold">Proposed total if approved</dt><dd className="m-0 text-lg font-bold tabular-nums">{preview.currency} {priceText(preview.new_total_minor)}</dd></div></dl><div className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-3"><div><p className="mb-1 text-xs font-semibold text-muted">Original delivery</p><p className="m-0 font-semibold">{preview.original_delivery_date}</p></div><div><p className="mb-1 text-xs font-semibold text-muted">Current agreed delivery</p><p className="m-0 font-semibold">{preview.current_delivery_date}</p></div><div className="rounded-lg bg-[#e7f2ed] p-3 sm:-m-3"><p className="mb-1 text-xs font-semibold text-[#275c50]">Proposed delivery if approved</p><p className="m-0 font-bold">{preview.request.proposed_delivery_date}</p></div></div></section>
  </div>
}

function LinkBox({ link }: { link: string }) {
  const [notice, setNotice] = useState('')
  return <section aria-labelledby="share-title" className="mt-6 rounded-xl border border-[#b9d8cd] bg-[#f2f8f5] p-5 sm:p-6"><h2 id="share-title">Share the review link</h2><p className="mb-5 text-sm leading-relaxed text-muted">Copy this private link and share it through your chosen channel. The client must verify their email before seeing the proposal. Issuing does not send an invitation.</p><label>Private review link<input readOnly value={link} onFocus={e => e.currentTarget.select()} /></label><button className="mt-4" type="button" onClick={() => navigator.clipboard.writeText(link).then(() => setNotice('Link copied.')).catch(() => setNotice('Select and copy the link above.'))}>Copy link</button>{notice && <p className="mt-3 mb-0 text-sm" role="status">{notice}</p>}</section>
}

function RequestEditor({ record, project }: { record?: ChangeRequest; project: Project }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [issued, setIssued] = useState<{ request: ChangeRequest; review_link: string } | null>(null)
  const [dirty, setDirty] = useState(false)
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setNotice(null)
    const f = new FormData(e.currentTarget)
    try {
      const payload: DraftInput = { description: String(f.get('description') ?? '').trim(), reason: String(f.get('reason') ?? '').trim(), extra_deliverables: String(f.get('extra_deliverables') ?? '').trim(), additional_price_minor: parsePrice(String(f.get('price') ?? '')), proposed_delivery_date: String(f.get('date') ?? '') }
      if (!payload.description || !payload.reason || !payload.extra_deliverables) throw new Error('Describe the work, reason, and extra deliverables.')
      const saved = await api<ChangeRequest>(record ? `/requests/${record.id}` : `/projects/${project.id}/requests`, record ? 'PUT' : 'POST', payload)
      location.assign(`/requests/${saved.id}`)
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Please retry.', error: true }); setBusy(false) }
  }
  async function showPreview() {
    try { setPreview(await api<Preview>(`/requests/${record?.id}/preview`)); setNotice(null) }
    catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Please retry.', error: true }) }
  }
  async function issue() {
    setBusy(true); setNotice(null)
    try { setIssued(await api<{ request: ChangeRequest; review_link: string }>(`/requests/${record?.id}/issue`, 'POST', {})); setPreview(null) }
    catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Please retry.', error: true }) }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!record || !confirm('Delete this draft?')) return
    try { await api(`/requests/${record.id}`, 'DELETE'); location.assign(`/projects/${project.id}`) }
    catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Please retry.', error: true }) }
  }
  if (issued) return <section className="rounded-2xl border border-line bg-white p-6 sm:p-8"><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-accent">Request issued</p><h2>Ready to share</h2><p className="text-muted">Review expires {timeText(issued.request.expires_at!)}. Awaiting decision does not confirm delivery or reading.</p><LinkBox link={issued.review_link} /><a className="mt-6 inline-block" href={'/requests/' + issued.request.id}>View request</a></section>
  return <section className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_28px_#203d3108] sm:p-8"><Message notice={notice} />{preview ? <><PreviewPanel preview={preview} project={project} />{preview.stale && <p role="alert" className="mt-5 rounded-lg border border-[#edc5b6] bg-[#fff4ef] p-4 text-[#813e25]">Project terms changed. Save this draft again before issue.</p>}{!preview.amount_valid && <p role="alert" className="mt-5 rounded-lg border border-[#edc5b6] bg-[#fff4ef] p-4 text-[#813e25]">The new total exceeds the supported maximum.</p>}<p className="mt-6 text-sm text-muted">The issued proposal freezes these terms. Check the recipient, work, price, and dates before continuing.</p><div className="mt-5 flex flex-wrap gap-3 max-[600px]:[&_button]:flex-1"><button disabled={busy || preview.stale || !preview.amount_valid} onClick={issue}>{busy ? 'Issuing…' : 'Issue request'}</button><button className={secondaryButton} onClick={() => setPreview(null)}>Back to edit</button></div></> : <><div className="mb-6 border-b border-line pb-5"><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-accent">Step 1 of 2 · Draft</p><h2>{record ? 'Edit change request' : 'Describe the change'}</h2><p className="m-0 text-sm text-muted">Current agreed terms: {project.currency} {priceText(project.current_price_minor)} · due {project.current_delivery_date}. Tax and billing are handled externally.</p></div><form onSubmit={save} onChange={() => setDirty(true)}><div className="grid gap-5 md:grid-cols-2"><label>Requested work<textarea name="description" rows={5} required defaultValue={record?.description} /><small>Describe what changes from the existing agreement.</small></label><label>Extra deliverables<textarea name="extra_deliverables" rows={5} required defaultValue={record?.extra_deliverables} /><small>List what the client will receive.</small></label></div><label>Reason for the change<textarea name="reason" rows={3} required defaultValue={record?.reason} /></label><div className="grid gap-5 border-t border-line pt-5 md:grid-cols-2"><label>Additional charge ({project.currency})<input name="price" inputMode="decimal" required defaultValue={record ? priceText(record.additional_price_minor) : ''} placeholder="0.00" /><small>Enter the added amount only, with up to two decimal places.</small></label><label>Proposed new delivery date<input name="date" type="date" required defaultValue={record?.proposed_delivery_date ?? project.current_delivery_date} /></label></div><div className="flex flex-wrap gap-3 max-[600px]:[&_button]:flex-1"><button disabled={busy}>{busy ? 'Saving…' : record ? 'Save changes' : 'Create draft'}</button>{record && <button type="button" className={secondaryButton} disabled={busy || dirty} onClick={showPreview}>Preview draft</button>}</div></form>{record && <><p className="mt-3 text-sm text-muted">{dirty ? 'Save changes before previewing the current draft.' : 'Preview the saved draft before issuing it.'}</p><div className="mt-7 border-t border-line pt-5"><button className={secondaryButton} onClick={remove}>Delete draft</button></div></>}</>}</section>
}

function IssuedRequest({ record }: { record: ChangeRequest }) {
  const [current, setCurrent] = useState(record)
  const [link, setLink] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  async function action(kind: 'withdraw' | 'duplicate' | 'rotate-link') {
    setBusy(true); setNotice(null)
    try {
      if (kind === 'duplicate') { const created = await api<ChangeRequest>(`/requests/${record.id}/duplicate`, 'POST', {}); location.assign(`/requests/${created.id}`); return }
      if (kind === 'rotate-link') { const result = await api<{ review_link: string }>(`/requests/${record.id}/rotate-link`, 'POST', {}); setLink(result.review_link); setNotice({ text: 'Previous link and verification access were revoked.' }); return }
      setCurrent(await api<ChangeRequest>(`/requests/${record.id}/withdraw`, 'POST', {}))
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Please retry.', error: true }) }
    finally { setBusy(false) }
  }
  return <div className="space-y-6"><section className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_28px_#203d3108] sm:p-8"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-accent">Issued proposal</p><h2 className="mb-0">Request status</h2></div><StatusBadge status={current.status} /></div><p className="mt-4 text-sm text-muted">{current.expires_at && <>Review expires {timeText(current.expires_at)}. </>}{current.status === 'pending' && 'Awaiting decision does not confirm delivery or reading.'}</p>{current.decided_at && <div className="mt-5 rounded-xl border border-line bg-soft p-4"><h3>Client decision</h3><p className="mb-0">{current.status === 'approved' ? 'Approved' : 'Rejected'} by {current.decision_name} ({current.decision_email}) on {timeText(current.decided_at)}{current.decision_reason ? ' · Reason: ' + current.decision_reason : ''}</p></div>}<Message notice={notice} /><div className="mt-6 flex flex-wrap items-center gap-3 max-[600px]:[&_button]:flex-1"><a className="inline-flex min-h-11 items-center rounded-[9px] border border-accent bg-accent px-[18px] py-2.5 font-bold text-white no-underline hover:bg-accent-hover hover:text-white" href={'/requests/' + record.id + '/print'}>Print record</a>{current.status === 'pending' && <><button className={secondaryButton} disabled={busy} onClick={() => action('rotate-link')}>Replace lost link</button><button className={secondaryButton} disabled={busy} onClick={() => action('withdraw')}>Withdraw request</button></>}{current.status !== 'pending' && <button className={secondaryButton} disabled={busy} onClick={() => action('duplicate')}>Duplicate as draft</button>}</div>{link && <LinkBox link={link} />}</section>{current.snapshot && <section aria-label="Frozen proposal" className="space-y-5"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.12em] text-accent">Frozen at issue</p><h2 className="mb-0">Proposal terms</h2></div><ClientProposalView snapshot={current.snapshot} /></section>}</div>
}

export function RequestsPage({ id }: { id: string }) {
  const projectId = new URLSearchParams(location.search).get('project_id')
  const load = useCallback(async () => {
    if (id === 'new') { if (!projectId) throw new Error('Choose a project first.'); return { project: await api<Project>(`/projects/${projectId}`), record: undefined, history: undefined } }
    const record = await api<ChangeRequest>(`/requests/${id}`)
    const [project, history] = await Promise.all([api<Project>(`/projects/${record.project_id}`), allEvents(id)])
    return { project, record, history }
  }, [id, projectId])
  const { data, feedback } = useLoad(load)
  return <Layout><div className="mx-auto w-full max-w-[1000px]"><a className="mb-5 inline-block text-sm" href={data ? '/projects/' + data.project.id : '/projects'}>← Back to project</a><h1>{id === 'new' ? 'New change request' : 'Change request'}</h1>{data && <p className="mb-7 text-muted">{data.project.title}{data.record && <> · <StatusBadge status={data.record.status} /></>}</p>}{feedback}{data && <div className="space-y-6">{!data.record || data.record.status === 'draft' ? <RequestEditor record={data.record} project={data.project} /> : <IssuedRequest record={data.record} />}{data.record?.linked_from_id && <p className="text-sm text-muted">Duplicated from <a href={'/requests/' + data.record.linked_from_id}>earlier request</a>.</p>}{data.history && <section className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_28px_#203d3108] sm:p-8"><EventHistory events={data.history} />{data.record?.status === 'expired' && <p className="mt-5 mb-0 text-sm text-muted">Review window ended at {timeText(data.record.expires_at!)}. Expiry may appear in history later when saved by a write.</p>}</section>}</div>}</div></Layout>
}
