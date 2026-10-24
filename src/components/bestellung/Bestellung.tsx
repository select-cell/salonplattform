import { useEffect, useRef, useState } from 'react'
import { sendeAnfrageMitDetails, type Karte, type SendeDetails } from '../../lib/bestellApi'
import {
  aendereMenge,
  anfrageIdFuer,
  anzahlStuecke,
  formatiereRest,
  HAUPTBUTTON_TEXT,
  positionenAusAuswahl,
  TEXTE,
  type Auswahl,
  type IdMerker,
  type Position,
} from '../../lib/bestellung'
import { zielUrl } from '../../lib/testversion'
import { Icon } from '../Icon'
import { Mengenwahl } from './Mengenwahl'
import { Platzmarke } from './Platzmarke'
import { TestDetails } from './TestDetails'

type Ansicht = 'karte' | 'auswahl' | 'fertig'
type Meldung = 'gesperrt' | 'fehler' | 'nicht_eingerichtet' | null

/** Sekunden bis zum Zeitpunkt `bis` (ms), tickt einmal pro halber Sekunde; 0 ohne Sperre */
function useRestsekunden(bis: number | null): number {
  const [, takt] = useState(0)
  useEffect(() => {
    if (bis === null || bis <= Date.now()) return
    const timer = setInterval(() => takt((n) => n + 1), 500)
    return () => clearInterval(timer)
  }, [bis])
  return bis === null ? 0 : Math.max(0, Math.ceil((bis - Date.now()) / 1000))
}

export function Bestellung({ platz, karte }: { platz: number; karte: Karte }) {
  const [auswahl, setAuswahl] = useState<Auswahl>({})
  const [ansicht, setAnsicht] = useState<Ansicht>('karte')
  const [sendet, setSendet] = useState(false)
  const [meldung, setMeldung] = useState<Meldung>(null)
  const [sperreBis, setSperreBis] = useState<number | null>(null)
  const [abgeschickt, setAbgeschickt] = useState<Position[]>([])
  const [details, setDetails] = useState<SendeDetails | null>(null) // nur Testversion
  const laeuft = useRef(false) // schützt vor Doppelklick, bevor React neu gezeichnet hat
  const idMerker = useRef<IdMerker | null>(null)
  const titel = useRef<HTMLHeadingElement>(null)
  const ersteAnsicht = useRef(true)
  const rest = useRestsekunden(sperreBis)

  const positionen = positionenAusAuswahl(auswahl, karte.artikel)
  const stuecke = anzahlStuecke(auswahl)
  const name = (artikelId: string) => karte.artikel.find((a) => a.id === artikelId)?.name ?? artikelId

  // Beim Wechsel der Ansicht springt der Fokus zur Überschrift (Screenreader, Tastatur)
  useEffect(() => {
    if (ersteAnsicht.current) {
      ersteAnsicht.current = false
      return
    }
    titel.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [ansicht])

  const aendern = (artikelId: string, schritt: number) => setAuswahl((alt) => aendereMenge(alt, artikelId, schritt))

  async function absenden() {
    if (laeuft.current || rest > 0 || positionen.length === 0) return
    laeuft.current = true
    setSendet(true)
    setMeldung(null)
    idMerker.current = anfrageIdFuer(idMerker.current, platz, positionen)
    const { antwort, details: sendeDetails } = await sendeAnfrageMitDetails(
      { anfrage_id: idMerker.current.id, typ: 'anfrage', platz, positionen },
      __TESTVERSION__ ? zielUrl() : undefined,
    )
    if (__TESTVERSION__) setDetails(sendeDetails)
    laeuft.current = false
    setSendet(false)

    if (antwort.art === 'ok') {
      setSperreBis(Date.now() + antwort.sperreSekunden * 1000)
      setAbgeschickt(positionen)
      idMerker.current = null
      setAnsicht('fertig')
    } else if (antwort.art === 'gesperrt') {
      setSperreBis(Date.now() + antwort.warteSekunden * 1000)
      setMeldung('gesperrt')
    } else {
      setMeldung(antwort.grund === 'nicht_eingerichtet' ? 'nicht_eingerichtet' : 'fehler')
    }
  }

  function neueAnfrage() {
    setAuswahl({})
    setMeldung(null)
    setAbgeschickt([])
    setDetails(null)
    idMerker.current = null
    setAnsicht('karte')
  }

  if (ansicht === 'fertig') {
    return (
      <section className="karte erfolg bestaetigung" aria-labelledby="bestell-titel">
        <Platzmarke platz={platz} />
        <span className="erfolg__icon">
          <Icon name="haken" groesse={28} />
        </span>
        <h1 id="bestell-titel" ref={titel} tabIndex={-1}>
          Anfrage <em>gesendet</em>
        </h1>
        <p className="muted">{TEXTE.bestaetigung}</p>
        <ul className="bestaetigung__liste">
          {abgeschickt.map((p) => (
            <li key={p.artikel}>
              {p.menge}× {name(p.artikel)}
            </li>
          ))}
        </ul>
        {rest > 0 ? (
          <span className="badge badge--akzent" role="timer">
            Neue Anfrage möglich in {formatiereRest(rest)}
          </span>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={neueAnfrage}>
            Neue Anfrage
          </button>
        )}
        {__TESTVERSION__ && details && <TestDetails details={details} />}
      </section>
    )
  }

  if (ansicht === 'auswahl') {
    return (
      <>
        <header className="bestell__kopf">
          <Platzmarke platz={platz} />
          <h1 ref={titel} tabIndex={-1}>
            Deine <em>Auswahl</em>
          </h1>
        </header>

        {positionen.length === 0 ? (
          <div className="stack">
            <p className="muted">Du hast noch nichts ausgewählt.</p>
            <button type="button" className="btn btn--ghost btn--block" onClick={() => setAnsicht('karte')}>
              Artikel auswählen
            </button>
          </div>
        ) : (
          <>
            <ul className="artikel">
              {positionen.map((p) => (
                <li key={p.artikel} className="artikel__zeile artikel__zeile--gewaehlt">
                  <span className="artikel__name">
                    {name(p.artikel)}
                    <button
                      type="button"
                      className="textlink artikel__entfernen"
                      onClick={() => aendern(p.artikel, -p.menge)}
                      disabled={sendet}
                    >
                      Entfernen
                    </button>
                  </span>
                  <Mengenwahl name={name(p.artikel)} menge={p.menge} onAendern={(s) => aendern(p.artikel, s)} />
                </li>
              ))}
            </ul>

            <div className="bestell__aktionen">
              {meldung === 'gesperrt' && rest > 0 && (
                <div className="hinweis" role="alert">
                  <Icon name="achtung" groesse={20} />
                  <p>{TEXTE.gesperrt}</p>
                </div>
              )}
              {(meldung === 'fehler' || meldung === 'nicht_eingerichtet') && (
                <div className="hinweis hinweis--fehler" role="alert">
                  <Icon name="achtung" groesse={20} />
                  <div>
                    <p>{meldung === 'fehler' ? TEXTE.fehler : TEXTE.nichtEingerichtet}</p>
                    {__TESTVERSION__ && (
                      <p style={{ marginTop: 6 }}>
                        <strong>Testversion:</strong> Der genaue Grund steht unten unter „Testdetails“.
                      </p>
                    )}
                  </div>
                </div>
              )}
              <button
                type="button"
                className="btn btn--gross btn--block"
                onClick={() => void absenden()}
                disabled={sendet || rest > 0}
              >
                {sendet ? (
                  'Wird gesendet …'
                ) : rest > 0 ? (
                  `Wieder möglich in ${formatiereRest(rest)}`
                ) : (
                  <>
                    {HAUPTBUTTON_TEXT}
                    <Icon name="pfeil" groesse={20} />
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={() => setAnsicht('karte')}
                disabled={sendet}
              >
                Weitere Artikel wählen
              </button>
            </div>
            {__TESTVERSION__ && details && <TestDetails details={details} />}
          </>
        )}
      </>
    )
  }

  return (
    <>
      <header className="bestell__kopf">
        <Platzmarke platz={platz} />
        <h1 ref={titel} tabIndex={-1}>
          Was dürfen wir dir <em>bringen</em>?
        </h1>
        <p className="muted">Wähle aus und sende einmal ab. Dein Team ist sofort informiert.</p>
      </header>

      <ul className="artikel">
        {karte.artikel.map((artikel) => {
          const menge = auswahl[artikel.id] ?? 0
          return (
            <li key={artikel.id} className={menge > 0 ? 'artikel__zeile artikel__zeile--gewaehlt' : 'artikel__zeile'}>
              <span className="artikel__name">{artikel.name}</span>
              <Mengenwahl name={artikel.name} menge={menge} onAendern={(s) => aendern(artikel.id, s)} />
            </li>
          )
        })}
      </ul>

      {stuecke > 0 && (
        <div className="bestell__leiste">
          <div className="bestell__leiste-innen">
            <p className="bestell__summe">
              <strong>{stuecke}</strong> Artikel
            </p>
            <button type="button" className="btn" onClick={() => setAnsicht('auswahl')}>
              Auswahl ansehen
              <Icon name="pfeil" groesse={18} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
