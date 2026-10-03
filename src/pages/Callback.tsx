import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/kontext'
import { Icon } from '../components/Icon'
import { Ladeanzeige } from '../components/Ladeanzeige'
import { urlFehlerBeimStart } from '../lib/urlFehler'

/** Wie lange wir auf die Sitzung warten, bevor wir den Link für ungültig halten. */
const GEDULD_MS = 8000

function meldung(code: string | undefined): string {
  if (code === 'otp_expired') {
    return 'Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte fordere einen neuen an.'
  }
  return 'Mit diesem Link hat die Anmeldung leider nicht geklappt. Bitte fordere einen neuen an.'
}

/** Rücksprung aus dem Magic Link. Die Weiterleitung nach Rolle übernimmt /app. */
export default function Callback() {
  const { laedt, sitzung } = useAuth()
  const [zuLange, setZuLange] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setZuLange(true), GEDULD_MS)
    return () => window.clearTimeout(timer)
  }, [])

  if (sitzung) return <Navigate to="/app" replace />

  const fehlgeschlagen = urlFehlerBeimStart !== null || (!laedt && zuLange)
  if (!fehlgeschlagen) return <Ladeanzeige text="Du wirst angemeldet …" />

  return (
    <main className="zentriert">
      <div className="zentriert__box">
        <section className="karte stack" role="alert">
          <div className="hinweis hinweis--fehler">
            <Icon name="achtung" groesse={18} />
            <span>{meldung(urlFehlerBeimStart?.code)}</span>
          </div>
          <Link to="/login" className="btn btn--block">
            Neuen Link anfordern
          </Link>
        </section>
      </div>
    </main>
  )
}
