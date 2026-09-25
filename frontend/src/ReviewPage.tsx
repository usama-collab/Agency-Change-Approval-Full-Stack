import { useEffect, useState, type FormEvent } from 'react'
import { reviewApi, type ProposalSnapshot } from './api'
import { ProposalView, timeText } from './ProposalView'
import { Message, type Notice } from './ui'

type Access = { request_id: string; status: string; masked_email: string; expires_at: string }
type Proposal = { id: string; status: string; snapshot: ProposalSnapshot; issued_at: string; expires_at: string; decided_at: string | null; decision_name: string | null; decision_email: string | null; decision_reason: string | null }

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
    const f = new FormData(e.currentTarget)
    try {
      const result = await reviewApi<Proposal>('/decision', 'POST', { decision, name: String(f.get('name') ?? '').trim(), agreement: f.get('agreement') === 'on', reason: String(f.get('reason') ?? '').trim() || null })
      setProposal(result)
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Please retry.', error: true }) }
    finally { setBusy(false) }
  }
  return <div className="shell"><header><span className="brand">Agency Change Approval</span><span className="tag">Client review</span></header><main><div className="workspace"><h1>Review additional work</h1><section className="card">{loading ? <p role="status">Loading review…</p> : <><Message notice={notice} />{access && !proposal && <><p>Designated recipient: <strong>{access.masked_email}</strong></p><p>Review window closes {timeText(access.expires_at)}.</p>{access.status === 'pending' ? <><p>Verify access to this email before the proposal is shown. A forwarded link alone does not grant access.</p><button disabled={busy} onClick={sendCode}>Send verification code</button><form onSubmit={verify}><label>Six-digit verification code<input name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required /></label><button disabled={busy}>Verify and view proposal</button></form></> : <p>This request is {access.status}. Contact the agency if you need a new request.</p>}</>}{proposal && <><p>Status: <strong>{proposal.status}</strong> · Review expires {timeText(proposal.expires_at)}</p><ProposalView snapshot={proposal.snapshot} />{proposal.status === 'pending' ? <><p className="muted">The additional charge is the total agreed extra amount. Tax and billing are handled externally. Email verification confirms mailbox access, not corporate authority.</p><form onSubmit={e => decide(e, 'approved')}><h2>Approve</h2><label>Your name<input name="name" maxLength={120} required /></label><label className="checkline"><input name="agreement" type="checkbox" required />I agree to the displayed work, additional price, and proposed delivery date.</label><button disabled={busy}>Approve request</button></form><form onSubmit={e => decide(e, 'rejected')}><h2>Reject</h2><label>Your name<input name="name" maxLength={120} required /></label><label>Reason (optional)<textarea name="reason" maxLength={1000} rows={3} /></label><button className="secondary" disabled={busy}>Reject request</button></form></> : <><p role="status">{proposal.decided_at ? `Decision recorded for ${proposal.decision_name} (${proposal.decision_email}) at ${timeText(proposal.decided_at)}.${proposal.decision_reason ? ` Reason: ${proposal.decision_reason}` : ''}` : `This request is ${proposal.status}.`}</p><a href={`/review/print?request_id=${proposal.id}`}>Print or save record</a></>}</>}</>}</section></div></main><footer>Client review</footer></div>
}
