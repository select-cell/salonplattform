import type { Entwurf, UmfrageInhalt, Verhalten } from '../../lib/umfrage'
import { KOMMENTAR_PFLICHT_AB, bewertete, brauchtVideo, notenSchluessel } from '../../lib/umfrage'
import { Skala } from './Skala'
import { VideoSperre } from './VideoSperre'

interface Props {
  verhalten: Verhalten
  nummer: number
  gesamt: number
  inhalt: UmfrageInhalt
  entwurf: Entwurf
  onNote: (schluessel: string, note: number) => void
  onKommentar: (schluessel: string, text: string) => void
  onVideoGesehen: () => void
}

export function VerhaltenSchritt({
  verhalten,
  nummer,
  gesamt,
  inhalt,
  entwurf,
  onNote,
  onKommentar,
  onVideoGesehen,
}: Props) {
  const gesperrt = brauchtVideo(verhalten.video_url) && !entwurf.videos[`v${verhalten.nr}`]
  const stufen = new Map(verhalten.kriterien.map((k) => [k.stufe, k]))

  const beschreibung = (note: number): string | null => {
    const k = stufen.get(note)
    if (!k) return null
    return [k.bezeichnung, k.prozent].filter(Boolean).join(' · ') || null
  }

  return (
    <article className="stack" aria-labelledby="schritt-titel">
      <header className="stack-s">
        <div className="umfrage__badges">
          {verhalten.grundpfeiler && <span className="badge">{verhalten.grundpfeiler}</span>}
          {verhalten.saeule && <span className="badge badge--akzent">{verhalten.saeule}</span>}
        </div>
        <h2 id="schritt-titel" className="umfrage__titel">
          {verhalten.titel}
        </h2>
        <p className="klein muted">
          Verhalten {nummer} von {gesamt}
        </p>
      </header>

      <VideoSperre
        url={verhalten.video_url}
        titel={verhalten.titel}
        gesehen={!!entwurf.videos[`v${verhalten.nr}`]}
        onGesehen={onVideoGesehen}
      />

      {verhalten.kriterien.length > 0 && (
        <details className="stufen">
          <summary>Bewertungsstufen ansehen</summary>
          <div className="stufen__liste">
            {verhalten.kriterien.map((k) => (
              <details key={k.stufe} className="stufe">
                <summary>
                  <span>{k.bezeichnung ?? `Stufe ${k.stufe}`}</span>
                  {k.prozent && <span className="badge">{k.prozent}</span>}
                </summary>
                <div className="stufe__inhalt">
                  {k.leitsatz && <p>{k.leitsatz}</p>}
                  {k.punkte.length > 0 && (
                    <ul className="platzhalter__liste">
                      {k.punkte.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            ))}
          </div>
        </details>
      )}

      {gesperrt ? (
        <p className="hinweis">
          <span>Sobald du das Video bis zum Ende gesehen hast, kannst du bewerten.</span>
        </p>
      ) : (
        <div className="stack">
          {bewertete(inhalt).map((person) => {
            const schluessel = notenSchluessel(verhalten.nr, person.id)
            const note = entwurf.noten[schluessel]
            const pflicht = !!note && note >= KOMMENTAR_PFLICHT_AB
            return (
              <Skala
                key={schluessel}
                name={`note-${schluessel}`}
                variante={person.selbst ? 'selbst' : 'fremd'}
                legende={
                  <>
                    <span className="bewertung__name">{person.selbst ? 'Du selbst' : person.name}</span>
                    <span className="bewertung__art">{person.selbst ? 'Selbstbild' : 'Fremdbild'}</span>
                  </>
                }
                wert={note}
                onChange={(n) => onNote(schluessel, n)}
                beschreibung={beschreibung}
              >
                {note && (
                  <div className="feld">
                    <label className="feld__label" htmlFor={`kommentar-${schluessel}`}>
                      Kommentar{' '}
                      <span className="muted">{pflicht ? '(Pflicht ab Note 4)' : '(freiwillig)'}</span>
                    </label>
                    <textarea
                      id={`kommentar-${schluessel}`}
                      className="feld__eingabe"
                      rows={3}
                      value={entwurf.kommentare[schluessel] ?? ''}
                      onChange={(e) => onKommentar(schluessel, e.target.value)}
                      required={pflicht}
                      aria-required={pflicht}
                    />
                  </div>
                )}
              </Skala>
            )
          })}
        </div>
      )}
    </article>
  )
}
