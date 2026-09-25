import { useCallback } from 'react'
import { api, reviewApi, type ChangeRequest } from './api'
import { ClientProposalView, timeText } from './ProposalView'
import { useLoad } from './record-ui'
import { allEvents, EventHistory } from './History'
import { StatusBadge } from './ui'

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
  return <div className="mx-auto max-w-[960px] p-4 sm:p-6 print:max-w-none print:p-0 print:bg-white print:font-serif print:text-[9.5pt] print:leading-[1.3] print:text-black print:[&_button]:hidden print:[&_a]:hidden print:[&_h1]:text-[18pt] print:[&_h2]:text-[12pt] print:[&_h3]:text-[10pt] print:[&_p]:leading-[1.3]">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">{kind === 'owner' ? <a href={`/requests/${expectedId}`}>Back to request</a> : <button className="!border-line !bg-white !text-accent hover:!bg-[#edf5f1]" onClick={() => history.back()}>Back to review</button>}{data && <button onClick={() => window.print()}>Print or save as PDF</button>}</div>
    {feedback}
    {record?.snapshot && (kind === 'client' ? <main className="break-words rounded-2xl border border-line bg-white p-5 sm:p-8 print:rounded-none print:border-0 print:p-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5 print:mb-2 print:pb-2"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-accent print:text-black">Client copy</p><h1 className="mb-2">Change request record</h1><p className="m-0 text-sm text-muted print:text-black">Request ID: {record.id}<br />Project ID: {record.project_id}</p></div><StatusBadge status={record.status} /></div>
      <dl className="mb-6 grid gap-4 text-sm sm:grid-cols-2 print:mb-2 print:grid-cols-2"><div><dt className="m-0 text-muted print:text-black">Issued</dt><dd className="m-0 mt-1 font-semibold">{record.issued_at ? timeText(record.issued_at) : '—'}</dd></div><div><dt className="m-0 text-muted print:text-black">Review expires</dt><dd className="m-0 mt-1 font-semibold">{record.expires_at ? timeText(record.expires_at) : '—'}</dd></div></dl>
      <ClientProposalView snapshot={record.snapshot} />
      {record.decided_at && <section className="mt-6 rounded-xl border border-line bg-soft p-5 print:mt-2 print:break-inside-avoid print:bg-white print:p-2"><h2>Decision</h2><p className="m-0 leading-relaxed">{record.status === 'approved' ? 'Approved' : 'Rejected'} by {record.decision_name} ({record.decision_email}) on {timeText(record.decided_at)}.{record.decision_reason ? ` Reason: ${record.decision_reason}` : ''}</p></section>}
      <p className="mt-6 mb-0 text-sm leading-relaxed text-muted print:mt-2 print:text-black">The baseline is the agency’s record of the original agreement. Tax and billing are handled externally. Email verification confirms mailbox access, not corporate authority. This is an application record, not an external certification.</p>
    </main> : <main className="break-words rounded-2xl border border-line bg-white p-5 sm:p-8 print:rounded-none print:border-0 print:p-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5 print:mb-2 print:pb-2"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-accent print:text-black">Agency copy</p><h1 className="mb-2">Change request record</h1><p className="m-0 text-sm text-muted print:text-black">Request ID: {record.id}<br />Project ID: {record.project_id}</p></div><StatusBadge status={record.status} /></div>
      <dl className="mb-6 grid gap-4 text-sm sm:grid-cols-2 print:mb-2 print:grid-cols-2"><div><dt className="m-0 text-muted print:text-black">Issued</dt><dd className="m-0 mt-1 font-semibold">{record.issued_at ? timeText(record.issued_at) : '—'}</dd></div><div><dt className="m-0 text-muted print:text-black">Review expires</dt><dd className="m-0 mt-1 font-semibold">{record.expires_at ? timeText(record.expires_at) : '—'}</dd></div></dl>
      <ClientProposalView snapshot={record.snapshot} />
      {record.decided_at && <section className="mt-6 rounded-xl border border-line bg-soft p-5 print:mt-2 print:break-inside-avoid print:bg-white print:p-2"><h2>Decision</h2><p className="m-0 leading-relaxed">{record.status === 'approved' ? 'Approved' : 'Rejected'} by {record.decision_name} ({record.decision_email}) on {timeText(record.decided_at)}.{record.decision_reason ? ' Reason: ' + record.decision_reason : ''}</p></section>}
      {record.status === 'expired' && <p className="mt-5 text-sm">Review window ended at {record.expires_at && timeText(record.expires_at)}. Any expiry event below records when that status was saved.</p>}
      {data?.events && <section className="mt-8 border-t border-line pt-6 print:mt-3 print:pt-2"><EventHistory events={data.events} /></section>}
      <p className="mt-6 mb-0 text-sm leading-relaxed text-muted print:mt-2 print:text-black">The baseline is the agency’s record of the original agreement. Tax and billing are handled externally. Email verification confirms mailbox access, not corporate authority. This is an application record, not an external certification.</p>
    </main>)}
  </div>
}
