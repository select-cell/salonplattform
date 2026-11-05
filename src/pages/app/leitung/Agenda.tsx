import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Abschnitt, DatenZustand, Kennzahl, Leer, Monatswahl } from '../../../components/auswertung/Bausteine'
import { Icon } from '../../../components/Icon'
import { bearbeiteAgenda, erstelleAgendaMitKi, erzeugeAgenda, gibAgendaFrei, holeAbschlussUebersicht, holeAgenda } from '../../../lib/api'
import { BLOCK_GRENZEN, pruefeZeitbudget, summeMinuten, vonKi, type AgendaBlock, type AgendaDaten, type AgendaZeile } from '../../../lib/agenda'
import { kiErlaubt, zeitpunkt } from '../../../lib/abschluss'
import { monatName } from '../../../lib/auswertung'
import { useDaten } from '../../../lib/useDaten'

interface Meldung {
  art: 'ok' | 'fehler'
  text: string
}
const fehlertext = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Das hat nicht geklappt. Bitte versuche es erneut.')
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/

/** Wie eine vorhandene Agenda ersetzt werden soll (für die Rückfrage) */
type Ersatz = 'vorlage' | 'ki'

/**
 * Leitung → Agenda: die Agenda fürs Teammeeting (15 bis 20 Minuten) aus den Daten des Monats. Die Vorlage braucht keine KI;
 * der Admin kann sie zusätzlich von der KI formulieren lassen (Version 1.3). Auch der Link aus der Mail
 * (`/app/leitung/agenda?monat=2026-09`) landet hier.
 */
export default function Agenda() {
  const params = useParams()
  const [suche] = useSearchParams()
  const navigate = useNavigate()
  const wunsch = [params.monat, suche.get('monat')].find((m): m is string => !!m && MONAT.test(m))
  const [monatWahl, setMonatWahl] = useState<string | undefined>(wunsch)
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  const [arbeitet, setArbeitet] = useState<'vorlage' | 'ki' | null>(null)
  const [rueckfrage, setRueckfrage] = useState<Ersatz | null>(null)

  const uebersicht = useDaten(() => holeAbschlussUebersicht(monatWahl), [monatWahl])
  const monat = uebersicht.daten?.monat
  const agenda = useDaten(() => (monat ? holeAgenda(monat) : Promise.resolve(null)), [monat])

  const wechsle = (m: string) => {
    setMonatWahl(m)
    setMeldung(null)
    setRueckfrage(null)
    navigate(`/app/leitung/agenda/${m}`, { replace: true })
  }

  async function aktion(job: () => Promise<unknown>, okText: string | ((ergebnis: unknown) => string), art: 'vorlage' | 'ki' = 'vorlage') {
    setArbeitet(art)
    setMeldung(null)
    try {
      const ergebnis = await job()
      setMeldung({ art: 'ok', text: typeof okText === 'function' ? okText(ergebnis) : okText })
      setRueckfrage(null)
      agenda.neuLaden()
    } catch (e) {
      setMeldung({ art: 'fehler', text: fehlertext(e) })
    } finally {
      setArbeitet(null)
    }
  }

  /** Die KI formuliert die Agenda; gleiche Daten wie beim letzten Mal ergeben keinen neuen Aufruf, außer `neu` ist gesetzt */
  const mitKi = (monatKey: string, neu: boolean) =>
    aktion(
      () => erstelleAgendaMitKi(monatKey, neu),
      (e) => {
        const r = e as Awaited<ReturnType<typeof erstelleAgendaMitKi>>
        if (r.uebersprungen) return 'Für diesen Monat hat sich nichts geändert, die vorhandene Agenda der KI bleibt.'
        return `Agenda von der KI formuliert${r.agenda.geprueft === false ? ', der Faktencheck ist nicht bestanden. Bitte genau lesen' : ''}. Bitte lesen, bei Bedarf bearbeiten und dann freigeben.`
      },
      'ki',
    )

  const a = agenda.daten

  return (
    <div className="stack stack-l">
      <header className="seitenkopf">
        <p className="overline">Leitung</p>
        <h1 style={{ marginTop: 8 }}>Agenda fürs Teammeeting</h1>
        <p>
          Fünf Blöcke in fester Reihenfolge, 15 bis 20 Minuten. Alle Zahlen kommen aus den Daten des Monats. Die Vorlage braucht keine KI; der Admin kann die Agenda
          zusätzlich von der KI formulieren lassen (nur Teamwerte, die Datenbank prüft Aufbau, Minuten und Zahlen). Die Agenda zeigt nur das Team, keine Rangliste und keine
          Absender.
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
                    <div className="aktionen">
                      <button
                        type="button"
                        className="btn"
                        disabled={arbeitet !== null}
                        onClick={() => aktion(() => erzeugeAgenda(uebersicht.daten!.monat), 'Agenda erzeugt. Bitte lesen, bei Bedarf bearbeiten und dann freigeben.')}
                      >
                        {arbeitet === 'vorlage' ? 'Wird erzeugt …' : 'Agenda erzeugen'}
                      </button>
                      {kiErlaubt(uebersicht.daten) && (
                        <button type="button" className="btn btn--ghost" disabled={arbeitet !== null} onClick={() => mitKi(uebersicht.daten!.monat, false)}>
                          {arbeitet === 'ki' ? 'Die KI formuliert …' : 'Mit KI formulieren'}
                        </button>
                      )}
                    </div>
                    {arbeitet === 'ki' && (
                      <p className="klein muted" role="status" data-testid="ki-arbeitet">
                        Die KI formuliert die Agenda. Das kann bis zu einer Minute dauern.
                      </p>
                    )}
                  </Abschnitt>
                ) : (
                  <AgendaAnsicht
                    key={`${a.monat}-${a.aktualisiert_am}`}
                    zeile={a}
                    ki={kiErlaubt(uebersicht.daten)}
                    arbeitet={arbeitet}
                    rueckfrage={rueckfrage}
                    onRueckfrage={setRueckfrage}
                    onNeu={() => aktion(() => erzeugeAgenda(a.monat, true), 'Agenda neu erzeugt (Entwurf).')}
                    onNeuKi={() => mitKi(a.monat, true)}
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
  zeile, ki, arbeitet, rueckfrage, onRueckfrage, onNeu, onNeuKi, onFrei, onSpeichern,
}: {
  zeile: AgendaZeile
  /** darf die aufrufende Person die KI nutzen? */
  ki: boolean
  arbeitet: 'vorlage' | 'ki' | null
  rueckfrage: Ersatz | null
  onRueckfrage: (b: Ersatz | null) => void
  onNeu: () => void
  onNeuKi: () => void
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

      {vonKi(zeile) && (
        <div className="badges" data-testid="agenda-ki">
          <span className="badge badge--akzent">Von der KI formuliert</span>
          <span className={`badge ${zeile.geprueft === false ? 'badge--rot' : 'badge--gruen'}`}>{zeile.geprueft === false ? 'Faktencheck nicht bestanden' : 'Faktencheck bestanden'}</span>
          {zeile.bearbeitet && <span className="badge">bearbeitet</span>}
        </div>
      )}
      {vonKi(zeile) && zeile.geprueft === false && zeile.pruef_hinweis && (
        <p className="hinweis hinweis--fehler" role="alert" data-testid="pruef-hinweis">
          <Icon name="achtung" groesse={18} />
          <span>{zeile.pruef_hinweis}. Bitte prüfe die Stelle und korrigiere sie, bevor du freigibst. Eine Freigabe bleibt trotzdem möglich.</span>
        </p>
      )}

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
            {vonKi(zeile) && ` Formuliert von der KI (${zeile.anbieter}${zeile.modell ? `, ${zeile.modell}` : ''})${zeile.versuche && zeile.versuche > 1 ? `, ${zeile.versuche} Versuche` : ''}.`}
            {zeile.bearbeitet_von && ` Bearbeitet von ${zeile.bearbeitet_von} am ${zeitpunkt(zeile.bearbeitet_am)}.`}
          </p>
          {arbeitet === 'ki' && (
            <p className="klein muted" role="status" data-testid="ki-arbeitet">
              Die KI formuliert die Agenda. Das kann bis zu einer Minute dauern.
            </p>
          )}

          {rueckfrage ? (
            <div className="stack-s" role="group" aria-label={rueckfrage === 'ki' ? 'Neu formulieren?' : 'Neu erzeugen?'}>
              <p className="hinweis hinweis--fehler">
                <Icon name="achtung" groesse={18} />
                <span>
                  {frei ? 'Diese Agenda ist freigegeben' : 'Diese Agenda wurde bearbeitet'}.{' '}
                  {rueckfrage === 'ki'
                    ? 'Neu formulieren lässt die KI die Agenda neu schreiben und ersetzt sie durch einen frischen Entwurf.'
                    : 'Neu erzeugen ersetzt sie durch einen frischen Entwurf aus den aktuellen Daten.'}
                </span>
              </p>
              <div className="aktionen">
                <button type="button" className="btn" disabled={arbeitet !== null} onClick={rueckfrage === 'ki' ? onNeuKi : onNeu}>
                  {rueckfrage === 'ki' ? 'Ja, neu formulieren' : 'Ja, neu erzeugen'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => onRueckfrage(null)}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <div className="aktionen">
              <button type="button" className="btn btn--ghost" disabled={arbeitet !== null} onClick={() => setBearbeiten(true)}>
                Bearbeiten
              </button>
              {frei ? (
                <button type="button" className="btn btn--ghost" disabled={arbeitet !== null} onClick={() => onFrei(false)}>
                  Freigabe zurücknehmen
                </button>
              ) : (
                <button type="button" className="btn" disabled={arbeitet !== null} onClick={() => onFrei(true)}>
                  Freigeben
                </button>
              )}
              <button type="button" className="btn btn--ghost" disabled={arbeitet !== null} onClick={() => (frei || zeile.bearbeitet ? onRueckfrage('vorlage') : onNeu())}>
                Neu erzeugen
              </button>
              {ki && (
                <button type="button" className="btn btn--ghost" disabled={arbeitet !== null} onClick={() => (frei || zeile.bearbeitet ? onRueckfrage('ki') : onNeuKi())}>
                  {arbeitet === 'ki' ? 'Die KI formuliert …' : 'Neu mit KI formulieren'}
                </button>
              )}
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
  arbeitet: 'vorlage' | 'ki' | null
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
        <button type="button" className="btn" disabled={arbeitet !== null} onClick={speichern}>
          {arbeitet ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
