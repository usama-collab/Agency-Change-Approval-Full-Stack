import { api, type Page, type RequestEvent } from './api'
import { timeText } from './ProposalView'

const actionLabels: Record<string, string> = {
  draft_created: 'Draft created', draft_updated: 'Draft updated', issued: 'Issued',
  link_rotated: 'Review link replaced', withdrawn: 'Withdrawn',
  expired: 'Expiry recorded', approved: 'Approved', rejected: 'Rejected',
}

export function EventHistory({ events }: { events: RequestEvent[] }) {
  return <section aria-labelledby="request-history"><div className="mb-6"><p className="mb-1 text-xs font-bold uppercase tracking-[.12em] text-accent print:text-black">Activity record</p><h2 id="request-history" className="mb-1">History</h2><p className="m-0 text-sm text-muted print:text-black">Events recorded for this request, from earliest to latest.</p></div><ol className="m-0 list-none border-l-2 border-line pl-0 print:border-black">{events.map(event => <li className="relative ml-5 border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0 print:break-inside-avoid" key={event.id}><span className="absolute -left-[27px] top-5 size-3 rounded-full border-[3px] border-white bg-accent print:border-white print:bg-black" aria-hidden="true" /><div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><strong>{actionLabels[event.action] || event.action}</strong><time className="text-xs font-medium text-muted print:text-black" dateTime={event.occurred_at}>{timeText(event.occurred_at)}</time></div><p className="mb-0 mt-1 break-words text-sm text-muted print:text-black">{event.actor}{event.actor_email ? ` · ${event.actor_email}` : ''}</p></li>)}</ol></section>
}

export async function allEvents(id: string): Promise<RequestEvent[]> {
  const result: RequestEvent[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await api<Page<RequestEvent>>(`/requests/${id}/events?limit=100&offset=${offset}`)
    result.push(...page.items)
    if (result.length >= page.total) return result
  }
}
