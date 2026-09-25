import type { ReactNode } from 'react'

export type Notice = { text: string; error?: boolean }

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  pending: 'Awaiting decision',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
}

export function StatusBadge({ status }: { status: string }) {
  const known = Object.hasOwn(statusLabels, status)
  const colors: Record<string, string> = {
    draft: 'border-[#d7dfdc] bg-[#f0f3f2] text-[#435b55]',
    pending: 'border-[#e8d39f] bg-[#fff5d9] text-[#79531d]',
    approved: 'border-[#b7dcc5] bg-[#e6f5eb] text-[#205a39]',
    rejected: 'border-[#e9c4bb] bg-[#fff0eb] text-[#8a3f2d]',
    withdrawn: 'border-[#d9e0e4] bg-[#f1f4f5] text-[#526269]',
    expired: 'border-[#d9e0e4] bg-[#f1f4f5] text-[#526269]',
  }
  return <span className={`inline-flex min-h-[25px] items-center whitespace-nowrap rounded-full border px-[9px] py-1 text-[.73rem] font-bold leading-[1.1] ${colors[known ? status : 'draft']}`}>{statusLabels[status] ?? status}</span>
}

export function Layout({ children, showWorkspace = true }: { children: ReactNode; showWorkspace?: boolean }) {
  const route = location.pathname
  const activeRoute = route.startsWith('/requests/') ? '/projects' : route
  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/clients', label: 'Clients' },
    { href: '/projects', label: 'Projects' },
    { href: '/agency', label: 'Agency' },
  ]
  return <div className="flex min-h-screen flex-col">
    <a className="absolute top-[-70px] left-4 z-10 rounded-lg border-2 border-accent bg-white px-3.5 py-2.5 focus:top-3" href="#main-content">Skip to content</a>
    <header className="border-b border-line bg-white"><div className="mx-auto flex min-h-[76px] w-[min(calc(100%-48px),1200px)] items-center justify-between gap-6 max-[800px]:w-[min(calc(100%-32px),1200px)] max-[800px]:flex-wrap max-[800px]:gap-0 max-[800px]:pt-3.5 max-[800px]:pb-2.5">
      <a className="inline-flex items-center gap-3 whitespace-nowrap text-[.96rem] font-bold tracking-[-.025em] text-ink no-underline hover:text-ink" href="/"><span className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-[#dff0e9] text-[.72rem] tracking-[-.05em] text-[#14594f]" aria-hidden="true">AC</span><span>Agency Change Approval</span></a>
      {showWorkspace && <nav className="flex flex-wrap items-center gap-1 max-[800px]:mt-2.5 max-[800px]:w-full max-[800px]:flex-nowrap max-[800px]:overflow-x-auto max-[600px]:grid max-[600px]:grid-cols-4 max-[600px]:gap-px max-[600px]:overflow-visible [&_a]:rounded-lg [&_a]:px-3.5 [&_a]:py-2.5 [&_a]:text-[.9rem] [&_a]:font-semibold [&_a]:text-[#4d625d] [&_a]:no-underline [&_a]:whitespace-nowrap [&_a:hover]:bg-[#f3f7f5] [&_a:hover]:text-ink [&_a[aria-current=page]]:bg-[#e7f2ed] [&_a[aria-current=page]]:text-[#12594f] max-[600px]:[&_a]:px-0.5 max-[600px]:[&_a]:py-[9px] max-[600px]:[&_a]:text-center max-[600px]:[&_a]:text-[.78rem]" aria-label="Workspace">
        {links.map(link => <a key={link.href} href={link.href} aria-current={activeRoute === link.href || (link.href !== '/dashboard' && activeRoute.startsWith(`${link.href}/`)) ? 'page' : undefined}>{link.label}</a>)}
      </nav>}
    </div></header>
    <main id="main-content" className="w-full flex-1 px-6 pt-[42px] pb-[72px] max-[800px]:px-4 max-[800px]:pt-[30px] max-[800px]:pb-14">{children}</main>
    <footer>Simple approval records for additional work.</footer>
  </div>
}

export function Message({ notice }: { notice: Notice | null }) {
  return notice && <p role={notice.error ? 'alert' : 'status'} className={`mb-5 rounded-[9px] border px-4 py-[13px] leading-normal print:hidden ${notice.error ? 'border-[#edc5b6] bg-[#fff4ef] text-[#813e25]' : 'border-[#b6ddc8] bg-[#edf8f1] text-[#20523a]'}`}>{notice.text}</p>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-[#cbdad2] bg-soft px-6 py-9 text-center [&_h3]:text-[1.08rem] [&_p]:mx-auto [&_p]:mb-[18px] [&_p]:max-w-[440px] [&_p]:leading-normal [&_p]:text-muted"><h3>{title}</h3><p>{description}</p>{action}</div>
}
