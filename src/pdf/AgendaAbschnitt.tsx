import { Text, View } from '@react-pdf/renderer'
import { pdfFarben as f } from '../config/brand'
import { datum, stile } from './bausteine'

export interface FreigegebeneAgenda {
  /** ohne Kommentar-Beispiele: die gibt es nie im PDF */
  bloecke: { titel: string; minuten: number; punkte: { text: string }[] }[]
  unvollstaendig: boolean
  hinweise: string[]
  freigegeben_am: string | null
  freigegeben_von: string | null
}

/** Die freigegebene Agenda fürs Teammeeting, am Ende des Monatsberichts. Nur Teamebene, keine Namen, keine Kommentare. */
export function AgendaAbschnitt({ agenda }: { agenda: FreigegebeneAgenda }) {
  const summe = agenda.bloecke.reduce((s, b) => s + b.minuten, 0)
  return (
    <View style={stile.abschnitt} break>
      <Text style={stile.abschnittTitel}>Agenda fürs Teammeeting</Text>
      <Text style={[stile.klein, { marginBottom: 6 }]}>
        {summe} Minuten
        {agenda.freigegeben_von ? `. Freigegeben von ${agenda.freigegeben_von}` : ''}
        {agenda.freigegeben_am ? ` am ${datum(agenda.freigegeben_am)}` : ''}.
      </Text>
      {agenda.unvollstaendig && (
        <View style={{ backgroundColor: f.flaeche, padding: 6, marginBottom: 8, borderRadius: 4 }} wrap={false}>
          <Text>
            <Text style={stile.fett}>Stand unvollständig: </Text>
            {agenda.hinweise.join(' ')}
          </Text>
        </View>
      )}
      {agenda.bloecke.map((b) => (
        <View key={b.titel} style={{ marginBottom: 7 }} wrap={false}>
          <Text style={stile.fett}>
            {b.titel} ({b.minuten} Min.)
          </Text>
          {b.punkte.map((p, i) => (
            <Text key={i} style={{ marginLeft: 10, marginTop: 1 }}>
              • {p.text}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}
