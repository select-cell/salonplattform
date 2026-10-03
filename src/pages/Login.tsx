import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/kontext'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'

const WARTEZEIT_SEKUNDEN = 60

type AuthFehler = { code?: string; message: string; status?: number }

/**
 * Supabase meldet bei unbekannten E-Mail-Adressen (shouldCreateUser: false) einen Fehler.
 * Den zeigen wir nicht an, sonst könnte man herausfinden, wer im Salon einen Zugang hat.
 */
function istUnbekannteAdresse(fehler: AuthFehler): boolean {
  return fehler.code === 'otp_disabled' || /signups? not allowed/i.test(fehler.message)
}

function limit(fehler: AuthFehler): boolean {
  return fehler.code === 'over_email_send_rate_limit' || fehler.code === 'over_request_rate_limit' || fehler.status === 429
}

export default function Login() {
  const { laedt, sitzung, person } = useAuth()
  const [modus, setModus] = useState<'passwort' | 'link'>('passwort')
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [sendet, setSendet] = useState(false)
  const [gesendetAn, setGesendetAn] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [warten, setWarten] = useState(0)

  useEffect(() => {
    if (warten <= 0) return
    const timer = window.setTimeout(() => setWarten((w) => w - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [warten])

  if (!laedt && sitzung && person?.aktiv) return <Navigate to="/app" replace />

  const adresse = email.trim().toLowerCase()

  async function mitPasswort(e: FormEvent) {
    e.preventDefault()
    if (!adresse || !passwort || sendet) return
    setSendet(true)
    setFehler(null)
    const { error } = await supabase.auth.signInWithPassword({ email: adresse, password: passwort })
    setSendet(false)
    if (!error) return // AuthProvider übernimmt, dann leitet diese Seite weiter
    setPasswort('')
    if (limit(error)) setFehler('Zu viele Versuche. Bitte warte kurz und versuche es dann noch einmal.')
    else if (error.code === 'invalid_credentials' || error.status === 400) setFehler('E-Mail oder Passwort stimmt nicht.')
    else setFehler('Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal.')
  }

  async function mitLink(e: FormEvent) {
    e.preventDefault()
    if (!adresse || sendet || warten > 0) return
    setSendet(true)
    setFehler(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: adresse,
      options: {
        shouldCreateUser: false, // niemand kann sich selbst registrieren
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setSendet(false)
    if (error && !istUnbekannteAdresse(error)) {
      setFehler(
        limit(error)
          ? 'Du hast gerade schon einen Link angefordert. Bitte warte eine Minute und versuche es dann noch einmal.'
          : 'Der Link konnte nicht gesendet werden. Melde dich stattdessen mit deinem Passwort an.',
      )
      return
    }
    setGesendetAn(adresse)
    setWarten(WARTEZEIT_SEKUNDEN)
  }

  if (gesendetAn) {
    return (
      <main className="zentriert">
        <div className="zentriert__box">
          <section className="karte erfolg" aria-live="polite">
            <div className="erfolg__icon">
              <Icon name="mail" groesse={26} />
            </div>
            <h1 style={{ fontSize: '1.75rem' }}>Schau in dein Postfach</h1>
            <p className="muted">
              Wenn <strong>{gesendetAn}</strong> für die Plattform freigeschaltet ist, haben wir dir gerade einen Link zum
              Anmelden geschickt. Er ist nur kurz gültig.
            </p>
            <p className="klein muted">Nichts angekommen? Schau auch im Spam-Ordner nach.</p>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              disabled={warten > 0 || sendet}
              onClick={() => setGesendetAn(null)}
            >
              {warten > 0 ? `Erneut senden in ${warten} s` : 'Link erneut senden'}
            </button>
          </section>
        </div>
      </main>
    )
  }

  const istPasswort = modus === 'passwort'

  return (
    <main className="zentriert">
      <div className="zentriert__box">
        <div className="login-kopf">
          <h1>Willkommen zurück</h1>
          <p>{istPasswort ? 'Melde dich mit deiner E-Mail-Adresse und deinem Passwort an.' : 'Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link zum Anmelden.'}</p>
        </div>

        <form className="karte stack" onSubmit={istPasswort ? mitPasswort : mitLink} noValidate>
          <div className="feld">
            <label className="feld__label" htmlFor="email">
              E-Mail-Adresse
            </label>
            <input
              id="email"
              className="feld__eingabe"
              type="email"
              name="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@beispiel.de"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {istPasswort && (
            <div className="feld">
              <label className="feld__label" htmlFor="passwort">
                Passwort
              </label>
              <input
                id="passwort"
                className="feld__eingabe"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
              />
            </div>
          )}

          {fehler && (
            <p className="hinweis hinweis--fehler" role="alert">
              <Icon name="achtung" groesse={18} />
              {fehler}
            </p>
          )}

          <button
            type="submit"
            className="btn btn--block"
            disabled={sendet || !email.includes('@') || (istPasswort && !passwort)}
          >
            {sendet ? 'Einen Moment …' : istPasswort ? 'Anmelden' : 'Link per E-Mail senden'}
          </button>

          <button
            type="button"
            className="textlink"
            style={{ justifySelf: 'center' }}
            onClick={() => {
              setModus(istPasswort ? 'link' : 'passwort')
              setFehler(null)
            }}
          >
            {istPasswort ? 'Stattdessen Link per E-Mail senden' : 'Mit Passwort anmelden'}
          </button>

          <p className="klein muted" style={{ textAlign: 'center' }}>
            Nur für eingeladene Personen. Noch keinen Zugang? Sprich mit dem Salon.
          </p>
        </form>
      </div>
    </main>
  )
}
