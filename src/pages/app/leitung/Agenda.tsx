import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Abschnitt, DatenZustand, Kennzahl, Leer, Monatswahl } from '../../../components/auswertung/Bausteine'
import { Icon } from '../../../components/Icon'
import { bearbeiteAgenda, erzeugeAgenda, gibAgendaFrei, holeAbschlussUebersicht, holeAgenda } from '../../../lib/api'
import { BLOCK_GRENZEN, pruefeZeitbudget, summeMinuten, type AgendaBlock, type AgendaDaten, type AgendaZeile } from '../../../lib/agenda'
import { zeitpunkt } from '../../../lib/abschluss'
import { monatName } from '../../../lib/auswertung'
import { useDaten } from '../../../lib/useDaten'

interface Meldung {
  art: 'ok' | 'fehler'
  text: string
}
const fehlertext = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Das hat nicht geklappt. Bitte versuche es erneut.')
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * Leitung → Agenda: die Agenda fürs Teammeeting (15 bis 20 Minuten) aus den Daten des Monats, ohne KI.
 * Auch der Link aus der Mail (`/app/leitung/agenda?monat=2026-09`) landet hier.
 */
export default function Agenda() {
  const params = useParams()
  const [suche] = useSearchParams()
  const navigate = useNavigate()
  const wunsch = [params.monat, suche.get('monat')].find((m): m is string => !!m && MONAT.test(m))
  const [monatWahl, setMonatWahl] = useState<string | undefined>(wunsch)
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  const [arbeitet, setArbeitet] = useState(false)
  const [rueckfrage, setRueckfrage] = useState(false)

  const uebersicht = useDaten(() => holeAbschlussUebersicht(monatWahl), [monatWahl])
  const monat = uebersicht.daten?.monat
  const agenda = useDaten(() => (monat ? holeAgenda(monat) : Promise.resolve(null)), [monat])

  const wechsle = (m: string) => {
    setMonatWahl(m)
    setMeldung(null)
    setRueckfrage(false)
    navigate(`/app/leitung/agenda/${m}`, { replace: true })
  }

  async function aktion(job: () => Promise<unknown>, okText: string) {
    setArbeitet(true)
    setMeldung(null)
    try {
      await job()
      setMeldung({ art: 'ok', text: okText })
      setRueckfrage(false)
      agenda.neuLaden()
    } catch (e) {
      setMeldung({ art: 'fehler', text: fehlertext(e) })
    } finally {
      setArbeitet(false)
    }
  }

  const a = agenda.daten

  return (
    <div className="stack stack-l">
      <header className="seitenkopf">
        <p className="overline">Leitung</p>
        <h1 style={{ marginTop: 8 }}>Agenda fürs Teammeeting</h1>
        <p>
          Fünf Blöcke in fester Reihenfolge, 15 bis 20 Minuten. Alle Zahlen kommen aus den Daten des Monats, es gibt keine KI. Die Agenda zeigt nur das Team, keine Rangliste
          und keine Absender.
        </p>
      </header>

      {meldung && (
        <p className={`hinweis hinweis--${meldung.art === 'ok' ? 'ok' : 'fehler'}`} role={meldung.art === 'ok' ? 'status' : 'alert'}>
          <Icon name={meldung.art === 'ok' ? 'haken' : 'achtung'} groesse={18} />
          <span>{meldung.text}</span>
        </p>
      )}

      <DatenZustand laedt={uebersicht.laedt && !uebersicht.daten} fehler={uebersicht.fehler} onNeu={uebersicht.neuLaden}>
        {uebersicht.daten &&
          (uebersicht.daten.monate.length === 0 ? (
            <Leer titel="Noch keine Abgaben" text="Sobald die ersten Umfragen abgegeben sind, lässt sich hier eine Agenda erzeugen." />
          ) : (
            <div className="stack stack-l" aria-busy={agenda.laedt}>
              <Monatswahl monate={uebersicht.daten.monate} wert={uebersicht.daten.monat} onChange={wechsle} />

              <DatenZustand laedt={agenda.laedt && !agenda.daten} fehler={agenda.fehler} onNeu={agenda.neuLaden}>
                {!a ? (
                  <Abschnitt titel="Noch keine Agenda">
                    <p>
                      Für {monatName(uebersicht.daten.monat)} gibt es noch keine Agenda. Sie entsteht aus den Team-Kennzahlen, dem Fokus und den größten Differenzen und
                      Veränderungen.
                    </p>
                    <button
                      type="button"
                      className="btn"
                      style={{ justifySelf: 'start' }}
                      disabled={arbeitet}
                      onClick={() => aktion(() => erzeugeAgenda(uebersicht.daten!.monat), 'Agenda erzeugt. Bitte lesen, bei Bedarf bearbeiten und dann freigeben.')}
                    >
                      {arbeitet ? 'Wird erzeugt …' : 'Agenda erzeugen'}
                    </button>
                  </Abschnitt>
                ) : (
                  <AgendaAnsicht
                    key={`${a.monat}-${a.aktualisiert_am}`}
                    zeile={a}
                    arbeitet={arbeitet}
                    rueckfrage={rueckfrage}
                    onRueckfrage={setRueckfrage}
                    onNeu={() => aktion(() => erzeugeAgenda(a.monat, true), 'Agenda neu erzeugt (Entwurf).')}
                    onFrei={(frei) => aktion(() => gibAgendaFrei(a.monat, frei), frei ? 'Freigegeben. Die Agenda steht jetzt am Ende des Monatsberichts (PDF).' : 'Freigabe zurückgenommen, die Agenda ist wieder ein Entwurf.')}
                    onSpeichern={(daten) => aktion(() => bearbeiteAgenda(a.monat, daten), 'Gespeichert. Die Agenda ist wieder ein Entwurf und muss neu freigegeben werden.')}
                  />
                )}
              </DatenZustand>
            </div>
          ))}
      </DatenZustand>
    </div>
  )
}

function AgendaAnsicht({
  zeile, arbeitet, rueckfrage, onRueckfrage, onNeu, onFrei, onSpeichern,
}: {
  zeile: AgendaZeile
  arbeitet: boolean
  rueckfrage: boolean
  onRueckfrage: (b: boolean) => void
  onNeu: () => void
  onFrei: (frei: boolean) => void
  onSpeichern: (daten: AgendaDaten) => void
}) {
  const [bearbeiten, setBearbeiten] = useState(false)
  const ag = zeile.agenda
  const frei = zeile.status === 'freigegeben'

  return (
    <div className="stack stack-l">
      <div className="kennzahlen kennzahlen--abschluss">
        <Kennzahl label="Stand" wert={frei ? 'Freigegeben' : 'Entwurf'} ton={frei ? 'gruen' : 'neutral'} zusatz={frei ? `von ${zeile.freigegeben_von}, ${zeitpunkt(zeile.freigegeben_am)}` : `erstellt ${zeitpunkt(zeile.erstellt_am)}`} />
        <Kennzahl label="Dauer" wert={`${summeMinuten(ag.bloecke)} Min.`} zusatz="Ziel: 15 bis 20 Minuten" />
      </div>

      {ag.unvollstaendig && (
        <div className="hinweis" data-testid="stand-unvollstaendig">
          <Icon name="achtung" groesse={18} />
          <span>
            <strong>Stand unvollständig</strong> (zum Zeitpunkt des Erzeugens): {ag.hinweise.join(' ')}
          </span>
        </div>
      )}

      {bearbeiten ? (
        <Editor zeile={zeile} arbeitet={arbeitet} onAbbrechen={() => setBearbeiten(false)} onSpeichern={onSpeichern} />
      ) : (
        <>
          {ag.bloecke.map((b) => (
            <Abschnitt key={b.id} titel={`${b.titel} (${b.minuten} Min.)`}>
              <ul className="md__liste" data-testid={`block-${b.id}`}>
                {b.punkte.map((p, i) => (
                  <li key={i} className={p.beispiel ? 'agenda-beispiel' : undefined}>
                    {p.text}
                    {p.beispiel && <span className="badge badge--akzent agenda-beispiel__hinweis">nur auf der Plattform</span>}
                  </li>
                ))}
              </ul>
            </Abschnitt>
          ))}
          <p className="klein muted">
            Kommentar-Beispiele stehen nur hier auf der Plattform, nie in der Mail und nie im PDF. Die freigegebene Agenda steht am Ende des Monatsberichts (PDF).
            {zeile.bearbeitet_von && ` Bearbeitet von ${zeile.bearbeitet_von} am ${zeitpunkt(zeile.bearbeitet_am)}.`}
          </p>

          {rueckfrage ? (
            <div className="stack-s" role="group" aria-label="Neu erzeugen?">
              <p className="hinweis hinweis--fehler">
                <Icon name="achtung" groesse={18} />
                <span>
                  {frei ? 'Diese Agenda ist freigegeben' : 'Diese Agenda wurde bearbeitet'}. Neu erzeugen ersetzt sie durch einen frischen Entwurf aus den aktuellen Daten.
                </span>
              </p>
              <div className="aktionen">
                <button type="button" className="btn" disabled={arbeitet} onClick={onNeu}>
                  Ja, neu erzeugen
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => onRueckfrage(false)}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <div className="aktionen">
              <button type="button" className="btn btn--ghost" disabled={arbeitet} onClick={() => setBearbeiten(true)}>
                Bearbeiten
              </button>
              {frei ? (
                <button type="button" className="btn btn--ghost" disabled={arbeitet} onClick={() => onFrei(false)}>
                  Freigabe zurücknehmen
                </button>
              ) : (
                <button type="button" className="btn" disabled={arbeitet} onClick={() => onFrei(true)}>
                  Freigeben
                </button>
              )}
              <button type="button" className="btn btn--ghost" disabled={arbeitet} onClick={() => (frei || zeile.bearbeitet ? onRueckfrage(true) : onNeu())}>
                Neu erzeugen
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Editor({
  zeile, arbeitet, onAbbrechen, onSpeichern,
}: {
  zeile: AgendaZeile
  arbeitet: boolean
  onAbbrechen: () => void
  onSpeichern: (daten: AgendaDaten) => void
}) {
  const ag = zeile.agenda
  const [minuten, setMinuten] = useState<Record<string, string>>(Object.fromEntries(ag.bloecke.map((b) => [b.id, String(b.minuten)])))
  const [zeilen, setZeilen] = useState<Record<string, string>>(
    Object.fromEntries(ag.bloecke.map((b) => [b.id, b.punkte.filter((p) => !p.beispiel).map((p) => p.text).join('\n')])),
  )
  const [fehler, setFehler] = useState<string[]>([])

  const bauen = (): AgendaDaten => {
    const bloecke: AgendaBlock[] = ag.bloecke.map((b) => ({
      ...b,
      minuten: minuten[b.id].trim() === '' ? Number.NaN : Number(minuten[b.id].replace(',', '.')),
      punkte: [
        ...zeilen[b.id].split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ text })),
        // Kommentar-Beispiele bleiben unverändert, sie lassen sich hier nicht ändern
        ...b.punkte.filter((p) => p.beispiel),
      ],
    }))
    return { ...ag, bloecke, minuten_gesamt: summeMinuten(bloecke) }
  }
  const aktuell = bauen()
  const summe = summeMinuten(aktuell.bloecke)

  function speichern() {
    const probleme = pruefeZeitbudget(aktuell.bloecke)
    for (const b of aktuell.bloecke) {
      if (b.punkte.some((p) => p.text.length > 600)) probleme.push('Ein Punkt ist länger als 600 Zeichen.')
    }
    setFehler([...new Set(probleme)])
    if (probleme.length === 0) onSpeichern(aktuell)
  }

  return (
    <div className="stack stack-l" data-testid="agenda-editor">
      {ag.bloecke.map((b) => {
        const g = BLOCK_GRENZEN[b.id]
        return (
          <section key={b.id} className="karte stack-s" aria-label={b.titel}>
            <h2 className="ausw-titel">{b.titel}</h2>
            <div className="feld" style={{ maxWidth: 200 }}>
              <label className="feld__label" htmlFor={`min-${b.id}`}>
                Minuten ({g.min === g.max ? `genau ${g.min}` : `${g.min} bis ${g.max}`})
              </label>
              <input
                id={`min-${b.id}`}
                className="feld__eingabe"
                inputMode="numeric"
                value={minuten[b.id]}
                onChange={(e) => setMinuten({ ...minuten, [b.id]: e.target.value })}
              />
            </div>
            <div className="feld">
              <label className="feld__label" htmlFor={`punkte-${b.id}`}>
                Punkte (einer pro Zeile)
              </label>
              <textarea
                id={`punkte-${b.id}`}
                className="feld__eingabe analyse-editor"
                style={{ minHeight: 110 }}
                rows={Math.max(3, zeilen[b.id].split('\n').length + 1)}
                value={zeilen[b.id]}
                onChange={(e) => setZeilen({ ...zeilen, [b.id]: e.target.value })}
              />
            </div>
            {b.punkte.some((p) => p.beispiel) && <p className="klein muted">Die Kommentar-Beispiele dieses Blocks bleiben erhalten (nur auf der Plattform).</p>}
          </section>
        )
      })}
      <p className="klein" data-testid="summe">
        Summe: <strong>{Number.isNaN(summe) ? '–' : summe} Minuten</strong> (Ziel: 15 bis 20)
      </p>
      {fehler.length > 0 && (
        <div className="hinweis hinweis--fehler" role="alert">
          <Icon name="achtung" groesse={18} />
          <span>{fehler.join(' ')}</span>
        </div>
      )}
      <div className="aktionen">
        <button type="button" className="btn" disabled={arbeitet} onClick={speichern}>
          {arbeitet ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
