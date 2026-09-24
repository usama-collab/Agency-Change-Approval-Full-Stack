export type Agency = { id: string; name: string; contact_name: string; contact_email: string }
export type Owner = { id: string; email: string; verified: boolean }

export type Client = { id: string; name: string; company: string | null; email: string }
export type Project = { id: string; client_id: string; title: string; baseline_deliverables: string; exclusions: string | null; original_price_minor: number; currency: string; delivery_date: string }
export type Page<T> = { items: T[]; total: number }
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
