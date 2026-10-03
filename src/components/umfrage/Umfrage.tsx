import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sendeUmfrage } from '../../lib/api'
import { monatLabel } from '../../lib/monat'
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
  const bereich = useRef<HTMLDivElement>(null)

  const index = Math.min(entwurf.schritt, schritte.length - 1)
  const schritt = schritte[index]
  const letzter = schritte.length - 1

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
      await sendeUmfrage(baueNutzdaten(inhalt, entwurf))
      loescheEntwurf(userId, monat)
      setAbgeschickt(true)
    } catch (e) {
      setSendeFehler(e instanceof Error ? e.message : 'Das Absenden hat nicht geklappt.')
    } finally {
      setSendet(false)
    }
  }

  if (abgeschickt) return <Danke vorname={inhalt.person.name.split(/\s+/)[0]} monat={monat} />

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
          <StartSchritt inhalt={inhalt} monat={monat} wiederaufgenommen={!!gespeichert && gespeichert.schritt > 0} />
        )}
        {schritt.art === 'verhalten' && (
          <VerhaltenSchritt
            key={schritt.verhalten.nr}
            verhalten={schritt.verhalten}
            nummer={schritt.index + 1}
            gesamt={inhalt.verhalten.length}
            inhalt={inhalt}
            entwurf={entwurf}
            onNote={(k, note) => {
              setFehler(null)
              setEntwurf((e) => ({ ...e, noten: { ...e.noten, [k]: note } }))
            }}
            onKommentar={(k, text) => setEntwurf((e) => ({ ...e, kommentare: { ...e.kommentare, [k]: text } }))}
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
}: {
  inhalt: UmfrageInhalt
  monat: string
  wiederaufgenommen: boolean
}) {
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
            und {kolleginnen === 1 ? 'deine Kollegin' : `deine ${kolleginnen} Kolleginnen`} (<strong>Fremdbild</strong>)
          </>
        )}
        . Nimm dir dafür etwas Ruhe, deine Antworten helfen dem ganzen Team.
      </p>

      <ul className="platzhalter__liste">
        <li>
          {inhalt.verhalten.length} Verhalten, jeweils mit Video und Note 1 bis 5. Ab Note 4 brauchen wir einen Kommentar.
        </li>
        {kolleginnen > 0 && <li>Vorab eine Frage zur Entwicklung des Monats.</li>}
        <li>Dein Zwischenstand wird auf diesem Gerät gespeichert. Du kannst jederzeit später weitermachen.</li>
      </ul>

      {wiederaufgenommen && (
        <p className="hinweis hinweis--ok">
          <Icon name="haken" groesse={18} />
          <span>Willkommen zurück. Du machst da weiter, wo du aufgehört hast.</span>
        </p>
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

function Danke({ vorname, monat }: { vorname: string; monat: string }) {
  return (
    <section className="karte erfolg" aria-live="polite">
      <div className="erfolg__icon">
        <Icon name="haken" groesse={28} />
      </div>
      <h2 className="umfrage__titel">Danke, {vorname}!</h2>
      <p className="muted">Deine Umfrage für {monatLabel(monat)} ist angekommen.</p>
      <Link to="/app" className="btn">
        Zur Übersicht
      </Link>
    </section>
  )
}
