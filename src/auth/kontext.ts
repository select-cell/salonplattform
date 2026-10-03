import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type { Person } from '../lib/types'

export interface AuthWert {
  /** true, solange Sitzung oder Person noch geladen werden */
  laedt: boolean
  sitzung: Session | null
  /** null = Login ohne zugeordnete Person */
  person: Person | null
  /** Fehler beim Laden der Person (z. B. kein Netz) */
  fehler: string | null
  neuLaden: () => void
  abmelden: () => Promise<void>
}

export const AuthKontext = createContext<AuthWert | null>(null)

export function useAuth(): AuthWert {
  const wert = useContext(AuthKontext)
  if (!wert) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden')
  return wert
}

/** Nur innerhalb geschützter Routen verwenden (dort ist die Person garantiert geladen und aktiv). */
export function usePerson(): Person {
  const { person } = useAuth()
  if (!person) throw new Error('usePerson wurde außerhalb einer geschützten Route verwendet')
  return person
}
