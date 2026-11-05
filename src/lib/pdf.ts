// PDF-Export (Erweiterung C): Daten holen, Dokument im Browser erzeugen, herunterladen.
// Die PDF-Bibliothek ist groß und wird erst beim Klick geladen (dynamischer Import).
import { SALON_SLUG } from '../config/brand'
import { holePdfMonatsbericht, holePdfPersonenbericht } from './api'

const UMLAUTE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' }

/** „Anna Müller-Schmidt“ → „anna-mueller-schmidt“ */
export function dateiteil(text: string): string {
  return (
    text
      .replace(/[äöüßÄÖÜ]/g, (z) => UMLAUTE[z] ?? z)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'person'
  )
}

/** `<salon>_<YYYY-MM>_<monatsbericht | personenbericht-name>.pdf` */
export function dateiname(art: 'monatsbericht' | 'personenbericht', monat: string, personName?: string): string {
  const ende = art === 'monatsbericht' ? 'monatsbericht' : `personenbericht-${dateiteil(personName ?? '')}`
  return `${SALON_SLUG}_${monat}_${ende}.pdf`
}

function speichere(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function ladeMonatsberichtHerunter(monat: string): Promise<void> {
  // Erst die Daten (prüft Rechte und schreibt das Protokoll), dann die schwere Bibliothek
  const daten = await holePdfMonatsbericht(monat)
  const { erzeugeMonatsbericht } = await import('../pdf/erzeuge')
  speichere(await erzeugeMonatsbericht(daten), dateiname('monatsbericht', monat))
}

export async function ladePersonenberichtHerunter(personId: string, monat: string): Promise<void> {
  const daten = await holePdfPersonenbericht(personId, monat)
  const { erzeugePersonenbericht } = await import('../pdf/erzeuge')
  speichere(await erzeugePersonenbericht(daten), dateiname('personenbericht', monat, daten.person.name))
}
