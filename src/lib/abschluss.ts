// Monatsabschluss und Einzelanalyse (Erweiterung E): Typen der Datenbank-Antworten und kleine Hilfen.

export interface AbschlussInfo {
  monat: string
  abgeschlossen_am: string
  aktualisiert_am: string
  von: string
  abgaben: number
  erwartet: number
  unvollstaendig: boolean
  /** nur direkt nach dem Abschließen */
  bereits_abgeschlossen?: boolean
}

export interface AnalyseKurz {
  status: 'entwurf' | 'freigegeben'
  geprueft: boolean
  bearbeitet: boolean
  aktualisiert_am: string
  freigegeben_am: string | null
  /** Die Daten haben sich seit dem Erstellen geändert */
  veraltet: boolean
}

export interface AbschlussUebersicht {
  monat: string
  monate: string[]
  eigene_analyse_nur_admin: boolean
  abschluss: AbschlussInfo | null
  aktuell: { abgaben: number; erwartet: number }
  nicht_abgegeben: { id: string; name: string }[]
  personen: { id: string; name: string; analyse: AnalyseKurz | null }[]
}

export interface Analyse {
  person_id: string
  monat: string
  status: 'entwurf' | 'freigegeben'
  text: string
  geprueft: boolean
  pruef_hinweis: string | null
  bearbeitet: boolean
  prompt_version: string | null
  anbieter: string | null
  modell: string | null
  versuche: number | null
  erstellt_am: string
  aktualisiert_am: string
  bearbeitet_am: string | null
  bearbeitet_von: string | null
  freigegeben_am: string | null
  freigegeben_von: string | null
  veraltet: boolean
}

export interface AnalyseErgebnis {
  uebersprungen: boolean
  versuche: number
  analyse: Analyse
}

const zeitFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })
const datumFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' })
const uhrFormat = new Intl.DateTimeFormat('de-DE', { timeStyle: 'short', timeZone: 'Europe/Berlin' })
export const datumKurz = (iso: string) => datumFormat.format(new Date(iso))
export const uhrzeit = (iso: string) => uhrFormat.format(new Date(iso))
export const zeitpunkt = (iso: string | null | undefined) => (iso ? zeitFormat.format(new Date(iso)) : '–')

export interface StatusAnzeige {
  text: string
  /** Farbe des Badges */
  ton: 'gruen' | 'gelb' | 'rot' | 'neutral'
}

export function analyseStatus(a: Pick<AnalyseKurz, 'status'> | null): StatusAnzeige {
  if (!a) return { text: 'Noch keine Analyse', ton: 'neutral' }
  return a.status === 'freigegeben' ? { text: 'Freigegeben', ton: 'gruen' } : { text: 'Entwurf', ton: 'gelb' }
}

/** „Die Abgaben ändern sich noch“: der Abschluss hat einen anderen Stand als die aktuellen Abgaben. */
export function abschlussVeraltet(u: Pick<AbschlussUebersicht, 'abschluss' | 'aktuell'>): boolean {
  return !!u.abschluss && (u.abschluss.abgaben !== u.aktuell.abgaben || u.abschluss.erwartet !== u.aktuell.erwartet)
}
