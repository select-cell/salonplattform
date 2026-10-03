import { useCallback, useEffect, useState } from 'react'

interface Zustand<T> {
  laedt: boolean
  daten: T | null
  fehler: string | null
}

/** Lädt Daten beim Öffnen und bei jeder Änderung von `abhaengig`. */
export function useDaten<T>(laden: () => Promise<T>, abhaengig: readonly unknown[]) {
  const [zustand, setZustand] = useState<Zustand<T>>({ laedt: true, daten: null, fehler: null })
  const [versuch, setVersuch] = useState(0)

  useEffect(() => {
    let aktiv = true
    setZustand((z) => ({ ...z, laedt: true, fehler: null }))
    laden().then(
      (daten) => aktiv && setZustand({ laedt: false, daten, fehler: null }),
      (e: unknown) =>
        aktiv && setZustand({ laedt: false, daten: null, fehler: e instanceof Error ? e.message : 'Unbekannter Fehler' }),
    )
    return () => {
      aktiv = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...abhaengig, versuch])

  const neuLaden = useCallback(() => setVersuch((v) => v + 1), [])
  return { ...zustand, neuLaden }
}
