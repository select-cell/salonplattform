// Nur für die Testversion (der produktive Build enthält diese Datei nicht):
// Webhook-Ziel wählen und erklären, was beim Senden passiert ist.
import type { SendeDetails } from './bestellApi'
import type { Antwort } from './bestellung'
import { BESTELL_WEBHOOK_URL, testWebhookUrl } from './bestellKonfiguration'

export type Ziel = 'produktion' | 'test'
const SCHLUESSEL = 'dawiid-webhook-ziel'

export function leseZiel(): Ziel {
  try {
    return window.localStorage.getItem(SCHLUESSEL) === 'test' ? 'test' : 'produktion'
  } catch {
    return 'produktion'
  }
}

export function speichereZiel(ziel: Ziel) {
  try {
    window.localStorage.setItem(SCHLUESSEL, ziel)
  } catch {
    // ohne Speicher gilt die Wahl nur bis zum Neuladen der Seite
  }
}

/** Adresse, an die gerade gesendet wird */
export function zielUrl(): string {
  return leseZiel() === 'test' ? testWebhookUrl(BESTELL_WEBHOOK_URL) : BESTELL_WEBHOOK_URL
}

export const istTestUrl = (url: string) => url.includes('/webhook-test/')

/**
 * Testversion: Hat die Anfrage den Webhook erreicht, auch wenn der Workflow nicht mit { "ok": true } antwortete?
 * Ja bei einer Antwort mit Status 2xx (z. B. „Workflow was started“) oder 5xx (Workflow nach dem Webhook gescheitert).
 * Nein, wenn keine Antwort kam, der Webhook unbekannt ist (404/405) oder n8n die Anfrage ausdrücklich abgewiesen hat (4xx).
 * Dann gilt sie in der Testversion als gesendet; die rote Fehlermeldung bleibt nur für Fälle, in denen nichts ankam.
 */
export function hatWebhookErreicht(d: SendeDetails, antwort: Antwort): boolean {
  if (antwort.art !== 'fehler' || d.status === null) return false
  return d.status < 400 || d.status >= 500
}

export interface Einordnung {
  stufe: 'ok' | 'warnung' | 'fehler'
  text: string
}

function jsonOderNull(text: string | null): Record<string, unknown> | null {
  try {
    const wert: unknown = JSON.parse(text ?? '')
    return typeof wert === 'object' && wert !== null ? (wert as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Übersetzt das Ergebnis des Sendens in einen Satz, der sagt, woran es liegt und was zu tun ist */
export function ordneEin(d: SendeDetails): Einordnung {
  const test = istTestUrl(d.url)
  if (d.fehler === 'nicht_eingerichtet') {
    return { stufe: 'fehler', text: 'Es ist keine Webhook-URL eingebaut (VITE_BESTELL_WEBHOOK_URL fehlt beim Bauen).' }
  }
  if (d.fehler === 'zeitlimit') {
    return { stufe: 'fehler', text: 'n8n hat nicht innerhalb von 10 Sekunden geantwortet. Prüfe in n8n unter Executions, ob die Anfrage dort ankam und wo der Workflow hängt.' }
  }
  if (d.fehler === 'netzwerk') {
    return {
      stufe: 'fehler',
      text: 'Keine Antwort lesbar. Entweder gibt es keine Verbindung zu n8n, oder der Browser hat die Antwort blockiert (CORS). Schau in n8n unter Executions, ob die Anfrage angekommen ist. Wenn ja, fehlt am Node Webhook unter Options → Allowed Origins der Eintrag * (oder die Adresse dieser Seite).',
    }
  }
  const body = jsonOderNull(d.antwortText)
  if (d.status === 404) {
    return {
      stufe: 'fehler',
      text: test
        ? 'n8n kennt diese Test-Adresse gerade nicht. Im Node Webhook auf „Listen for test event“ klicken und danach sofort erneut senden (die Test-Adresse gilt nur für eine Anfrage).'
        : 'n8n kennt diese Produktions-Adresse nicht: Der Workflow ist nicht veröffentlicht. In n8n „Publish“ klicken, oder oben das Ziel „Test“ wählen und im Node Webhook „Listen for test event“ nutzen.',
    }
  }
  if (d.status !== null && d.status < 300 && !(body && typeof body.ok === 'boolean')) {
    return {
      stufe: 'ok',
      text: `n8n hat die Anfrage angenommen (HTTP ${d.status}). Die Antwort hat nicht das Format { "ok": true }, das die Seite im Salon erwartet. Bei einem einfachen Test-Webhook ist das normal. Die Daten stehen in n8n unter Executions.`,
    }
  }
  if (d.status !== null && d.status >= 500) {
    return {
      stufe: 'fehler',
      text: 'n8n hat die Anfrage angenommen, aber der Workflow ist mit einem Fehler beendet (häufig: Telegram- oder Supabase-Credential fehlt, Chat-ID nicht eingetragen). Die Anfrage ist in n8n unter Executions zu sehen, dort steht der Fehler beim betroffenen Node.',
    }
  }
  if (body && body.ok === true) {
    return {
      stufe: 'ok',
      text: test
        ? 'n8n hat die Anfrage angenommen und beantwortet. Die Daten stehen jetzt im Node Webhook (Test-Ausführung).'
        : 'n8n hat die Anfrage angenommen und beantwortet. Sie steht in n8n unter Executions.',
    }
  }
  if (body && body.ok === false && body.grund === 'gesperrt') {
    return { stufe: 'warnung', text: 'n8n hat die Anfrage angenommen, aber wegen der Sperre je Platz nicht weitergeleitet (Antwort „gesperrt“). Anderen Platz wählen oder die Wartezeit abwarten.' }
  }
  if (body && body.ok === false) {
    return { stufe: 'fehler', text: `n8n hat die Anfrage angenommen, aber abgewiesen (grund: ${String(body.grund)}). Die Bedeutung steht in n8n/README.md.` }
  }
  return { stufe: 'fehler', text: `Unerwartete Antwort von n8n (HTTP ${d.status}). Prüfe in n8n unter Executions, was der Workflow geantwortet hat.` }
}
