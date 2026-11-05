import { useState } from 'react'
import { Abschnitt, DatenZustand, Kennzahl, Leer, Monatswahl } from '../../../components/auswertung/Bausteine'
import { Icon } from '../../../components/Icon'
import { Markdown } from '../../../components/leitung/Markdown'
import {
  bearbeiteAnalyse, erstelleAnalyse, gibAnalyseFrei, holeAbschlussUebersicht, holeAnalyse, schliesseMonatAb,
} from '../../../lib/api'
import { abschlussVeraltet, analyseStatus, datumKurz, uhrzeit, zeitpunkt, type AbschlussUebersicht, type Analyse } from '../../../lib/abschluss'
import { monatName } from '../../../lib/auswertung'
import { useDaten } from '../../../lib/useDaten'

interface Meldung {
  art: 'ok' | 'fehler'
  text: string
}

const fehlertext = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Das hat nicht geklappt. Bitte versuche es erneut.')

/** Leitung → Monatsabschluss: Monat abschließen, KI-Analysen je Person lesen, bearbeiten und freigeben (Erweiterung E). */
export default function Abschluss() {
  const [gewaehlt, setGewaehlt] = useState<string | undefined>(undefined)
  const [offen, setOffen] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  const [arbeitet, setArbeitet] = useState<string | null>(null)
  const [fortschritt, setFortschritt] = useState<string | null>(null)
  const [rueckfrage, setRueckfrage] = useState(false)
  const [stand, setStand] = useState(0)
  const { laedt, daten, fehler, neuLaden } = useDaten(() => holeAbschlussUebersicht(gewaehlt), [gewaehlt])

  const geaendert = () => {
    setStand((s) => s + 1)
    neuLaden()
  }
  const monatWechseln = (m: string) => {
    setGewaehlt(m)
    setOffen(null)
    setMeldung(null)
    setRueckfrage(false)
  }

  async function abschliessen(u: AbschlussUebersicht) {
    setArbeitet('abschluss')
    setMeldung(null)
    try {
      const a = await schliesseMonatAb(u.monat)
      setMeldung({
        art: 'ok',
        text: a.bereits_abgeschlossen
          ? `Stand aktualisiert: ${a.abgaben} von ${a.erwartet} Abgaben.`
          : `${monatName(u.monat)} ist abgeschlossen: ${a.abgaben} von ${a.erwartet} Abgaben.`,
      })
      setRueckfrage(false)
      geaendert()
    } catch (e) {
      setMeldung({ art: 'fehler', text: fehlertext(e) })
    } finally {
      setArbeitet(null)
    }
  }

  async function erstellen(u: AbschlussUebersicht, personId: string, neu: boolean) {
    setArbeitet(personId)
    setMeldung(null)
    try {
      const r = await erstelleAnalyse(personId, u.monat, neu)
      const name = u.personen.find((p) => p.id === personId)?.name ?? 'Person'
      setMeldung({
        art: 'ok',
        text: r.uebersprungen
          ? `Für ${name} hat sich nichts geändert, die vorhandene Analyse bleibt.`
          : `Entwurf für ${name} erstellt${r.analyse.geprueft ? '' : ', der Faktencheck ist nicht bestanden. Bitte genau lesen'}.`,
      })
      setOffen(personId)
      geaendert()
    } catch (e) {
      setMeldung({ art: 'fehler', text: fehlertext(e) })
    } finally {
      setArbeitet(null)
    }
  }

  async function alleFehlenden(u: AbschlussUebersicht) {
    const fehlend = u.personen.filter((p) => !p.analyse)
    setMeldung(null)
    setArbeitet('alle')
    let fertig = 0
    try {
      for (const p of fehlend) {
        setFortschritt(`Erstelle ${fertig + 1} von ${fehlend.length}: ${p.name} …`)
        await erstelleAnalyse(p.id, u.monat, false)
        fertig++
      }
      setMeldung({ art: 'ok', text: `${fertig} ${fertig === 1 ? 'Entwurf' : 'Entwürfe'} erstellt. Bitte jeden Entwurf lesen, bevor du ihn freigibst.` })
    } catch (e) {
      setMeldung({
        art: 'fehler',
        text: `${fertig} von ${fehlend.length} erstellt. ${fehlertext(e)}`,
      })
    } finally {
      setFortschritt(null)
      setArbeitet(null)
      geaendert()
    }
  }

  return (
    <div className="stack stack-l">
      <header className="seitenkopf">
        <p className="overline">Leitung</p>
        <h1 style={{ marginTop: 8 }}>Monatsabschluss</h1>
        <p>Monat abschließen und für jede Person eine Gesprächsgrundlage erstellen lassen. Die Zahlen kommen aus der Datenbank, die KI formuliert nur den Text.</p>
      </header>

      <p className="hinweis" data-testid="datenschutz-hinweis">
        <Icon name="schloss" groesse={18} />
        <span>
          <strong>Datenschutz:</strong> An die KI gehen die Feedbacktexte <strong>ohne Namen und ohne Absender</strong>. Die bewertete Person heißt dort
          „die bewertete Person“, alle anderen „Kollege A, B …“. Mitarbeiter bekommen keine Analysen.
        </span>
      </p>

      {meldung && (
        <p className={`hinweis hinweis--${meldung.art === 'ok' ? 'ok' : 'fehler'}`} role={meldung.art === 'ok' ? 'status' : 'alert'}>
          <Icon name={meldung.art === 'ok' ? 'haken' : 'achtung'} groesse={18} />
          <span>{meldung.text}</span>
        </p>
      )}

      <DatenZustand laedt={laedt && !daten} fehler={fehler} onNeu={neuLaden}>
        {daten &&
          (daten.monate.length === 0 ? (
            <Leer titel="Noch keine Abgaben" text="Sobald die ersten Umfragen abgegeben sind, lässt sich der Monat hier abschließen." />
          ) : (
            <div className="stack stack-l" aria-busy={laedt}>
              <Monatswahl monate={daten.monate} wert={daten.monat} onChange={monatWechseln} />

              <Abschnitt titel="Abschluss">
                {daten.abschluss ? (
                  <div className="stack">
                    <div className="kennzahlen kennzahlen--abschluss">
                      <Kennzahl label="Abgaben" wert={`${daten.abschluss.abgaben} von ${daten.abschluss.erwartet}`} zusatz={daten.abschluss.unvollstaendig ? 'unvollständig' : 'vollständig'} ton={daten.abschluss.unvollstaendig ? 'rot' : 'gruen'} />
                      <Kennzahl label="Abgeschlossen" wert={datumKurz(daten.abschluss.abgeschlossen_am)} zusatz={`${uhrzeit(daten.abschluss.abgeschlossen_am)} Uhr, von ${daten.abschluss.von}`} />
                    </div>
                    {abschlussVeraltet(daten) && (
                      <div className="hinweis" data-testid="abschluss-veraltet">
                        <Icon name="achtung" groesse={18} />
                        <span>
                          Seit dem Abschluss hat sich etwas geändert: jetzt {daten.aktuell.abgaben} von {daten.aktuell.erwartet} Abgaben. Mit „Stand aktualisieren“ übernimmst
                          du das; Analysen zeigen dann „Daten geändert“ und lassen sich neu erstellen.
                        </span>
                      </div>
                    )}
                    {abschlussVeraltet(daten) && (
                      <button type="button" className="btn btn--ghost" style={{ justifySelf: 'start' }} disabled={arbeitet !== null} onClick={() => abschliessen(daten)}>
                        Stand aktualisieren
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="stack">
                    <p>
                      {monatName(daten.monat)} ist noch <strong>nicht abgeschlossen</strong>. Bisher: {daten.aktuell.abgaben} von {daten.aktuell.erwartet} Abgaben.
                    </p>
                    {daten.nicht_abgegeben.length > 0 && (
                      <p className="klein" data-testid="nicht-abgegeben">
                        <strong>Noch nicht abgegeben:</strong> {daten.nicht_abgegeben.map((p) => p.name).join(', ')}
                      </p>
                    )}
                    {rueckfrage ? (
                      <div className="stack-s" role="group" aria-label="Unvollständig abschließen?">
                        <p className="hinweis hinweis--fehler">
                          <Icon name="achtung" groesse={18} />
                          <span>
                            Es fehlen noch {daten.aktuell.erwartet - daten.aktuell.abgaben} Abgaben. Du kannst trotzdem abschließen, der Bericht
                            nennt dann „{daten.aktuell.abgaben} von {daten.aktuell.erwartet}“.
                          </span>
                        </p>
                        <div className="aktionen">
                          <button type="button" className="btn" disabled={arbeitet !== null} onClick={() => abschliessen(daten)}>
                            Ja, unvollständig abschließen
                          </button>
                          <button type="button" className="btn btn--ghost" onClick={() => setRueckfrage(false)}>
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        style={{ justifySelf: 'start' }}
                        disabled={arbeitet !== null || daten.aktuell.abgaben === 0}
                        onClick={() => (daten.aktuell.abgaben < daten.aktuell.erwartet ? setRueckfrage(true) : abschliessen(daten))}
                      >
                        {arbeitet === 'abschluss' ? 'Wird abgeschlossen …' : 'Monat abschließen'}
                      </button>
                    )}
                  </div>
                )}
              </Abschnitt>

              {daten.abschluss && (
                <Abschnitt titel="Analysen" kurz="Entwurf, dann lesen, bearbeiten und freigeben. Nur freigegebene Analysen kommen in den Personenbericht (PDF).">
                  {daten.personen.length === 0 ? (
                    <p className="muted">Für diesen Monat gibt es keine Person mit Bewertungen.</p>
                  ) : (
                    <>
                      <div className="aktionen">
                        <button
                          type="button"
                          className="btn"
                          disabled={arbeitet !== null || daten.personen.every((p) => p.analyse)}
                          onClick={() => alleFehlenden(daten)}
                        >
                          Alle fehlenden erstellen
                        </button>
                        {fortschritt && (
                          <span className="klein" role="status" data-testid="fortschritt">
                            {fortschritt}
                          </span>
                        )}
                      </div>
                      <ul className="analyse-liste" data-testid="analyse-tabelle">
                        {daten.personen.map((p) => {
                          const s = analyseStatus(p.analyse)
                          return (
                            <li key={p.id} className={offen === p.id ? 'aktiv' : undefined}>
                              <span className="analyse-liste__name">{p.name}</span>
                              <span className="badges">
                                <span className={`badge${s.ton === 'neutral' ? '' : ` badge--${s.ton}`}`}>{s.text}</span>
                                {p.analyse && !p.analyse.geprueft && <span className="badge badge--rot">Faktencheck nicht bestanden</span>}
                                {p.analyse?.bearbeitet && <span className="badge">bearbeitet</span>}
                                {p.analyse?.veraltet && <span className="badge badge--akzent">Daten geändert</span>}
                              </span>
                              {p.analyse ? (
                                <button type="button" className="btn btn--ghost" onClick={() => setOffen(offen === p.id ? null : p.id)}>
                                  {offen === p.id ? 'Schließen' : 'Öffnen'}
                                </button>
                              ) : (
                                <button type="button" className="btn btn--ghost" disabled={arbeitet !== null} onClick={() => erstellen(daten, p.id, false)}>
                                  {arbeitet === p.id ? 'Wird erstellt …' : 'Erstellen'}
                                </button>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                      {offen && daten.personen.some((p) => p.id === offen) && (
                        <AnalysePanel
                          key={`${offen}-${daten.monat}`}
                          personId={offen}
                          name={daten.personen.find((p) => p.id === offen)?.name ?? ''}
                          monat={daten.monat}
                          stand={stand}
                          beschaeftigt={arbeitet !== null}
                          arbeitetHier={arbeitet === offen}
                          onNeu={(neu) => erstellen(daten, offen, neu)}
                          onGeaendert={geaendert}
                          onMeldung={setMeldung}
                        />
                      )}
                    </>
                  )}
                </Abschnitt>
              )}
            </div>
          ))}
      </DatenZustand>
    </div>
  )
}

function AnalysePanel({
  personId, name, monat, stand, beschaeftigt, arbeitetHier, onNeu, onGeaendert, onMeldung,
}: {
  personId: string
  name: string
  monat: string
  stand: number
  beschaeftigt: boolean
  arbeitetHier: boolean
  onNeu: (neu: boolean) => void
  onGeaendert: () => void
  onMeldung: (m: Meldung | null) => void
}) {
  const { laedt, daten, fehler, neuLaden } = useDaten(() => holeAnalyse(personId, monat), [personId, monat, stand])
  const [bearbeiten, setBearbeiten] = useState(false)
  const [text, setText] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const [rueckfrage, setRueckfrage] = useState(false)

  async function speichern(a: Analyse) {
    setSpeichert(true)
    onMeldung(null)
    try {
      const neu = await bearbeiteAnalyse(personId, monat, text)
      onMeldung({
        art: 'ok',
        text:
          neu.text === a.text
            ? 'Nichts geändert.'
            : neu.geprueft
              ? 'Gespeichert. Die Analyse ist wieder ein Entwurf und muss neu freigegeben werden.'
              : `Gespeichert, aber: ${neu.pruef_hinweis ?? 'Faktencheck nicht bestanden'}. Die Analyse ist wieder ein Entwurf.`,
      })
      setBearbeiten(false)
      onGeaendert()
    } catch (e) {
      onMeldung({ art: 'fehler', text: fehlertext(e) })
    } finally {
      setSpeichert(false)
    }
  }

  async function freigeben(frei: boolean) {
    setSpeichert(true)
    onMeldung(null)
    try {
      await gibAnalyseFrei(personId, monat, frei)
      onMeldung({ art: 'ok', text: frei ? `Freigegeben. Die Analyse für ${name} steht jetzt im Personenbericht (PDF).` : 'Freigabe zurückgenommen, die Analyse ist wieder ein Entwurf.' })
      onGeaendert()
    } catch (e) {
      onMeldung({ art: 'fehler', text: fehlertext(e) })
    } finally {
      setSpeichert(false)
    }
  }

  return (
    <section className="karte karte--creme stack" aria-label={`Analyse ${name}`} data-testid="analyse-panel">
      <h3 className="ausw-titel">{name}</h3>
      <DatenZustand laedt={laedt && !daten} fehler={fehler} onNeu={neuLaden}>
        {daten && (
          <>
            <div className="badges">
              <span className={`badge${analyseStatus(daten).ton === 'neutral' ? '' : ` badge--${analyseStatus(daten).ton}`}`}>{analyseStatus(daten).text}</span>
              <span className={`badge ${daten.geprueft ? 'badge--gruen' : 'badge--rot'}`}>{daten.geprueft ? 'Faktencheck bestanden' : 'Faktencheck nicht bestanden'}</span>
              {daten.bearbeitet && <span className="badge">bearbeitet</span>}
              {daten.veraltet && <span className="badge badge--akzent">Daten geändert</span>}
            </div>
            {!daten.geprueft && daten.pruef_hinweis && (
              <p className="hinweis hinweis--fehler" role="alert" data-testid="pruef-hinweis">
                <Icon name="achtung" groesse={18} />
                <span>
                  {daten.pruef_hinweis}. Bitte prüfe die Stelle und korrigiere sie, bevor du freigibst. Eine Freigabe bleibt trotzdem möglich.
                </span>
              </p>
            )}

            {bearbeiten ? (
              <div className="stack-s">
                <label className="feld__label" htmlFor="analyse-text">
                  Text (Überschriften mit ##, Aufzählungen mit -)
                </label>
                <textarea id="analyse-text" className="feld__eingabe analyse-editor" rows={18} value={text} onChange={(e) => setText(e.target.value)} />
                <div className="aktionen">
                  <button type="button" className="btn" disabled={speichert || !text.trim()} onClick={() => speichern(daten)}>
                    {speichert ? 'Wird gespeichert …' : 'Speichern'}
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setBearbeiten(false)}>
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Markdown text={daten.text} />
                <p className="klein muted">
                  Erstellt {zeitpunkt(daten.erstellt_am)}
                  {daten.anbieter ? ` mit ${daten.anbieter}${daten.modell ? ` (${daten.modell})` : ''}` : ''}
                  {daten.versuche && daten.versuche > 1 ? `, ${daten.versuche} Versuche` : ''}.
                  {daten.bearbeitet_von ? ` Bearbeitet von ${daten.bearbeitet_von} am ${zeitpunkt(daten.bearbeitet_am)}.` : ''}
                  {daten.freigegeben_von ? ` Freigegeben von ${daten.freigegeben_von} am ${zeitpunkt(daten.freigegeben_am)}.` : ''}
                </p>
                {rueckfrage ? (
                  <div className="stack-s" role="group" aria-label="Neu generieren?">
                    <p className="hinweis hinweis--fehler">
                      <Icon name="achtung" groesse={18} />
                      <span>
                        {daten.status === 'freigegeben' ? 'Diese Analyse ist freigegeben' : 'Diese Analyse wurde bearbeitet'}. Neu generieren ersetzt den Text und macht sie wieder zum Entwurf.
                      </span>
                    </p>
                    <div className="aktionen">
                      <button type="button" className="btn" disabled={beschaeftigt} onClick={() => { setRueckfrage(false); onNeu(true) }}>
                        Ja, neu generieren
                      </button>
                      <button type="button" className="btn btn--ghost" onClick={() => setRueckfrage(false)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="aktionen">
                    <button type="button" className="btn btn--ghost" disabled={speichert || beschaeftigt} onClick={() => { setText(daten.text); setBearbeiten(true) }}>
                      Bearbeiten
                    </button>
                    {daten.status === 'freigegeben' ? (
                      <button type="button" className="btn btn--ghost" disabled={speichert || beschaeftigt} onClick={() => freigeben(false)}>
                        Freigabe zurücknehmen
                      </button>
                    ) : (
                      <button type="button" className="btn" disabled={speichert || beschaeftigt} onClick={() => freigeben(true)}>
                        Freigeben
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={speichert || beschaeftigt}
                      onClick={() => (daten.bearbeitet || daten.status === 'freigegeben' ? setRueckfrage(true) : onNeu(true))}
                    >
                      {arbeitetHier ? 'Wird erstellt …' : 'Neu generieren'}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </DatenZustand>
    </section>
  )
}
