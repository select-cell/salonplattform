// Anbindung des Zeitmessers an Seite und Server (Erweiterung B).
// Die Umfrage hängt nie an der Zeiterfassung: Fehlt die Verbindung, zählt der Browser weiter,
// holt die Sitzung nach und meldet beim nächsten Herzschlag den Stand.
import { useCallback, useEffect, useRef, useState } from 'react'
import { sendeHerzschlag, sendeHerzschlagBeimSchliessen, starteUmfrageSitzung } from './api'
import { supabase } from './supabase'
import { erzeugeZeitmesser, type ZeitStand } from './zeitmesser'

export const HERZSCHLAG_MS = 30_000
/** Ereignis, das Teile der Seite senden, deren Eingaben der Browser nicht sieht (z. B. ein Video im iframe) */
export const AKTIVITAET_EREIGNIS = 'dawiid:aktivitaet'

export interface ZeitAbschluss extends ZeitStand {
  sitzung: string | null
}

export function useZeiterfassung(monat: string, schritt: string | null) {
  const messer = useRef(erzeugeZeitmesser(() => performance.now(), document.visibilityState !== 'hidden'))
  const sitzung = useRef<string | null>(null)
  const token = useRef<string | null>(null)
  const [wiederaufgenommen, setWiederaufgenommen] = useState(false)

  const uebernehme = useCallback((s: { sitzung: string; aktive_sek: number; schritte: Record<string, number> }) => {
    sitzung.current = s.sitzung
    messer.current.uebernehme({ aktiveSek: s.aktive_sek, schritte: s.schritte })
  }, [])

  // Ein Start zur Zeit: sonst würde der zweite Aufruf die gerade angelegte Sitzung als „fortgesetzt“ kennzeichnen
  const startLaeuft = useRef<Promise<void> | null>(null)
  const starten = useCallback(() => {
    startLaeuft.current ??= (async () => {
      try {
        const s = await starteUmfrageSitzung(monat)
        uebernehme(s)
        setWiederaufgenommen(s.wiederaufgenommen)
      } catch {
        // später noch einmal versuchen (nächster Herzschlag oder Abgabe)
      } finally {
        startLaeuft.current = null
      }
    })()
    return startLaeuft.current
  }, [monat, uebernehme])

  const herzschlag = useCallback(async (startenWennNoetig = false) => {
    if (!sitzung.current) {
      if (startenWennNoetig) await starten()
      return
    }
    const stand = messer.current.stand()
    try {
      await sendeHerzschlag(sitzung.current, stand.aktiveSek, stand.schritte)
    } catch {
      // offline: der Stand bleibt im Browser
    }
  }, [starten])

  // Anmelde-Token für den letzten Herzschlag beim Schließen merken
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { token.current = data.session?.access_token ?? null })
    const { data } = supabase.auth.onAuthStateChange((_ereignis, s) => { token.current = s?.access_token ?? null })
    return () => data.subscription.unsubscribe()
  }, [])

  // Sitzung beginnen oder fortsetzen
  useEffect(() => {
    void starten()
  }, [starten])

  // Eingaben und Sichtbarkeit
  useEffect(() => {
    const m = messer.current
    let letzterAnstoss = 0
    const eingabe = () => m.eingabe()
    // Mausbewegung und Scrollen höchstens alle 250 ms zählen
    const gedrosselt = () => {
      const jetzt = performance.now()
      if (jetzt - letzterAnstoss > 250) {
        letzterAnstoss = jetzt
        m.eingabe()
      }
    }
    const aufAlles = ['pointerdown', 'keydown', 'touchstart', 'input', 'click', AKTIVITAET_EREIGNIS] as const
    const aufGedrosselt = ['pointermove', 'wheel', 'scroll'] as const
    aufAlles.forEach((e) => window.addEventListener(e, eingabe, { passive: true, capture: true }))
    aufGedrosselt.forEach((e) => window.addEventListener(e, gedrosselt, { passive: true, capture: true }))
    // Medien-Ereignisse blubbern nicht, aber ein laufendes Video ist Aktivität
    const medium = () => gedrosselt()
    document.addEventListener('timeupdate', medium, true)

    const schliessen = () => {
      if (!sitzung.current || !token.current) return
      const stand = m.stand()
      sendeHerzschlagBeimSchliessen(token.current, sitzung.current, stand.aktiveSek, stand.schritte)
    }
    const sichtbarkeit = () => {
      const sichtbar = document.visibilityState !== 'hidden'
      m.sichtbar(sichtbar)
      if (!sichtbar) schliessen()
    }
    document.addEventListener('visibilitychange', sichtbarkeit)
    window.addEventListener('pagehide', schliessen)

    const takt = window.setInterval(() => void herzschlag(true), HERZSCHLAG_MS)
    return () => {
      aufAlles.forEach((e) => window.removeEventListener(e, eingabe, { capture: true }))
      aufGedrosselt.forEach((e) => window.removeEventListener(e, gedrosselt, { capture: true }))
      document.removeEventListener('timeupdate', medium, true)
      document.removeEventListener('visibilitychange', sichtbarkeit)
      window.removeEventListener('pagehide', schliessen)
      window.clearInterval(takt)
    }
  }, [herzschlag])

  // Schrittwechsel: Zeit dem neuen Schritt zuordnen und sofort einen Herzschlag senden
  useEffect(() => {
    messer.current.schritt(schritt)
    void herzschlag()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schritt])

  /** Stand für die Abgabe. Fehlt noch eine Sitzung (kein Netz am Anfang), wird sie jetzt noch einmal versucht. */
  const abschluss = useCallback(async (): Promise<ZeitAbschluss> => {
    if (!sitzung.current) await starten()
    return { sitzung: sitzung.current, ...messer.current.stand() }
  }, [starten])

  /** „Neu beginnen“: Die laufende Sitzung endet mit dem Kennzeichen „neu_begonnen“, die Zeit beginnt bei null. */
  const neuBeginnen = useCallback(async () => {
    messer.current.zuruecksetzen()
    try {
      const s = await starteUmfrageSitzung(monat, true)
      sitzung.current = s.sitzung
      setWiederaufgenommen(false)
    } catch {
      sitzung.current = null
    }
  }, [monat])

  return { abschluss, neuBeginnen, wiederaufgenommen }
}
