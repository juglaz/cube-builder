import { NavLink, Outlet } from 'react-router-dom'

const links = [
  { to: '/', label: 'Library' },
  { to: '/themes', label: 'Themes / Tagger' },
  { to: '/import', label: 'Bulk paste' },
  { to: '/cubes', label: 'Cubes' },
  { to: '/generate', label: 'Generate' },
]

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#111318]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3">
          <div>
            <p className="text-xs tracking-[0.2em] text-amber-200/70 uppercase">Local cube studio</p>
            <h1 className="text-xl text-amber-100">Cube Builder</h1>
          </div>
          <nav className="flex flex-wrap gap-1" aria-label="Main">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-sm ${
                    isActive
                      ? 'bg-amber-200/15 text-amber-100'
                      : 'text-stone-300 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <a
              href="https://juglaz.github.io/cube-builder/"
              className="rounded-full px-3 py-1.5 text-sm text-stone-300 hover:bg-white/5 hover:text-white"
            >
              Lore
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
