import { Document, Text, View } from '@react-pdf/renderer'
import { pdfFarben as f } from '../config/brand'
import type { Schwellen } from '../lib/auswertung'
import { einordnung, monatName, topFlop } from '../lib/auswertung'
import { formatDauer } from '../lib/zeitmesser'
import { Balken, Kennzahl, Legende, Seite, prozent, stile, vz, z1 } from './bausteine'

export interface MonatsberichtDaten {
  salon: string
  monat: string
  erstellt_am: string
  schwellen: Schwellen
  beteiligung: { erwartet: number; abgegeben: number }
  kennzahlen: { sb: number | null; fb: number | null; differenz: number | null }
  verhalten: { nr: number; grundpfeiler: string | null; saeule: string | null; titel: string; sb: number | null; fb: number | null }[]
  kommentare: {
    team: { quote: number | null; kommentare: number; bewertungen: number; pflicht: number; pflicht_erfuellt: number; freiwillige_quote: number | null; woerter_schnitt: number | null }
    personen: { id: string; name: string; quote: number | null; pflicht: number; pflicht_erfuellt: number; freiwillige_quote: number | null; woerter_schnitt: number | null }[]
  }
  zeit: { abgegeben: number; zaehlt: number; median_sek: number | null } | null
  agenda: unknown
}

export function Monatsbericht({ daten, logo }: { daten: MonatsberichtDaten; logo: string | null }) {
  const d = daten
  const monat = monatName(d.monat)
  const stufe = einordnung(d.kennzahlen.differenz, d.schwellen, false)
  const { top, flop } = topFlop(d.verhalten, (v) => v.fb)
  const gruppen: { name: string; zeilen: typeof d.verhalten }[] = []
  for (const v of d.verhalten) {
    const name = [v.grundpfeiler, v.saeule].filter(Boolean).join(' · ')
    const letzte = gruppen[gruppen.length - 1]
    if (letzte && letzte.name === name) letzte.zeilen.push(v)
    else gruppen.push({ name, zeilen: [v] })
  }
  const quote = d.beteiligung.erwartet > 0 ? Math.round((100 * d.beteiligung.abgegeben) / d.beteiligung.erwartet) : null

  return (
    <Document title={`${d.salon} · Monatsbericht ${monat}`} author={d.salon} language="de">
      <Seite kopfTitel={`Monatsbericht · ${monat}`} erstelltAm={d.erstellt_am} logo={logo}>
        <Text style={stile.titel}>Monatsbericht {monat}</Text>
        <Text style={stile.untertitel}>
          {d.salon}. {d.beteiligung.abgegeben} von {d.beteiligung.erwartet} Personen haben abgegeben{quote === null ? '' : ` (${quote} %)`}.
        </Text>

        <View style={stile.kennzahlen}>
          <Kennzahl label="Team Ø Selbstbild" wert={z1(d.kennzahlen.sb)} />
          <Kennzahl label="Team Ø Fremdbild" wert={z1(d.kennzahlen.fb)} />
          <Kennzahl label="Differenz" wert={vz(d.kennzahlen.differenz)} zusatz={einordnung(d.kennzahlen.differenz, d.schwellen, true).text} />
          <Kennzahl label="Ø Ausfüllzeit" wert={d.zeit?.median_sek == null ? '–' : formatDauer(d.zeit.median_sek)} zusatz="Median, aktive Zeit" />
        </View>
        <Text style={stile.klein}>
          Einordnung: {stufe.text}. Als ausgewogen gilt eine Differenz bis ±{z1(d.schwellen.ausgewogen)}.
        </Text>

        <View style={stile.abschnitt}>
          <Text style={stile.abschnittTitel}>Ergebnis je Verhalten</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 2 }}>
            <Legende farbe={f.selbstbild} text="Selbstbild" />
            <Legende farbe={f.fremdbild} text="Fremdbild" />
          </View>
          <View style={stile.tabelleKopf}>
            <Text style={{ flexGrow: 1 }}>Verhalten</Text>
            <Text style={{ width: 34, textAlign: 'right' }}>SB</Text>
            <Text style={{ width: 34, textAlign: 'right' }}>FB</Text>
            <Text style={{ width: 120, textAlign: 'right' }}>0 bis 5</Text>
          </View>
          {gruppen.map((g) => (
            <View key={g.name}>
              <Text style={stile.gruppe}>{g.name || 'Ohne Säule'}</Text>
              {g.zeilen.map((v) => (
                <View key={v.nr} style={stile.zeile} wrap={false}>
                  <Text style={{ flexGrow: 1, flexShrink: 1, paddingRight: 6 }}>
                    {v.nr}  {v.titel}
                  </Text>
                  <Text style={{ width: 34, textAlign: 'right' }}>{z1(v.sb)}</Text>
                  <Text style={{ width: 34, textAlign: 'right' }}>{z1(v.fb)}</Text>
                  <View style={{ width: 120, alignItems: 'flex-end' }}>
                    <Balken sb={v.sb} fb={v.fb} />
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={stile.abschnitt} wrap={false}>
          <Text style={stile.abschnittTitel}>Stärken und Entwicklungsfelder</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flexGrow: 1, flexBasis: 0 }}>
              <Text style={[stile.fett, { color: f.gruen, marginBottom: 3 }]}>Top 4 (Fremdbild)</Text>
              {top.map((v) => (
                <Text key={v.nr} style={{ marginBottom: 2 }}>
                  {z1(v.fb)}  {v.titel}
                </Text>
              ))}
            </View>
            <View style={{ flexGrow: 1, flexBasis: 0 }}>
              <Text style={[stile.fett, { color: f.rot, marginBottom: 3 }]}>Flop 4 (Fremdbild)</Text>
              {flop.map((v) => (
                <Text key={v.nr} style={{ marginBottom: 2 }}>
                  {z1(v.fb)}  {v.titel}
                </Text>
              ))}
            </View>
          </View>
        </View>

        <View style={stile.abschnitt} wrap={false}>
          <Text style={stile.abschnittTitel}>Kommentare</Text>
          <Text>
            Kommentar-Quote {prozent(d.kommentare.team.quote)} ({d.kommentare.team.kommentare} von {d.kommentare.team.bewertungen} Bewertungen).
            Pflicht erfüllt: {d.kommentare.team.pflicht_erfuellt} von {d.kommentare.team.pflicht}. Freiwillig geschrieben:{' '}
            {prozent(d.kommentare.team.freiwillige_quote)}. Ø {d.kommentare.team.woerter_schnitt === null ? '–' : z1(d.kommentare.team.woerter_schnitt)} Wörter.
          </Text>
        </View>

        {d.kommentare.personen.length > 0 && (
          <View style={stile.abschnitt}>
            <Text style={stile.abschnittTitel}>Kommentare je Person</Text>
            <Text style={[stile.klein, { marginBottom: 4 }]}>Kennzahlen, keine Texte.</Text>
            <View style={stile.tabelleKopf}>
              <Text style={{ flexGrow: 1 }}>Person</Text>
              <Text style={{ width: 52, textAlign: 'right' }}>Quote</Text>
              <Text style={{ width: 70, textAlign: 'right' }}>Pflicht erfüllt</Text>
              <Text style={{ width: 62, textAlign: 'right' }}>Freiwillig</Text>
              <Text style={{ width: 52, textAlign: 'right' }}>Ø Wörter</Text>
            </View>
            {d.kommentare.personen.map((p) => (
              <View key={p.id} style={stile.zeile} wrap={false}>
                <Text style={{ flexGrow: 1 }}>{p.name}</Text>
                <Text style={{ width: 52, textAlign: 'right' }}>{prozent(p.quote)}</Text>
                <Text style={{ width: 70, textAlign: 'right' }}>
                  {p.pflicht_erfuellt} von {p.pflicht}
                </Text>
                <Text style={{ width: 62, textAlign: 'right' }}>{prozent(p.freiwillige_quote)}</Text>
                <Text style={{ width: 52, textAlign: 'right' }}>{p.woerter_schnitt === null ? '–' : z1(p.woerter_schnitt)}</Text>
              </View>
            ))}
          </View>
        )}
      </Seite>
    </Document>
  )
}
