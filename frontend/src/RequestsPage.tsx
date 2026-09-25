import { useCallback, useState, type FormEvent } from 'react'
import { api, type ChangeRequest, type Project } from './api'
import { parsePrice, priceText } from './money'
import { ProposalView, timeText } from './ProposalView'
import { allEvents, EventHistory } from './History'
import { useLoad } from './record-ui'
import { Layout, Message, type Notice } from './ui'

type DraftInput = Pick<ChangeRequest, 'description' | 'reason' | 'extra_deliverables' | 'additional_price_minor' | 'proposed_delivery_date'>
type Preview = { request: ChangeRequest; project_title: string; client_name: string; recipient_email: string; currency: string; original_price_minor: number; current_price_minor: number; new_total_minor: number; original_delivery_date: string; current_delivery_date: string; stale: boolean; amount_valid: boolean }

function LinkBox({ link }: { link: string }) {
  const [notice, setNotice] = useState('')
  return <section aria-label="Share review link"><p>Copy this private review link and share it through your chosen channel. The client must still verify their email. Issuing does not send an invitation.</p><label>Review link<input readOnly value={link} onFocus={e => e.currentTarget.select()} /></label><button type="button" onClick={() => navigator.clipboard.writeText(link).then(() => setNotice('Link copied.')).catch(() => setNotice('Select and copy the link above.'))}>Copy link</button>{notice && <p role="status">{notice}</p>}</section>
}

function RequestEditor({ record, project }: { record?: ChangeRequest; project: Project }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [issued, setIssued] = useState<{ request: ChangeRequest; review_link: string } | null>(null)
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
  if (issued) return <><p role="status">Request issued. It expires {timeText(issued.request.expires_at!)}. Pending means awaiting a decision; delivery or reading is not confirmed.</p><LinkBox link={issued.review_link} /><a href={`/requests/${issued.request.id}`}>View request</a></>
  return <><p className="muted">Project: {project.title}. Current terms: {project.currency} {priceText(project.current_price_minor)}, due {project.current_delivery_date}. Tax and billing are handled externally.</p><Message notice={notice} />{preview ? <section><h2 tabIndex={-1} ref={node => node?.focus()}>Review before issue</h2><p>{preview.project_title} · {preview.client_name} · {preview.recipient_email}</p><dl><dt>Work</dt><dd>{preview.request.description}</dd><dt>Reason</dt><dd>{preview.request.reason}</dd><dt>Extra deliverables</dt><dd>{preview.request.extra_deliverables}</dd><dt>Original total and deadline</dt><dd>{preview.currency} {priceText(preview.original_price_minor)} · {preview.original_delivery_date}</dd><dt>Current total and deadline</dt><dd>{preview.currency} {priceText(preview.current_price_minor)} · {preview.current_delivery_date}</dd><dt>Additional charge</dt><dd>{preview.currency} {priceText(preview.request.additional_price_minor)}</dd><dt>Proposed total and deadline</dt><dd>{preview.currency} {priceText(preview.new_total_minor)} · {preview.request.proposed_delivery_date}</dd></dl>{preview.stale && <p role="alert">Project terms changed. Save this draft again before issue.</p>}{!preview.amount_valid && <p role="alert">The new total exceeds the supported maximum.</p>}<div className="actions"><button disabled={busy || preview.stale || !preview.amount_valid} onClick={issue}>{busy ? 'Issuing…' : 'Issue request'}</button><button className="secondary" onClick={() => setPreview(null)}>Back to edit</button></div></section> : <><form onSubmit={save}><label>Description<textarea name="description" rows={4} required defaultValue={record?.description} /></label><label>Reason<textarea name="reason" rows={3} required defaultValue={record?.reason} /></label><label>Extra deliverables<textarea name="extra_deliverables" rows={4} required defaultValue={record?.extra_deliverables} /></label><div className="columns"><label>Additional charge ({project.currency})<input name="price" inputMode="decimal" required defaultValue={record ? priceText(record.additional_price_minor) : ''} placeholder="0.00" /></label><label>Proposed new delivery date<input name="date" type="date" required defaultValue={record?.proposed_delivery_date ?? project.current_delivery_date} /></label></div><button disabled={busy}>{busy ? 'Saving…' : record ? 'Save draft' : 'Create draft'}</button></form>{record && <div className="actions"><button className="secondary" onClick={showPreview}>Preview draft</button><button className="secondary" onClick={remove}>Delete draft</button></div>}</>}</>
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
  return <><p>Status: <strong>{current.status}</strong>{current.expires_at && ` · Review expires ${timeText(current.expires_at)}`}</p>{current.status === 'pending' && <p className="muted">Pending means awaiting a decision; it does not confirm delivery or reading.</p>}<Message notice={notice} />{current.snapshot && <ProposalView snapshot={current.snapshot} />}{current.decided_at && <p>Decision by {current.decision_name} ({current.decision_email}) at {timeText(current.decided_at)}{current.decision_reason ? ` · Reason: ${current.decision_reason}` : ''}</p>}<div className="actions"><a href={`/requests/${record.id}/print`}>Print record</a>{current.status === 'pending' && <><button disabled={busy} onClick={() => action('rotate-link')}>Replace lost link</button><button className="secondary" disabled={busy} onClick={() => action('withdraw')}>Withdraw request</button></>}{current.status !== 'pending' && <button className="secondary" disabled={busy} onClick={() => action('duplicate')}>Duplicate as draft</button>}</div>{link && <LinkBox link={link} />}</>
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
  return <Layout><div className="workspace"><h1>{id === 'new' ? 'New change request' : 'Change request'}</h1>{feedback}{data && <><p><a href={`/projects/${data.project.id}`}>Back to project</a></p><section className="card">{!data.record || data.record.status === 'draft' ? <RequestEditor record={data.record} project={data.project} /> : <IssuedRequest record={data.record} />}</section>{data.record?.linked_from_id && <p>Duplicated from <a href={`/requests/${data.record.linked_from_id}`}>earlier request</a>.</p>}{data.history && <section className="card"><EventHistory events={data.history} />{data.record?.status === 'expired' && <p>Review window ended at {timeText(data.record.expires_at!)}. Expiry may appear in history later when saved by a write.</p>}</section>}</>}</div></Layout>
}
