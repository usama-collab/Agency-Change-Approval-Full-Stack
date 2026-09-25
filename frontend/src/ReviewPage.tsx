import { useEffect, useState, type FormEvent } from 'react'
import { reviewApi, type ProposalSnapshot } from './api'
import { ClientProposalView, timeText } from './ProposalView'
import { Message, StatusBadge, type Notice } from './ui'

type Access = { request_id: string; status: string; masked_email: string; expires_at: string }
type Proposal = { id: string; status: string; snapshot: ProposalSnapshot; issued_at: string; expires_at: string; decided_at: string | null; decision_name: string | null; decision_email: string | null; decision_reason: string | null }

const panel = 'rounded-2xl border border-line bg-white p-5 shadow-[0_8px_28px_#203d3108] sm:p-8'

export function ReviewPage() {
  const token = new URLSearchParams(location.hash.slice(1)).get('token')
  const [access, setAccess] = useState<Access | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    if (!token) { setNotice({ text: 'Review link is missing.', error: true }); setLoading(false); return }
    Promise.allSettled([reviewApi<Access>('/access', 'POST', { token }), reviewApi<Proposal>('/proposal')]).then(([a, p]) => {
      if (!active) return
      if (a.status === 'fulfilled') setAccess(a.value)
      else setNotice({ text: a.reason instanceof Error ? a.reason.message : 'Review link is unavailable.', error: true })
      if (p.status === 'fulfilled' && a.status === 'fulfilled' && p.value.id === a.value.request_id) setProposal(p.value)
      setLoading(false)
    })
    return () => { active = false }
  }, [token])

  async function sendCode() {
    setBusy(true); setNotice(null)
    try { await reviewApi('/code', 'POST', { token }); setNotice({ text: 'Check the designated email for a six-digit code.' }) }
    catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Please retry.', error: true }) }
    finally { setBusy(false) }
  }

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setNotice(null)
    const code = String(new FormData(e.currentTarget).get('code') ?? '').trim()
    try { await reviewApi('/verify', 'POST', { token, code }); setProposal(await reviewApi<Proposal>('/proposal')) }
    catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Please retry.', error: true }) }
    finally { setBusy(false) }
  }

  async function decide(e: FormEvent<HTMLFormElement>, decision: 'approved' | 'rejected') {
    e.preventDefault(); setBusy(true); setNotice(null)
    const fields = new FormData(e.currentTarget)
    try {
      const result = await reviewApi<Proposal>('/decision', 'POST', {
        decision, name: String(fields.get('name') ?? '').trim(),
        agreement: fields.get('agreement') === 'on',
        reason: String(fields.get('reason') ?? '').trim() || null,
      })
      setProposal(result)
      window.scrollTo({ top: 0, behavior: 'instant' })
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Please retry.', error: true }) }
    finally { setBusy(false) }
  }

  const stage = proposal?.status !== 'pending' && proposal ? 3 : proposal ? 2 : 1

  return <div className="flex min-h-screen flex-col">
    <a className="absolute top-[-70px] left-4 z-10 rounded-lg border-2 border-accent bg-white px-3.5 py-2.5 focus:top-3" href="#review-main">Skip to review</a>
    <header className="border-b border-line bg-white"><div className="mx-auto flex min-h-[76px] max-w-[1120px] items-center justify-between gap-4 px-5">
      <span className="inline-flex items-center gap-3 text-sm font-bold tracking-[-.02em] text-ink sm:text-base"><span className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-[#dff0e9] text-[.72rem] tracking-[-.05em] text-[#14594f]" aria-hidden="true">AC</span>Agency Change Approval</span>
      <span className="hidden rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted sm:inline-flex">Client review</span>
    </div></header>
    <main id="review-main" className="w-full flex-1 px-4 py-8 sm:px-6 sm:py-12"><div className="mx-auto max-w-[960px]">
      <div className="mb-7"><p className="mb-2 text-xs font-extrabold uppercase tracking-[.12em] text-accent">Client review</p><h1 className="mb-2">Review additional work</h1><p className="m-0 max-w-[680px] leading-relaxed text-muted">Verify your email, compare the proposed changes, then record your decision.</p></div>
      <ol aria-label="Review steps" className="mb-7 grid grid-cols-3 gap-2 border-y border-line py-4 text-xs sm:gap-4 sm:text-sm">{['Verify email', 'Review terms', 'Decision'].map((label, index) => <li key={label} aria-current={stage === index + 1 ? 'step' : undefined} className={`flex items-center gap-2 font-semibold ${stage >= index + 1 ? 'text-accent' : 'text-muted'}`}><span className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs ${stage >= index + 1 ? 'border-accent bg-[#e7f2ed]' : 'border-line bg-white'}`}>{index + 1}</span><span>{label}</span></li>)}</ol>
      {loading ? <div role="status" className={panel}>Loading review…</div> : <>
        <Message notice={notice} />
        {access && !proposal && <section className={`${panel} max-w-[680px]`} aria-labelledby="verify-title">
          <p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-accent">Step 1 of 3</p><h2 id="verify-title" className="mb-3">Verify your email</h2>
          <p className="mb-5 leading-relaxed text-muted">Only the designated recipient can view the proposal. A forwarded link alone does not grant access.</p>
          <div className="mb-6 rounded-xl border border-line bg-soft p-4 text-sm"><p className="mb-1">Designated email: <strong>{access.masked_email}</strong></p><p className="m-0 text-muted">Review window closes {timeText(access.expires_at)}.</p></div>
          {access.status === 'pending' ? <div className="space-y-6"><button type="button" className="w-full sm:w-auto" disabled={busy} onClick={sendCode}>{busy ? 'Please wait…' : 'Send verification code'}</button>
            <form onSubmit={verify} className="max-w-[400px] border-t border-line pt-6"><label>Six-digit verification code<input name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required placeholder="000000" /></label><button disabled={busy}>{busy ? 'Verifying…' : 'Verify and view proposal'}</button></form>
          </div> : <p className="m-0 leading-relaxed">This request is {access.status}. Contact the agency if you need a new request.</p>}
        </section>}
        {proposal && <div className="space-y-6">
          <div className={`${panel} flex flex-wrap items-center justify-between gap-4`}><div><p className="mb-1 text-xs font-bold uppercase tracking-[.12em] text-accent">{proposal.status === 'pending' ? 'Step 2 of 3' : 'Decision recorded'}</p><p className="m-0 text-sm text-muted">Review window closes {timeText(proposal.expires_at)}.</p></div><StatusBadge status={proposal.status} /></div>
          {proposal.status === 'pending' && <ClientProposalView snapshot={proposal.snapshot} />}
          {proposal.status === 'pending' ? <section aria-labelledby="decision-title" className={panel}>
            <p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-accent">Step 3 of 3</p><h2 id="decision-title" className="mb-2">Record your decision</h2>
            <p className="mb-6 max-w-[740px] text-sm leading-relaxed text-muted">The additional charge is the total agreed extra amount. Tax and billing are handled externally. Email verification confirms mailbox access, not corporate authority.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <form onSubmit={e => decide(e, 'approved')} className="content-start rounded-xl border border-[#b9d8cd] bg-[#f2f8f5] p-5 sm:p-6"><div><h3 className="mb-1 text-lg">Approve this request</h3><p className="m-0 text-sm leading-relaxed text-muted">Agree to the displayed work, charge, and proposed delivery date.</p></div><label>Your name<input name="name" maxLength={120} autoComplete="name" required /></label><label className="flex items-start gap-3 text-sm leading-relaxed font-medium"><input name="agreement" type="checkbox" required className="mt-0.5 size-5 min-h-0 shrink-0 accent-accent" /><span>I agree to the displayed work, additional price, and proposed delivery date.</span></label><button disabled={busy}>{busy ? 'Recording decision…' : 'Approve request'}</button></form>
              <form onSubmit={e => decide(e, 'rejected')} className="content-start rounded-xl border border-line p-5 sm:p-6"><div><h3 className="mb-1 text-lg">Reject this request</h3><p className="m-0 text-sm leading-relaxed text-muted">The current agreed terms remain unchanged.</p></div><label>Your name<input name="name" maxLength={120} autoComplete="name" required /></label><label>Reason (optional)<textarea name="reason" maxLength={1000} rows={3} /></label><button className="!border-line !bg-white !text-accent hover:!bg-[#edf5f1]" disabled={busy}>{busy ? 'Recording decision…' : 'Reject request'}</button></form>
            </div>
          </section> : <section className={panel} aria-labelledby="decision-result">
            <p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-accent">Step 3 of 3</p><h2 id="decision-result">{proposal.status === 'approved' ? 'Request approved' : proposal.status === 'rejected' ? 'Request rejected' : `Request ${proposal.status}`}</h2>
            <p role="status" className="leading-relaxed text-muted">{proposal.decided_at ? `Decision recorded for ${proposal.decision_name} (${proposal.decision_email}) at ${timeText(proposal.decided_at)}.${proposal.decision_reason ? ` Reason: ${proposal.decision_reason}` : ''}` : `This request is ${proposal.status}.`}</p>
            <a className="inline-flex min-h-11 items-center justify-center rounded-[9px] border border-accent bg-accent px-[18px] py-2.5 font-bold text-white no-underline hover:bg-accent-hover hover:text-white" href={`/review/print?request_id=${proposal.id}`}>Print or save record</a>
          </section>}
          {proposal.status !== 'pending' && <ClientProposalView snapshot={proposal.snapshot} />}
        </div>}
      </>}
    </div></main>
    <footer>Client review · Agency Change Approval</footer>
  </div>
}
