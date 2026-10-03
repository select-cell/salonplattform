import { Icon } from '../Icon'
import type { Entwurf, Schritt, UmfrageInhalt } from '../../lib/umfrage'
import { durchschnitte, ersterUnvollstaendigerSchritt, ritualSchluessel, schrittFehler } from '../../lib/umfrage'

interface Props {
  schritte: Schritt[]
  inhalt: UmfrageInhalt
  entwurf: Entwurf
  sendet: boolean
  fehler: string | null
  onSpringe: (index: number) => void
  onAbsenden: () => void
}

const zahl = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function Zusammenfassung({ schritte, inhalt, entwurf, sendet, fehler, onSpringe, onAbsenden }: Props) {
  const offen = ersterUnvollstaendigerSchritt(schritte, entwurf, inhalt)
  const schnitte = durchschnitte(inhalt, entwurf)

  const ritualFragen = inhalt.rituale.flatMap((r) => r.fragen.map((f) => ({ r, f })))
  const beantwortet = ritualFragen.filter(({ r, f }) => (entwurf.ritual[ritualSchluessel(r.nr, f.nr)] ?? '').trim()).length
  const genannt = inhalt.kolleginnen.find((k) => k.id === entwurf.entwicklung.personId)

  return (
    <article className="stack stack-l" aria-labelledby="schritt-titel">
      <header className="stack-s">
        <span className="badge badge--gruen">Fast geschafft</span>
        <h2 id="schritt-titel" className="umfrage__titel">
          Deine Zusammenfassung
        </h2>
        <p className="muted">Schau noch einmal drüber. Nach dem Absenden kannst du nichts mehr ändern.</p>
      </header>

      <section className="karte karte--creme stack-s" aria-label="Durchschnitt deiner Noten">
        <h3 className="abschnitt-titel">Durchschnitt deiner Noten</h3>
        <ul className="zeilen">
          {schnitte.map(({ person, schnitt }) => (
            <li key={person.id} className="zeile">
              <span>
                {person.selbst ? 'Du selbst' : person.name}{' '}
                <span className={`badge ${person.selbst ? 'badge--akzent' : 'badge--blau'}`}>
                  {person.selbst ? 'Selbstbild' : 'Fremdbild'}
                </span>
              </span>
              <strong>{schnitt === null ? '–' : `Ø ${zahl.format(schnitt)}`}</strong>
            </li>
          ))}
        </ul>
        <p className="klein muted">{inhalt.verhalten.length} Verhalten bewertet</p>
      </section>

      {ritualFragen.length > 0 && (
        <section className="karte karte--creme stack-s" aria-label="Rituale">
          <h3 className="abschnitt-titel">Rituale</h3>
          <p>
            {beantwortet} von {ritualFragen.length} Fragen beantwortet
          </p>
        </section>
      )}

      {inhalt.kolleginnen.length > 0 && (
        <section className="karte karte--creme stack-s" aria-label="Entwicklung des Monats">
          <h3 className="abschnitt-titel">Entwicklung des Monats</h3>
          <p>{genannt ? genannt.name : 'Niemand genannt'}</p>
        </section>
      )}

      {offen !== -1 && (
        <div className="hinweis hinweis--fehler" role="alert">
          <Icon name="achtung" groesse={18} />
          <span>
            Es fehlt noch etwas: {schrittFehler(schritte[offen], entwurf, inhalt)}{' '}
            <button type="button" className="textlink" onClick={() => onSpringe(offen)}>
              Jetzt ergänzen
            </button>
          </span>
        </div>
      )}

      {fehler && (
        <div className="hinweis hinweis--fehler" role="alert">
          <Icon name="achtung" groesse={18} />
          <span>{fehler}</span>
        </div>
      )}

      <button type="button" className="btn btn--gross btn--block" onClick={onAbsenden} disabled={sendet || offen !== -1}>
        {sendet ? 'Wird gesendet …' : 'Umfrage absenden'}
      </button>
    </article>
  )
}
