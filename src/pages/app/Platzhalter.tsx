import { Link, useLocation } from 'react-router-dom'
import { usePerson } from '../../auth/kontext'
import { Icon } from '../../components/Icon'
import { findeBereich } from '../../lib/navigation'
import NotFound from '../NotFound'

interface Props {
  /** Überschrift abweichend vom Bereich, z. B. „Umfrage Oktober 2026“ */
  titel?: string
  geplant?: readonly string[]
}

/** „Kommt bald“-Seite: zeigt, was in dem Bereich entstehen wird (Plan §3). */
export default function Platzhalter({ titel, geplant }: Props) {
  const person = usePerson()
  const { pathname } = useLocation()
  const bereich = findeBereich(person, pathname)
  if (!bereich) return <NotFound zu="/app" />

  return (
    <div className="platzhalter">
      <div>
        <p className="overline">Kommt bald</p>
        <h1 style={{ marginTop: 8 }}>{titel ?? bereich.titel}</h1>
        <p className="muted" style={{ marginTop: 10 }}>
          {bereich.kurz}
        </p>
      </div>

      <section className="karte karte--creme" style={{ width: '100%' }}>
        <h2 className="abschnitt-titel">Das erwartet dich hier</h2>
        <ul className="platzhalter__liste">
          {(geplant ?? bereich.geplant).map((punkt) => (
            <li key={punkt}>{punkt}</li>
          ))}
        </ul>
      </section>

      <Link to="/app" className="btn btn--ghost">
        <Icon name="start" groesse={18} /> Zurück zur Übersicht
      </Link>
    </div>
  )
}
