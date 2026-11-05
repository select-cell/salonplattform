import { useState } from 'react'
import { Abschnitt, DatenZustand } from '../../../components/auswertung/Bausteine'
import { Icon } from '../../../components/Icon'
import { holeFokus, schalteFokus } from '../../../lib/api'
import type { FokusListe, FokusVerhalten } from '../../../lib/agenda'
import { useDaten } from '../../../lib/useDaten'

const datumFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' })
const tag = (iso: string) => datumFormat.format(new Date(`${iso}T00:00:00Z`))
const fehlertext = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Das hat nicht geklappt. Bitte versuche es erneut.')

/** Leitung → Fokus: Verhalten markieren, die gerade besonders wichtig sind (Erweiterung F). Sie stehen in der Agenda ganz oben. */
export default function Fokus() {
  const { laedt, daten, fehler, neuLaden } = useDaten(holeFokus, [])
  const [offen, setOffen] = useState<string | null>(null)
  const [begruendung, setBegruendung] = useState('')
  const [bis, setBis] = useState('')
  const [arbeitet, setArbeitet] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)

  async function schalte(v: FokusVerhalten, an: boolean) {
    setArbeitet(v.id)
    setMeldung(null)
    try {
      await schalteFokus(v.id, an, an ? begruendung : undefined, an ? bis : undefined)
      setMeldung({ art: 'ok', text: an ? `Verhalten ${v.nr} ist im Fokus.` : `Verhalten ${v.nr} ist nicht mehr im Fokus.` })
      setOffen(null)
      setBegruendung('')
      setBis('')
      neuLaden()
    } catch (e) {
      setMeldung({ art: 'fehler', text: fehlertext(e) })
    } finally {
      setArbeitet(null)
    }
  }

  const oeffne = (v: FokusVerhalten) => {
    setMeldung(null)
    setOffen(v.id)
    setBegruendung(v.fokus?.begruendung ?? '')
    setBis(v.fokus?.gueltig_bis ?? '')
  }

  return (
    <div className="stack stack-l">
      <header className="seitenkopf">
        <p className="overline">Leitung</p>
        <h1 style={{ marginTop: 8 }}>Fokus</h1>
        <p>
          Markiere Verhalten, die gerade besonders wichtig sind. Sie stehen in der Agenda fürs Teammeeting ganz oben. Ein Fokus gilt bis auf Weiteres oder bis zu einem Datum
          (einschließlich dieses Tages).
        </p>
      </header>

      {meldung && (
        <p className={`hinweis hinweis--${meldung.art === 'ok' ? 'ok' : 'fehler'}`} role={meldung.art === 'ok' ? 'status' : 'alert'}>
          <Icon name={meldung.art === 'ok' ? 'haken' : 'achtung'} groesse={18} />
          <span>{meldung.text}</span>
        </p>
      )}

      <DatenZustand laedt={laedt && !daten} fehler={fehler} onNeu={neuLaden}>
        {daten && (
          <>
            <Abschnitt titel="Verhalten" kurz={`${anzahlImFokus(daten)} im Fokus. Stand: ${tag(daten.heute)}.`}>
              <ul className="analyse-liste" data-testid="fokus-liste">
                {daten.verhalten.map((v) => (
                  <li key={v.id} className={v.fokus ? 'aktiv' : undefined} data-nr={v.nr}>
                    <span className="analyse-liste__name">
                      {v.nr} {v.titel}
                      {v.saeule && <span className="klein muted"> · {v.saeule}</span>}
                    </span>
                    <span className="badges">
                      {v.fokus ? (
                        <span className="badge badge--akzent">
                          {v.fokus.geplant ? `ab ${tag(v.fokus.gueltig_ab)}` : 'im Fokus'}
                          {v.fokus.gueltig_bis ? `, bis ${tag(v.fokus.gueltig_bis)}` : ''}
                        </span>
                      ) : null}
                    </span>
                    {offen === v.id ? null : v.fokus ? (
                      <span className="aktionen">
                        <button type="button" className="btn btn--ghost" disabled={arbeitet !== null} onClick={() => oeffne(v)}>
                          Ändern
                        </button>
                        <button type="button" className="btn btn--ghost" disabled={arbeitet !== null} onClick={() => schalte(v, false)}>
                          Aus dem Fokus nehmen
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="btn btn--ghost" disabled={arbeitet !== null} onClick={() => oeffne(v)}>
                        In den Fokus
                      </button>
                    )}
                    {v.fokus?.begruendung && offen !== v.id && <p className="klein muted analyse-liste__zusatz">Warum: {v.fokus.begruendung}</p>}
                    {offen === v.id && (
                      <form
                        className="stack-s analyse-liste__zusatz"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void schalte(v, true)
                        }}
                      >
                        <div className="feld">
                          <label className="feld__label" htmlFor={`warum-${v.nr}`}>
                            Warum ist das Verhalten im Fokus? (optional)
                          </label>
                          <textarea id={`warum-${v.nr}`} className="feld__eingabe" rows={2} maxLength={500} value={begruendung} onChange={(e) => setBegruendung(e.target.value)} />
                        </div>
                        <div className="feld" style={{ maxWidth: 240 }}>
                          <label className="feld__label" htmlFor={`bis-${v.nr}`}>
                            Befristet bis (optional)
                          </label>
                          <input id={`bis-${v.nr}`} className="feld__eingabe" type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
                        </div>
                        <div className="aktionen">
                          <button type="submit" className="btn" disabled={arbeitet !== null}>
                            {arbeitet === v.id ? 'Wird gespeichert …' : 'Speichern'}
                          </button>
                          <button type="button" className="btn btn--ghost" onClick={() => setOffen(null)}>
                            Abbrechen
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </Abschnitt>

            {daten.verlauf.length > 0 && (
              <Abschnitt titel="Bisher im Fokus" kurz="Beendete Einträge. Die Geschichte bleibt; „In den Fokus“ legt einen neuen Eintrag an.">
                <ul className="md__liste" data-testid="fokus-verlauf">
                  {daten.verlauf.map((x, i) => (
                    <li key={i}>
                      <strong>
                        {x.nr} {x.titel}
                      </strong>{' '}
                      <span className="klein muted">
                        {tag(x.gueltig_ab)} bis {tag(x.gueltig_bis)}
                        {x.begruendung ? ` · ${x.begruendung}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </Abschnitt>
            )}
          </>
        )}
      </DatenZustand>
    </div>
  )
}

const anzahlImFokus = (d: FokusListe) => {
  const n = d.verhalten.filter((v) => v.fokus && !v.fokus.geplant).length
  return n === 1 ? '1 Verhalten' : `${n} Verhalten`
}
