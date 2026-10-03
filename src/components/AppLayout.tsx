import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { usePerson, useAuth } from '../auth/kontext'
import { bereicheFuer } from '../lib/navigation'
import { ROLLEN_LABEL } from '../lib/types'
import { Fuss } from './Fuss'
import { Icon } from './Icon'
import { Marke } from './Marke'

export function AppLayout() {
  const person = usePerson()
  const { abmelden } = useAuth()
  const [menueOffen, setMenueOffen] = useState(false)

  const eintraege = bereicheFuer(person)
  // Pfade wie /app/team kommen pro Rolle nur einmal vor, daher ist der Pfad ein stabiler Schlüssel.
  const menue = [
    { pfad: '/app', label: 'Start', icon: 'start' as const, ende: true },
    ...eintraege.map((b) => ({
      pfad: b.schluessel === 'umfrage' ? '/app/umfrage' : b.pfad,
      label: b.menue,
      icon: b.icon,
      ende: false,
    })),
  ]

  useEffect(() => {
    if (!menueOffen) return
    const schliessen = (e: KeyboardEvent) => e.key === 'Escape' && setMenueOffen(false)
    window.addEventListener('keydown', schliessen)
    return () => window.removeEventListener('keydown', schliessen)
  }, [menueOffen])

  const links = (
    <>
      {menue.map((eintrag) => (
        <NavLink
          key={eintrag.pfad}
          to={eintrag.pfad}
          end={eintrag.ende}
          className={({ isActive }) => `nav__link${isActive ? ' aktiv' : ''}`}
          onClick={() => setMenueOffen(false)}
        >
          <Icon name={eintrag.icon} groesse={19} />
          {eintrag.label}
        </NavLink>
      ))}
    </>
  )

  return (
    <div className="seite">
      <header className="kopf">
        <div className="container kopf__innen">
          <Marke zu="/app" />
          <nav className="nav" aria-label="Hauptmenü">
            {links}
          </nav>
          <div className="kopf__rechts">
            <div className="nutzer">
              <div className="nutzer__name">{person.name}</div>
              <div className="nutzer__rolle">{ROLLEN_LABEL[person.rolle]}</div>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => void abmelden()}
              title="Abmelden"
              aria-label="Abmelden"
            >
              <Icon name="abmelden" />
            </button>
            <button
              type="button"
              className="icon-btn menu-btn"
              aria-expanded={menueOffen}
              aria-controls="mobil-menue"
              aria-label={menueOffen ? 'Menü schließen' : 'Menü öffnen'}
              onClick={() => setMenueOffen((o) => !o)}
            >
              <Icon name={menueOffen ? 'schliessen' : 'menu'} />
            </button>
          </div>
        </div>
        {menueOffen && (
          <nav id="mobil-menue" className="nav-mobil" aria-label="Hauptmenü">
            {links}
            <div className="nav-mobil__fuss klein muted">
              Angemeldet als {person.name} ({ROLLEN_LABEL[person.rolle]})
            </div>
          </nav>
        )}
      </header>

      <main className="seite__inhalt">
        <div className="container">
          <Outlet />
        </div>
      </main>

      <Fuss />
    </div>
  )
}
