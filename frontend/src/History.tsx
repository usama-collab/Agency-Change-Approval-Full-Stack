import { api, type Page, type RequestEvent } from './api'
import { timeText } from './ProposalView'

const actionLabels: Record<string, string> = {
  draft_created: 'Draft created', draft_updated: 'Draft updated', issued: 'Issued',
  link_rotated: 'Review link replaced', withdrawn: 'Withdrawn',
  expired: 'Expiry recorded', approved: 'Approved', rejected: 'Rejected',
}

export function EventHistory({ events }: { events: RequestEvent[] }) {
  return <section><h2>History</h2><ol className="event-list">{events.map(event => <li key={event.id}><strong>{actionLabels[event.action] || event.action}</strong> · {timeText(event.occurred_at)} · {event.actor}{event.actor_email ? ` (${event.actor_email})` : ''}</li>)}</ol></section>
}

export async function allEvents(id: string): Promise<RequestEvent[]> {
  const result: RequestEvent[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await api<Page<RequestEvent>>(`/requests/${id}/events?limit=100&offset=${offset}`)
    result.push(...page.items)
    if (result.length >= page.total) return result
  }
}
