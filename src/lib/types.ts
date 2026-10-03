export type Rolle = 'mitarbeiter' | 'verantwortlicher' | 'admin'

/** Antwort der Datenbank-Funktion ich() */
export interface Person {
  id: string
  name: string
  email: string
  rolle: Rolle
  salon_id: string | null
  salon_name: string | null
  nimmt_an_teamumfrage: boolean
  aktiv: boolean
  aktiv_ab: string | null
}

export const ROLLEN_LABEL: Record<Rolle, string> = {
  mitarbeiter: 'Mitarbeiterin',
  verantwortlicher: 'Verantwortlicher',
  admin: 'Admin',
}

/** Verantwortlicher und Admin teilen sich die Leitungs-Sicht (Plan §2). */
export function istLeitung(person: Pick<Person, 'rolle'>): boolean {
  return person.rolle === 'verantwortlicher' || person.rolle === 'admin'
}
