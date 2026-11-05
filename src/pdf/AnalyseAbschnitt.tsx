import { Text, View } from '@react-pdf/renderer'
import { inlineTeile, parseMarkdown } from '../lib/markdown'
import { datum, stile } from './bausteine'

export interface FreigegebeneAnalyse {
  text: string
  freigegeben_am: string | null
  freigegeben_von: string | null
}

function Zeile({ text }: { text: string }) {
  return (
    <>
      {inlineTeile(text).map((t, i) => (t.fett ? <Text key={i} style={stile.fett}>{t.text}</Text> : t.text))}
    </>
  )
}

/** Die freigegebene KI-Analyse (nur diese kommt ins PDF, nie ein Entwurf). */
export function AnalyseAbschnitt({ analyse }: { analyse: FreigegebeneAnalyse }) {
  return (
    <View style={stile.abschnitt}>
      <Text style={stile.abschnittTitel}>Analyse</Text>
      <Text style={[stile.klein, { marginBottom: 6 }]}>
        Gesprächsgrundlage, mit Hilfe einer KI aus den Zahlen formuliert und von der Leitung geprüft
        {analyse.freigegeben_von ? `. Freigegeben von ${analyse.freigegeben_von}` : ''}
        {analyse.freigegeben_am ? ` am ${datum(analyse.freigegeben_am)}` : ''}.
      </Text>
      {parseMarkdown(analyse.text).map((b, i) =>
        b.art === 'ueberschrift' ? (
          <Text key={i} style={[stile.fett, { marginTop: 7, marginBottom: 2 }]}>
            <Zeile text={b.text} />
          </Text>
        ) : b.art === 'liste' ? (
          <View key={i} style={{ marginBottom: 2 }}>
            {b.punkte.map((p, j) => (
              <Text key={j} style={{ marginLeft: 10, marginTop: 1 }}>
                • <Zeile text={p} />
              </Text>
            ))}
          </View>
        ) : (
          <Text key={i} style={{ marginBottom: 3 }}>
            <Zeile text={b.text} />
          </Text>
        ),
      )}
    </View>
  )
}
