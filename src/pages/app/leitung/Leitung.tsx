import { NavLink, Outlet } from 'react-router-dom'
import { usePerson } from '../../../auth/kontext'
import { LEITUNG_SEITEN } from '../../../lib/leitung'

/** /app/leitung: gemeinsamer Rahmen mit Unter-Navigation für Verantwortliche und Admin. */
export default function Leitung() {
  const person = usePerson()
  const seiten = LEITUNG_SEITEN.filter((s) => !s.nurAdmin || person.rolle === 'admin')
  return (
    <div className="stack stack-l">
      <nav className="unternav" aria-label="Leitung">
        {seiten.map((s) => (
          <NavLink key={s.pfad} to={s.pfad} className={({ isActive }) => `unternav__link${isActive ? ' aktiv' : ''}`}>
            {s.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
