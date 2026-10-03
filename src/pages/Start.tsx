import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/kontext'
import { Icon, type IconName } from '../components/Icon'

const MERKMALE: { icon: IconName; titel: string; text: string }[] = [
  {
    icon: 'umfrage',
    titel: 'Monatliche Umfrage',
    text: 'Einmal im Monat gibst du ehrliches Feedback zu den Verhalten im Team, mit Videos und klaren Bewertungsstufen.',
  },
  {
    icon: 'ergebnisse',
    titel: 'Selbstbild und Fremdbild',
    text: 'Sieh, wie du dich einschätzt und wie andere dich erleben. Dazu dein Verlauf über alle Monate.',
  },
  {
    icon: 'team',
    titel: 'Entwicklung im Team',
    text: 'Das Team im Überblick: wo ihr stark seid und woran ihr gemeinsam arbeitet.',
  },
]

export default function Start() {
  const { laedt, sitzung, person } = useAuth()

  // Wer schon drin ist (auch nach dem Klick auf einen Einladungslink), geht direkt weiter.
  if (!laedt && sitzung && person?.aktiv) return <Navigate to="/app" replace />

  return (
    <main>
      <section className="hero">
        <div className="container">
          <div className="hero__text">
            <p className="overline">Für das Team</p>
            <h1>
              Feedback, das den Salon <em>weiterbringt.</em>
            </h1>
            <p className="hero__lead">
              Hier füllst du deine Monatsumfrage aus, siehst deine Ergebnisse und erkennst, wie sich das Team entwickelt.
            </p>
            <div className="hero__aktionen">
              <Link to="/login" className="btn btn--gross">
                Anmelden <Icon name="pfeil" groesse={20} />
              </Link>
              <span className="klein muted">Du bekommst einen Link per E-Mail. Ein Passwort brauchst du nicht.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="container" aria-label="Das erwartet dich">
        <div className="merkmale">
          {MERKMALE.map((m) => (
            <article key={m.titel} className="karte merkmal">
              <div className="merkmal__icon">
                <Icon name={m.icon} />
              </div>
              <h3>{m.titel}</h3>
              <p>{m.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
