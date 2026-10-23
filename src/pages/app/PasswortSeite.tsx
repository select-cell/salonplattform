import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/kontext'
import { Icon } from '../../components/Icon'
import { supabase } from '../../lib/supabase'

const MIN_LAENGE = 8

/** /app/passwort: eingeloggte Personen ändern ihr Passwort selbst (altes Passwort zur Sicherheit erneut abfragen). */
export default function PasswortSeite() {
  const { sitzung } = useAuth()
  const email = sitzung?.user.email ?? ''
  const [alt, setAlt] = useState('')
  const [neu, setNeu] = useState('')
  const [wiederholt, setWiederholt] = useState('')
  const [sendet, setSendet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [fertig, setFertig] = useState(false)

  const pruefung = (): string | null => {
    if (neu.length < MIN_LAENGE) return `Das neue Passwort braucht mindestens ${MIN_LAENGE} Zeichen.`
    if (neu !== wiederholt) return 'Die beiden neuen Passwörter sind nicht gleich.'
    if (neu === alt) return 'Das neue Passwort muss sich vom alten unterscheiden.'
    return null
  }

  async function speichern(e: FormEvent) {
    e.preventDefault()
    if (sendet) return
    const problem = pruefung()
    if (problem) {
      setFehler(problem)
      return
    }
    setSendet(true)
    setFehler(null)

    // Das aktuelle Passwort noch einmal bestätigen
    const pruef = await supabase.auth.signInWithPassword({ email, password: alt })
    if (pruef.error) {
      setSendet(false)
      setFehler(
        pruef.error.status === 429
          ? 'Zu viele Versuche. Bitte warte kurz und versuche es dann noch einmal.'
          : 'Das aktuelle Passwort stimmt nicht.',
      )
      return
    }

    const { error } = await supabase.auth.updateUser({ password: neu })
    setSendet(false)
    if (error) {
      setFehler(
        /same|different/i.test(error.message)
          ? 'Das neue Passwort muss sich vom alten unterscheiden.'
          : /weak|short|least/i.test(error.message)
            ? 'Dieses Passwort ist zu einfach. Bitte wähle ein längeres oder anderes Passwort.'
            : 'Das Passwort konnte nicht geändert werden. Bitte versuche es gleich noch einmal.',
      )
      return
    }
    setAlt('')
    setNeu('')
    setWiederholt('')
    setFertig(true)
  }

  return (
    <div className="stack stack-l" style={{ maxWidth: 520 }}>
      <header className="seitenkopf">
        <p className="overline">Mein Zugang</p>
        <h1 style={{ marginTop: 8 }}>Passwort ändern</h1>
        <p>Wähle ein neues Passwort für {email || 'deinen Zugang'}.</p>
      </header>

      {fertig ? (
        <section className="karte erfolg" aria-live="polite">
          <div className="erfolg__icon">
            <Icon name="haken" groesse={26} />
          </div>
          <h2 className="umfrage__titel">Passwort geändert</h2>
          <p className="muted">Ab jetzt meldest du dich mit dem neuen Passwort an.</p>
          <Link to="/app" className="btn">
            Zur Übersicht
          </Link>
        </section>
      ) : (
        <form className="karte stack" onSubmit={speichern} noValidate>
          <div className="feld">
            <label className="feld__label" htmlFor="pw-alt">
              Aktuelles Passwort
            </label>
            <input
              id="pw-alt"
              className="feld__eingabe"
              type="password"
              autoComplete="current-password"
              required
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
            />
            {/* Hilft Passwort-Managern, den richtigen Zugang zu aktualisieren */}
            <input type="email" autoComplete="username" value={email} readOnly hidden />
          </div>

          <div className="feld">
            <label className="feld__label" htmlFor="pw-neu">
              Neues Passwort <span className="muted">(mindestens {MIN_LAENGE} Zeichen)</span>
            </label>
            <input
              id="pw-neu"
              className="feld__eingabe"
              type="password"
              autoComplete="new-password"
              minLength={MIN_LAENGE}
              required
              value={neu}
              onChange={(e) => setNeu(e.target.value)}
            />
          </div>

          <div className="feld">
            <label className="feld__label" htmlFor="pw-wiederholt">
              Neues Passwort wiederholen
            </label>
            <input
              id="pw-wiederholt"
              className="feld__eingabe"
              type="password"
              autoComplete="new-password"
              required
              value={wiederholt}
              onChange={(e) => setWiederholt(e.target.value)}
            />
          </div>

          {fehler && (
            <p className="hinweis hinweis--fehler" role="alert">
              <Icon name="achtung" groesse={18} />
              {fehler}
            </p>
          )}

          <button type="submit" className="btn btn--block" disabled={sendet || !alt || !neu || !wiederholt}>
            {sendet ? 'Wird gespeichert …' : 'Passwort speichern'}
          </button>
        </form>
      )}
    </div>
  )
}
