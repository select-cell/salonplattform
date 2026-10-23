import { useCallback, useEffect, useState } from 'react'

// Hell oder dunkel: Die Wahl steht im Browser (localStorage). Ohne Wahl folgt die Seite dem Gerät.
// index.html setzt data-theme schon vor dem ersten Zeichnen, damit nichts aufblitzt.
export type Thema = 'light' | 'dark'

const SCHLUESSEL = 'dawiid-theme'
const FARBEN: Record<Thema, string> = { light: '#FAF8F3', dark: '#15110C' }

function gespeichert(): Thema | null {
  try {
    const wert = window.localStorage.getItem(SCHLUESSEL)
    return wert === 'light' || wert === 'dark' ? wert : null
  } catch {
    return null
  }
}

const geraet = (): Thema => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

export function aktuellesThema(): Thema {
  const am: string | undefined = document.documentElement.dataset.theme
  return am === 'dark' || am === 'light' ? am : (gespeichert() ?? geraet())
}

function anwenden(thema: Thema) {
  document.documentElement.dataset.theme = thema
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', FARBEN[thema])
}

export function speichereThema(thema: Thema) {
  anwenden(thema)
  try {
    window.localStorage.setItem(SCHLUESSEL, thema)
  } catch {
    // ohne Speicher gilt die Wahl nur bis zum Neuladen
  }
}

/** Aktuelles Thema plus Umschalter. Ohne eigene Wahl folgt es Änderungen am Gerät (z. B. Abendmodus). */
export function useThema(): { thema: Thema; umschalten: () => void } {
  const [thema, setThema] = useState<Thema>(aktuellesThema)

  useEffect(() => {
    const abfrage = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!abfrage) return
    const aenderung = () => {
      if (gespeichert()) return
      const neu = geraet()
      anwenden(neu)
      setThema(neu)
    }
    abfrage.addEventListener('change', aenderung)
    return () => abfrage.removeEventListener('change', aenderung)
  }, [])

  const umschalten = useCallback(() => {
    const neu: Thema = aktuellesThema() === 'dark' ? 'light' : 'dark'
    speichereThema(neu)
    setThema(neu)
  }, [])

  return { thema, umschalten }
}
