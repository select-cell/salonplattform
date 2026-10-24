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

/**
 * Sendet die Anfrage an den Webhook. Wirft nie: Netzwerkfehler und Zeitüberschreitung
 * (ca. 10 Sekunden) kommen als `fehler` zurück, damit die Oberfläche eine Meldung zeigen kann.
 */
export async function sendeAnfrage(nutzdaten: Nutzdaten): Promise<Antwort> {
  if (!BESTELL_WEBHOOK_URL) {
    console.error('VITE_BESTELL_WEBHOOK_URL fehlt: Die Anfrage kann nicht gesendet werden.')
    return { art: 'fehler', grund: 'nicht_eingerichtet' }
  }
  const abbruch = new AbortController()
  const timer = setTimeout(() => abbruch.abort(), ZEITLIMIT_SENDEN_MS)
  try {
    const antwort = await fetch(BESTELL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nutzdaten),
      signal: abbruch.signal,
    })
    const gelesen = leseAntwort(await antwort.json().catch(() => null))
    return gelesen ?? { art: 'fehler', grund: antwort.ok ? 'antwort_unlesbar' : `status_${antwort.status}` }
  } catch {
    return { art: 'fehler', grund: abbruch.signal.aborted ? 'zeitlimit' : 'netzwerk' }
  } finally {
    clearTimeout(timer)
  }
}
