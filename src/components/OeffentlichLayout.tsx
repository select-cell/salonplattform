import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/kontext'
import { Fuss } from './Fuss'
import { Marke } from './Marke'
import { ThemaSchalter } from './ThemaSchalter'

export function OeffentlichLayout() {
  const { sitzung } = useAuth()
  return (
    <div className="seite">
      <header className="kopf">
        <div className="container kopf__innen">
          <Marke />
          <div className="kopf__rechts">
            <ThemaSchalter />
            <Link to={sitzung ? '/app' : '/login'} className="btn btn--ghost">
              {sitzung ? 'Zum Bereich' : 'Anmelden'}
            </Link>
          </div>
        </div>
      </header>
      <Outlet />
      <Fuss />
    </div>
  )
}
