import { NavLink } from 'react-router-dom'
import { Dumbbell, ListChecks, LineChart, Home } from 'lucide-react'

const links = [
  { to: '/', label: 'Accueil', icon: Home },
  { to: '/programs', label: 'Programmes', icon: Dumbbell },
  { to: '/exercises', label: 'Exercices', icon: ListChecks },
  { to: '/history', label: 'Progression', icon: LineChart },
]

export function NavBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-slate-900/80">
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {links.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                  isActive ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
                }`
              }
            >
              <Icon size={20} strokeWidth={2.2} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
