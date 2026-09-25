import { useState, type FormEvent } from 'react'
import { api } from './api'
import { Layout, Message, type Notice } from './ui'
export type AuthKind = 'register' | 'login' | 'forgot' | 'reset' | 'verify' | 'resend'

export function AuthPage({ kind }: { kind: AuthKind }) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const token = new URLSearchParams(location.search).get('token') ?? ''
  const labels = { register: 'Create your owner account', login: 'Welcome back', forgot: 'Reset your password', reset: 'Choose a new password', verify: 'Verify your email', resend: 'Send a new verification link' }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    const fields = new FormData(event.currentTarget)
    const email = String(fields.get('email') ?? '')
    const password = String(fields.get('password') ?? '')
    try {
      if (kind === 'register') {
        const result = await api<{ message: string }>('/auth/register', 'POST', { email, password })
        setNotice({ text: result.message })
      } else if (kind === 'login') {
        await api('/auth/login', 'POST', { email, password })
        location.assign('/')
      } else if (kind === 'resend') {
        const result = await api<{ message: string }>('/auth/resend-verification', 'POST', { email })
        setNotice({ text: result.message })
      } else if (kind === 'forgot') {
        const result = await api<{ message: string }>('/auth/forgot-password', 'POST', { email })
        setNotice({ text: result.message })
      } else if (kind === 'reset') {
        const result = await api<{ message: string }>('/auth/reset-password', 'POST', { token, password })
        setNotice({ text: result.message })
      } else {
        const result = await api<{ message: string }>('/auth/verify', 'POST', { token })
        setNotice({ text: result.message })
      }
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Please retry.', error: true })
    } finally { setBusy(false) }
  }

  return <Layout showWorkspace={false}><section className="max-w-[760px] rounded-2xl border border-line bg-white p-[clamp(24px,3vw,36px)] shadow-[0_8px_28px_#203d3108] max-[600px]:px-[18px] max-[600px]:py-[22px] [&_form+form]:mt-9 [&_form+form]:border-t [&_form+form]:border-line [&_form+form]:pt-6 [&_section+section]:mt-[30px] mx-auto mt-11 w-full !max-w-[480px] max-[600px]:mt-4">
    <p className="mb-2 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-accent">Agency workspace</p><h1>{labels[kind]}</h1>
    <p className="mb-6 leading-[1.55] text-muted">{kind === 'register' ? 'Start with a verified email. Your agency profile comes next.' : kind === 'verify' ? 'Confirm the address linked to your owner account.' : 'Enter your details below.'}</p>
    <Message notice={notice} />
    <form onSubmit={submit}>
      {['register', 'login', 'forgot', 'resend'].includes(kind) && <label>Email address<input name="email" type="email" autoComplete="email" required /></label>}
      {['register', 'login', 'reset'].includes(kind) && <label>Password<input name="password" type="password" minLength={12} maxLength={128} autoComplete={kind === 'login' ? 'current-password' : 'new-password'} required /><small>At least 12 characters.</small></label>}
      {(kind === 'verify' || kind === 'reset') && !token && <p role="alert">This link is missing its token. Request a new email.</p>}
      <button disabled={busy || ((kind === 'verify' || kind === 'reset') && !token)}>{busy ? 'Please wait…' : kind === 'verify' ? 'Verify email' : kind === 'forgot' ? 'Send reset link' : kind === 'resend' ? 'Send link' : kind === 'reset' ? 'Change password' : kind === 'register' ? 'Create account' : 'Sign in'}</button>
    </form>
    <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[.9rem]"><a href="/login">Sign in</a><a href="/register">Create account</a><a href="/resend">Resend verification</a><a href="/forgot">Forgot password?</a></nav>
  </section></Layout>
}
