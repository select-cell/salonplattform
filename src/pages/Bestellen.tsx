import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Bestellung } from '../components/bestellung/Bestellung'
import { BestellLayout } from '../components/BestellLayout'
import { Ladeanzeige } from '../components/Ladeanzeige'
import { ladeKarte, type Karte } from '../lib/bestellApi'
import { istPlatzGueltig, platzAusUrl, TEXTE } from '../lib/bestellung'
import '../styles/bestellung.css'

/** Gäste-Seite „Jetzt anfordern“: /p/4 (oder /p?platz=4 als Ausweichweg) */
export default function Bestellen() {
  const { platz: ausPfad } = useParams()
  const [suche] = useSearchParams()
  const platz = platzAusUrl(ausPfad ?? suche.get('platz'))

  useEffect(() => {
    const vorher = document.title
    document.title = (platz ? `Platz ${platz} · Dawiid` : 'Dawiid') + (__TESTVERSION__ ? ' (Test)' : '')
    return () => {
      document.title = vorher
    }
  }, [platz])

  return (
    <BestellLayout>{platz === null ? <UngueltigerPlatz /> : <PlatzSeite key={platz} platz={platz} />}</BestellLayout>
  )
}

function PlatzSeite({ platz }: { platz: number }) {
  const [karte, setKarte] = useState<Karte | null>(null)

  useEffect(() => {
    let aktiv = true
    void ladeKarte(platz).then((k) => aktiv && setKarte(k))
    return () => {
      aktiv = false
    }
  }, [platz])

  if (!karte) return <Ladeanzeige kompakt text="Einen Moment …" />
  if (!istPlatzGueltig(platz, karte.platzBekannt)) return <UngueltigerPlatz />
  if (karte.artikel.length === 0) {
    return (
      <div className="leer">
        <h1 style={{ fontSize: '1.75rem' }}>Gerade leer</h1>
        <p className="muted">{TEXTE.leereKarte}</p>
      </div>
    )
  }
  return <Bestellung platz={platz} karte={karte} />
}

function UngueltigerPlatz() {
  return (
    <div className="leer" role="alert">
      <h1 style={{ fontSize: '1.75rem' }}>Platz nicht gefunden</h1>
      <p className="muted">{TEXTE.platzUngueltig}</p>
    </div>
  )
}
