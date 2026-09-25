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

function Money({ currency, minor }: { currency: string; minor: number }) {
  const [whole, cents] = priceText(minor).split('.')
  return <span className="tabular-nums">{currency} {whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.{cents}</span>
}

export function ClientProposalView({ snapshot }: { snapshot: ProposalSnapshot }) {
  return <div className="space-y-6 print:space-y-2">
    <section aria-labelledby="proposal-parties" className="rounded-xl border border-line bg-white p-5 sm:p-6 print:border-0 print:p-0">
      <p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-accent print:text-black">Change request for</p>
      <h2 id="proposal-parties" className="mb-2">{snapshot.project_title}</h2>
      <p className="mb-1 text-sm text-muted print:text-black">{snapshot.agency_name} · {snapshot.agency_contact_name} · {snapshot.agency_contact_email}</p>
      <p className="m-0 text-sm text-muted print:text-black">{snapshot.client_name}{snapshot.client_company ? ` · ${snapshot.client_company}` : ''} · {snapshot.approver_email}</p>
    </section>

    <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
      <section aria-labelledby="existing-work-title" className="min-w-0 rounded-xl border border-line bg-soft p-5 sm:p-6 print:break-inside-avoid print:bg-white print:p-2">
        <p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-muted print:text-black">Before this request</p>
        <h2 id="existing-work-title" className="text-lg">Existing work</h2>
        <p className="mb-3 whitespace-pre-wrap leading-relaxed print:mb-1">{snapshot.baseline_deliverables}</p>
        <p className="m-0 text-sm leading-relaxed text-muted print:text-black"><strong className="text-ink">Exclusions:</strong> {snapshot.exclusions || 'None'}</p>
      </section>
      <section aria-labelledby="added-work-title" className="min-w-0 rounded-xl border border-[#b9d8cd] bg-[#f2f8f5] p-5 sm:p-6 print:break-inside-avoid print:bg-white print:p-2">
        <p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-accent print:text-black">For your decision</p>
        <h2 id="added-work-title" className="text-lg">Additional work</h2>
        <p className="mb-3 whitespace-pre-wrap leading-relaxed print:mb-1">{snapshot.description}</p>
        <dl className="m-0 text-sm leading-relaxed">
          <dt className="mt-3 print:mt-1">Reason</dt><dd className="mt-1 whitespace-pre-wrap">{snapshot.reason}</dd>
          <dt className="mt-3 print:mt-1">Extra deliverables</dt><dd className="mt-1 whitespace-pre-wrap">{snapshot.extra_deliverables}</dd>
        </dl>
      </section>
    </div>

    <section aria-labelledby="terms-title" className="rounded-xl border border-line bg-white p-5 sm:p-6 print:break-inside-avoid print:p-2">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 print:mb-2">
        <h2 id="terms-title" className="m-0">Price and delivery</h2>
        <span className="text-xs font-semibold text-muted print:text-black">All amounts in {snapshot.currency}</span>
      </div>
      <dl className="m-0 divide-y divide-line">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 first:pt-0 print:py-1"><dt className="m-0 font-medium text-muted print:text-black">Original agreement recorded by agency</dt><dd className="m-0 font-semibold"><Money currency={snapshot.currency} minor={snapshot.original_price_minor} /></dd></div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 print:py-1"><dt className="m-0 font-medium text-muted print:text-black">Earlier approved additions</dt><dd className="m-0 font-semibold"><Money currency={snapshot.currency} minor={snapshot.previously_approved_minor} /></dd></div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 print:py-1"><dt className="m-0 font-medium text-muted print:text-black">Current agreed total</dt><dd className="m-0 font-semibold"><Money currency={snapshot.currency} minor={snapshot.old_total_minor} /></dd></div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 print:py-1"><dt className="m-0 font-semibold">Additional charge for this request</dt><dd className="m-0 font-bold text-accent print:text-black"><Money currency={snapshot.currency} minor={snapshot.additional_price_minor} /></dd></div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-lg bg-[#e7f2ed] px-4 py-4 -mx-4 print:mx-0 print:bg-white print:px-0 print:py-1"><dt className="m-0 font-bold">Proposed total if approved</dt><dd className="m-0 text-lg font-bold"><Money currency={snapshot.currency} minor={snapshot.new_total_minor} /></dd></div>
      </dl>
      <div className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-3 print:mt-2 print:grid-cols-3 print:pt-2">
        <div><p className="mb-1 text-xs font-semibold text-muted print:text-black">Original delivery</p><p className="m-0 font-semibold">{snapshot.original_delivery_date}</p></div>
        <div><p className="mb-1 text-xs font-semibold text-muted print:text-black">Current agreed delivery</p><p className="m-0 font-semibold">{snapshot.old_deadline}</p></div>
        <div className="rounded-lg bg-[#e7f2ed] p-3 -m-3 max-sm:m-0 print:bg-white print:p-0"><p className="mb-1 text-xs font-semibold text-[#275c50] print:text-black">Proposed delivery if approved</p><p className="m-0 font-bold">{snapshot.new_deadline}</p></div>
      </div>
    </section>
  </div>
}
