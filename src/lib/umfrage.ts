// Monatsumfrage: Typen, Ablauf, Prüfungen und Payload.
// Die Oberfläche (components/umfrage) zeigt nur an; was erlaubt ist und was an die
// Datenbank geht, steht hier. Der Server prüft alles noch einmal (umfrage_einreichen_v2).

// ---- Antworten der Datenbank-Funktionen ------------------------------------

export interface MonatStatus {
  /** 2026-10-01 */
  monat: string
  /** 2026-10 */
  monat_key: string
  /** letzter Tag des Monats */
  frist: string
  /** Kalendertage bis zur Frist, negativ = überschritten */
  tage_bis_frist: number
  abgegeben: boolean
  abgegeben_am: string | null
}

export interface Kriterium {
  stufe: number
  bezeichnung: string | null
  prozent: string | null
  leitsatz: string | null
  punkte: string[]
}

export interface Verhalten {
  nr: number
  grundpfeiler: string | null
  saeule: string | null
  titel: string
  video_url: string | null
  kriterien: Kriterium[]
}

export type FrageTyp = 'skala' | 'auswahl' | 'text'

export interface RitualFrage {
  nr: number
  typ: FrageTyp
  frage: string
  optionen: string[] | null
  labels: string[] | null
  pflicht: boolean
}

export interface Ritual {
  nr: number
  titel: string
  video_url: string | null
  fragen: RitualFrage[]
}

export interface Kollegin {
  id: string
  name: string
}

export interface UmfrageInhalt {
  salon: { id: string; name: string }
  person: { id: string; name: string }
  verhalten: Verhalten[]
  rituale: Ritual[]
  kolleginnen: Kollegin[]
}

// ---- Entwurf (Zwischenstand im Browser) ---------------------------------------

export interface Entwurf {
  version: 1
  monat: string
  /** Beim ersten Öffnen festgehalten; daraus rechnet die Datenbank die Ausfülldauer */
  gestartetAm: string
  schritt: number
  /** `${verhaltenNr}:${personId}` → Note 1–5 */
  noten: Record<string, number>
  kommentare: Record<string, string>
  /** `v${nr}` bzw. `r${nr}` → Video bis zum Ende gesehen */
  videos: Record<string, true>
  /** `${ritualNr}:${frageNr}` → Antwort als Text (Skala: '3') */
  ritual: Record<string, string>
  entwicklung: { personId: string | null; begruendung: string }
}

export function neuerEntwurf(monat: string, jetzt: Date = new Date()): Entwurf {
  return {
    version: 1,
    monat,
    gestartetAm: jetzt.toISOString(),
    schritt: 0,
    noten: {},
    kommentare: {},
    videos: {},
    ritual: {},
    entwicklung: { personId: null, begruendung: '' },
  }
}

const schluesselEntwurf = (userId: string, monat: string) => `umfrage-entwurf:${userId}:${monat}`

export function ladeEntwurf(userId: string, monat: string): Entwurf | null {
  try {
    const roh = window.localStorage.getItem(schluesselEntwurf(userId, monat))
    if (!roh) return null
    const e = JSON.parse(roh) as Partial<Entwurf>
    if (e.version !== 1 || e.monat !== monat || typeof e.gestartetAm !== 'string') return null
    return { ...neuerEntwurf(monat), ...e } as Entwurf
  } catch {
    return null
  }
}

export function speichereEntwurf(userId: string, entwurf: Entwurf): void {
  try {
    window.localStorage.setItem(schluesselEntwurf(userId, entwurf.monat), JSON.stringify(entwurf))
  } catch {
    // Kein Speicher (privater Modus o. Ä.): die Umfrage funktioniert trotzdem
  }
}

export function loescheEntwurf(userId: string, monat: string): void {
  try {
    window.localStorage.removeItem(schluesselEntwurf(userId, monat))
  } catch {
    // ignorieren
  }
}

// ---- Ablauf ----------------------------------------------------------------------

export type Schritt =
  | { art: 'start' }
  | { art: 'verhalten'; verhalten: Verhalten; index: number }
  | { art: 'ritual'; ritual: Ritual }
  | { art: 'entwicklung' }
  | { art: 'zusammenfassung' }

export function baueSchritte(inhalt: UmfrageInhalt): Schritt[] {
  const schritte: Schritt[] = [{ art: 'start' }]
  inhalt.verhalten.forEach((verhalten, index) => schritte.push({ art: 'verhalten', verhalten, index }))
  inhalt.rituale.forEach((ritual) => schritte.push({ art: 'ritual', ritual }))
  if (inhalt.kolleginnen.length > 0) schritte.push({ art: 'entwicklung' })
  schritte.push({ art: 'zusammenfassung' })
  return schritte
}

/** Alle Personen, die zu jedem Verhalten bewertet werden: zuerst ich selbst (Selbstbild). */
export interface Bewertete {
  id: string
  name: string
  selbst: boolean
}

export function bewertete(inhalt: UmfrageInhalt): Bewertete[] {
  return [
    { id: inhalt.person.id, name: inhalt.person.name, selbst: true },
    ...inhalt.kolleginnen.map((k) => ({ id: k.id, name: k.name, selbst: false })),
  ]
}

export const notenSchluessel = (verhaltenNr: number, personId: string) => `${verhaltenNr}:${personId}`
export const ritualSchluessel = (ritualNr: number, frageNr: number) => `${ritualNr}:${frageNr}`

/** Ab dieser Note ist ein Kommentar Pflicht (Plan §1, Datenbank: bewertungen_kommentar_ab_4). */
export const KOMMENTAR_PFLICHT_AB = 4

export function brauchtVideo(url: string | null): boolean {
  return !!url && url.trim() !== ''
}

// ---- Prüfungen -------------------------------------------------------------------

/** Meldung, was an diesem Schritt noch fehlt, oder null, wenn man weiter darf. */
export function schrittFehler(schritt: Schritt, entwurf: Entwurf, inhalt: UmfrageInhalt): string | null {
  if (schritt.art === 'verhalten') {
    const { verhalten } = schritt
    if (brauchtVideo(verhalten.video_url) && !entwurf.videos[`v${verhalten.nr}`]) {
      return 'Bitte schau dir zuerst das Video bis zum Ende an.'
    }
    for (const person of bewertete(inhalt)) {
      const schluessel = notenSchluessel(verhalten.nr, person.id)
      const note = entwurf.noten[schluessel]
      if (!note) {
        return person.selbst
          ? 'Bitte bewerte dich selbst.'
          : `Bitte bewerte ${person.name}.`
      }
      if (note >= KOMMENTAR_PFLICHT_AB && !(entwurf.kommentare[schluessel] ?? '').trim()) {
        return `Ab Note ${KOMMENTAR_PFLICHT_AB} brauchen wir einen Kommentar${person.selbst ? ' zu dir' : ` zu ${person.name}`}.`
      }
    }
    return null
  }

  if (schritt.art === 'ritual') {
    const { ritual } = schritt
    if (brauchtVideo(ritual.video_url) && !entwurf.videos[`r${ritual.nr}`]) {
      return 'Bitte schau dir zuerst das Video bis zum Ende an.'
    }
    for (const frage of ritual.fragen) {
      if (frage.pflicht && !(entwurf.ritual[ritualSchluessel(ritual.nr, frage.nr)] ?? '').trim()) {
        return 'Bitte beantworte alle Pflichtfragen.'
      }
    }
    return null
  }

  return null
}

/** Erster Schritt, der noch nicht vollständig ist (für die Zusammenfassung), oder -1. */
export function ersterUnvollstaendigerSchritt(
  schritte: Schritt[],
  entwurf: Entwurf,
  inhalt: UmfrageInhalt,
): number {
  return schritte.findIndex((s) => schrittFehler(s, entwurf, inhalt) !== null)
}

// ---- Payload an umfrage_einreichen_v2 ---------------------------------------------

export interface UmfrageNutzdaten {
  monat: string
  gestartet_am: string
  zeitpunkt: string
  version: string
  bewertungen: { verhalten_nr: number; bewertete_person_id: string; note: number; kommentar: string }[]
  rituale: { ritual_nr: number; frage_nr: number; antwort: string | number }[]
  entwicklung: { person_id: string | null; begruendung: string }
}

export function baueNutzdaten(inhalt: UmfrageInhalt, entwurf: Entwurf, jetzt: Date = new Date()): UmfrageNutzdaten {
  const personen = bewertete(inhalt)

  const bewertungen = inhalt.verhalten.flatMap((v) =>
    personen.map((p) => {
      const schluessel = notenSchluessel(v.nr, p.id)
      return {
        verhalten_nr: v.nr,
        bewertete_person_id: p.id,
        note: entwurf.noten[schluessel],
        kommentar: (entwurf.kommentare[schluessel] ?? '').trim(),
      }
    }),
  )

  const rituale = inhalt.rituale.flatMap((r) =>
    r.fragen.flatMap((f) => {
      const antwort = (entwurf.ritual[ritualSchluessel(r.nr, f.nr)] ?? '').trim()
      if (!antwort) return []
      return [{ ritual_nr: r.nr, frage_nr: f.nr, antwort: f.typ === 'skala' ? Number(antwort) : antwort }]
    }),
  )

  const nenntPerson = entwurf.entwicklung.personId !== null
  return {
    monat: entwurf.monat,
    gestartet_am: entwurf.gestartetAm,
    zeitpunkt: jetzt.toISOString(),
    version: 'plattform-1',
    bewertungen,
    rituale,
    entwicklung: {
      person_id: entwurf.entwicklung.personId,
      begruendung: nenntPerson ? entwurf.entwicklung.begruendung.trim() : '',
    },
  }
}

/** Durchschnitt der Noten pro bewerteter Person (für die Zusammenfassung). */
export function durchschnitte(inhalt: UmfrageInhalt, entwurf: Entwurf): { person: Bewertete; schnitt: number | null }[] {
  return bewertete(inhalt).map((person) => {
    const noten = inhalt.verhalten
      .map((v) => entwurf.noten[notenSchluessel(v.nr, person.id)])
      .filter((n): n is number => typeof n === 'number')
    return { person, schnitt: noten.length ? noten.reduce((a, b) => a + b, 0) / noten.length : null }
  })
}
