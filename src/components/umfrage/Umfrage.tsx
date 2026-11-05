import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { holeMeineAusfuellzeit, sendeUmfrage } from '../../lib/api'
import { monatLabel } from '../../lib/monat'
import { formatDauer } from '../../lib/zeitmesser'
import { useZeiterfassung } from '../../lib/zeiterfassung'
import type { Entwurf, UmfrageInhalt } from '../../lib/umfrage'
import {
  baueNutzdaten,
  baueSchritte,
  ladeEntwurf,
  loescheEntwurf,
  neuerEntwurf,
  schrittFehler,
  speichereEntwurf,
} from '../../lib/umfrage'
import { Icon } from '../Icon'
import { EntwicklungSchritt } from './EntwicklungSchritt'
import { VerhaltenSchritt } from './VerhaltenSchritt'
import { Zusammenfassung } from './Zusammenfassung'

interface Props {
  inhalt: UmfrageInhalt
  /** 2026-10 */
  monat: string
  userId: string
}

/** Der Ablauf der Monatsumfrage: Start, Entwicklung, Verhalten, Zusammenfassung (Plan §7.3). */
export function Umfrage({ inhalt, monat, userId }: Props) {
  const schritte = useMemo(() => baueSchritte(inhalt), [inhalt])
  const [gespeichert] = useState(() => ladeEntwurf(userId, monat))
  const [entwurf, setEntwurf] = useState<Entwurf>(() => gespeichert ?? neuerEntwurf(monat))
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)
  const [sendeFehler, setSendeFehler] = useState<string | null>(null)
  const [abgeschickt, setAbgeschickt] = useState(false)
  const [aktiveSek, setAktiveSek] = useState<number | null>(null)
  const [neuBegonnen, setNeuBegonnen] = useState(false)
  const bereich = useRef<HTMLDivElement>(null)

  const index = Math.min(entwurf.schritt, schritte.length - 1)
  const schritt = schritte[index]
  const letzter = schritte.length - 1

  // Zeiterfassung: aktive Zeit je Schritt (Server-Uhr), nie Voraussetzung für die Umfrage
  const schrittSchluessel =
    schritt.art === 'verhalten' ? `v${schritt.verhalten.nr}` : schritt.art === 'entwicklung' ? 'entwicklung' : null
  const zeit = useZeiterfassung(monat, schrittSchluessel)

  // Zwischenstand sichern, damit beim versehentlichen Schließen nichts verloren geht
  useEffect(() => {
    if (!abgeschickt) speichereEntwurf(userId, entwurf)
  }, [entwurf, userId, abgeschickt])

  // Beim Schrittwechsel nach oben und den Fokus auf den neuen Inhalt setzen
  useEffect(() => {
    window.scrollTo({ top: 0 })
    bereich.current?.focus({ preventScroll: true })
  }, [index, abgeschickt])

  const geheZu = (ziel: number) => {
    setFehler(null)
    setEntwurf((e) => ({ ...e, schritt: Math.max(0, Math.min(ziel, letzter)) }))
  }

  const weiter = () => {
    const problem = schrittFehler(schritt, entwurf, inhalt)
    if (problem) {
      setFehler(problem)
      return
    }
    geheZu(index + 1)
  }

  const absenden = async () => {
    setSendet(true)
    setSendeFehler(null)
    try {
      const z = await zeit.abschluss()
      await sendeUmfrage(baueNutzdaten(inhalt, entwurf), z)
      loescheEntwurf(userId, monat)
      // Die geprüfte Zeit aus der Datenbank, sonst der eigene Zählerstand
      setAktiveSek(z.aktiveSek)
      void holeMeineAusfuellzeit(monat).then((r) => setAktiveSek(r ? r.aktive_sek : null)).catch(() => undefined)
      setAbgeschickt(true)
    } catch (e) {
      setSendeFehler(e instanceof Error ? e.message : 'Das Absenden hat nicht geklappt.')
    } finally {
      setSendet(false)
    }
  }

  if (abgeschickt) return <Danke vorname={inhalt.person.name.split(/\s+/)[0]} monat={monat} aktiveSek={aktiveSek} />

  const titelFuerScreenreader =
    schritt.art === 'verhalten'
      ? `Verhalten ${schritt.index + 1} von ${inhalt.verhalten.length}`
      : schritt.art === 'entwicklung'
        ? 'Entwicklung des Monats'
        : schritt.art === 'zusammenfassung'
          ? 'Zusammenfassung'
          : 'Start'

  return (
    <div className="umfrage">
      <div className="umfrage__fortschritt">
        <div
          className="fortschritt"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={letzter}
          aria-valuenow={index}
          aria-label="Fortschritt der Umfrage"
        >
          <div className="fortschritt__balken" style={{ width: `${(index / letzter) * 100}%` }} />
        </div>
        <p className="klein muted">
          {index === 0 ? 'Start' : index === letzter ? 'Zusammenfassung' : `Schritt ${index} von ${letzter - 1}`}
        </p>
      </div>

      <p className="nur-sr" role="status">
        {titelFuerScreenreader}
      </p>

      <div ref={bereich} tabIndex={-1} className="umfrage__inhalt">
        {schritt.art === 'start' && (
          <StartSchritt
            inhalt={inhalt}
            monat={monat}
            wiederaufgenommen={!neuBegonnen && !!gespeichert && gespeichert.schritt > 0}
            onNeuBeginnen={() => {
              loescheEntwurf(userId, monat)
              setEntwurf(neuerEntwurf(monat))
              setNeuBegonnen(true)
              void zeit.neuBeginnen()
            }}
          />
        )}
        {schritt.art === 'verhalten' && (
          <VerhaltenSchritt
            key={schritt.verhalten.nr}
            verhalten={schritt.verhalten}
            nummer={schritt.index + 1}
            gesamt={inhalt.verhalten.length}
            inhalt={inhalt}
            entwurf={entwurf}
            onLockedIn={(k, note, kommentar) => {
              setFehler(null)
              setEntwurf((e) => ({
                ...e,
                noten: { ...e.noten, [k]: note },
                kommentare: { ...e.kommentare, [k]: kommentar },
              }))
            }}
            onFertig={() => geheZu(index + 1)}
            onVideoGesehen={() => {
              setFehler(null)
              setEntwurf((e) => ({ ...e, videos: { ...e.videos, [`v${schritt.verhalten.nr}`]: true } }))
            }}
          />
        )}
        {schritt.art === 'entwicklung' && (
          <EntwicklungSchritt
            inhalt={inhalt}
            entwurf={entwurf}
            onWahl={(personId) =>
              setEntwurf((e) => ({ ...e, entwicklung: { personId, begruendung: personId ? e.entwicklung.begruendung : '' } }))
            }
            onBegruendung={(text) => setEntwurf((e) => ({ ...e, entwicklung: { ...e.entwicklung, begruendung: text } }))}
          />
        )}
        {schritt.art === 'zusammenfassung' && (
          <Zusammenfassung
            schritte={schritte}
            inhalt={inhalt}
            entwurf={entwurf}
            sendet={sendet}
            fehler={sendeFehler}
            onSpringe={geheZu}
            onAbsenden={() => void absenden()}
          />
        )}
      </div>

      {fehler && (
        <div className="hinweis hinweis--fehler umfrage__fehler" role="alert">
          <Icon name="achtung" groesse={18} />
          <span>{fehler}</span>
        </div>
      )}

      <div className="umfrage__aktionen">
        <button type="button" className="btn btn--ghost" onClick={() => geheZu(index - 1)} disabled={index === 0 || sendet}>
          Zurück
        </button>
        {index < letzter && (
          <button type="button" className="btn" onClick={weiter}>
            {index === 0 ? 'Los geht’s' : 'Weiter'} <Icon name="pfeil" groesse={18} />
          </button>
        )}
      </div>
    </div>
  )
}

function StartSchritt({
  inhalt,
  monat,
  wiederaufgenommen,
  onNeuBeginnen,
}: {
  inhalt: UmfrageInhalt
  monat: string
  wiederaufgenommen: boolean
  onNeuBeginnen: () => void
}) {
  const [rueckfrage, setRueckfrage] = useState(false)
  const kolleginnen = inhalt.kolleginnen.length
  return (
    <article className="stack" aria-labelledby="schritt-titel">
      <header className="stack-s">
        <span className="badge badge--akzent">Monatsumfrage</span>
        <h2 id="schritt-titel" className="umfrage__titel">
          Deine Umfrage für {monatLabel(monat)}
        </h2>
      </header>

      <p>
        Du bewertest dich selbst (<strong>Selbstbild</strong>)
        {kolleginnen > 0 && (
          <>
            {' '}
            und {kolleginnen === 1 ? 'deinen Kollegen' : `deine ${kolleginnen} Kollegen`} (<strong>Fremdbild</strong>)
          </>
        )}
        . Nimm dir dafür etwas Ruhe, deine Antworten helfen dem ganzen Team.
      </p>

      <ul className="platzhalter__liste">
        <li>
          {inhalt.verhalten.length} Verhalten, jeweils mit Video und einer Bewertung von 1 bis 5. Ab Bewertung 4 brauchen wir einen Kommentar.
        </li>
        {kolleginnen > 0 && <li>Vorab eine Frage zur Entwicklung des Monats.</li>}
        <li>Dein Zwischenstand wird auf diesem Gerät gespeichert. Du kannst jederzeit später weitermachen.</li>
        <li>
          Wir messen, wie lange du aktiv an der Umfrage arbeitest. Pausen zählen nicht.{' '}
          <Link to="/app/info" className="textlink">
            Mehr dazu
          </Link>
        </li>
      </ul>

      {wiederaufgenommen && (
        <div className="stack-s">
          <p className="hinweis hinweis--ok">
            <Icon name="haken" groesse={18} />
            <span>Willkommen zurück. Du machst da weiter, wo du aufgehört hast.</span>
          </p>
          {rueckfrage ? (
            <div className="hinweis hinweis--fehler" role="alertdialog" aria-label="Neu beginnen">
              <Icon name="achtung" groesse={18} />
              <span>
                Wirklich neu beginnen? Deine bisherigen Antworten gehen verloren.{' '}
                <button type="button" className="textlink" onClick={onNeuBeginnen}>
                  Ja, neu beginnen
                </button>{' '}
                ·{' '}
                <button type="button" className="textlink" onClick={() => setRueckfrage(false)}>
                  Abbrechen
                </button>
              </span>
            </div>
          ) : (
            <button type="button" className="textlink" onClick={() => setRueckfrage(true)}>
              Neu beginnen
            </button>
          )}
        </div>
      )}
      {kolleginnen === 0 && (
        <p className="hinweis">
          <Icon name="achtung" groesse={18} />
          <span>Im Moment nimmt außer dir niemand teil. Du bewertest nur dich selbst.</span>
        </p>
      )}
    </article>
  )
}

function Danke({ vorname, monat, aktiveSek }: { vorname: string; monat: string; aktiveSek: number | null }) {
  return (
    <section className="karte erfolg" aria-live="polite">
      <div className="erfolg__icon">
        <Icon name="haken" groesse={28} />
      </div>
      <h2 className="umfrage__titel">Danke, {vorname}!</h2>
      <p className="muted">Deine Umfrage für {monatLabel(monat)} ist angekommen.</p>
      {aktiveSek !== null && <p className="klein muted">Ausgefüllt in {formatDauer(aktiveSek)} aktiver Zeit.</p>}
      <Link to="/app" className="btn">
        Zur Übersicht
      </Link>
    </section>
  )
}
