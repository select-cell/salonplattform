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

export interface Kollegin {
  id: string
  name: string
}

export interface UmfrageInhalt {
  salon: { id: string; name: string }
  person: { id: string; name: string }
  verhalten: Verhalten[]
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
  /** `v${nr}` → Video bis zum Ende gesehen */
  videos: Record<string, true>
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
  | { art: 'entwicklung' }
  | { art: 'zusammenfassung' }

export function baueSchritte(inhalt: UmfrageInhalt): Schritt[] {
  // Reihenfolge wie in der bisherigen Umfrage: zuerst die Entwicklung des Monats, dann die Verhalten
  const schritte: Schritt[] = [{ art: 'start' }]
  if (inhalt.kolleginnen.length > 0) schritte.push({ art: 'entwicklung' })
  inhalt.verhalten.forEach((verhalten, index) => schritte.push({ art: 'verhalten', verhalten, index }))
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

/** Ab dieser Note ist ein Kommentar Pflicht (Plan §1, Datenbank: bewertungen_kommentar_ab_4). */
export const KOMMENTAR_PFLICHT_AB = 4

/** Beschriftung der Noten 1–5 beim Selbstbild (wie in der bisherigen Umfrage). */
export const SELBSTBILD_LABELS = ['Nicht sichtbar', 'Selten sichtbar', 'Oft sichtbar', 'Immer sichtbar', 'Vorbildlich'] as const

/** Mindestdauer des Platzhalter-Videos, solange noch kein echtes Video hinterlegt ist. */
export const PLATZHALTER_VIDEO_SEKUNDEN = 8

/** Jedes Verhalten hat eine Video-Sperre: echtes Video bis zum Ende, sonst der Platzhalter. */
export function brauchtVideo(_url: string | null): boolean {
  return true
}

// ---- Prüfungen -------------------------------------------------------------------

/** Meldung, was an diesem Schritt noch fehlt, oder null, wenn man weiter darf. */
export function schrittFehler(schritt: Schritt, entwurf: Entwurf, inhalt: UmfrageInhalt): string | null {
  if (schritt.art === 'entwicklung') {
    if (!entwurf.entwicklung.personId) return 'Bitte wähle eine Kollegin für die Entwicklung des Monats aus.'
    if (!entwurf.entwicklung.begruendung.trim()) return 'Bitte begründe deine Wahl bei der Entwicklung des Monats.'
    return null
  }

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

  const nenntPerson = entwurf.entwicklung.personId !== null
  return {
    monat: entwurf.monat,
    gestartet_am: entwurf.gestartetAm,
    zeitpunkt: jetzt.toISOString(),
    version: 'plattform-1',
    bewertungen,
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
