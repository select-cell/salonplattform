// Unter-Navigation des Bereichs „Leitung“. Jede Erweiterung trägt hier ihre Seite ein.
export interface LeitungSeite {
  pfad: string
  label: string
  /** Nur für den Admin sichtbar */
  nurAdmin?: boolean
}

export const LEITUNG_SEITEN: readonly LeitungSeite[] = [
  { pfad: 'kommentare', label: 'Kommentare' },
]
