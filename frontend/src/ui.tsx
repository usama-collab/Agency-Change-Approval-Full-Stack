import type { ReactNode } from 'react'
export type Notice = { text: string; error?: boolean }

export function Layout({ children }: { children: ReactNode }) {
  return <div className="shell">
    <header><a className="brand" href="/">Agency Change Approval</a><span className="tag">Owner workspace</span></header>
    <nav className="workspace links" aria-label="Workspace"><a href="/dashboard">Dashboard</a><a href="/clients">Clients</a><a href="/projects">Projects</a><a href="/agency">Agency</a></nav><main>{children}</main>
    <footer>Simple approval records for additional work.</footer>
  </div>
}

export function Message({ notice }: { notice: Notice | null }) {
  return notice && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'notice error' : 'notice'}>{notice.text}</p>
}
