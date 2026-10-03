import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { holeIch } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { Person } from '../lib/types'
import { AuthKontext, type AuthWert } from './kontext'

interface PersonZustand {
  /** Für welchen Login diese Person geladen wurde (verhindert veraltete Anzeige) */
  userId: string
  person: Person | null
  fehler: string | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sitzung, setSitzung] = useState<Session | null>(null)
  const [sitzungBereit, setSitzungBereit] = useState(false)
  const [geladen, setGeladen] = useState<PersonZustand | null>(null)
  const [versuch, setVersuch] = useState(0)

  // 1) Sitzung: aus dem Speicher bzw. aus dem Magic Link in der URL
  useEffect(() => {
    let aktiv = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!aktiv) return
      setSitzung(data.session)
      setSitzungBereit(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_ereignis, neueSitzung) => {
      // Hier keine weiteren Supabase-Aufrufe: das kann den Client blockieren.
      setSitzung(neueSitzung)
      setSitzungBereit(true)
    })
    return () => {
      aktiv = false
      data.subscription.unsubscribe()
    }
  }, [])

  // 2) Person zum Login laden (Rolle, Salon, Teilnahme)
  const userId = sitzung?.user.id ?? null
  useEffect(() => {
    if (!userId) return
    let aktiv = true
    holeIch().then(
      (person) => aktiv && setGeladen({ userId, person, fehler: null }),
      (fehler: unknown) =>
        aktiv &&
        setGeladen({
          userId,
          person: null,
          fehler: fehler instanceof Error ? fehler.message : 'Unbekannter Fehler',
        }),
    )
    return () => {
      aktiv = false
    }
  }, [userId, versuch])

  const neuLaden = useCallback(() => {
    setGeladen(null)
    setVersuch((v) => v + 1)
  }, [])

  const abmelden = useCallback(async () => {
    await supabase.auth.signOut()
    setGeladen(null)
  }, [])

  const wert = useMemo<AuthWert>(() => {
    const personFertig = !userId || geladen?.userId === userId
    return {
      laedt: !sitzungBereit || !personFertig,
      sitzung,
      person: personFertig && userId ? (geladen?.person ?? null) : null,
      fehler: personFertig && userId ? (geladen?.fehler ?? null) : null,
      neuLaden,
      abmelden,
    }
  }, [sitzungBereit, sitzung, userId, geladen, neuLaden, abmelden])

  return <AuthKontext.Provider value={wert}>{children}</AuthKontext.Provider>
}
