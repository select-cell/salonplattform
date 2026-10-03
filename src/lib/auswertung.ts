// Auswertungen: Typen der Datenbank-Antworten und reine Hilfsfunktionen zum Aufbereiten.
// Die Kennzahlen selbst (Selbstbild, Fremdbild, Differenz) werden in der Datenbank berechnet
// (Plan §5.5). Hier wird nur gruppiert, sortiert und eingeordnet.

export interface Schwellen {
  ausgewogen: number
  niedrig: number
  hoch: number
}

export interface VerhaltenZeile {
  monat: string
  nr: number
  grundpfeiler: string | null
  saeule: string | null
  titel: string
  sb: number | null
  fb: number | null
  anzahl_fb?: number
}

export interface PersonAuswertung {
  person: { id: string; name: string }
  schwellen: Schwellen
  /** Monate mit Daten, neuester zuerst */
  monate: string[]
  verhalten: VerhaltenZeile[]
  kommentare: { monat: string; nr: number; kommentar: string; note: number }[]
  rituale: { monat: string; ritual: string; frage_nr: number; frage: string; antwort: number }[]
  dauer: { monat: string; minuten: number | null }[]
  entwicklung: { monat: string; von?: string; begruendung?: string | null }[]
  /** Nur für Verantwortliche und Admins; sonst null */
  einzelwerte: { monat: string; nr: number; von: string; note: number; kommentar: string | null }[] | null
}

export interface TeamAuswertung {
  schwellen: Schwellen
  monate: string[]
  verhalten: VerhaltenZeile[]
  rituale_skalen: { monat: string; ritual: string; frage_nr: number; frage: string; schnitt: number; anzahl: number }[]
  rituale_phasen: { monat: string; ritual: string; phase: string; nennungen: number }[]
  entwicklung: { monat: string; person: string; nennungen: number }[]
  dauer: { monat: string; minuten: number | null; abgaben: number }[]
}

export interface DashboardPerson {
  id: string
  name: string
  sb: number | null
  fb: number | null
  differenz: number | null
  minuten: number | null
  rang: number | null
}

export interface Dashboard {
  schwellen: Schwellen
  monate: string[]
  monat: string
  personen: DashboardPerson[]
  verhalten: Omit<VerhaltenZeile, 'monat'>[]
  matrix: { nr: number; person_id: string; sb: number | null; fb: number | null }[]
  rituale_skalen: { ritual: string; frage_nr: number; frage: string; schnitt: number; anzahl: number }[]
  rituale_phasen: { ritual: string; phase: string; nennungen: number }[]
  entwicklung: { person: string; nennungen: number; nennungen_von: { von: string; begruendung: string | null }[] }[]
}

export interface AbgabeStatus {
  person_id: string
  name: string
  abgegeben: boolean
  abgegeben_am: string | null
  frist: string
}

export interface Ueberfaellig {
  person_id: string
  name: string
  monat_key: string
  frist: string
  tage_ueberfaellig: number
}

// ---- Farben (Plan §5.6) -----------------------------------------------------------

export const FARBE_SB = '#C4845A'
export const FARBE_FB = '#4A7FA5'

// ---- Rechnen und Einordnen --------------------------------------------------------

export function mittel(werte: (number | null | undefined)[]): number | null {
  const echte = werte.filter((w): w is number => typeof w === 'number')
  return echte.length ? echte.reduce((a, b) => a + b, 0) / echte.length : null
}

const zahlFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const zahlFormat2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function zahl(wert: number | null | undefined, stellen: 1 | 2 = 1): string {
  if (wert === null || wert === undefined || Number.isNaN(wert)) return '–'
  return (stellen === 1 ? zahlFormat : zahlFormat2).format(wert)
}

export function vorzeichen(wert: number | null | undefined): string {
  if (wert === null || wert === undefined || Number.isNaN(wert)) return '–'
  const text = zahlFormat.format(Math.abs(wert))
  return wert > 0 ? `+${text}` : wert < 0 ? `−${text}` : text
}

export interface Einordnung {
  text: string
  /** gruen = ausgewogen, rot = deutliche Abweichung, neutral = keine Daten */
  farbe: 'gruen' | 'rot' | 'neutral'
}

/** Differenz-Einordnung aus dem alten Board (Plan §5.5). team = kürzere Wörter für die Team-Sicht. */
export function einordnung(differenz: number | null | undefined, schwellen: Schwellen, team = false): Einordnung {
  if (differenz === null || differenz === undefined) return { text: 'Keine Daten', farbe: 'neutral' }
  if (Math.abs(differenz) <= schwellen.ausgewogen) return { text: 'Ausgewogen', farbe: 'gruen' }
  if (differenz > 0) return { text: team ? 'SB > FB' : 'Selbstüberschätzung', farbe: 'rot' }
  return { text: team ? 'FB > SB' : 'Selbstunterschätzung', farbe: 'rot' }
}

/** Score-Niveau für Farben in Tabellen und Heatmap */
export function niveau(score: number | null | undefined, schwellen: Schwellen): 'hoch' | 'mittel' | 'niedrig' | null {
  if (score === null || score === undefined) return null
  if (score >= schwellen.hoch) return 'hoch'
  if (score < schwellen.niedrig) return 'niedrig'
  return 'mittel'
}

// ---- Gruppieren, sortieren ------------------------------------------------------------

export interface Saeule {
  schluessel: string
  grundpfeiler: string
  saeule: string
  /** kurzer Name für Diagramme: „GP 1 · S 2“ */
  kurz: string
  sb: number | null
  fb: number | null
}

const nummer = (text: string | null | undefined, praefix: string) => new RegExp(`${praefix}\\s*(\\d+)`, 'i').exec(text ?? '')?.[1]

export function saeulenSchnitte(zeilen: Pick<VerhaltenZeile, 'grundpfeiler' | 'saeule' | 'sb' | 'fb'>[]): Saeule[] {
  const gruppen = new Map<string, typeof zeilen>()
  for (const z of zeilen) {
    const schluessel = `${z.grundpfeiler ?? ''}|${z.saeule ?? ''}`
    gruppen.set(schluessel, [...(gruppen.get(schluessel) ?? []), z])
  }
  return [...gruppen.entries()]
    .map(([schluessel, g]) => {
      const gp = g[0].grundpfeiler ?? ''
      const s = g[0].saeule ?? ''
      return {
        schluessel,
        grundpfeiler: gp,
        saeule: s,
        kurz: `GP ${nummer(gp, 'Grundpfeiler') ?? '?'} · S ${nummer(s, 'Säule') ?? '?'}`,
        sb: mittel(g.map((x) => x.sb)),
        fb: mittel(g.map((x) => x.fb)),
      }
    })
    .sort((a, b) => a.schluessel.localeCompare(b.schluessel, 'de', { numeric: true }))
}

export type Sortierung = 'standard' | 'hoechste' | 'niedrigste'

/** „Standard“ = nach Nummer (damit nach Säulen gruppiert), sonst ohne Gruppierung nach dem Wert. */
export function sortiere<T extends { nr: number }>(zeilen: T[], wert: (z: T) => number | null, modus: Sortierung): T[] {
  const kopie = [...zeilen]
  if (modus === 'standard') return kopie.sort((a, b) => a.nr - b.nr)
  const richtung = modus === 'hoechste' ? -1 : 1
  return kopie.sort((a, b) => {
    const x = wert(a)
    const y = wert(b)
    if (x === null && y === null) return a.nr - b.nr
    if (x === null) return 1
    if (y === null) return -1
    return (x - y) * richtung || a.nr - b.nr
  })
}

/** Höchste und niedrigste n Verhalten nach dem Wert (Standard: Fremdbild). */
export function topFlop<T extends { nr: number }>(zeilen: T[], wert: (z: T) => number | null, n = 4) {
  const mitWert = zeilen.filter((z) => wert(z) !== null)
  const absteigend = sortiere(mitWert, wert, 'hoechste')
  const aufsteigend = sortiere(mitWert, wert, 'niedrigste')
  return { top: absteigend.slice(0, n), flop: aufsteigend.slice(0, n) }
}

/** „2026-10“ → „Oktober 2026“ */
export function monatName(schluessel: string): string {
  const [jahr, monat] = schluessel.split('-').map(Number)
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(jahr, monat - 1, 1)),
  )
}

/** „2026-10“ → „Okt 26“ für Achsen */
export function monatKurz(schluessel: string): string {
  const [jahr, monat] = schluessel.split('-').map(Number)
  return new Intl.DateTimeFormat('de-DE', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(jahr, monat - 1, 1)),
  )
}
