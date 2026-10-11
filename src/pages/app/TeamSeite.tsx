import { useState } from 'react'
import { usePerson } from '../../auth/kontext'
import { DatenZustand } from '../../components/auswertung/Bausteine'
import { LeitungsTeam } from '../../components/auswertung/LeitungsTeam'
import { TeamAnsicht } from '../../components/auswertung/TeamAnsicht'
import { holeTeamDashboard, holeTeamErgebnisse } from '../../lib/api'
import { useDaten } from '../../lib/useDaten'
import { istLeitung } from '../../lib/types'

/** /app/team: Mitarbeiterinnen sehen Team-Schnitte, Verantwortliche und Admins das volle Dashboard. */
export default function TeamSeite() {
  const person = usePerson()
  const leitung = istLeitung(person)

  return (
    <div className="stack stack-l">
      <header className="seitenkopf">
        <p className="overline">{leitung ? 'Team-Dashboard' : 'Team-Ergebnisse'}</p>
        <h1 style={{ marginTop: 8 }}>{leitung ? 'Wie steht das Team da?' : 'Wo steht unser Team?'}</h1>
        <p>
          {leitung
            ? 'Rangliste, Heatmap und der Vergleich von Selbst- und Fremdbild. Mit dem Umschalter wechselst du zu einzelnen Personen.'
            : 'Durchschnittswerte des Teams, dazu Rangliste und Heatmap.'}
        </p>
      </header>
      {leitung ? <LeitungsTeam /> : <TeamFuerMitarbeiterin />}
    </div>
  )
}

function TeamFuerMitarbeiterin() {
  const { laedt, daten, fehler, neuLaden } = useDaten(holeTeamErgebnisse, [])
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const monat = daten && gewaehlt && daten.monate.includes(gewaehlt) ? gewaehlt : (daten?.monate[0] ?? '')
  // Rangliste und Heatmap kommen aus dem Dashboard-Aufruf (für Mitarbeiterinnen ohne Dauer und Absender)
  const uebersicht = useDaten(() => (monat ? holeTeamDashboard(monat) : Promise.resolve(null)), [monat])
  return (
    <DatenZustand laedt={laedt} fehler={fehler} onNeu={neuLaden}>
      {daten && <TeamAnsicht daten={daten} monat={monat} onMonat={setGewaehlt} uebersicht={uebersicht.daten} />}
    </DatenZustand>
  )
}
