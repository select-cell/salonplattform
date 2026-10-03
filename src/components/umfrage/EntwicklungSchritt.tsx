import type { Entwurf, UmfrageInhalt } from '../../lib/umfrage'

interface Props {
  inhalt: UmfrageInhalt
  entwurf: Entwurf
  onWahl: (personId: string | null) => void
  onBegruendung: (text: string) => void
}

/** „Entwicklung des Monats“: erste Frage der Umfrage, Person und Begründung sind Pflicht. */
export function EntwicklungSchritt({ inhalt, entwurf, onWahl, onBegruendung }: Props) {
  const gewaehlt = entwurf.entwicklung.personId

  return (
    <article className="stack" aria-labelledby="schritt-titel">
      <header className="stack-s">
        <span className="badge badge--gruen">Entwicklung des Monats</span>
        <h2 id="schritt-titel" className="umfrage__titel">
          Bei welcher Kollegin hast du im letzten Monat eine besonders positive Entwicklung im Verhalten beobachtet?
        </h2>
        <p className="muted">Du kannst dich selbst nicht auswählen.</p>
      </header>

      <fieldset className="bewertung bewertung--neutral">
        <legend className="nur-sr">Entwicklung des Monats</legend>
        <div className="auswahl">
          {inhalt.kolleginnen.map((k) => (
            <label key={k.id} className="auswahl__option">
              <input
                type="radio"
                name="entwicklung"
                value={k.id}
                checked={gewaehlt === k.id}
                onChange={() => onWahl(k.id)}
              />
              <span>{k.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {gewaehlt && (
        <div className="feld">
          <label className="feld__label" htmlFor="entwicklung-begruendung">
            Warum hast du so entschieden?
          </label>
          <textarea
            id="entwicklung-begruendung"
            className="feld__eingabe"
            rows={4}
            placeholder="Begründung…"
            value={entwurf.entwicklung.begruendung}
            required
            aria-required
            onChange={(e) => onBegruendung(e.target.value)}
          />
        </div>
      )}
    </article>
  )
}
