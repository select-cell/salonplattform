import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BestellLayout } from '../components/BestellLayout'
import { NOTFALL_PLAETZE, platzAusUrl } from '../lib/bestellung'
import Bestellen from './Bestellen'
import '../styles/bestellung.css'

/**
 * Startseite der Testversion: Platz wählen statt QR-Code scannen. Gibt es nur in der Testversion
 * (der produktive Build enthält diese Datei nicht). Jeder Platz hat außerdem einen Direktlink /p/<platz>.
 */
export default function TestAuswahl() {
  const [suche] = useSearchParams()

  useEffect(() => {
    const vorher = document.title
    document.title = 'Dawiid (Test)'
    return () => {
      document.title = vorher
    }
  }, [])

  // /p?platz=3 und ähnliche Ausweichlinks funktionieren auch in der Testversion
  if (platzAusUrl(suche.get('platz')) !== null) return <Bestellen />

  return (
    <BestellLayout>
      <header className="bestell__kopf">
        <h1>
          Platz <em>wählen</em>
        </h1>
        <p className="muted">
          Das ist die Testversion: Du öffnest die Bestellseite hier direkt, ohne QR-Code. Im Salon scannen die Gäste den
          QR-Code an ihrem Platz und landen auf genau der Seite ihres Platzes.
        </p>
      </header>

      <ul className="platzwahl">
        {NOTFALL_PLAETZE.map((platz) => (
          <li key={platz}>
            <Link className="platzwahl__link" to={`/p/${platz}`}>
              <span className="platzmarke__label">Platz</span>
              <span className="platzwahl__zahl">{platz}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="stack" style={{ marginTop: 24 }}>
        <div className="hinweis" role="note">
          <p>Auch in der Testversion wird die Anfrage wirklich abgeschickt und kommt beim Team an.</p>
        </div>
        <p className="klein muted">
          Jeder Platz hat einen eigenen Link, den Du auch ohne QR-Code öffnen oder teilen kannst, zum Beispiel{' '}
          <a href="/p/4">{`${window.location.origin}/p/4`}</a>
        </p>
      </div>
    </BestellLayout>
  )
}
