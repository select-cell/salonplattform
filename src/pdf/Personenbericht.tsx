import { Document, Line, Polyline, Svg, Circle, Text, View } from '@react-pdf/renderer'
import { pdfFarben as f } from '../config/brand'
import type { Schwellen, VerhaltenZeile } from '../lib/auswertung'
import { einordnung, mittel, monatName } from '../lib/auswertung'
import { Balken, Kennzahl, Legende, Seite, stile, vz, z1 } from './bausteine'

export interface PersonenberichtDaten {
  salon: string
  monat: string
  erstellt_am: string
  person: { id: string; name: string }
  schwellen: Schwellen
  verhalten: VerhaltenZeile[]
  kommentare: { monat: string; nr: number; kommentar: string; note: number }[]
  selbst_kommentare: { monat: string; nr: number; kommentar: string; note: number }[]
  entwicklung: { begruendung: string | null }[]
  analyse: unknown
}

function Verlauf({ punkte }: { punkte: { monat: string; sb: number | null; fb: number | null }[] }) {
  const B = 480
  const H = 110
  const links = 22
  const x = (i: number) => (punkte.length === 1 ? links + (B - links) / 2 : links + (i / (punkte.length - 1)) * (B - links - 10))
  const y = (v: number) => H - 16 - (v / 5) * (H - 30)
  const reihe = (feld: 'sb' | 'fb', farbe: string) => {
    const mit = punkte.map((p, i) => ({ i, v: p[feld] })).filter((p): p is { i: number; v: number } => p.v !== null)
    return (
      <>
        {mit.length > 1 && <Polyline points={mit.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} stroke={farbe} strokeWidth={1.5} fill="none" />}
        {mit.map((p) => (
          <Circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={2.5} fill={farbe} />
        ))}
      </>
    )
  }
  return (
    <Svg width={B} height={H}>
      {[1, 2, 3, 4, 5].map((g) => (
        <Line key={g} x1={links} y1={y(g)} x2={B} y2={y(g)} stroke={f.linie} strokeWidth={0.5} />
      ))}
      {reihe('sb', f.selbstbild)}
      {reihe('fb', f.fremdbild)}
    </Svg>
  )
}

export function Personenbericht({ daten, logo }: { daten: PersonenberichtDaten; logo: string | null }) {
  const d = daten
  const monat = monatName(d.monat)
  const monate = [...new Set(d.verhalten.map((v) => v.monat))].sort()
  const proMonat = (m: string) => {
    const z = d.verhalten.filter((v) => v.monat === m)
    return { monat: m, sb: mittel(z.map((x) => x.sb)), fb: mittel(z.map((x) => x.fb)) }
  }
  const aktuell = proMonat(d.monat)
  const vorher = monate.filter((m) => m < d.monat).pop()
  const vormonat = vorher ? proMonat(vorher) : null
  const diff = aktuell.sb !== null && aktuell.fb !== null ? Math.round((aktuell.sb - aktuell.fb) * 100) / 100 : null
  const aenderung = vormonat && vormonat.fb !== null && aktuell.fb !== null ? Math.round((aktuell.fb - vormonat.fb) * 100) / 100 : null
  const zeilen = d.verhalten.filter((v) => v.monat === d.monat).sort((a, b) => a.nr - b.nr)
  const titelVon = (nr: number) => zeilen.find((z) => z.nr === nr)?.titel ?? `Verhalten ${nr}`
  const nachVerhalten = <T extends { nr: number }>(liste: T[]) => {
    const m = new Map<number, T[]>()
    for (const k of liste) m.set(k.nr, [...(m.get(k.nr) ?? []), k])
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }

  return (
    <Document title={`${d.salon} · Personenbericht ${d.person.name} ${monat}`} author={d.salon} language="de">
      <Seite kopfTitel={`Personenbericht · ${d.person.name} · ${monat}`} erstelltAm={d.erstellt_am} logo={logo}>
        <Text style={stile.titel}>{d.person.name}</Text>
        <Text style={stile.untertitel}>
          Personenbericht {monat}, {d.salon}
        </Text>

        <View style={stile.kennzahlen}>
          <Kennzahl label="Ø Selbstbild" wert={z1(aktuell.sb)} />
          <Kennzahl label="Ø Fremdbild" wert={z1(aktuell.fb)} />
          <Kennzahl label="Differenz" wert={vz(diff)} zusatz={einordnung(diff, d.schwellen).text} />
          <Kennzahl
            label="Zum Vormonat"
            wert={aenderung === null ? '–' : vz(aenderung)}
            zusatz={vorher ? `Fremdbild gegenüber ${monatName(vorher)}` : 'Kein Vormonat'}
          />
        </View>

        {monate.length > 0 && (
          <View style={stile.abschnitt} wrap={false}>
            <Text style={stile.abschnittTitel}>Verlauf</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 2 }}>
              <Legende farbe={f.selbstbild} text="Selbstbild" />
              <Legende farbe={f.fremdbild} text="Fremdbild" />
              <Text style={stile.klein}>
                {monate.map((m) => monatName(m)).join(' · ')}
              </Text>
            </View>
            <Verlauf punkte={monate.map(proMonat)} />
          </View>
        )}

        <View style={stile.abschnitt}>
          <Text style={stile.abschnittTitel}>Selbst- und Fremdbild je Verhalten</Text>
          <View style={stile.tabelleKopf}>
            <Text style={{ flexGrow: 1 }}>Verhalten</Text>
            <Text style={{ width: 34, textAlign: 'right' }}>SB</Text>
            <Text style={{ width: 34, textAlign: 'right' }}>FB</Text>
            <Text style={{ width: 120, textAlign: 'right' }}>0 bis 5</Text>
          </View>
          {zeilen.map((v) => (
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

        <View style={stile.abschnitt}>
          <Text style={stile.abschnittTitel}>Kommentare der Kollegen</Text>
          <Text style={[stile.klein, { marginBottom: 4 }]}>Ohne Absender.</Text>
          {d.kommentare.length === 0 && <Text style={stile.klein}>In diesem Monat gibt es keine Kommentare.</Text>}
          {nachVerhalten(d.kommentare).map(([nr, liste]) => (
            <View key={nr} style={{ marginBottom: 5 }} wrap={false}>
              <Text style={stile.fett}>
                {nr}  {titelVon(nr)}
              </Text>
              {liste.map((k, i) => (
                <Text key={i} style={{ marginLeft: 10, marginTop: 1 }}>
                  • (Bewertung {k.note}) {k.kommentar}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={stile.abschnitt}>
          <Text style={stile.abschnittTitel}>Eigene Kommentare</Text>
          {d.selbst_kommentare.length === 0 && <Text style={stile.klein}>Keine eigenen Kommentare in diesem Monat.</Text>}
          {nachVerhalten(d.selbst_kommentare).map(([nr, liste]) => (
            <View key={nr} style={{ marginBottom: 5 }} wrap={false}>
              <Text style={stile.fett}>
                {nr}  {titelVon(nr)}
              </Text>
              {liste.map((k, i) => (
                <Text key={i} style={{ marginLeft: 10, marginTop: 1 }}>
                  • (Bewertung {k.note}) {k.kommentar}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={stile.abschnitt} wrap={false}>
          <Text style={stile.abschnittTitel}>Entwicklung des Monats</Text>
          {d.entwicklung.length === 0 ? (
            <Text style={stile.klein}>In diesem Monat wurde niemand für diese Person genannt.</Text>
          ) : (
            <>
              <Text>
                {d.person.name} wurde {d.entwicklung.length}-mal genannt.
              </Text>
              {d.entwicklung.map((e, i) => (e.begruendung ? <Text key={i} style={{ marginLeft: 10, marginTop: 1 }}>• {e.begruendung}</Text> : null))}
            </>
          )}
        </View>

        <View style={stile.abschnitt} wrap={false}>
          <Text style={stile.abschnittTitel}>Vereinbarungen</Text>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ borderBottomWidth: 0.5, borderBottomColor: f.text2, height: 22 }} />
          ))}
          <View style={{ flexDirection: 'row', gap: 30, marginTop: 34 }}>
            {['Datum, Unterschrift Mitarbeiter', 'Datum, Unterschrift Verantwortlicher'].map((t) => (
              <View key={t} style={{ flexGrow: 1, flexBasis: 0 }}>
                <View style={{ borderBottomWidth: 0.5, borderBottomColor: f.text, height: 18 }} />
                <Text style={[stile.klein, { marginTop: 3 }]}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
      </Seite>
    </Document>
  )
}
