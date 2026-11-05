// Logik der Edge Function `analyse-erstellen` (Erweiterung E, Version 1.3): reines TypeScript ohne Deno-Bezug,
// damit sie sich mit Node testen lässt (analyse.test.ts). index.ts verdrahtet sie nur mit Deno.serve.
//
// Aufgaben (Feld `aufgabe` der Anfrage):
//   person   Einzelanalyse für eine Person (Standard, wie bisher)
//   alle     Sammellauf: die Einzelanalysen aller Personen eines Monats, die noch keine haben (in Paketen)
//   gesamt   Gesamtauswertung des Teams
//   agenda   Agenda fürs Teammeeting, von der KI formuliert (die Vorlage ohne KI bleibt daneben bestehen)
//
// Alle Zahlen kommen aus SQL, die KI formuliert nur den Text. Die Datenbank baut die Eingabe (ohne Namen),
// prüft jede Zahl im Text gegen die Eingabe (Faktencheck) und ermittelt „geprueft“ selbst. Diese Function
// hat keinen service_role-Schlüssel: Sie ruft die Funktionen im Namen der angemeldeten Person auf (nur Admin,
// solange salons.ki_nur_admin an ist; das prüft die Datenbank).
//
// Standardmäßig (ohne AI_PROVIDER) geht alles an EINEN Webhook (n8n, Adresse fest im Code: STANDARD_WEBHOOK_URL). Dort entscheidet das Feld `aufgabe`, welcher Strang
// die Anfrage bearbeitet; die Antwort geht direkt als Antwort des Webhooks zurück an diese Function, die sie prüfen
// und speichern lässt.

/** Wer einen Prompt ändert, erhöht die Version: dann gilt die Eingabe als neu und die KI wird erneut gefragt. */
export const PROMPT_VERSION = 'analyse-v1'
export const PROMPT_VERSION_GESAMT = 'gesamt-v1'
export const PROMPT_VERSION_AGENDA = 'agenda-ki-v1'

/** Höchstens so viele KI-Aufrufe je Analyse (ein erster Versuch und bis zu zwei Wiederholungen). */
export const MAX_AUFRUFE = 3

/**
 * Wie viele Personen ein Aufruf des Sammellaufs höchstens bearbeitet (die Oberfläche ruft so lange auf, bis alle fertig sind).
 * n8n Cloud beendet Anfragen nach etwa 100 Sekunden und der Agent arbeitet die Aufträge nacheinander ab: zwei Personen passen sicher hinein.
 */
export const PAKET_GROESSE = 2

/** Gesamtzeit für eine Anfrage. Die Edge Function antwortet spätestens nach 150 Sekunden, sonst bricht Supabase ab. */
export const ZEITBUDGET_MS = 135_000
const MIN_RUNDE_MS = 20_000
const MAX_KI_ZEIT_MS = 120_000

export const AUFGABE_EINZEL = 'einzelanalyse'
export const AUFGABE_GESAMT = 'gesamtauswertung'
export const AUFGABE_AGENDA = 'agenda'

// Branche: Friseursalon. Für einen anderen Salontyp den ersten Satz anpassen und PROMPT_VERSION erhöhen.
export const SYSTEM_PROMPT = `Du unterstützt die Leitung eines Friseursalons bei Mitarbeitergesprächen. Du bekommst die Auswertung einer Feedback-Umfrage (Selbstbild und Fremdbild, Noten von 1 bis 5) für eine Person. Alle Namen sind entfernt: Die bewertete Person heißt „die bewertete Person“, andere heißen „Kollege A“, „Kollege B“ und so weiter.

Formuliere daraus eine sachliche, wertschätzende Gesprächsgrundlage auf Deutsch.

Regeln:
- Verwende ausschließlich Zahlen, die in den Daten stehen (Noten, Differenzen, Veränderungen, Anzahlen, Monat und Jahr). Rechne nichts selbst nach, runde nicht anders und erfinde keine Prozentwerte. Schreibe Zahlen im deutschen Format mit Komma, so wie in den Daten.
- Nenne keine Namen und keine Buchstaben-Bezeichnungen wie „Kollege A“. Schreibe stattdessen „die Person“ oder „ein Kollege“. Verwende keine Pronomen wie „sie“ oder „er“ für die Person.
- Gib Kommentare nur sinngemäß wieder und erfinde keine. Zitiere keine Kommentare wörtlich, wenn sie Namen oder Details verraten könnten, wer sie geschrieben hat.
- Fehlen Daten (zum Beispiel kein Fremdbild oder kein Vormonat), sage das offen.
- Keine Aussagen zu Gehalt, Kündigung, Gesundheit oder Recht. Keine Bewertung der Person als Mensch, nur des beobachteten Verhaltens.
- Schreibe kurz und konkret. Die Leitung liest den Entwurf, bearbeitet ihn und gibt ihn frei.

Antworte ausschließlich mit einem JSON-Objekt, ohne weiteren Text und ohne Code-Block, mit genau diesen Schlüsseln:
{
  "zusammenfassung": "2 bis 4 Sätze",
  "staerken": ["2 bis 4 Punkte"],
  "entwicklungsfelder": ["2 bis 4 Punkte"],
  "gespraechsfragen": ["3 bis 4 offene Fragen für das Gespräch"],
  "vereinbarungen_vorschlaege": ["2 bis 3 konkrete Vorschläge"],
  "kommentar_qualitaet_hinweis": "ein Satz, falls Kommentare auffallend kurz oder unspezifisch sind, sonst null"
}`

export const SYSTEM_PROMPT_GESAMT = `Du unterstützt die Leitung eines Friseursalons bei der Vorbereitung eines Teamgesprächs. Du bekommst die Auswertung einer Feedback-Umfrage (Selbstbild und Fremdbild, Noten von 1 bis 5) für das gesamte Team in einem Monat. Es gibt nur Teamwerte: keine Namen, keine Einzelpersonen und keine Kommentartexte.

Formuliere daraus eine sachliche, wertschätzende Auswertung für die Leitung auf Deutsch.

Regeln:
- Verwende ausschließlich Zahlen, die in den Daten stehen (Noten, Differenzen, Veränderungen, Anzahlen, Monat und Jahr). Rechne nichts selbst nach, runde nicht anders und erfinde keine Prozentwerte. Schreibe Zahlen im deutschen Format mit Komma, so wie in den Daten.
- Sprich vom „Team“. Leite nichts über einzelne Personen ab, auch nicht aus der Beteiligung oder aus der Zahl der Kommentare.
- Beschreibe Verhalten mit der Nummer und dem Titel aus den Daten.
- Fehlen Daten (zum Beispiel kein Vormonat oder eine geringe Beteiligung), sage das offen.
- Keine Aussagen zu Gehalt, Kündigung, Gesundheit oder Recht.
- Schreibe kurz und konkret. Die Leitung liest den Entwurf, bearbeitet ihn und gibt ihn frei.

Antworte ausschließlich mit einem JSON-Objekt, ohne weiteren Text und ohne Code-Block, mit genau diesen Schlüsseln:
{
  "zusammenfassung": "2 bis 4 Sätze",
  "staerken": ["2 bis 4 Punkte"],
  "entwicklungsfelder": ["2 bis 4 Punkte"],
  "gespraechsfragen": ["3 bis 4 offene Fragen für das Teamgespräch"],
  "vereinbarungen_vorschlaege": ["2 bis 3 konkrete Vorschläge"],
  "datenlage_hinweis": "ein Satz, falls die Datenlage dünn ist (geringe Beteiligung, kein Vormonat, kaum Kommentare), sonst null"
}`

export const SYSTEM_PROMPT_AGENDA = `Du unterstützt die Leitung eines Friseursalons bei der Vorbereitung des nächsten Teammeetings (15 bis 20 Minuten). Du bekommst die Auswertung der Feedback-Umfrage des Monats für das gesamte Team (Selbstbild und Fremdbild, Noten von 1 bis 5), die aktuellen Fokus-Verhalten und das Zeitbudget je Block. Es gibt nur Teamwerte: keine Namen, keine Einzelpersonen und keine Kommentartexte.

Erstelle daraus die Agenda für das Meeting auf Deutsch mit genau fünf Blöcken in dieser Reihenfolge: einstieg, kennzahlen, fokus, entwicklung, vereinbarungen. Je Block gibst du die Minuten an (eine ganze Zahl zwischen min und max aus dem Zeitbudget) und die Gesprächspunkte.

Regeln:
- Verwende ausschließlich Zahlen, die in den Daten stehen (Noten, Differenzen, Veränderungen, Anzahlen, Monat und Jahr). Rechne nichts selbst nach, runde nicht anders und erfinde keine Prozentwerte. Schreibe Zahlen im deutschen Format mit Komma, so wie in den Daten.
- einstieg: Dank an das Team und die Beteiligung (abgegeben von erwartet).
- kennzahlen: Selbstbild, Fremdbild und Differenz des Teams, die Einordnung und, wenn vorhanden, der Vergleich zum Vormonat.
- fokus: zuerst die Fokus-Verhalten (fokus_aktuell), danach die größten Differenzen und Veränderungen. Höchstens drei Verhalten insgesamt. Nenne die Nummer und den Titel. Gibt es kein Fokus-Verhalten und keine Auffälligkeiten, sage das und schlage vor, gemeinsam eines festzulegen.
- entwicklung: die Entwicklungsfelder (niedrigste Fremdbilder), ohne Wiederholung aus dem Fokus-Block.
- vereinbarungen: offene Leitfragen: Was nehmen wir uns vor? Wer übernimmt welchen Schritt? Woran merken wir, dass es besser wird?
- Jeder Punkt ist ein kurzer, in sich verständlicher Satz (höchstens 300 Zeichen), je Block zwei bis vier Punkte. Keine Nummerierung.
- Sprich vom „Team“. Leite nichts über einzelne Personen ab, auch nicht aus der Beteiligung. Keine Namen, keine Aussagen zu Gehalt, Kündigung, Gesundheit oder Recht.
- Fehlen Daten (zum Beispiel kein Vormonat oder eine geringe Beteiligung), sage das offen.

Antworte ausschließlich mit einem JSON-Objekt, ohne weiteren Text und ohne Code-Block, in genau dieser Form (die Minuten sind Beispiele):
{
  "bloecke": [
    { "id": "einstieg", "minuten": 2, "punkte": ["…"] },
    { "id": "kennzahlen", "minuten": 3, "punkte": ["…"] },
    { "id": "fokus", "minuten": 7, "punkte": ["…"] },
    { "id": "entwicklung", "minuten": 4, "punkte": ["…"] },
    { "id": "vereinbarungen", "minuten": 2, "punkte": ["…"] }
  ]
}`

export interface Ausgabe {
  zusammenfassung: string
  staerken: string[]
  entwicklungsfelder: string[]
  gespraechsfragen: string[]
  vereinbarungen_vorschlaege: string[]
  kommentar_qualitaet_hinweis: string | null
}

export interface GesamtAusgabe {
  zusammenfassung: string
  staerken: string[]
  entwicklungsfelder: string[]
  gespraechsfragen: string[]
  vereinbarungen_vorschlaege: string[]
  datenlage_hinweis: string | null
}

export class AnalyseFehler extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'AnalyseFehler'
    this.status = status
  }
}

// ---- Ausgabe der KI lesen und in Text umwandeln ---------------------------------------------------------------

function ersteJsonStelle(text: string): unknown {
  const ohneZaun = text.replace(/```(?:json)?/gi, '')
  try {
    return JSON.parse(ohneZaun.trim())
  } catch {
    // weiter: das erste vollständige {...} suchen
  }
  const start = ohneZaun.indexOf('{')
  if (start < 0) throw new Error('kein JSON')
  let tiefe = 0
  let inText = false
  let escape = false
  for (let i = start; i < ohneZaun.length; i++) {
    const c = ohneZaun[i]
    if (inText) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') inText = false
    } else if (c === '"') inText = true
    else if (c === '{') tiefe++
    else if (c === '}' && --tiefe === 0) return JSON.parse(ohneZaun.slice(start, i + 1))
  }
  throw new Error('JSON unvollständig')
}

const kurz = (t: string) => t.replace(/\s+/g, ' ').trim()

function liste(wert: unknown, name: string): string[] {
  if (!Array.isArray(wert)) throw new Error(`${name} ist keine Liste`)
  const punkte = wert.filter((x): x is string => typeof x === 'string').map(kurz).filter(Boolean)
  if (punkte.length === 0) throw new Error(`${name} ist leer`)
  return punkte
}

/** Gemeinsamer Kern beider Ausgaben: fünf Teile und ein Hinweis unter dem angegebenen Schlüssel. */
function leseAusgabe(roh: unknown, hinweisSchluessel: string) {
  const o = typeof roh === 'string' ? ersteJsonStelle(roh) : roh
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('keine Objekt-Antwort')
  const r = o as Record<string, unknown>
  if (typeof r.zusammenfassung !== 'string' || !kurz(r.zusammenfassung)) throw new Error('zusammenfassung fehlt')
  const hinweis = typeof r[hinweisSchluessel] === 'string' ? kurz(r[hinweisSchluessel] as string) : ''
  return {
    zusammenfassung: kurz(r.zusammenfassung),
    staerken: liste(r.staerken, 'staerken'),
    entwicklungsfelder: liste(r.entwicklungsfelder, 'entwicklungsfelder'),
    gespraechsfragen: liste(r.gespraechsfragen, 'gespraechsfragen'),
    vereinbarungen_vorschlaege: liste(r.vereinbarungen_vorschlaege, 'vereinbarungen_vorschlaege'),
    hinweis: hinweis && hinweis.toLowerCase() !== 'null' ? hinweis : null,
  }
}

/** Liest die Antwort der KI (Text oder Objekt) und prüft die Form. Wirft bei Abweichung. */
export function parseAusgabe(roh: unknown): Ausgabe {
  const { hinweis, ...kern } = leseAusgabe(roh, 'kommentar_qualitaet_hinweis')
  return { ...kern, kommentar_qualitaet_hinweis: hinweis }
}

/** Wie parseAusgabe, für die Gesamtauswertung (Hinweis zur Datenlage). */
export function parseGesamtAusgabe(roh: unknown): GesamtAusgabe {
  const { hinweis, ...kern } = leseAusgabe(roh, 'datenlage_hinweis')
  return { ...kern, datenlage_hinweis: hinweis }
}

const punkte = (l: string[]) => l.map((p) => `- ${p}`).join('\n')

/** Der Text, den die Leitung liest, bearbeitet und freigibt (Markdown, nur Überschriften und Aufzählungen). */
export function textAusAusgabe(a: Ausgabe): string {
  const teile = [
    `## Zusammenfassung\n${a.zusammenfassung}`,
    `## Stärken\n${punkte(a.staerken)}`,
    `## Entwicklungsfelder\n${punkte(a.entwicklungsfelder)}`,
    `## Fragen für das Gespräch\n${punkte(a.gespraechsfragen)}`,
    `## Vorschläge für Vereinbarungen\n${punkte(a.vereinbarungen_vorschlaege)}`,
  ]
  if (a.kommentar_qualitaet_hinweis) teile.push(`## Hinweis zu den Kommentaren\n${a.kommentar_qualitaet_hinweis}`)
  return teile.join('\n\n')
}

export function textAusGesamt(a: GesamtAusgabe): string {
  const teile = [
    `## Zusammenfassung\n${a.zusammenfassung}`,
    `## Stärken des Teams\n${punkte(a.staerken)}`,
    `## Entwicklungsfelder des Teams\n${punkte(a.entwicklungsfelder)}`,
    `## Fragen für das Teamgespräch\n${punkte(a.gespraechsfragen)}`,
    `## Vorschläge für Vereinbarungen\n${punkte(a.vereinbarungen_vorschlaege)}`,
  ]
  if (a.datenlage_hinweis) teile.push(`## Hinweis zur Datenlage\n${a.datenlage_hinweis}`)
  return teile.join('\n\n')
}

export const BLOCK_IDS = ['einstieg', 'kennzahlen', 'fokus', 'entwicklung', 'vereinbarungen'] as const

export interface AgendaAusgabe {
  bloecke: { id: string; minuten: number; punkte: string[] }[]
}

/**
 * Liest die Agenda der KI: fünf Blöcke in fester Reihenfolge mit Minuten und Punkten. Ob die Minuten ins Zeitbudget passen,
 * prüft die Datenbank verbindlich (mit einer Meldung, die an die KI zurückgeht); hier nur die Form.
 */
export function parseAgendaAusgabe(roh: unknown): AgendaAusgabe {
  const o = typeof roh === 'string' ? ersteJsonStelle(roh) : roh
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('keine Objekt-Antwort')
  const b = (o as Record<string, unknown>).bloecke
  if (!Array.isArray(b) || b.length !== BLOCK_IDS.length) throw new Error('bloecke: fünf Blöcke erwartet')
  const bloecke = b.map((x, i) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error(`Block ${i + 1} ist kein Objekt`)
    const r = x as Record<string, unknown>
    if (r.id !== BLOCK_IDS[i]) throw new Error(`Block ${i + 1}: id „${BLOCK_IDS[i]}“ erwartet`)
    const minuten = typeof r.minuten === 'string' && r.minuten.trim() !== '' ? Number(r.minuten.replace(',', '.')) : r.minuten
    if (typeof minuten !== 'number' || !Number.isFinite(minuten)) throw new Error(`Block ${r.id}: minuten fehlt`)
    const punkte = (Array.isArray(r.punkte) ? r.punkte : [])
      .map((p) => (typeof p === 'string' ? p : p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : ''))
      .map(kurz)
      .filter(Boolean)
    if (punkte.length === 0) throw new Error(`Block ${r.id}: punkte ist leer`)
    return { id: String(r.id), minuten, punkte }
  })
  return { bloecke }
}

/** Der Text der Agenda für die Anzeige im Protokoll: eine Zeile je Punkt */
export function textAusAgenda(a: AgendaAusgabe): string {
  return a.bloecke.flatMap((b) => b.punkte).join('\n')
}

/** Die Nachricht an die KI. Bei einer Wiederholung steht oben, was beim letzten Mal nicht stimmte. */
export function baueNachricht(eingabe: unknown, korrektur?: string): string {
  const kopf = korrektur ? `${korrektur}\n\n` : ''
  return `${kopf}Daten (JSON):\n${JSON.stringify(eingabe)}`
}

// ---- Anbieter ---------------------------------------------------------------------------------------------------

export interface AnbieterConfig {
  name: 'claude' | 'webhook'
  modell: string | null
  schluessel?: string
  url?: string
  geheimnis?: string
}

export const NICHT_EINGERICHTET = 'Die KI ist noch nicht eingerichtet.'
const STANDARD_MODELL = 'claude-sonnet-5-5'

/**
 * Der n8n-Webhook, an den alle KI-Aufgaben gehen (Production URL, Strang je nach Feld `aufgabe`). Die Adresse ist kein Geheimnis,
 * deshalb steht sie hier im Code und nicht in den Secrets. Gilt, solange AI_WEBHOOK_URL nicht gesetzt ist.
 */
export const STANDARD_WEBHOOK_URL = 'https://tobitest2008.app.n8n.cloud/webhook/dawiid-ki'

/**
 * Liest die Einstellungen. Ohne jede Einstellung geht alles an den n8n-Webhook oben (der Standard); „claude“ ruft die Anthropic-API
 * direkt (braucht ANTHROPIC_API_KEY). Das Geheimnis AI_WEBHOOK_SECRET gehört nicht in den Code: Es ist optional und kommt aus den Secrets.
 * Ungültig (kein https, Claude ohne Schlüssel, unbekannter Anbieter): 503 „Die KI ist noch nicht eingerichtet.“
 */
export function anbieterAusUmgebung(env: Record<string, string | undefined>): AnbieterConfig {
  const name = (env.AI_PROVIDER ?? '').trim().toLowerCase() || 'webhook'
  if (name === 'claude') {
    const schluessel = (env.ANTHROPIC_API_KEY ?? '').trim()
    if (!schluessel) throw new AnalyseFehler(NICHT_EINGERICHTET, 503)
    return { name: 'claude', modell: (env.ANTHROPIC_MODEL ?? '').trim() || STANDARD_MODELL, schluessel }
  }
  if (name === 'webhook') {
    const url = (env.AI_WEBHOOK_URL ?? '').trim() || STANDARD_WEBHOOK_URL
    if (!/^https:\/\//i.test(url)) throw new AnalyseFehler(NICHT_EINGERICHTET, 503)
    return { name: 'webhook', modell: null, url, geheimnis: (env.AI_WEBHOOK_SECRET ?? '').trim() || undefined }
  }
  throw new AnalyseFehler(NICHT_EINGERICHTET, 503)
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

const KEINE_ANTWORT = 'Die KI hat nicht geantwortet. Bitte später erneut versuchen.'

async function anfrage(fetchFn: FetchFn, url: string, init: RequestInit, timeoutMs = 90_000): Promise<Response> {
  let antwort: Response
  try {
    antwort = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    throw new AnalyseFehler(KEINE_ANTWORT, 502)
  }
  if (antwort.status === 401 || antwort.status === 403) {
    throw new AnalyseFehler('Der KI-Zugang wurde abgelehnt. Bitte den Schlüssel in den Secrets prüfen.', 502)
  }
  if (antwort.status === 429) {
    throw new AnalyseFehler('Die KI ist gerade ausgelastet. Bitte in ein paar Minuten erneut versuchen.', 503)
  }
  if (!antwort.ok) throw new AnalyseFehler(KEINE_ANTWORT, 502)
  return antwort
}

/** Ein Auftrag an die KI. `ref` ordnet die Antwort zu; es ist nie eine Kennung aus der Datenbank. */
export interface Auftrag {
  ref: string
  system: string
  nachricht: string
  eingabe: unknown
}

export type KiAntwort = { roh: unknown } | { fehler: AnalyseFehler }

export interface AnbieterOptionen {
  /** Standard: der Prompt der Einzelanalyse */
  system?: string
  promptVersion?: string
  /** Welcher Strang im Webhook die Anfrage bearbeitet. Standard: einzelanalyse */
  aufgabe?: string
  timeoutMs?: number
}

async function rufeClaude(config: AnbieterConfig, a: Auftrag, fetchFn: FetchFn, timeoutMs: number): Promise<unknown> {
  const antwort = await anfrage(fetchFn, 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.schluessel ?? '', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: config.modell,
      max_tokens: 2000,
      system: a.system,
      messages: [{ role: 'user', content: a.nachricht }],
    }),
  }, timeoutMs)
  const daten = (await antwort.json().catch(() => null)) as { content?: { type?: string; text?: string }[] } | null
  const text = (daten?.content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('')
  if (!text) throw new AnalyseFehler(KEINE_ANTWORT, 502)
  return text
}

const WEBHOOK_FELDER = ['ausgabe', 'output', 'text', 'antwort']

function ausgabeAusFeldern(daten: Record<string, unknown>): unknown {
  for (const feld of WEBHOOK_FELDER) {
    if (daten[feld] !== undefined && daten[feld] !== null) return daten[feld]
  }
  return undefined
}

/**
 * Mehrere Aufträge einer Aufgabe. Claude direkt: ein Aufruf je Auftrag, gleichzeitig. Webhook: EIN Aufruf mit allen Aufträgen,
 *   Anfrage:  { aufgabe, prompt_version, auftraege: [{ ref, system, nachricht, eingabe }] }
 *   Antwort:  { ergebnisse: [{ ref, code?, ausgabe | fehler }] }
 * Fehler des Anbieters für die ganze Anfrage (Zugang, Auslastung, Zeitüberschreitung) werden geworfen, Fehler einzelner
 * Aufträge kommen als { fehler } zurück.
 */
export async function rufeAnbieterBatch(
  config: AnbieterConfig, aufgabe: string, promptVersion: string, auftraege: Auftrag[], fetchFn: FetchFn, optionen: { timeoutMs?: number } = {},
): Promise<Record<string, KiAntwort>> {
  const timeoutMs = optionen.timeoutMs ?? 90_000
  const ergebnis: Record<string, KiAntwort> = {}

  if (config.name === 'claude') {
    await Promise.all(auftraege.map(async (a) => {
      try {
        ergebnis[a.ref] = { roh: await rufeClaude(config, a, fetchFn, timeoutMs) }
      } catch (e) {
        ergebnis[a.ref] = { fehler: e instanceof AnalyseFehler ? e : new AnalyseFehler(KEINE_ANTWORT, 502) }
      }
    }))
    return ergebnis
  }

  const antwort = await anfrage(fetchFn, config.url ?? '', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.geheimnis ? { authorization: `Bearer ${config.geheimnis}`, 'x-webhook-secret': config.geheimnis } : {}),
    },
    body: JSON.stringify({
      aufgabe,
      prompt_version: promptVersion,
      auftraege: auftraege.map(({ ref, system, nachricht, eingabe }) => ({ ref, system, nachricht, eingabe })),
    }),
  }, timeoutMs)
  const daten = (await antwort.json().catch(() => null)) as Record<string, unknown> | null
  if (!daten || typeof daten !== 'object') throw new AnalyseFehler(KEINE_ANTWORT, 502)

  if (Array.isArray(daten.ergebnisse)) {
    for (const e of daten.ergebnisse as Record<string, unknown>[]) {
      if (!e || typeof e !== 'object' || typeof e.ref !== 'string') continue
      const code = typeof e.code === 'number' ? e.code : 200
      const roh = ausgabeAusFeldern(e)
      ergebnis[e.ref] = code >= 400 || e.fehler || roh === undefined
        ? { fehler: new AnalyseFehler(KEINE_ANTWORT, code === 429 ? 503 : 502) }
        : { roh }
    }
  } else if (auftraege.length === 1) {
    // ältere Webhooks antworten direkt oder verpackt
    ergebnis[auftraege[0].ref] = { roh: ausgabeAusFeldern(daten) ?? daten }
  }
  for (const a of auftraege) {
    ergebnis[a.ref] ??= { fehler: new AnalyseFehler(KEINE_ANTWORT, 502) }
  }
  return ergebnis
}

/** Ein KI-Aufruf. Liefert die rohe Antwort (Text oder Objekt); parseAusgabe prüft sie. */
export async function rufeAnbieter(
  config: AnbieterConfig, nachricht: string, eingabe: unknown, fetchFn: FetchFn, optionen: AnbieterOptionen = {},
): Promise<unknown> {
  const a: Auftrag = { ref: '1', system: optionen.system ?? SYSTEM_PROMPT, nachricht, eingabe }
  const r = (await rufeAnbieterBatch(
    config, optionen.aufgabe ?? AUFGABE_EINZEL, optionen.promptVersion ?? PROMPT_VERSION, [a], fetchFn, { timeoutMs: optionen.timeoutMs },
  ))['1']
  if ('fehler' in r) throw r.fehler
  return r.roh
}

// ---- Ablauf ---------------------------------------------------------------------------------------------------

export interface RpcAntwort {
  data: unknown
  error: { code?: string; message: string } | null
}

export interface Abhaengigkeiten {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcAntwort>
  /** Wirft 503, wenn die KI nicht eingerichtet ist; wird nur gerufen, wenn wirklich ein KI-Aufruf nötig ist. */
  anbieter: () => AnbieterConfig
  ki: (config: AnbieterConfig, nachricht: string, eingabe: unknown, optionen?: AnbieterOptionen) => Promise<unknown>
  /** Mehrere Aufträge auf einmal. Fehlt sie, wird `ki` je Auftrag gerufen. */
  kiBatch?: (
    config: AnbieterConfig, aufgabe: string, promptVersion: string, auftraege: Auftrag[], optionen: { timeoutMs: number },
  ) => Promise<Record<string, KiAntwort>>
  /** Für Tests: die Uhr */
  jetzt?: () => number
}

export interface Ergebnis {
  uebersprungen: boolean
  versuche: number
  analyse: unknown
}

function fehlerAusRpc(e: { code?: string; message: string }): AnalyseFehler {
  if (e.code === '42501' && /permission denied/i.test(e.message)) return new AnalyseFehler('Bitte melde dich an.', 401)
  if (e.code === '42501') return new AnalyseFehler(e.message, 403)
  if (e.code === '22023') return new AnalyseFehler(e.message, 422)
  return new AnalyseFehler('Die Analyse konnte nicht erstellt werden.', 500)
}

async function rpcOderFehler(d: Abhaengigkeiten, name: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await d.rpc(name, args)
  if (r.error) throw fehlerAusRpc(r.error)
  return r.data
}

/** Ein Ziel ist eine Analyse, die entstehen soll: ihre Eingabe, ihr Prompt und wie ihre Ausgabe gelesen und geprüft wird. */
export interface Ziel {
  schluessel: string
  system: string
  eingabe: unknown
  parse: (roh: unknown) => { ausgabe: unknown; text: string }
  /** `korrektur`: der Hinweis an die KI bei der Wiederholung (sonst die Liste der Zahlen, die nicht in den Daten stehen) */
  pruefen: (text: string, ausgabe: unknown) => Promise<{ geprueft: boolean; abweichungen?: string[]; korrektur?: string }>
}

export type ZielErgebnis = { ok: true; text: string; ausgabe: unknown; versuche: number } | { ok: false; fehler: AnalyseFehler }

const KEIN_JSON = 'Deine letzte Antwort war kein gültiges JSON im vorgegebenen Format. Antworte nur mit dem JSON-Objekt und allen Schlüsseln.'

/**
 * Alle Ziele einer Aufgabe in Runden: Jede Runde schickt die noch offenen Ziele gemeinsam an die KI (bei einem Webhook in
 * einem Aufruf). Stimmt die Form nicht oder der Faktencheck nicht, kommt das Ziel in die nächste Runde, mit Hinweis.
 * Höchstens MAX_AUFRUFE Runden und höchstens ZEITBUDGET_MS. Die letzte lesbare Fassung zählt auch ohne bestandenen Faktencheck.
 * Scheitern in einer Runde alle Aufträge am Anbieter, wird dessen Fehler geworfen.
 */
export async function arbeiteZiele(
  d: Abhaengigkeiten, config: AnbieterConfig, aufgabe: string, promptVersion: string, ziele: Ziel[],
): Promise<Map<string, ZielErgebnis>> {
  const jetzt = d.jetzt ?? Date.now
  const start = jetzt()
  const kiBatch: NonNullable<Abhaengigkeiten['kiBatch']> =
    d.kiBatch ??
    (async (c, a, v, auftraege, o) => {
      const r: Record<string, KiAntwort> = {}
      await Promise.all(auftraege.map(async (x) => {
        try {
          r[x.ref] = { roh: await d.ki(c, x.nachricht, x.eingabe, { system: x.system, promptVersion: v, aufgabe: a, timeoutMs: o.timeoutMs }) }
        } catch (e) {
          r[x.ref] = { fehler: e instanceof AnalyseFehler ? e : new AnalyseFehler(KEINE_ANTWORT, 502) }
        }
      }))
      return r
    })

  interface Stand {
    ziel: Ziel
    ref: string
    korrektur?: string
    letzte: { ausgabe: unknown; text: string } | null
    aufrufe: number
    fehler: AnalyseFehler | null
    fertig: boolean
  }
  const staende: Stand[] = ziele.map((ziel, i) => ({ ziel, ref: String(i + 1), letzte: null, aufrufe: 0, fehler: null, fertig: false }))
  let offen = staende.filter((s) => !s.fertig)

  for (let runde = 0; offen.length > 0 && runde < MAX_AUFRUFE; runde++) {
    const uebrig = ZEITBUDGET_MS - (jetzt() - start)
    if (runde > 0 && uebrig < MIN_RUNDE_MS) break
    const timeoutMs = Math.max(10_000, Math.min(MAX_KI_ZEIT_MS, uebrig - 5_000))

    const auftraege: Auftrag[] = offen.map((s) => ({
      ref: s.ref, system: s.ziel.system, nachricht: baueNachricht(s.ziel.eingabe, s.korrektur), eingabe: s.ziel.eingabe,
    }))
    const antworten = await kiBatch(config, aufgabe, promptVersion, auftraege, { timeoutMs })

    const fehlgeschlagen = offen.map((s) => antworten[s.ref]).filter((a): a is { fehler: AnalyseFehler } => !a || 'fehler' in a)
    if (fehlgeschlagen.length === offen.length) {
      // Der Anbieter hat in dieser Runde für niemanden geliefert. Gibt es überall schon eine lesbare Fassung, zählt sie.
      if (offen.every((s) => s.letzte)) break
      throw fehlgeschlagen[0]?.fehler ?? new AnalyseFehler(KEINE_ANTWORT, 502)
    }

    const weiter: Stand[] = []
    for (const s of offen) {
      s.aufrufe++
      const a = antworten[s.ref]
      if (!a || 'fehler' in a) {
        s.fehler = a?.fehler ?? new AnalyseFehler(KEINE_ANTWORT, 502)
        weiter.push(s)
        continue
      }
      let gelesen: { ausgabe: unknown; text: string }
      try {
        gelesen = s.ziel.parse(a.roh)
      } catch {
        s.korrektur = KEIN_JSON
        weiter.push(s)
        continue
      }
      s.letzte = gelesen
      s.fehler = null
      let pruefung: { geprueft: boolean; abweichungen?: string[]; korrektur?: string }
      try {
        pruefung = await s.ziel.pruefen(gelesen.text, gelesen.ausgabe)
      } catch (e) {
        s.fehler = e instanceof AnalyseFehler ? e : new AnalyseFehler('Die Analyse konnte nicht erstellt werden.', 500)
        s.fertig = true
        s.letzte = null
        continue
      }
      if (pruefung.geprueft) {
        s.fertig = true
        continue
      }
      s.korrektur =
        pruefung.korrektur ??
        `Deine letzte Antwort enthielt Zahlen, die nicht in den Daten stehen: ${(pruefung.abweichungen ?? []).join(', ')}. Formuliere neu und verwende nur Zahlen aus den Daten.`
      weiter.push(s)
    }
    offen = weiter
  }

  const ergebnis = new Map<string, ZielErgebnis>()
  for (const s of staende) {
    if (s.letzte) ergebnis.set(s.ziel.schluessel, { ok: true, text: s.letzte.text, ausgabe: s.letzte.ausgabe, versuche: s.aufrufe })
    else {
      ergebnis.set(s.ziel.schluessel, {
        ok: false,
        fehler: s.fehler ?? new AnalyseFehler('Die KI hat keine verwertbare Antwort geliefert. Bitte später erneut versuchen.', 502),
      })
    }
  }
  return ergebnis
}

// ---- Einzelanalyse (eine Person) --------------------------------------------------------------------------------

function personZiel(d: Abhaengigkeiten, basis: Record<string, unknown>, schluessel: string, eingabe: unknown): Ziel {
  return {
    schluessel,
    system: SYSTEM_PROMPT,
    eingabe,
    parse: (roh) => {
      const a = parseAusgabe(roh)
      return { ausgabe: a, text: textAusAusgabe(a) }
    },
    pruefen: async (text, ausgabe) =>
      (await rpcOderFehler(d, 'analyse_pruefen', { ...basis, p_text: text, p_ausgabe: ausgabe })) as { geprueft: boolean; abweichungen?: string[] },
  }
}

function speichereAnalyse(d: Abhaengigkeiten, basis: Record<string, unknown>, config: AnbieterConfig, r: { text: string; ausgabe: unknown; versuche: number }) {
  return rpcOderFehler(d, 'analyse_speichern', {
    ...basis,
    p_text: r.text,
    p_ausgabe: r.ausgabe,
    p_prompt_version: PROMPT_VERSION,
    p_anbieter: config.name,
    p_modell: config.modell,
    p_versuche: r.versuche,
  })
}

/**
 * Eingabe holen → gleiche Eingabe und Prompt-Version wie gespeichert = kein neuer KI-Aufruf → Anbieter formuliert →
 * Faktencheck über analyse_pruefen → bei Abweichung bis zu zwei Wiederholungen (höchstens MAX_AUFRUFE) → Entwurf speichern.
 * Ein Entwurf mit nicht bestandenem Faktencheck wird trotzdem gespeichert (mit Hinweis): nichts wird verworfen.
 */
export async function erstelleAnalyse(
  d: Abhaengigkeiten,
  p: { personId: string; monat: string; neu: boolean },
): Promise<Ergebnis> {
  const basis = { p_person: p.personId, p_monat: `${p.monat}-01` }

  const eingabeAntwort = (await rpcOderFehler(d, 'analyse_eingabe', basis)) as { eingabe: unknown; hash: string }
  const vorhanden = (await rpcOderFehler(d, 'analyse_lesen', basis)) as { eingabe_hash?: string; prompt_version?: string } | null

  if (vorhanden && !p.neu && vorhanden.eingabe_hash === eingabeAntwort.hash && vorhanden.prompt_version === PROMPT_VERSION) {
    return { uebersprungen: true, versuche: 0, analyse: vorhanden }
  }

  const config = d.anbieter()
  const ziel = personZiel(d, basis, 'person', eingabeAntwort.eingabe)
  const r = (await arbeiteZiele(d, config, AUFGABE_EINZEL, PROMPT_VERSION, [ziel])).get('person')!
  if (!r.ok) throw r.fehler

  const analyse = await speichereAnalyse(d, basis, config, r)
  return { uebersprungen: false, versuche: r.versuche, analyse }
}

// ---- Sammellauf (alle Personen eines Monats) --------------------------------------------------------------------

export interface SammellaufErgebnis {
  erstellt: { person_id: string; versuche: number; geprueft: boolean }[]
  fehlgeschlagen: { person_id: string; fehler: string }[]
  /** Personen ohne Analyse, die in diesem Aufruf nicht mehr drankamen. Größer als 0: die Oberfläche ruft erneut auf. */
  verbleibend: number
}

/**
 * Erstellt die Einzelanalysen für die nächsten PAKET_GROESSE Personen des Monats, die noch keine haben (ohne die
 * ausgenommenen). Die Personenliste kommt aus abschluss_uebersicht: nur Admins bekommen sie mit Analyse-Zuständen.
 */
export async function erstelleAlle(
  d: Abhaengigkeiten,
  p: { monat: string; ausgenommen: string[] },
): Promise<SammellaufErgebnis> {
  const monat = `${p.monat}-01`
  const ue = (await rpcOderFehler(d, 'abschluss_uebersicht', { p_monat: monat })) as {
    ki?: boolean
    abschluss: unknown
    personen: { id: string; name: string; analyse: unknown }[]
  }
  if (ue.ki !== true) throw new AnalyseFehler('Nur für Admins.', 403)
  if (!ue.abschluss) throw new AnalyseFehler('Der Monat ist noch nicht abgeschlossen.', 422)

  const offen = ue.personen.filter((x) => !x.analyse && !p.ausgenommen.includes(x.id))
  const paket = offen.slice(0, PAKET_GROESSE)
  const ergebnis: SammellaufErgebnis = { erstellt: [], fehlgeschlagen: [], verbleibend: offen.length - paket.length }
  if (paket.length === 0) return ergebnis

  const ziele: Ziel[] = []
  const basisVon = new Map<string, Record<string, unknown>>()
  for (const person of paket) {
    const basis = { p_person: person.id, p_monat: monat }
    try {
      const e = (await rpcOderFehler(d, 'analyse_eingabe', basis)) as { eingabe: unknown }
      ziele.push(personZiel(d, basis, person.id, e.eingabe))
      basisVon.set(person.id, basis)
    } catch (e) {
      ergebnis.fehlgeschlagen.push({ person_id: person.id, fehler: e instanceof AnalyseFehler ? e.message : 'Die Analyse konnte nicht erstellt werden.' })
    }
  }
  if (ziele.length === 0) return ergebnis

  const config = d.anbieter()
  const ergebnisse = await arbeiteZiele(d, config, AUFGABE_EINZEL, PROMPT_VERSION, ziele)
  for (const ziel of ziele) {
    const r = ergebnisse.get(ziel.schluessel)!
    if (!r.ok) {
      ergebnis.fehlgeschlagen.push({ person_id: ziel.schluessel, fehler: r.fehler.message })
      continue
    }
    try {
      const gespeichert = (await speichereAnalyse(d, basisVon.get(ziel.schluessel)!, config, r)) as { geprueft?: boolean }
      ergebnis.erstellt.push({ person_id: ziel.schluessel, versuche: r.versuche, geprueft: gespeichert?.geprueft === true })
    } catch (e) {
      ergebnis.fehlgeschlagen.push({ person_id: ziel.schluessel, fehler: e instanceof AnalyseFehler ? e.message : 'Die Analyse konnte nicht erstellt werden.' })
    }
  }
  return ergebnis
}

// ---- Gesamtauswertung (das Team) --------------------------------------------------------------------------------

/** Wie erstelleAnalyse, für die Gesamtauswertung des Teams (nur Teamwerte). */
export async function erstelleGesamt(
  d: Abhaengigkeiten,
  p: { monat: string; neu: boolean },
): Promise<Ergebnis> {
  const basis = { p_monat: `${p.monat}-01` }

  const eingabeAntwort = (await rpcOderFehler(d, 'gesamt_eingabe', basis)) as { eingabe: unknown; hash: string }
  const vorhanden = (await rpcOderFehler(d, 'gesamt_lesen', basis)) as { eingabe_hash?: string; prompt_version?: string } | null

  if (vorhanden && !p.neu && vorhanden.eingabe_hash === eingabeAntwort.hash && vorhanden.prompt_version === PROMPT_VERSION_GESAMT) {
    return { uebersprungen: true, versuche: 0, analyse: vorhanden }
  }

  const config = d.anbieter()
  const ziel: Ziel = {
    schluessel: 'gesamt',
    system: SYSTEM_PROMPT_GESAMT,
    eingabe: eingabeAntwort.eingabe,
    parse: (roh) => {
      const a = parseGesamtAusgabe(roh)
      return { ausgabe: a, text: textAusGesamt(a) }
    },
    pruefen: async (text, ausgabe) =>
      (await rpcOderFehler(d, 'gesamt_pruefen', { ...basis, p_text: text, p_ausgabe: ausgabe })) as { geprueft: boolean; abweichungen?: string[] },
  }
  const r = (await arbeiteZiele(d, config, AUFGABE_GESAMT, PROMPT_VERSION_GESAMT, [ziel])).get('gesamt')!
  if (!r.ok) throw r.fehler

  const analyse = await rpcOderFehler(d, 'gesamt_speichern', {
    ...basis,
    p_text: r.text,
    p_ausgabe: r.ausgabe,
    p_prompt_version: PROMPT_VERSION_GESAMT,
    p_anbieter: config.name,
    p_modell: config.modell,
    p_versuche: r.versuche,
  })
  return { uebersprungen: false, versuche: r.versuche, analyse }
}

// ---- Agenda fürs Teammeeting (von der KI formuliert) -----------------------------------------------------------

/**
 * Wie erstelleGesamt, für die Agenda. Die Datenbank setzt Überschriften und Hinweise „Stand unvollständig“, prüft Aufbau,
 * Zeitbudget (15 bis 20 Minuten) und jede Zahl; ein Fehler im Aufbau geht als Hinweis zurück an die KI.
 * Die Agenda aus der Vorlage (ohne KI) bleibt unberührt, bis dieser Aufruf erfolgreich speichert.
 */
export async function erstelleAgenda(
  d: Abhaengigkeiten,
  p: { monat: string; neu: boolean },
): Promise<Ergebnis> {
  const basis = { p_monat: `${p.monat}-01` }

  const eingabeAntwort = (await rpcOderFehler(d, 'agenda_ki_eingabe', basis)) as { eingabe: unknown; hash: string }
  const vorhanden = (await rpcOderFehler(d, 'agenda_lesen', basis)) as { eingabe_hash?: string; prompt_version?: string; anbieter?: string } | null

  if (
    vorhanden && !p.neu && vorhanden.anbieter !== 'vorlage' &&
    vorhanden.eingabe_hash === eingabeAntwort.hash && vorhanden.prompt_version === PROMPT_VERSION_AGENDA
  ) {
    return { uebersprungen: true, versuche: 0, analyse: vorhanden }
  }

  const config = d.anbieter()
  const ziel: Ziel = {
    schluessel: 'agenda',
    system: SYSTEM_PROMPT_AGENDA,
    eingabe: eingabeAntwort.eingabe,
    parse: (roh) => {
      const a = parseAgendaAusgabe(roh)
      return { ausgabe: a, text: textAusAgenda(a) }
    },
    pruefen: async (_text, ausgabe) => {
      const r = (await rpcOderFehler(d, 'agenda_ki_pruefen', { ...basis, p_bloecke: (ausgabe as AgendaAusgabe).bloecke })) as {
        geprueft: boolean
        abweichungen?: string[]
        struktur_fehler?: string | null
      }
      if (r.struktur_fehler) {
        return {
          geprueft: false,
          korrektur: `Deine letzte Antwort passt nicht zur Vorgabe: ${r.struktur_fehler} Halte dich genau an die fünf Blöcke, ihre Reihenfolge und die Minuten aus dem Zeitbudget.`,
        }
      }
      return { geprueft: r.geprueft, abweichungen: r.abweichungen }
    },
  }
  const r = (await arbeiteZiele(d, config, AUFGABE_AGENDA, PROMPT_VERSION_AGENDA, [ziel])).get('agenda')!
  if (!r.ok) throw r.fehler

  // Passt der Aufbau auch nach der letzten Runde nicht, lehnt die Datenbank beim Speichern mit einer deutschen Meldung ab (422)
  const analyse = await rpcOderFehler(d, 'agenda_ki_speichern', {
    ...basis,
    p_bloecke: (r.ausgabe as AgendaAusgabe).bloecke,
    p_prompt_version: PROMPT_VERSION_AGENDA,
    p_anbieter: config.name,
    p_modell: config.modell,
    p_versuche: r.versuche,
  })
  return { uebersprungen: false, versuche: r.versuche, analyse }
}

// ---- HTTP -----------------------------------------------------------------------------------------------------

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function antwort(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/

/** Eine Anfrage an die Function. env: Secrets und SUPABASE_URL/SUPABASE_ANON_KEY der Laufzeit. */
export async function behandleAnfrage(req: Request, env: Record<string, string | undefined>, fetchFn: FetchFn): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return antwort(405, { ok: false, fehler: 'Nur POST ist erlaubt.' })

  const token = req.headers.get('authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(token)) return antwort(401, { ok: false, fehler: 'Bitte melde dich an.' })

  let body: { aufgabe?: unknown; person_id?: unknown; monat?: unknown; neu?: unknown; ausgenommen?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return antwort(400, { ok: false, fehler: 'Die Anfrage ist ungültig.' })
  }

  const aufgabe = body.aufgabe ?? 'person'
  if (aufgabe !== 'person' && aufgabe !== 'alle' && aufgabe !== 'gesamt' && aufgabe !== 'agenda') {
    return antwort(400, { ok: false, fehler: 'Die Aufgabe ist unbekannt.' })
  }
  if (typeof body.monat !== 'string' || !MONAT.test(body.monat)) {
    return antwort(400, { ok: false, fehler: aufgabe === 'person' ? 'Person oder Monat fehlt oder ist ungültig.' : 'Der Monat fehlt oder ist ungültig.' })
  }
  if (aufgabe === 'person' && (typeof body.person_id !== 'string' || !UUID.test(body.person_id))) {
    return antwort(400, { ok: false, fehler: 'Person oder Monat fehlt oder ist ungültig.' })
  }
  let ausgenommen: string[] = []
  if (aufgabe === 'alle' && body.ausgenommen !== undefined) {
    if (!Array.isArray(body.ausgenommen) || body.ausgenommen.length > 200 || !body.ausgenommen.every((x) => typeof x === 'string' && UUID.test(x))) {
      return antwort(400, { ok: false, fehler: 'Die Liste der ausgenommenen Personen ist ungültig.' })
    }
    ausgenommen = body.ausgenommen as string[]
  }
  const monat = body.monat

  const url = (env.SUPABASE_URL ?? '').replace(/\/$/, '')
  const anon = env.SUPABASE_ANON_KEY ?? ''
  if (!url || !anon) return antwort(500, { ok: false, fehler: 'Die Function ist nicht vollständig konfiguriert.' })

  const rpc: Abhaengigkeiten['rpc'] = async (name, args) => {
    try {
      const r = await fetchFn(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: anon, authorization: token, 'content-type': 'application/json' },
        body: JSON.stringify(args),
      })
      const daten = await r.json().catch(() => null)
      if (!r.ok) return { data: null, error: { code: daten?.code, message: daten?.message ?? 'Fehler' } }
      return { data: daten, error: null }
    } catch {
      return { data: null, error: { message: 'Netzwerkfehler' } }
    }
  }

  const d: Abhaengigkeiten = {
    rpc,
    anbieter: () => anbieterAusUmgebung(env),
    ki: (c, n, e, o) => rufeAnbieter(c, n, e, fetchFn, o),
    kiBatch: (c, a, v, auftraege, o) => rufeAnbieterBatch(c, a, v, auftraege, fetchFn, o),
  }

  try {
    if (aufgabe === 'alle') {
      const ergebnis = await erstelleAlle(d, { monat, ausgenommen })
      return antwort(200, { ok: true, aufgabe: 'alle', ...ergebnis })
    }
    const neu = body.neu === true
    const ergebnis =
      aufgabe === 'gesamt'
        ? await erstelleGesamt(d, { monat, neu })
        : aufgabe === 'agenda'
          ? await erstelleAgenda(d, { monat, neu })
          : await erstelleAnalyse(d, { personId: body.person_id as string, monat, neu })
    return antwort(200, { ok: true, ...ergebnis })
  } catch (e) {
    if (e instanceof AnalyseFehler) return antwort(e.status, { ok: false, fehler: e.message })
    return antwort(500, { ok: false, fehler: 'Die Analyse konnte nicht erstellt werden.' })
  }
}
