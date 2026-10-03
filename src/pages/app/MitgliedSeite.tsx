import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DatenZustand } from '../../components/auswertung/Bausteine'
import { PersonenAnsicht } from '../../components/auswertung/PersonenAnsicht'
import { holePersonErgebnisse } from '../../lib/api'
import { useDaten } from '../../lib/useDaten'

/** /app/mitglieder/:id: Auswertung einer Person mit Verlauf und Einzelbewertungen inklusive Absender. */
export default function MitgliedSeite() {
  const { id = '' } = useParams()
  const { laedt, daten, fehler, neuLaden } = useDaten(() => holePersonErgebnisse(id), [id])
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const monat = daten && gewaehlt && daten.monate.includes(gewaehlt) ? gewaehlt : (daten?.monate[0] ?? '')

  return (
    <div className="stack stack-l">
      <header className="seitenkopf">
        <Link to="/app/mitglieder" className="textlink">
          ← Alle Mitarbeiterinnen
        </Link>
        <h1 style={{ marginTop: 12 }}>{daten?.person.name ?? 'Individuelle Auswertung'}</h1>
        <p>Verlauf über alle Monate und jede Einzelbewertung mit Absender.</p>
      </header>
      <DatenZustand laedt={laedt} fehler={fehler} onNeu={neuLaden}>
        {daten && <PersonenAnsicht daten={daten} monat={monat} onMonat={setGewaehlt} mitAbsender />}
      </DatenZustand>
    </div>
  )
}
