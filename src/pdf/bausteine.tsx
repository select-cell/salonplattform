import type { ReactNode } from 'react'
import { Image, Page, StyleSheet, Svg, Rect, Text, View } from '@react-pdf/renderer'
import { SALON_NAME, pdfFarben as f } from '../config/brand'
import { LOGO_VERHAELTNIS } from './logo'

// Hinweis: lineHeight nie an Seite oder Container setzen. Es wird vererbt und lässt die Fußzeile mit der
// Seitenzahl verschwinden. Nur an einzelnen Überschriften.
export const stile = StyleSheet.create({
  seite: { paddingTop: 70, paddingBottom: 56, paddingHorizontal: 40, fontFamily: 'DM Sans', fontSize: 9.5, color: f.text },
  kopf: { position: 'absolute', top: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 0.75, borderBottomColor: f.linie, paddingBottom: 8 },
  kopfTitel: { fontSize: 9, color: f.text2 },
  fuss: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: f.text2, borderTopWidth: 0.75, borderTopColor: f.linie, paddingTop: 6 },
  titel: { fontFamily: 'DM Serif Display', fontSize: 24, marginBottom: 4, lineHeight: 1.15 },
  untertitel: { fontSize: 10.5, color: f.text2, marginBottom: 14 },
  abschnitt: { marginTop: 14, marginBottom: 6 },
  abschnittTitel: { fontFamily: 'DM Serif Display', fontSize: 14, marginBottom: 6, lineHeight: 1.15 },
  klein: { fontSize: 8.5, color: f.text2 },
  fett: { fontWeight: 700 },
  zeile: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: f.linie, paddingVertical: 4 },
  kennzahlen: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  karte: { flexGrow: 1, flexBasis: 0, borderWidth: 0.75, borderColor: f.linie, borderRadius: 6, padding: 8 },
  karteLabel: { fontSize: 8, color: f.text2, textTransform: 'uppercase', letterSpacing: 0.6 },
  karteWert: { fontFamily: 'DM Serif Display', fontSize: 20, marginTop: 3, lineHeight: 1.1 },
  gruppe: { marginTop: 8, marginBottom: 2, fontSize: 8.5, fontWeight: 700, color: f.akzent, textTransform: 'uppercase', letterSpacing: 0.5 },
  tabelleKopf: { flexDirection: 'row', backgroundColor: f.flaeche, paddingVertical: 4, paddingHorizontal: 4, fontSize: 8, fontWeight: 700, color: f.text2 },
})

const zahlFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const z1 = (w: number | null | undefined) => (w === null || w === undefined ? '–' : zahlFormat.format(w))
export const vz = (w: number | null | undefined) =>
  w === null || w === undefined ? '–' : w > 0 ? `+${zahlFormat.format(w)}` : w < 0 ? `−${zahlFormat.format(Math.abs(w))}` : zahlFormat.format(w)
export const datum = (iso: string) => new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'Europe/Berlin' }).format(new Date(iso))
export const prozent = (w: number | null | undefined) => (w === null || w === undefined ? '–' : `${zahlFormat.format(w)} %`)

/** Eine Seite mit Kopf (Logo, Titel) und Fuß (vertraulich, Datum, Seite x von y). */
export function Seite({ kopfTitel, erstelltAm, logo, children }: { kopfTitel: string; erstelltAm: string; logo: string | null; children: ReactNode }) {
  return (
    <Page size="A4" style={stile.seite}>
      <View style={stile.kopf} fixed>
        {logo ? <Image src={logo} style={{ height: 22, width: 22 * LOGO_VERHAELTNIS }} /> : <Text style={{ fontFamily: 'DM Serif Display', fontSize: 14 }}>{SALON_NAME}</Text>}
        <Text style={stile.kopfTitel}>{kopfTitel}</Text>
      </View>
      {children}
      <View style={stile.fuss} fixed>
        <Text>Vertraulich – nur für Verantwortliche</Text>
        <Text>{datum(erstelltAm)}</Text>
        <Text render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
      </View>
    </Page>
  )
}

export function Kennzahl({ label, wert, zusatz }: { label: string; wert: string; zusatz?: string }) {
  return (
    <View style={stile.karte} wrap={false}>
      <Text style={stile.karteLabel}>{label}</Text>
      <Text style={stile.karteWert}>{wert}</Text>
      {zusatz ? <Text style={[stile.klein, { marginTop: 2 }]}>{zusatz}</Text> : null}
    </View>
  )
}

/** Zwei Balken (Selbstbild, Fremdbild) auf der Skala 0 bis 5, als Vektorgrafik. */
export function Balken({ sb, fb, breite = 110 }: { sb: number | null; fb: number | null; breite?: number }) {
  const w = (v: number | null) => (v === null ? 0 : Math.max(0, Math.min(5, v)) / 5 * breite)
  return (
    <Svg width={breite} height={14}>
      <Rect x={0} y={1} width={breite} height={5} fill={f.flaeche} />
      <Rect x={0} y={1} width={w(sb)} height={5} fill={f.selbstbild} />
      <Rect x={0} y={8} width={breite} height={5} fill={f.flaeche} />
      <Rect x={0} y={8} width={w(fb)} height={5} fill={f.fremdbild} />
    </Svg>
  )
}

/** Legende: ein Farbfeld mit Beschriftung (gezeichnet, weil DM Sans keine Sonderzeichen wie ■ enthält). */
export function Legende({ farbe, text }: { farbe: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 7, height: 7, backgroundColor: farbe, borderRadius: 1.5 }} />
      <Text style={[stile.klein, { color: farbe }]}>{text}</Text>
    </View>
  )
}
