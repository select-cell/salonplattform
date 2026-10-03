import { Navigate, Outlet } from 'react-router-dom'
import { Ladeanzeige } from '../components/Ladeanzeige'
import type { Rolle } from '../lib/types'
import { KeinZugang } from '../pages/KeinZugang'
import { useAuth, usePerson } from './kontext'

/** Alles unter /app: eingeloggt und mit aktiver Person (Plan §4.2). */
export function RequireAuth() {
  const { laedt, sitzung, person, fehler } = useAuth()

  if (laedt) return <Ladeanzeige />
  if (!sitzung) return <Navigate to="/login" replace />
  if (fehler) return <KeinZugang grund="fehler" meldung={fehler} />
  if (!person) return <KeinZugang grund="keine-person" />
  if (!person.aktiv) return <KeinZugang grund="gesperrt" />
  return <Outlet />
}

/**
 * Komfort-Schutz im Frontend. Die eigentliche Sicherheit liegt in RLS und den
 * Datenbank-Funktionen (Plan §3): wer hier durchkommt, sieht trotzdem nur erlaubte Daten.
 */
export function RequireRolle({ rollen }: { rollen: readonly Rolle[] }) {
  const person = usePerson()
  return rollen.includes(person.rolle) ? <Outlet /> : <Navigate to="/app" replace />
}

/** Nur für Personen, die an der Teamumfrage teilnehmen. */
export function RequireTeilnahme() {
  const person = usePerson()
  return person.nimmt_an_teamumfrage ? <Outlet /> : <Navigate to="/app" replace />
}
