// Monats- und Fristlogik. Alles rechnet in Europe/Berlin (Plan §6):
// Die Umfrage für Monat M ist bis zum letzten Tag von M auszufüllen.

const ZEITZONE = 'Europe/Berlin'

export interface Kalendertag {
  jahr: number
  monat: number
  tag: number
  stunde: number
}

export function jetztBerlin(jetzt: Date = new Date()): Kalendertag {
  const teile = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZEITZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(jetzt)
  const hole = (typ: Intl.DateTimeFormatPartTypes) => Number(teile.find((t) => t.type === typ)?.value)
  return { jahr: hole('year'), monat: hole('month'), tag: hole('day'), stunde: hole('hour') }
}

/** Monatsschlüssel im Format YYYY-MM */
export function monatSchluessel(jahr: number, monat: number): string {
  return `${jahr}-${String(monat).padStart(2, '0')}`
}

export function aktuellerMonat(jetzt: Date = new Date()): string {
  const { jahr, monat } = jetztBerlin(jetzt)
  return monatSchluessel(jahr, monat)
}

export function istMonat(wert: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(wert)
}

function teile(monat: string): { jahr: number; monat: number } {
  const [jahr, m] = monat.split('-').map(Number)
  return { jahr, monat: m }
}

/** „Oktober 2026“ */
export function monatLabel(monat: string): string {
  const { jahr, monat: m } = teile(monat)
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(jahr, m - 1, 1)),
  )
}

export interface Frist {
  /** Letzter Tag des Monats, z. B. „31. Oktober 2026“ */
  label: string
  /** Kalendertage bis zum Fristende (heute = 0, negativ = überschritten) */
  tageBis: number
}

export function fristFuer(monat: string, jetzt: Date = new Date()): Frist {
  const { jahr, monat: m } = teile(monat)
  const letzterTag = new Date(Date.UTC(jahr, m, 0))
  const heute = jetztBerlin(jetzt)
  const heuteUtc = Date.UTC(heute.jahr, heute.monat - 1, heute.tag)
  return {
    label: new Intl.DateTimeFormat('de-DE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(letzterTag),
    tageBis: Math.round((letzterTag.getTime() - heuteUtc) / 86_400_000),
  }
}

/** Kurztext zur Frist: „noch 28 Tage“, „heute letzter Tag“, „3 Tage überfällig“ */
export function fristText(tageBis: number): string {
  if (tageBis > 1) return `noch ${tageBis} Tage`
  if (tageBis === 1) return 'noch 1 Tag'
  if (tageBis === 0) return 'heute letzter Tag'
  if (tageBis === -1) return '1 Tag überfällig'
  return `${-tageBis} Tage überfällig`
}

export function tageszeitGruss(jetzt: Date = new Date()): string {
  const { stunde } = jetztBerlin(jetzt)
  if (stunde < 5) return 'Hallo'
  if (stunde < 11) return 'Guten Morgen'
  if (stunde < 18) return 'Guten Tag'
  return 'Guten Abend'
}
