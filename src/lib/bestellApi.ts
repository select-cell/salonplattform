// Netzwerk des Bestellsystems. Zwei Wege, bewusst getrennt (docs/bestellsystem.md):
//  - Speisekarte lesen: direkt aus Supabase, mit dem öffentlichen Key (nur Lesen)
//  - Anfrage senden: ausschließlich an den n8n-Webhook, nie direkt an Telegram
import { BESTELL_WEBHOOK_URL } from './bestellKonfiguration'
import {
  leseAntwort,
  NOTKARTE,
  ZEITLIMIT_KARTE_MS,
  ZEITLIMIT_SENDEN_MS,
  type Antwort,
  type Artikel,
  type Nutzdaten,
} from './bestellung'
import { supabase } from './supabase'

export interface Karte {
  artikel: readonly Artikel[]
  /** Steht der Platz in `plaetze`? null = Supabase nicht erreichbar */
  platzBekannt: boolean | null
  /** true = fest hinterlegte Notkarte, weil Supabase nicht antwortete */
  notkarte: boolean
}

/** Artikel und Platz aus Supabase. Antwortet Supabase nicht, greift die Notkarte (Plan §5). */
export async function ladeKarte(platz: number): Promise<Karte> {
  const abbruch = new AbortController()
  const timer = setTimeout(() => abbruch.abort(), ZEITLIMIT_KARTE_MS)
  try {
    const [plaetze, artikel] = await Promise.all([
      supabase
        .from('plaetze')
        .select('platz')
        .eq('platz', platz)
        .eq('aktiv', true)
        .abortSignal(abbruch.signal)
        .maybeSingle(),
      supabase
        .from('artikel')
        .select('id, name, kategorie')
        .eq('aktiv', true)
        .order('sortierung')
        .abortSignal(abbruch.signal),
    ])
    return {
      platzBekannt: plaetze.error ? null : plaetze.data !== null,
      artikel: artikel.error ? NOTKARTE : (artikel.data as Artikel[]),
      notkarte: artikel.error !== null,
    }
  } catch {
    return { platzBekannt: null, artikel: NOTKARTE, notkarte: true }
  } finally {
    clearTimeout(timer)
  }
}

/** Alles, was beim Senden passiert ist. Die Testversion zeigt es an; produktiv wird es nicht angezeigt. */
export interface SendeDetails {
  url: string
  gesendet: Nutzdaten
  /** HTTP-Status der Antwort, null wenn keine lesbare Antwort kam */
  status: number | null
  antwortText: string | null
  dauerMs: number
  fehler: 'zeitlimit' | 'netzwerk' | 'nicht_eingerichtet' | null
}

/**
 * Sendet die Anfrage an den Webhook. Wirft nie: Netzwerkfehler und Zeitüberschreitung
 * (ca. 10 Sekunden) kommen als `fehler` zurück, damit die Oberfläche eine Meldung zeigen kann.
 * `url` ist nur in der Testversion eine andere als die eingebaute (Test-URL von n8n).
 */
export async function sendeAnfrageMitDetails(
  nutzdaten: Nutzdaten,
  url: string = BESTELL_WEBHOOK_URL,
): Promise<{ antwort: Antwort; details: SendeDetails }> {
  const start = Date.now()
  const details: SendeDetails = { url, gesendet: nutzdaten, status: null, antwortText: null, dauerMs: 0, fehler: null }
  const fertig = (antwort: Antwort) => ({ antwort, details: { ...details, dauerMs: Date.now() - start } })

  if (!url) {
    console.error('VITE_BESTELL_WEBHOOK_URL fehlt: Die Anfrage kann nicht gesendet werden.')
    details.fehler = 'nicht_eingerichtet'
    return fertig({ art: 'fehler', grund: 'nicht_eingerichtet' })
  }
  const abbruch = new AbortController()
  const timer = setTimeout(() => abbruch.abort(), ZEITLIMIT_SENDEN_MS)
  try {
    const antwort = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nutzdaten),
      signal: abbruch.signal,
    })
    details.status = antwort.status
    details.antwortText = await antwort.text().catch(() => null)
    let body: unknown = null
    try {
      body = JSON.parse(details.antwortText ?? '')
    } catch {
      // keine JSON-Antwort: wird unten als Fehler behandelt
    }
    const gelesen = leseAntwort(body)
    return fertig(gelesen ?? { art: 'fehler', grund: antwort.ok ? 'antwort_unlesbar' : `status_${antwort.status}` })
  } catch {
    details.fehler = abbruch.signal.aborted ? 'zeitlimit' : 'netzwerk'
    return fertig({ art: 'fehler', grund: details.fehler })
  } finally {
    clearTimeout(timer)
  }
}
