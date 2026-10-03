import { useState } from 'react'
import { PersonenAnsicht } from '../../components/auswertung/PersonenAnsicht'
import { DatenZustand } from '../../components/auswertung/Bausteine'
import { holeMeineErgebnisse } from '../../lib/api'
import { useDaten } from '../../lib/useDaten'

/** /app/ergebnisse: eigene Auswertung (Plan §3). Kommentare ohne Absender. */
export default function ErgebnissePage() {
  const { laedt, daten, fehler, neuLaden } = useDaten(holeMeineErgebnisse, [])
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const monat = daten && gewaehlt && daten.monate.includes(gewaehlt) ? gewaehlt : (daten?.monate[0] ?? '')

  return (
    <div className="stack stack-l">
      <header className="seitenkopf">
        <p className="overline">Meine Ergebnisse</p>
        <h1 style={{ marginTop: 8 }}>So siehst du dich, so sehen dich andere</h1>
        <p>Deine Selbsteinschätzung im Vergleich zu dem, was die Kolleginnen von dir wahrnehmen.</p>
      </header>
      <DatenZustand laedt={laedt} fehler={fehler} onNeu={neuLaden}>
        {daten && <PersonenAnsicht daten={daten} monat={monat} onMonat={setGewaehlt} mitAbsender={false} />}
      </DatenZustand>
    </div>
  )
}
