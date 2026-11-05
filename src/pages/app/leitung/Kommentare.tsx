import { useState } from 'react'
import { DatenZustand, Kennzahl, Leer, Monatswahl, Abschnitt } from '../../../components/auswertung/Bausteine'
import { holeKommentarAuswertung } from '../../../lib/api'
import { monatName, zahl } from '../../../lib/auswertung'
import { useDaten } from '../../../lib/useDaten'

const prozent = (w: number | null) => (w === null ? '–' : `${zahl(w)} %`)

/** Leitung → Kommentare: wer schreibt Kommentare, wie ausführlich, wer keine (Erweiterung D). Nie Kommentartexte. */
export default function Kommentare() {
  const [gewaehlt, setGewaehlt] = useState<string | undefined>(undefined)
  const { laedt, daten, fehler, neuLaden } = useDaten(() => holeKommentarAuswertung(gewaehlt), [gewaehlt])

  return (
    <div className="stack stack-l">
      <header className="seitenkopf">
        <p className="overline">Leitung</p>
        <h1 style={{ marginTop: 8 }}>Kommentare im Team</h1>
        <p>Wer schreibt Kommentare, wie ausführlich und wer keine. Es werden Kennzahlen je Person gezeigt, nie die Texte selbst.</p>
      </header>

      <DatenZustand laedt={laedt && !daten} fehler={fehler} onNeu={neuLaden}>
        {daten &&
          (daten.monate.length === 0 ? (
            <Leer titel="Noch keine Abgaben" text="Sobald die ersten Umfragen abgegeben sind, erscheint hier die Auswertung." />
          ) : (
            <div className="stack stack-l" aria-busy={laedt}>
              <Monatswahl monate={daten.monate} wert={daten.monat} onChange={setGewaehlt} />

              {daten.team.abgegeben === 0 ? (
                <Leer titel={`Keine Abgaben für ${monatName(daten.monat)}`} text="Für diesen Monat liegen keine Bewertungen vor." />
              ) : (
                <>
                  <div className="kennzahlen">
                    <Kennzahl label="Kommentar-Quote" wert={prozent(daten.team.quote)} zusatz={`${daten.team.kommentare} von ${daten.team.bewertungen} Bewertungen`} />
                    <Kennzahl
                      label={`Pflicht (ab ${daten.schwelle_pflicht})`}
                      wert={`${daten.team.pflicht_erfuellt} von ${daten.team.pflicht}`}
                      zusatz="mit Kommentar"
                    />
                    <Kennzahl label="Freiwillig geschrieben" wert={prozent(daten.team.freiwillige_quote)} zusatz={`Bewertungen 1 bis ${daten.schwelle_pflicht - 1}`} />
                    <Kennzahl label="Ø Wörter" wert={daten.team.woerter_schnitt === null ? '–' : zahl(daten.team.woerter_schnitt)} zusatz={`${daten.team.kurz} unter ${daten.kurz_unter_woerter} Wörtern`} />
                  </div>

                  <Abschnitt
                    titel="Je Person"
                    kurz={`Team gewichtet: ${daten.team.abgegeben} von ${daten.team.erwartet} Personen haben abgegeben. Wiederholungen: ${daten.team.doppelt}.`}
                  >
                    <div className="tabelle-scroll">
                      <table className="tabelle" data-testid="kommentar-tabelle">
                        <thead>
                          <tr>
                            <th>Person</th>
                            <th className="zahl">Quote</th>
                            <th className="zahl">Pflicht erfüllt</th>
                            <th className="zahl">Freiwillig</th>
                            <th className="zahl">Ø Wörter</th>
                            <th className="zahl">Kurz</th>
                            <th className="zahl">Doppelt</th>
                            <th className="zahl">Verhalten ohne Kommentar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {daten.personen.map((p) => (
                            <tr key={p.id}>
                              <td>{p.name}</td>
                              <td className="zahl">{prozent(p.quote)}</td>
                              <td className="zahl">
                                {p.pflicht_erfuellt} von {p.pflicht}
                              </td>
                              <td className="zahl">{prozent(p.freiwillige_quote)}</td>
                              <td className="zahl">{p.woerter_schnitt === null ? '–' : zahl(p.woerter_schnitt)}</td>
                              <td className="zahl">{p.kurz}</td>
                              <td className="zahl">{p.doppelt}</td>
                              <td className="zahl">{p.verhalten_ohne_kommentar}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {daten.nicht_abgegeben.length > 0 && (
                      <p className="klein" data-testid="nicht-abgegeben">
                        <strong>Nicht abgegeben:</strong> {daten.nicht_abgegeben.map((p) => p.name).join(', ')}
                      </p>
                    )}
                  </Abschnitt>
                </>
              )}

              <p className="klein muted">
                Die Quote sagt, wie oft kommentiert wurde. „Freiwillig“ zählt nur Bewertungen unter {daten.schwelle_pflicht}, dort ist ein
                Kommentar nicht vorgeschrieben. „Doppelt“ sind Wiederholungen desselben Textes. „Verhalten ohne Kommentar“ sind
                Verhalten, zu denen die Person nirgends etwas geschrieben hat.
                {daten.eigene_analyse_nur_admin && ' Eigene Werte sehen Verantwortliche nicht (Datenschutz-Schalter), der Admin sieht alles.'}
              </p>
            </div>
          ))}
      </DatenZustand>
    </div>
  )
}
