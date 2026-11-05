// Fokus, Agenda und Termine (Erweiterung F): Typen der Datenbank-Antworten und kleine Hilfen.
// Absichtlich ohne weitere Importe, damit sich die Hilfen mit `node --test` prüfen lassen (agenda.test.ts).

// ---- Fokus-Verhalten ------------------------------------------------------------------------------------------

export interface FokusEintrag {
  begruendung: string | null
  gueltig_ab: string
  gueltig_bis: string | null
  /** beginnt erst in der Zukunft */
  geplant: boolean
}

export interface FokusVerhalten {
  id: string
  nr: number
  titel: string
  grundpfeiler: string | null
  saeule: string | null
  fokus: FokusEintrag | null
}

export interface FokusListe {
  heute: string
  verhalten: FokusVerhalten[]
  verlauf: { nr: number; titel: string; begruendung: string | null; gueltig_ab: string; gueltig_bis: string }[]
}

// ---- Agenda ---------------------------------------------------------------------------------------------------

export type BlockId = 'einstieg' | 'kennzahlen' | 'fokus' | 'entwicklung' | 'vereinbarungen'

export interface AgendaPunkt {
  text: string
  /** Kommentar-Beispiel: nur auf der Plattform, nie in Mail und PDF */
  beispiel?: boolean
  grund?: 'fokus' | 'differenz' | 'veraenderung'
  nr?: number
}

export interface AgendaBlock {
  id: BlockId
  titel: string
  minuten: number
  punkte: AgendaPunkt[]
}

export interface AgendaDaten {
  vorlage: string
  monat: string
  minuten_gesamt: number
  unvollstaendig: boolean
  hinweise: string[]
  bloecke: AgendaBlock[]
}

export interface AgendaZeile {
  monat: string
  status: 'entwurf' | 'freigegeben'
  agenda: AgendaDaten
  text: string
  bearbeitet: boolean
  erstellt_am: string
  aktualisiert_am: string
  bearbeitet_am: string | null
  bearbeitet_von: string | null
  freigegeben_am: string | null
  freigegeben_von: string | null
}

/** Das Zeitbudget je Block (Vorlage agenda-vorlage-v1). Die Datenbank prüft es verbindlich; hier nur für die Anzeige. */
export const BLOCK_GRENZEN: Record<BlockId, { min: number; max: number; name: string }> = {
  einstieg: { min: 2, max: 2, name: 'Einstieg und Beteiligung' },
  kennzahlen: { min: 3, max: 3, name: 'Team-Kennzahlen des Monats' },
  fokus: { min: 6, max: 8, name: 'Fokus-Verhalten' },
  entwicklung: { min: 3, max: 4, name: 'Entwicklungsfelder und Differenzen' },
  vereinbarungen: { min: 2, max: 3, name: 'Vereinbarungen' },
}
export const GESAMT_GRENZEN = { min: 15, max: 20 }

export const summeMinuten = (bloecke: { minuten: number }[]) => bloecke.reduce((s, b) => s + (Number.isFinite(b.minuten) ? b.minuten : 0), 0)

/** Prüft das Zeitbudget wie die Datenbank. Liefert Fehlermeldungen (leer = in Ordnung). */
export function pruefeZeitbudget(bloecke: { id: BlockId; minuten: number }[]): string[] {
  const fehler: string[] = []
  for (const b of bloecke) {
    const g = BLOCK_GRENZEN[b.id]
    if (!Number.isInteger(b.minuten)) fehler.push(`Die Minuten von „${g.name}“ müssen eine ganze Zahl sein.`)
    else if (b.minuten < g.min || b.minuten > g.max) {
      fehler.push(g.min === g.max ? `Der Block „${g.name}“ dauert genau ${g.min} Minuten.` : `Der Block „${g.name}“ darf ${g.min} bis ${g.max} Minuten dauern.`)
    }
  }
  const summe = summeMinuten(bloecke)
  if (fehler.length === 0 && (summe < GESAMT_GRENZEN.min || summe > GESAMT_GRENZEN.max)) {
    fehler.push(`Die Agenda soll ${GESAMT_GRENZEN.min} bis ${GESAMT_GRENZEN.max} Minuten dauern (jetzt ${summe} Minuten).`)
  }
  return fehler
}

// ---- Termine --------------------------------------------------------------------------------------------------

export type MailArt = 'vorab' | 'erinnerung'
export type MailStatus = 'geplant' | 'in_arbeit' | 'gesendet' | 'fehler' | 'fehlgeschlagen' | 'pausiert' | 'verpasst' | 'entfernt'

export interface MailZustand {
  art: MailArt
  status: MailStatus
  versuche: number
  fehler: string | null
  faellig_ab: string
  gesendet_am: string | null
}

export interface Termin {
  id: string
  startet_am: string
  /** „2026-10-26T10:00“, Ortszeit */
  startet_lokal: string
  titel: string
  bezugsmonat_fest: string | null
  bezugsmonat: string
  vorlauf_tage: number[]
  erinnerung_stunden: number[]
  admin_in_kopie: boolean
  mails_pausiert: boolean
  entfernt: boolean
  serie_id: string | null
  mails: MailZustand[]
}

export interface TerminListe {
  jetzt: string
  termine: Termin[]
  fehlgeschlagen: number
}

export type Rhythmus = 'woechentlich' | 'zweiwoechentlich' | 'monatlich'
export const RHYTHMEN: { wert: Rhythmus; label: string }[] = [
  { wert: 'woechentlich', label: 'wöchentlich' },
  { wert: 'zweiwoechentlich', label: 'alle zwei Wochen' },
  { wert: 'monatlich', label: 'monatlich' },
]

/**
 * Liest eine Liste von Zahlen aus einem Eingabefeld. Trenner sind „;“, Leerzeichen oder „Komma + Leerzeichen“;
 * ein Komma zwischen Ziffern ist das Dezimalzeichen („0,5“ ist eine halbe Stunde, nicht zwei Werte).
 * Liefert null bei einer ungültigen Eingabe (leer, keine Zahl, nicht positiv).
 */
export function leseZahlenListe(text: string): number[] | null {
  const teile = text
    .replace(/,\s+/g, ' ')
    .replace(/;/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (teile.length === 0) return null
  const werte: number[] = []
  for (const t of teile) {
    if (!/^\d+(?:[.,]\d+)?$/.test(t)) return null
    const w = Number(t.replace(',', '.'))
    if (!Number.isFinite(w) || w <= 0) return null
    werte.push(w)
  }
  return werte
}

/** [0.5, 2] → „0,5; 2“ */
export const formatZahlenListe = (werte: number[]) => werte.map((w) => String(w).replace('.', ',')).join('; ')

export const MAIL_ART_NAME: Record<MailArt, string> = { vorab: 'Agenda-Mail', erinnerung: 'Erinnerung' }

/** Text und Farbe für den Zustand einer Mail in der Terminliste. */
export function mailAnzeige(m: MailZustand): { text: string; ton: 'gruen' | 'gelb' | 'rot' | 'neutral' } {
  switch (m.status) {
    case 'gesendet':
      return { text: 'gesendet', ton: 'gruen' }
    case 'fehler':
      return { text: `Fehler, Versuch ${m.versuche} von 3`, ton: 'gelb' }
    case 'fehlgeschlagen':
      return { text: 'nach 3 Versuchen fehlgeschlagen', ton: 'rot' }
    case 'in_arbeit':
      return { text: 'wird gesendet', ton: 'neutral' }
    case 'pausiert':
      return { text: 'pausiert', ton: 'neutral' }
    case 'verpasst':
      return { text: 'nicht gesendet', ton: 'neutral' }
    case 'entfernt':
      return { text: 'entfernt', ton: 'neutral' }
    default:
      return { text: 'geplant', ton: 'neutral' }
  }
}
