// Gebündelter Datenzugriff: dünne Wrapper um supabase.rpc(...). Weitere Funktionen
// aus Plan §5.3 kommen hier mit den jeweiligen Phasen dazu.
import { supabase } from './supabase'
import type { Person } from './types'

/** Eigene Zeile aus `personen`; null, wenn der Login keiner Person zugeordnet ist. */
export async function holeIch(): Promise<Person | null> {
  const { data, error } = await supabase.rpc('ich').maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Person | null) ?? null
}
