import { Link } from 'react-router-dom'
import { usePerson } from '../../auth/kontext'
import { Icon } from '../../components/Icon'
import { Kachel } from '../../components/Kachel'
import { supabaseProjektRef } from '../../lib/konfiguration'
import { aktuellerMonat, fristFuer, fristText, monatLabel, tageszeitGruss } from '../../lib/monat'
import { bereicheFuer, zielFuer } from '../../lib/navigation'
import { ROLLEN_LABEL, istLeitung } from '../../lib/types'

/** Begrüßungsbereich (Plan §3). Der Inhalt hängt von der Rolle ab. */
export default function Dashboard() {
  const person = usePerson()
  const leitung = istLeitung(person)
  const vorname = person.name.split(/\s+/)[0]

  const monat = aktuellerMonat()
  const frist = fristFuer(monat)
  const bereiche = bereicheFuer(person)
  const umfrage = bereiche.find((b) => b.schluessel === 'umfrage')
  const kacheln = bereiche.filter((b) => b.schluessel !== 'umfrage')

  return (
    <div className="stack stack-l">
      <header className="begruessung">
        <p className="overline">
          {ROLLEN_LABEL[person.rolle]}
          {person.salon_name ? ` · ${person.salon_name}` : ''}
        </p>
        <h1 style={{ marginTop: 8 }}>
          {tageszeitGruss()}, <em>{vorname}</em>
        </h1>
      </header>

      {umfrage && (
        <section className="karte umfrage-karte" aria-labelledby="umfrage-titel">
          <div>
            <p className="overline">Monatsumfrage</p>
            <h2 id="umfrage-titel" className="umfrage-karte__titel">
              Deine Umfrage für {monatLabel(monat)}
            </h2>
            <div className="umfrage-karte__meta">
              <span className="badge badge--akzent">
                <Icon name="kalender" groesse={14} /> Frist: {frist.label}
              </span>
              <span className="badge">{fristText(frist.tageBis)}</span>
              <span className="badge badge--gelb">Wird in Kürze freigeschaltet</span>
            </div>
          </div>
          <Link to={zielFuer(umfrage)} className="btn">
            Öffnen <Icon name="pfeil" groesse={18} />
          </Link>
        </section>
      )}

      {leitung && (
        <section className="karte" aria-labelledby="status-titel">
          <div className="karte__kopf">
            <div>
              <p className="overline">Abgabe-Status</p>
              <h2 id="status-titel" style={{ marginTop: 6 }}>
                {monatLabel(monat)}
              </h2>
            </div>
            <span className="badge badge--akzent">Kommt bald</span>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            Sobald die Monatsumfrage freigeschaltet ist, siehst du hier, wer schon abgegeben hat. Du wirst erinnert, wenn
            jemand überfällig ist (Frist: {frist.label}).
          </p>
        </section>
      )}

      <section aria-labelledby="bereiche-titel">
        <h2 id="bereiche-titel" className="abschnitt-titel">
          Deine Bereiche
        </h2>
        <div className="kacheln">
          {kacheln.map((b) => (
            <Kachel key={b.schluessel} bereich={b} />
          ))}
        </div>
      </section>

      {person.rolle === 'admin' && <AdminKarte />}
    </div>
  )
}

/** Hilfe für den Admin: Personen und Zugänge werden direkt in Supabase gepflegt (Plan §4.1). */
function AdminKarte() {
  const ref = supabaseProjektRef()
  const basis = ref ? `https://supabase.com/dashboard/project/${ref}` : null

  return (
    <section className="karte karte--creme stack" aria-labelledby="admin-titel">
      <div>
        <p className="overline">Admin</p>
        <h2 id="admin-titel" style={{ marginTop: 6 }}>
          Neue Person anlegen
        </h2>
      </div>
      <ol className="schritte">
        <li>
          In der Tabelle <strong>personen</strong> eine Zeile anlegen: Name, E-Mail, Rolle und Teilnahme.
        </li>
        <li>
          Unter <strong>Authentication → Users</strong> dieselbe E-Mail einladen. Die Verknüpfung passiert automatisch.
        </li>
        <li>
          Die Person öffnet die Plattform und meldet sich mit ihrer E-Mail-Adresse an. Ein Passwort gibt es nicht.
        </li>
      </ol>
      {basis && (
        <div className="link-zeile">
          <a className="btn btn--ghost" href={`${basis}/editor`} target="_blank" rel="noreferrer noopener">
            Tabelle personen öffnen
          </a>
          <a className="btn btn--ghost" href={`${basis}/auth/users`} target="_blank" rel="noreferrer noopener">
            Nutzer einladen
          </a>
        </div>
      )}
    </section>
  )
}
