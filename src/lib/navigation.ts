// Eine Quelle für Menü, Dashboard-Kacheln und Platzhalterseiten (Plan §3).
// `live: false` = Seite ist vorbereitet, Inhalt kommt in einer späteren Phase.
import type { IconName } from '../components/Icon'
import { aktuellerMonat, monatLabel } from './monat'
import type { Person, Rolle } from './types'

export interface Bereich {
  schluessel: string
  /** Route ohne Parameter, z. B. /app/team */
  pfad: string
  /** Kurzer Name im Menü */
  menue: string
  /** Überschrift auf Kachel und Seite */
  titel: string
  kurz: string
  icon: IconName
  rollen: readonly Rolle[]
  /** Nur für Personen mit nimmt_an_teamumfrage */
  nurTeilnehmer?: boolean
  live: boolean
  /** Was die Seite später zeigt (für die Platzhalterseite) */
  geplant: readonly string[]
}

const MITARBEITER: readonly Rolle[] = ['mitarbeiter']
const LEITUNG: readonly Rolle[] = ['verantwortlicher', 'admin']
const ALLE: readonly Rolle[] = ['mitarbeiter', 'verantwortlicher', 'admin']

export const BEREICHE: readonly Bereich[] = [
  {
    schluessel: 'umfrage',
    pfad: '/app/umfrage',
    menue: 'Umfrage',
    titel: 'Monatsumfrage',
    kurz: 'Gib dein Feedback für diesen Monat ab.',
    icon: 'umfrage',
    rollen: ALLE,
    nurTeilnehmer: true,
    live: false,
    geplant: [
      'Selbstbild und Fremdbild der Kolleginnen in einem Durchgang',
      'Videos und Bewertungsstufen pro Verhalten',
      'Rituale und Entwicklung des Monats',
    ],
  },
  {
    schluessel: 'ergebnisse',
    pfad: '/app/ergebnisse',
    menue: 'Ergebnisse',
    titel: 'Meine Ergebnisse',
    kurz: 'Selbstbild, Fremdbild und dein Verlauf.',
    icon: 'ergebnisse',
    rollen: ALLE,
    nurTeilnehmer: true,
    live: false,
    geplant: [
      'Kennzahlen: Selbstbild, Fremdbild und Abweichung',
      'Top und Flop 4 deiner Verhalten',
      'Verlauf über alle Monate und Kommentare ohne Absender',
    ],
  },
  {
    schluessel: 'team-mitarbeiter',
    pfad: '/app/team',
    menue: 'Team',
    titel: 'Team-Ergebnisse',
    kurz: 'Wie steht das Team insgesamt da?',
    icon: 'team',
    rollen: MITARBEITER,
    live: false,
    geplant: [
      'Durchschnittswerte des Teams für Selbst- und Fremdbild',
      'Top und Flop 4 im Team',
      'Verlauf des Teams. Einzelne Personen bleiben ungenannt.',
    ],
  },
  {
    schluessel: 'team-leitung',
    pfad: '/app/team',
    menue: 'Team',
    titel: 'Team-Dashboard',
    kurz: 'Rangliste, Heatmap und Selbst- gegen Fremdbild.',
    icon: 'team',
    rollen: LEITUNG,
    live: false,
    geplant: [
      'Umschalter Team ↔ Person und Kennzahl-Kacheln',
      'Rangliste, Selbstbild gegen Fremdbild und Differenz pro Person',
      'Heatmap Verhalten × Person und Detailtabelle',
    ],
  },
  {
    schluessel: 'mitglieder',
    pfad: '/app/mitglieder',
    menue: 'Mitarbeiterinnen',
    titel: 'Mitarbeiterinnen',
    kurz: 'Jede Person im Detail, mit Abgabe-Status.',
    icon: 'mitglieder',
    rollen: LEITUNG,
    live: false,
    geplant: [
      'Liste aller Mitarbeiterinnen mit Fremdbild, Differenz und Abgabe-Status',
      'Individuelle Auswertung mit Verlauf über alle Monate',
      'Einzelbewertungen mit Absender und Kommentar',
    ],
  },
  {
    schluessel: 'chefumfrage-mitarbeiter',
    pfad: '/app/chefumfrage',
    menue: 'Chefumfrage',
    titel: 'Chefumfrage',
    kurz: 'Einmal im Quartal Feedback an den Verantwortlichen.',
    icon: 'chefumfrage',
    rollen: MITARBEITER,
    live: false,
    geplant: ['Quartalsumfrage zur Zusammenarbeit mit dem Verantwortlichen'],
  },
  {
    schluessel: 'chefumfrage-leitung',
    pfad: '/app/chefumfrage',
    menue: 'Chefumfrage',
    titel: 'Ergebnisse Chefumfrage',
    kurz: 'Das Feedback des Teams an dich.',
    icon: 'chefumfrage',
    rollen: LEITUNG,
    live: false,
    geplant: ['Auswertung der Quartalsumfrage des Teams'],
  },
  {
    schluessel: 'gaeste',
    pfad: '/app/gaeste',
    menue: 'Gäste',
    titel: 'Ergebnisse Gästeumfrage',
    kurz: 'Was die Gäste im Salon erleben.',
    icon: 'gaeste',
    rollen: LEITUNG,
    live: false,
    geplant: ['Auswertung der Gästeumfrage (Link oder QR-Code im Salon)'],
  },
  {
    schluessel: 'meine-umfrage',
    pfad: '/app/meine-umfrage',
    menue: 'Meine Umfrage',
    titel: 'Meine Umfrage',
    kurz: 'Dein persönlicher Link zur Umfrage für den Verantwortlichen.',
    icon: 'link',
    rollen: LEITUNG,
    live: false,
    geplant: ['Individueller Link zur Umfrage für den Verantwortlichen. Der Inhalt folgt.'],
  },
  {
    schluessel: 'coaching',
    pfad: '/app/coaching',
    menue: 'Jarvis',
    titel: 'Jarvis',
    kurz: 'Dein Coach im Gespräch über deine Ergebnisse.',
    icon: 'coaching',
    rollen: ALLE,
    live: false,
    geplant: ['Chat mit Jarvis, der ausschließlich Daten kennt, die du ohnehin sehen darfst'],
  },
]

/** Alle Bereiche, die diese Person sehen darf, in Menü-Reihenfolge. */
export function bereicheFuer(person: Person): Bereich[] {
  return BEREICHE.filter(
    (b) => b.rollen.includes(person.rolle) && (!b.nurTeilnehmer || person.nimmt_an_teamumfrage),
  )
}

/** Ziel-URL eines Bereichs; die Umfrage zeigt auf den laufenden Monat. */
export function zielFuer(bereich: Bereich): string {
  return bereich.schluessel === 'umfrage' ? `${bereich.pfad}/${aktuellerMonat()}` : bereich.pfad
}

export function titelFuer(bereich: Bereich): string {
  return bereich.schluessel === 'umfrage' ? `Umfrage ${monatLabel(aktuellerMonat())}` : bereich.titel
}

export function findeBereich(person: Person, pfad: string): Bereich | undefined {
  const sauber = pfad.replace(/\/+$/, '')
  return bereicheFuer(person).find((b) => sauber === b.pfad || sauber.startsWith(`${b.pfad}/`))
}
