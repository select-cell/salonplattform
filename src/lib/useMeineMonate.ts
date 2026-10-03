import { useCallback, useEffect, useState } from 'react'
import { holeMeineMonate } from './api'
import type { MonatStatus } from './umfrage'

interface Zustand {
  laedt: boolean
  monate: MonatStatus[]
  fehler: string | null
}

/** Lädt die Umfrage-Monate der eingeloggten Person (siehe meine_monate()). */
export function useMeineMonate() {
  const [zustand, setZustand] = useState<Zustand>({ laedt: true, monate: [], fehler: null })
  const [versuch, setVersuch] = useState(0)

  useEffect(() => {
    let aktiv = true
    holeMeineMonate().then(
      (monate) => aktiv && setZustand({ laedt: false, monate, fehler: null }),
      (e: unknown) =>
        aktiv &&
        setZustand({ laedt: false, monate: [], fehler: e instanceof Error ? e.message : 'Unbekannter Fehler' }),
    )
    return () => {
      aktiv = false
    }
  }, [versuch])

  const neuLaden = useCallback(() => {
    setZustand((z) => ({ ...z, laedt: true, fehler: null }))
    setVersuch((v) => v + 1)
  }, [])

  return { ...zustand, neuLaden }
}
