import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/kontext'
import { Icon } from '../../components/Icon'
import { Ladeanzeige } from '../../components/Ladeanzeige'
import { Umfrage } from '../../components/umfrage/Umfrage'
import { holeUmfrageInhalt } from '../../lib/api'
import { fristText, istMonat, monatLabel, tagLabel, zeitpunktLabel } from '../../lib/monat'
import type { UmfrageInhalt } from '../../lib/umfrage'
import { useMeineMonate } from '../../lib/useMeineMonate'
import NotFound from '../NotFound'

interface InhaltZustand {
  laedt: boolean
  daten: UmfrageInhalt | null
  fehler: string | null
}

/** /app/umfrage → der Monat, der zuerst dran ist. /app/umfrage/:monat mit monat = YYYY-MM. */
export default function UmfrageSeite() {
  const { monat } = useParams()
  const { sitzung } = useAuth()
  const monate = useMeineMonate()
  const [inhalt, setInhalt] = useState<InhaltZustand>({ laedt: true, daten: null, fehler: null })
  const [versuch, setVersuch] = useState(0)

  useEffect(() => {
    let aktiv = true
    holeUmfrageInhalt().then(
      (daten) => aktiv && setInhalt({ laedt: false, daten, fehler: null }),
      (e: unknown) =>
        aktiv && setInhalt({ laedt: false, daten: null, fehler: e instanceof Error ? e.message : 'Unbekannter Fehler' }),
    )
    return () => {
      aktiv = false
    }
  }, [versuch])

  if (monat !== undefined && !istMonat(monat)) return <NotFound zu="/app" />
  if (monate.laedt || inhalt.laedt) return <Ladeanzeige kompakt text="Deine Umfrage wird geladen …" />

  const fehler = monate.fehler ?? inhalt.fehler
  if (fehler || !inhalt.daten) {
    return (
      <Hinweiskarte titel="Das hat nicht geklappt" icon="achtung">
        <p className="muted">{fehler ?? 'Die Umfrage konnte nicht geladen werden.'}</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            monate.neuLaden()
            setInhalt({ laedt: true, daten: null, fehler: null })
            setVersuch((v) => v + 1)
          }}
        >
          Erneut versuchen
        </button>
      </Hinweiskarte>
    )
  }

  // Ohne Monat in der URL: der älteste offene Monat, sonst der neueste
  if (monat === undefined) {
    const offene = monate.monate.filter((m) => !m.abgegeben)
    const ziel = offene.length > 0 ? offene[offene.length - 1] : monate.monate[0]
    if (ziel) return <Navigate to={`/app/umfrage/${ziel.monat_key}`} replace />
    return (
      <Hinweiskarte titel="Noch keine Umfrage" icon="kalender">
        <p className="muted">Für dich gibt es im Moment keine Umfrage. Sobald eine ansteht, siehst du sie hier.</p>
      </Hinweiskarte>
    )
  }

  const status = monate.monate.find((m) => m.monat_key === monat)

  if (!status) {
    const erster = monate.monate[monate.monate.length - 1]
    return (
      <Hinweiskarte titel={`Keine Umfrage für ${monatLabel(monat)}`} icon="kalender">
        <p className="muted">
          {erster
            ? `Deine Umfragen laufen ab ${monatLabel(erster.monat_key)}. Für diesen Monat gibt es keine.`
            : 'Für diesen Monat gibt es keine Umfrage für dich.'}
        </p>
        <Link to="/app" className="btn">
          Zur Übersicht
        </Link>
      </Hinweiskarte>
    )
  }

  if (status.abgegeben) {
    return (
      <section className="karte erfolg">
        <div className="erfolg__icon">
          <Icon name="haken" groesse={28} />
        </div>
        <h1 style={{ fontSize: '1.75rem' }}>Schon erledigt</h1>
        <p className="muted">
          Du hast die Umfrage für {monatLabel(monat)}
          {status.abgegeben_am ? ` am ${zeitpunktLabel(status.abgegeben_am)}` : ''} abgegeben. Danke!
        </p>
        <Link to="/app" className="btn">
          Zur Übersicht
        </Link>
      </section>
    )
  }

  if (inhalt.daten.verhalten.length === 0) {
    return (
      <Hinweiskarte titel="Die Umfrage ist noch nicht eingerichtet" icon="achtung">
        <p className="muted">Es sind noch keine Verhalten hinterlegt. Bitte melde dich beim Verantwortlichen oder beim Admin.</p>
      </Hinweiskarte>
    )
  }

  const ueberfaellig = status.tage_bis_frist < 0

  return (
    <div className="umfrage-seite stack">
      <div>
        <Link to="/app" className="textlink">
          ← Zur Übersicht
        </Link>
        <div className="umfrage-seite__kopf">
          <h1>Umfrage {monatLabel(monat)}</h1>
          <div className="umfrage-karte__meta">
            <span className="badge badge--akzent">
              <Icon name="kalender" groesse={14} /> Frist: {tagLabel(status.frist)}
            </span>
            <span className={ueberfaellig ? 'badge badge--rot' : 'badge'}>{fristText(status.tage_bis_frist)}</span>
          </div>
          {ueberfaellig && <p className="klein muted">Du kannst die Umfrage auch nach der Frist noch abgeben.</p>}
        </div>
      </div>

      <Umfrage key={monat} inhalt={inhalt.daten} monat={monat} userId={sitzung?.user.id ?? ''} />
    </div>
  )
}

function Hinweiskarte({
  titel,
  icon,
  children,
}: {
  titel: string
  icon: 'achtung' | 'kalender'
  children: React.ReactNode
}) {
  return (
    <section className="karte stack" style={{ maxWidth: 560 }}>
      <div className="merkmal__icon">
        <Icon name={icon} />
      </div>
      <h1 style={{ fontSize: '1.75rem' }}>{titel}</h1>
      {children}
    </section>
  )
}
