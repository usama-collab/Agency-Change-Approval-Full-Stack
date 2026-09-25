export type Agency = { id: string; name: string; contact_name: string; contact_email: string }
export type Owner = { id: string; email: string; verified: boolean }

export type Client = { id: string; name: string; company: string | null; email: string }
export type Project = { id: string; client_id: string; title: string; baseline_deliverables: string; exclusions: string | null; original_price_minor: number; currency: string; delivery_date: string; current_price_minor: number; current_delivery_date: string; terms_version: number; first_issued_at: string | null }
export type ChangeRequest = { id: string; project_id: string; linked_from_id: string | null; description: string; reason: string; extra_deliverables: string; additional_price_minor: number; proposed_delivery_date: string; draft_terms_version: number; status: string; snapshot: ProposalSnapshot | null; issued_at: string | null; expires_at: string | null; decided_at: string | null; decision_name: string | null; decision_email: string | null; decision_reason: string | null }
export type ProposalSnapshot = { agency_name: string; agency_contact_name: string; agency_contact_email: string; client_name: string; client_company: string | null; approver_email: string; project_title: string; baseline_deliverables: string; exclusions: string | null; currency: string; original_price_minor: number; original_delivery_date: string; previously_approved_minor: number; old_total_minor: number; old_deadline: string; description: string; reason: string; extra_deliverables: string; additional_price_minor: number; new_total_minor: number; new_deadline: string }
export type Page<T> = { items: T[]; total: number }
export type RequestEvent = { id: string; action: string; actor: string; actor_email: string | null; occurred_at: string }
export type RequestRow = { id: string; project_id: string; project_title: string; client_name: string; description: string; currency: string; additional_price_minor: number; status: string; created_at: string; issued_at: string | null; expires_at: string | null; decided_at: string | null }
export type CurrencySummary = { currency: string; project_count: number; original_minor: string; approved_minor: string; current_minor: string; pending_minor: string }
export type DashboardSummary = { as_of: string; status_counts: Record<string, number>; currencies: CurrencySummary[] }
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

let redirectingToLogin = false

function cookie(name: string): string {
  return document.cookie.split('; ').find((part) => part.startsWith(`${name}=`))?.split('=')[1] ?? ''
}

async function csrfToken(prelogin: boolean): Promise<string> {
  const active = cookie('csrf')
  if (active && !prelogin) return decodeURIComponent(active)
  const response = await fetch('/api/auth/csrf')
  if (!response.ok) throw new Error('Could not start a secure request. Refresh and try again.')
  return (await response.json()).csrf_token
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    headers['X-CSRF-Token'] = await csrfToken(/^\/auth\/(register|resend-verification|verify|login|forgot-password|reset-password)$/.test(path))
  }
  const response = await fetch(`/api${path}`, {
    method, headers, credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = 'Something went wrong. Please retry.'
    try {
      const data = await response.json()
      if (typeof data.detail === 'string') detail = data.detail
      else if (Array.isArray(data.detail)) detail = data.detail.map((e: { loc: string[]; msg: string }) => `${e.loc.slice(1).join('.')}: ${e.msg}`).join('; ')
    } catch { /* retain generic message */ }
    if (response.status === 401 && !redirectingToLogin && (!path.startsWith('/auth/') || path === '/auth/me' || path === '/auth/logout')) {
      redirectingToLogin = true
      location.assign('/login')
    }
    throw new ApiError(detail, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function reviewApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    headers['X-CSRF-Token'] = path === '/decision' ? decodeURIComponent(cookie('review_csrf')) : await csrfToken(true)
  }
  const response = await fetch(`/api/review${path}`, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) })
  if (!response.ok) {
    let detail = 'Something went wrong. Please retry.'
    try { const data = await response.json(); if (typeof data.detail === 'string') detail = data.detail }
    catch { /* retain generic message */ }
    throw new ApiError(detail, response.status)
  }
  return response.json() as Promise<T>
}
