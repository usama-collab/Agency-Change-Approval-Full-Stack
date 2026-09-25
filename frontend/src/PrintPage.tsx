import { useCallback } from 'react'
import { api, reviewApi, type ChangeRequest } from './api'
import { ProposalView, timeText } from './ProposalView'
import { useLoad } from './record-ui'
import { allEvents, EventHistory } from './History'

type ClientRecord = Pick<ChangeRequest, 'id' | 'project_id' | 'status' | 'snapshot' | 'issued_at' | 'expires_at' | 'decided_at' | 'decision_name' | 'decision_email' | 'decision_reason'>

export function PrintPage({ kind, id }: { kind: 'owner' | 'client'; id?: string }) {
  const expectedId = kind === 'owner' ? id : new URLSearchParams(location.search).get('request_id')
  const load = useCallback(async () => {
    if (!expectedId) throw new Error('Request ID is missing.')
    if (kind === 'client') {
      const record = await reviewApi<ClientRecord>('/proposal')
      if (record.id !== expectedId) throw new Error('This review session belongs to another request.')
      return { record, events: null }
    }
    const record = await api<ChangeRequest>(`/requests/${expectedId}`)
    if (!record.snapshot) throw new Error('Only issued requests have printable records.')
    return { record, events: await allEvents(expectedId) }
  }, [expectedId, kind])
  const { data, feedback } = useLoad(load, kind === 'owner')
  const record = data?.record
  return <div className="print-shell"><div className="print-controls">{kind === 'owner' ? <a href={`/requests/${expectedId}`}>Back to request</a> : <button className="secondary" onClick={() => history.back()}>Back to review</button>}{data && <button onClick={() => window.print()}>Print or save as PDF</button>}</div>{feedback}{record?.snapshot && <main className="print-record"><h1>Change request record</h1><p>Request ID: {record.id}<br />Project ID: {record.project_id}</p><p><strong>Status: {record.status}</strong></p><dl><dt>Issued</dt><dd>{record.issued_at ? timeText(record.issued_at) : '—'}</dd><dt>Review expires</dt><dd>{record.expires_at ? timeText(record.expires_at) : '—'}</dd>{record.decided_at && <><dt>Decision</dt><dd>{timeText(record.decided_at)} · {record.decision_name} ({record.decision_email}){record.decision_reason ? ` · Reason: ${record.decision_reason}` : ''}</dd></>}</dl><ProposalView snapshot={record.snapshot} />{record.status === 'expired' && <p>Review window ended at {record.expires_at && timeText(record.expires_at)}. Any expiry event below records when that status was saved.</p>}{data?.events && <EventHistory events={data.events} />}<p className="muted">The baseline is the agency’s record of the original agreement. Tax and billing are handled externally. Email verification confirms mailbox access, not corporate authority. This is an application record, not an external certification.</p></main>}</div>
}
