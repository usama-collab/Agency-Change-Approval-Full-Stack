import { useEffect, useState } from 'react'
import { AuthPage, type AuthKind } from './AuthPage'
import { AgencyPage } from './AgencyPage'
import { ClientsPage } from './ClientsPage'
import { ProjectsPage } from './ProjectsPage'
import { api, type Agency } from './api'
import { Layout } from './ui'

function Home() {
  const [error, setError] = useState('')
  useEffect(() => { api<Agency | null>('/agencies/me').then(a => location.replace(a ? '/projects' : '/agency')).catch(e => setError(e.message)) }, [])
  return <Layout>{error ? <p role="alert">{error} <a href="/">Retry</a></p> : <p role="status">Opening your workspace…</p>}</Layout>
}

export default function App() {
  const route = location.pathname
  if (['/register', '/login', '/forgot', '/reset', '/verify', '/resend'].includes(route)) return <AuthPage kind={route.slice(1) as AuthKind} />
  if (route === '/') return <Home />
  if (route === '/agency') return <AgencyPage />
  const match = route.match(/^\/(clients|projects)(?:\/(new|[0-9a-f-]{36}))?$/)
  if (match) return match[1] === 'clients' ? <ClientsPage id={match[2]} /> : <ProjectsPage id={match[2]} />
  return <Layout><h1>Page not found</h1><a href="/">Go to your workspace</a></Layout>
}
