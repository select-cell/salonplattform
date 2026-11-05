// KI direkt aus der Oberfläche: Der Browser holt die Eingabe von der Datenbank (nur Admin), schickt sie mit der Anmeldung
// des Admins an den n8n-Webhook und lässt die Antwort von der Datenbank prüfen und speichern. Es ist dieselbe Logik wie in
// der Edge Function `analyse-erstellen` (supabase/functions/analyse-erstellen/analyse.ts), nur ohne den Umweg über Supabase.
//
// Was dabei nicht aus der Hand gegeben wird: Wer die Eingabe bekommt, wer speichert und ob jede Zahl stimmt, entscheiden weiter
// die Datenbankfunktionen (agenda_ki_eingabe, agenda_ki_pruefen, …) mit der Anmeldung des Admins. Der Webhook bekommt nur die
// Eingabe ohne Namen und ohne Kommentartexte. Ein Geheimnis steckt nicht in der Oberfläche; der Webhook lässt die Anmeldung
// bei Supabase prüfen.
import { supabase } from './supabase'
import {
  AnalyseFehler, STANDARD_WEBHOOK_URL, erstelleAgenda, erstelleAlle, erstelleAnalyse, erstelleGesamt, rufeAnbieter, rufeAnbieterBatch,
  type Abhaengigkeiten,
} from '../../supabase/functions/analyse-erstellen/analyse'

/** Die Adresse des n8n-Webhooks: dieselbe wie in der Edge Function (eine Quelle). */
export const KI_WEBHOOK_URL = STANDARD_WEBHOOK_URL

const fetchFn = (url: string, init?: RequestInit) => fetch(url, init)

/** Schalter für die Fehlersuche: `localStorage.setItem('dawiid-ki-weg', 'edge')` nimmt immer die Edge Function (zurück: removeItem). */
export const KI_WEG_SCHLUESSEL = 'dawiid-ki-weg'
function nurEdgeFunction(): boolean {
  try {
    return localStorage.getItem(KI_WEG_SCHLUESSEL) === 'edge'
  } catch {
    return false
  }
}

/**
 * Führt eine KI-Aufgabe im Browser aus. Das Ergebnis hat dieselbe Form wie die Antwort der Edge Function (`{ ok: true, … }`).
 * `null`: Der Webhook war vom Browser aus nicht erreichbar (kein Netz, CORS) und hat nichts erhalten; der Aufrufer nimmt dann die
 * Edge Function. Alle anderen Fehler kommen als Error mit deutscher Meldung.
 */
export async function kiDirekt(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (nurEdgeFunction()) return null
  const aufgabe = body.aufgabe ?? 'person'
  const monat = typeof body.monat === 'string' ? body.monat : ''
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monat)) throw new Error('Der Monat fehlt oder ist ungültig.')

  const { data: sitzung } = await supabase.auth.getSession()
  const token = sitzung.session?.access_token
  if (!token) throw new Error('Bitte melde dich an.')

  const d: Abhaengigkeiten = {
    rpc: async (name, args) => {
      const { data, error } = await supabase.rpc(name, args)
      return { data, error: error ? { code: error.code, message: error.message } : null }
    },
    anbieter: () => ({ name: 'webhook', modell: null, url: KI_WEBHOOK_URL, token }),
    ki: (c, n, e, o) => rufeAnbieter(c, n, e, fetchFn, o),
    kiBatch: (c, a, v, auftraege, o) => rufeAnbieterBatch(c, a, v, auftraege, fetchFn, o),
  }

  try {
    const neu = body.neu === true
    switch (aufgabe) {
      case 'alle': {
        const ausgenommen = Array.isArray(body.ausgenommen) ? (body.ausgenommen as string[]) : []
        return { ok: true, aufgabe: 'alle', ...(await erstelleAlle(d, { monat, ausgenommen })) }
      }
      case 'gesamt':
        return { ok: true, ...(await erstelleGesamt(d, { monat, neu })) }
      case 'agenda':
        return { ok: true, ...(await erstelleAgenda(d, { monat, neu })) }
      case 'person':
        if (typeof body.person_id !== 'string') throw new Error('Person oder Monat fehlt oder ist ungültig.')
        return { ok: true, ...(await erstelleAnalyse(d, { personId: body.person_id, monat, neu })) }
      default:
        throw new Error('Die Aufgabe ist unbekannt.')
    }
  } catch (e) {
    if (e instanceof AnalyseFehler && e.netzwerk) return null
    throw e instanceof Error ? new Error(e.message) : new Error('Die Analyse konnte nicht erstellt werden.')
  }
}
