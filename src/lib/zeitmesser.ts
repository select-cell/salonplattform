// Zeitmesser der Umfrage: zählt die aktive Bearbeitungszeit, je Schritt und insgesamt.
// Reine Logik: Die Uhr wird übergeben (im Browser performance.now(), nie Date), dadurch ist sie testbar
// und lässt sich nicht über die Geräteuhr verstellen. Die Serveruhr bleibt trotzdem maßgeblich.

/** Aktiv heißt: Seite sichtbar und in den letzten 45 Sekunden eine Eingabe. */
export const AKTIV_FENSTER_MS = 45_000

export interface ZeitStand {
  /** aktive Sekunden insgesamt */
  aktiveSek: number
  /** aktive Sekunden je Schritt ("entwicklung", "v<Nr>") */
  schritte: Record<string, number>
}

export interface Zeitmesser {
  /** Eine Eingabe (Tippen, Klicken, Mausbewegung, Scrollen, laufendes Video). Die Rückkehr in den Tab zählt nicht. */
  eingabe(): void
  /** Seite sichtbar oder verborgen */
  sichtbar(sichtbar: boolean): void
  /** Aktueller Schritt (null auf Start und Zusammenfassung) */
  schritt(schluessel: string | null): void
  /** Aktueller Stand in Sekunden (rundet ab) */
  stand(): ZeitStand
  /** Stand vom Server übernehmen (Fortsetzung nach Neuladen): nur, wenn er größer ist als der lokale */
  uebernehme(stand: ZeitStand): void
  /** Alles auf null (neu beginnen) */
  zuruecksetzen(): void
}

export function erzeugeZeitmesser(jetzt: () => number, startSichtbar = true): Zeitmesser {
  let letzterTakt = jetzt()
  let letzteEingabe = -Infinity
  let istSichtbar = startSichtbar
  let aktuellerSchritt: string | null = null
  let aktivMs = 0
  const schrittMs = new Map<string, number>()

  /** Zählt die Zeit seit dem letzten Takt, soweit sie aktiv war. Vor jeder Zustandsänderung aufrufen. */
  const takt = () => {
    const jetztMs = jetzt()
    const dt = Math.max(0, jetztMs - letzterTakt)
    if (istSichtbar && dt > 0) {
      const aktivBis = Math.min(jetztMs, letzteEingabe + AKTIV_FENSTER_MS)
      const aktiv = Math.max(0, Math.min(dt, aktivBis - letzterTakt))
      aktivMs += aktiv
      if (aktuellerSchritt !== null && aktiv > 0) {
        schrittMs.set(aktuellerSchritt, (schrittMs.get(aktuellerSchritt) ?? 0) + aktiv)
      }
    }
    letzterTakt = jetztMs
  }

  return {
    eingabe() {
      takt()
      letzteEingabe = letzterTakt
    },
    sichtbar(neu) {
      takt()
      istSichtbar = neu
    },
    schritt(schluessel) {
      takt()
      aktuellerSchritt = schluessel
    },
    stand() {
      takt()
      const schritte: Record<string, number> = {}
      for (const [k, ms] of schrittMs) schritte[k] = Math.floor(ms / 1000)
      return { aktiveSek: Math.floor(aktivMs / 1000), schritte }
    },
    uebernehme(stand) {
      takt()
      aktivMs = Math.max(aktivMs, stand.aktiveSek * 1000)
      for (const [k, sek] of Object.entries(stand.schritte)) {
        schrittMs.set(k, Math.max(schrittMs.get(k) ?? 0, sek * 1000))
      }
    },
    zuruecksetzen() {
      takt()
      aktivMs = 0
      schrittMs.clear()
    },
  }
}

/** „12 Min.“, „unter 1 Min.“ */
export function formatDauer(sekunden: number): string {
  if (sekunden < 60) return 'unter 1 Min.'
  const min = Math.round(sekunden / 60)
  return min < 60 ? `${min} Min.` : `${Math.floor(min / 60)} Std. ${String(min % 60).padStart(2, '0')} Min.`
}
