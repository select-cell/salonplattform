import { useAuth } from '../auth/kontext'
import { Fuss } from '../components/Fuss'
import { Icon } from '../components/Icon'
import { Marke } from '../components/Marke'

type Grund = 'keine-person' | 'gesperrt' | 'fehler'

const TEXTE: Record<Grund, { titel: string; text: string }> = {
  'keine-person': {
    titel: 'Noch kein Zugang',
    text: 'Du bist angemeldet, aber noch nicht für den Salon freigeschaltet. Bitte melde dich beim Verantwortlichen oder beim Admin.',
  },
  gesperrt: {
    titel: 'Zugang pausiert',
    text: 'Dein Zugang ist im Moment nicht aktiv. Bitte melde dich beim Verantwortlichen oder beim Admin.',
  },
  fehler: {
    titel: 'Das hat nicht geklappt',
    text: 'Deine Daten konnten nicht geladen werden. Bitte prüfe deine Verbindung und versuche es noch einmal.',
  },
}

export function KeinZugang({ grund, meldung }: { grund: Grund; meldung?: string }) {
  const { abmelden, neuLaden, sitzung } = useAuth()
  const { titel, text } = TEXTE[grund]

  return (
    <div className="seite">
      <header className="kopf">
        <div className="container kopf__innen">
          <Marke />
        </div>
      </header>
      <main className="zentriert">
        <div className="zentriert__box">
          <section className="karte stack" role="alert">
            <div className="merkmal__icon">
              <Icon name="schloss" />
            </div>
            <h1 style={{ fontSize: '1.75rem' }}>{titel}</h1>
            <p className="muted">{text}</p>
            {sitzung?.user.email && (
              <p className="klein muted">
                Angemeldet als <strong>{sitzung.user.email}</strong>
              </p>
            )}
            {grund === 'fehler' && meldung && <p className="klein muted">{meldung}</p>}
            {grund === 'fehler' && (
              <button type="button" className="btn btn--block" onClick={neuLaden}>
                Erneut versuchen
              </button>
            )}
            <button type="button" className="btn btn--ghost btn--block" onClick={() => void abmelden()}>
              Abmelden
            </button>
          </section>
        </div>
      </main>
      <Fuss />
    </div>
  )
}
