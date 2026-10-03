import { Link } from 'react-router-dom'
import { usePerson } from '../../auth/kontext'
import { Icon } from '../../components/Icon'
import { Kachel } from '../../components/Kachel'
import { supabaseProjektRef } from '../../lib/konfiguration'
import { aktuellerMonat, fristFuer, fristText, monatLabel, tageszeitGruss, tagLabel, zeitpunktLabel } from '../../lib/monat'
import { bereicheFuer } from '../../lib/navigation'
import { ROLLEN_LABEL, istLeitung } from '../../lib/types'
import { useMeineMonate } from '../../lib/useMeineMonate'
import { StatusKarte } from '../../components/StatusKarte'

/** Begrüßungsbereich (Plan §3). Der Inhalt hängt von der Rolle ab. */
export default function Dashboard() {
  const person = usePerson()
  const leitung = istLeitung(person)
  const vorname = person.name.split(/\s+/)[0]

  const bereiche = bereicheFuer(person)
  const umfrage = bereiche.some((b) => b.schluessel === 'umfrage')
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

      {umfrage && <UmfrageKarte />}

      {leitung && <StatusKarte />}

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
          Unter <strong>Authentication → Users → Add user → Create new user</strong> dieselbe E-Mail mit einem Passwort anlegen
          und <strong>Auto Confirm User</strong> ankreuzen. Die Verknüpfung passiert automatisch.
        </li>
        <li>Der Person die E-Mail-Adresse und das Passwort weitergeben. Sie meldet sich damit auf der Startseite an.</li>
      </ol>
      {basis && (
        <div className="link-zeile">
          <a className="btn btn--ghost" href={`${basis}/editor`} target="_blank" rel="noreferrer noopener">
            Tabelle personen öffnen
          </a>
          <a className="btn btn--ghost" href={`${basis}/auth/users`} target="_blank" rel="noreferrer noopener">
            Nutzer anlegen
          </a>
        </div>
      )}
    </section>
  )
}

/** „Deine Umfrage für <Monat>“: offen oder erledigt, mit Frist (Plan §3, Phase 2). */
function UmfrageKarte() {
  const { laedt, monate, fehler, neuLaden } = useMeineMonate()
  const aktuell = aktuellerMonat()
  const dieserMonat = monate.find((m) => m.monat_key === aktuell)
  const frueherOffen = monate.filter((m) => !m.abgegeben && m.monat_key !== aktuell)

  if (laedt) {
    return (
      <section className="karte umfrage-karte" aria-busy="true">
        <div>
          <p className="overline">Monatsumfrage</p>
          <h2 className="umfrage-karte__titel">Deine Umfrage für {monatLabel(aktuell)}</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            Wird geladen …
          </p>
        </div>
      </section>
    )
  }

  if (fehler) {
    return (
      <section className="karte umfrage-karte">
        <div>
          <p className="overline">Monatsumfrage</p>
          <h2 className="umfrage-karte__titel">Deine Umfrage</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            Der Status konnte nicht geladen werden.
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={neuLaden}>
          Erneut versuchen
        </button>
      </section>
    )
  }

  if (!dieserMonat) {
    return (
      <section className="karte umfrage-karte">
        <div>
          <p className="overline">Monatsumfrage</p>
          <h2 className="umfrage-karte__titel">Deine Umfrage startet bald</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            Sobald deine erste Umfrage ansteht, findest du sie hier.
          </p>
        </div>
      </section>
    )
  }

  const frist = fristFuer(dieserMonat.monat_key)
  return (
    <div className="stack">
      <section
        className={dieserMonat.abgegeben ? 'karte umfrage-karte umfrage-karte--erledigt' : 'karte umfrage-karte'}
        aria-labelledby="umfrage-titel"
      >
        <div>
          <p className="overline">Monatsumfrage</p>
          <h2 id="umfrage-titel" className="umfrage-karte__titel">
            Deine Umfrage für {monatLabel(dieserMonat.monat_key)}
          </h2>
          <div className="umfrage-karte__meta">
            {dieserMonat.abgegeben ? (
              <span className="badge badge--gruen">
                <Icon name="haken" groesse={14} /> Erledigt
                {dieserMonat.abgegeben_am ? ` am ${zeitpunktLabel(dieserMonat.abgegeben_am)}` : ''}
              </span>
            ) : (
              <>
                <span className="badge badge--akzent">
                  <Icon name="kalender" groesse={14} /> Frist: {frist.label}
                </span>
                <span className="badge">{fristText(dieserMonat.tage_bis_frist)}</span>
              </>
            )}
          </div>
          {dieserMonat.abgegeben && <p className="muted" style={{ marginTop: 10 }}>Danke, deine Umfrage ist angekommen.</p>}
        </div>
        {!dieserMonat.abgegeben && (
          <Link to={`/app/umfrage/${dieserMonat.monat_key}`} className="btn">
            Jetzt ausfüllen <Icon name="pfeil" groesse={18} />
          </Link>
        )}
      </section>

      {frueherOffen.length > 0 && (
        <section className="karte karte--creme" aria-label="Weitere offene Umfragen">
          <h3 className="abschnitt-titel">Noch offen</h3>
          <ul className="zeilen">
            {frueherOffen.map((m) => (
              <li key={m.monat_key} className="zeile">
                <span>
                  {monatLabel(m.monat_key)}{' '}
                  <span className="badge badge--rot">überfällig seit {tagLabel(m.frist)}</span>
                </span>
                <Link to={`/app/umfrage/${m.monat_key}`} className="textlink">
                  Ausfüllen
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
