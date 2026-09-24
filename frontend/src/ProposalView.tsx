import type { ProposalSnapshot } from './api'
import { priceText } from './money'

export function timeText(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
}

export function ProposalView({ snapshot }: { snapshot: ProposalSnapshot }) {
  return <dl>
    <dt>Agency</dt><dd>{snapshot.agency_name} · {snapshot.agency_contact_name} · {snapshot.agency_contact_email}</dd>
    <dt>Client and designated approver</dt><dd>{snapshot.client_name}{snapshot.client_company ? ` · ${snapshot.client_company}` : ''} · {snapshot.approver_email}</dd>
    <dt>Project</dt><dd>{snapshot.project_title}</dd>
    <dt>Original agreement recorded by agency</dt><dd>{snapshot.baseline_deliverables}<br />Exclusions: {snapshot.exclusions || 'None'}<br />{snapshot.currency} {priceText(snapshot.original_price_minor)} · Due {snapshot.original_delivery_date}</dd>
    <dt>Current agreed terms before this request</dt><dd>{snapshot.currency} {priceText(snapshot.old_total_minor)} (including {snapshot.currency} {priceText(snapshot.previously_approved_minor)} in earlier additions) · Due {snapshot.old_deadline}</dd>
    <dt>Requested work</dt><dd>{snapshot.description}<br />Reason: {snapshot.reason}<br />Extra deliverables: {snapshot.extra_deliverables}</dd>
    <dt>Additional charge</dt><dd>{snapshot.currency} {priceText(snapshot.additional_price_minor)}</dd>
    <dt>Proposed total and deadline</dt><dd>{snapshot.currency} {priceText(snapshot.new_total_minor)} · Due {snapshot.new_deadline}</dd>
  </dl>
}
