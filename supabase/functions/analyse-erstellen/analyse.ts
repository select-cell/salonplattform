// Logik der Edge Function `analyse-erstellen` (Erweiterung E): reines TypeScript ohne Deno-Bezug,
// damit sie sich mit Node testen lässt (analyse.test.ts). index.ts verdrahtet sie nur mit Deno.serve.
//
// Alle Zahlen kommen aus SQL, die KI formuliert nur den Text. Die Datenbank baut die Eingabe (ohne Namen),
// prüft jede Zahl im Text gegen die Eingabe (Faktencheck) und ermittelt „geprueft“ selbst. Diese Function
// hat keinen service_role-Schlüssel: Sie ruft die Funktionen im Namen der angemeldeten Leitung auf.

/** Wer den Prompt ändert, erhöht die Version: dann gilt die Eingabe als neu und die KI wird erneut gefragt. */
export const PROMPT_VERSION = 'analyse-v1'

/** Höchstens so viele KI-Aufrufe je Analyse (ein erster Versuch und bis zu zwei Wiederholungen). */
export const MAX_AUFRUFE = 3

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

export interface Ausgabe {
  zusammenfassung: string
  staerken: string[]
  entwicklungsfelder: string[]
  gespraechsfragen: string[]
  vereinbarungen_vorschlaege: string[]
  kommentar_qualitaet_hinweis: string | null
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

/** Liest die Antwort der KI (Text oder Objekt) und prüft die Form. Wirft bei Abweichung. */
export function parseAusgabe(roh: unknown): Ausgabe {
  const o = typeof roh === 'string' ? ersteJsonStelle(roh) : roh
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('keine Objekt-Antwort')
  const r = o as Record<string, unknown>
  if (typeof r.zusammenfassung !== 'string' || !kurz(r.zusammenfassung)) throw new Error('zusammenfassung fehlt')
  const hinweis = typeof r.kommentar_qualitaet_hinweis === 'string' ? kurz(r.kommentar_qualitaet_hinweis) : ''
  return {
    zusammenfassung: kurz(r.zusammenfassung),
    staerken: liste(r.staerken, 'staerken'),
    entwicklungsfelder: liste(r.entwicklungsfelder, 'entwicklungsfelder'),
    gespraechsfragen: liste(r.gespraechsfragen, 'gespraechsfragen'),
    vereinbarungen_vorschlaege: liste(r.vereinbarungen_vorschlaege, 'vereinbarungen_vorschlaege'),
    kommentar_qualitaet_hinweis: hinweis && hinweis.toLowerCase() !== 'null' ? hinweis : null,
  }
}

/** Der Text, den die Leitung liest, bearbeitet und freigibt (Markdown, nur Überschriften und Aufzählungen). */
export function textAusAusgabe(a: Ausgabe): string {
  const punkte = (l: string[]) => l.map((p) => `- ${p}`).join('\n')
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

/** Liest die Secrets. Ohne Einrichtung: 503 „Die KI ist noch nicht eingerichtet.“ */
export function anbieterAusUmgebung(env: Record<string, string | undefined>): AnbieterConfig {
  const name = (env.AI_PROVIDER ?? '').trim().toLowerCase()
  if (name === 'claude') {
    const schluessel = (env.ANTHROPIC_API_KEY ?? '').trim()
    if (!schluessel) throw new AnalyseFehler(NICHT_EINGERICHTET, 503)
    return { name: 'claude', modell: (env.ANTHROPIC_MODEL ?? '').trim() || STANDARD_MODELL, schluessel }
  }
  if (name === 'webhook') {
    const url = (env.AI_WEBHOOK_URL ?? '').trim()
    if (!/^https:\/\//i.test(url)) throw new AnalyseFehler(NICHT_EINGERICHTET, 503)
    return { name: 'webhook', modell: null, url, geheimnis: (env.AI_WEBHOOK_SECRET ?? '').trim() || undefined }
  }
  throw new AnalyseFehler(NICHT_EINGERICHTET, 503)
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

const KEINE_ANTWORT = 'Die KI hat nicht geantwortet. Bitte später erneut versuchen.'

async function anfrage(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Response> {
  let antwort: Response
  try {
    antwort = await fetchFn(url, { ...init, signal: AbortSignal.timeout(90_000) })
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

/** Ein KI-Aufruf. Liefert die rohe Antwort (Text oder Objekt); parseAusgabe prüft sie. */
export async function rufeAnbieter(config: AnbieterConfig, nachricht: string, eingabe: unknown, fetchFn: FetchFn): Promise<unknown> {
  if (config.name === 'claude') {
    const antwort = await anfrage(fetchFn, 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.schluessel ?? '', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: config.modell,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: nachricht }],
      }),
    })
    const daten = (await antwort.json().catch(() => null)) as { content?: { type?: string; text?: string }[] } | null
    const text = (daten?.content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('')
    if (!text) throw new AnalyseFehler(KEINE_ANTWORT, 502)
    return text
  }

  const antwort = await anfrage(fetchFn, config.url ?? '', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.geheimnis ? { authorization: `Bearer ${config.geheimnis}`, 'x-webhook-secret': config.geheimnis } : {}),
    },
    body: JSON.stringify({ prompt_version: PROMPT_VERSION, system: SYSTEM_PROMPT, nachricht, eingabe }),
  })
  const daten = (await antwort.json().catch(() => null)) as Record<string, unknown> | null
  if (!daten) throw new AnalyseFehler(KEINE_ANTWORT, 502)
  // Der Webhook darf die Ausgabe direkt oder verpackt liefern
  for (const feld of ['ausgabe', 'output', 'text', 'antwort']) {
    if (daten[feld] !== undefined && daten[feld] !== null) return daten[feld]
  }
  return daten
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
  ki: (config: AnbieterConfig, nachricht: string, eingabe: unknown) => Promise<unknown>
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

  let korrektur: string | undefined
  let letzte: { ausgabe: Ausgabe; text: string } | null = null
  let aufrufe = 0
  while (aufrufe < MAX_AUFRUFE) {
    aufrufe++
    const roh = await d.ki(config, baueNachricht(eingabeAntwort.eingabe, korrektur), eingabeAntwort.eingabe)
    let ausgabe: Ausgabe
    try {
      ausgabe = parseAusgabe(roh)
    } catch {
      korrektur = 'Deine letzte Antwort war kein gültiges JSON im vorgegebenen Format. Antworte nur mit dem JSON-Objekt und allen sechs Schlüsseln.'
      continue
    }
    const text = textAusAusgabe(ausgabe)
    letzte = { ausgabe, text }
    const pruefung = (await rpcOderFehler(d, 'analyse_pruefen', { ...basis, p_text: text, p_ausgabe: ausgabe })) as {
      geprueft: boolean
      abweichungen?: string[]
    }
    if (pruefung.geprueft) break
    korrektur = `Deine letzte Antwort enthielt Zahlen, die nicht in den Daten stehen: ${(pruefung.abweichungen ?? []).join(', ')}. Formuliere neu und verwende nur Zahlen aus den Daten.`
  }

  if (!letzte) {
    throw new AnalyseFehler('Die KI hat keine verwertbare Antwort geliefert. Bitte später erneut versuchen.', 502)
  }

  const analyse = await rpcOderFehler(d, 'analyse_speichern', {
    ...basis,
    p_text: letzte.text,
    p_ausgabe: letzte.ausgabe,
    p_prompt_version: PROMPT_VERSION,
    p_anbieter: config.name,
    p_modell: config.modell,
    p_versuche: aufrufe,
  })
  return { uebersprungen: false, versuche: aufrufe, analyse }
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

  let body: { person_id?: unknown; monat?: unknown; neu?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return antwort(400, { ok: false, fehler: 'Die Anfrage ist ungültig.' })
  }
  if (typeof body.person_id !== 'string' || !UUID.test(body.person_id) || typeof body.monat !== 'string' || !MONAT.test(body.monat)) {
    return antwort(400, { ok: false, fehler: 'Person oder Monat fehlt oder ist ungültig.' })
  }

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

  try {
    const ergebnis = await erstelleAnalyse(
      { rpc, anbieter: () => anbieterAusUmgebung(env), ki: (c, n, e) => rufeAnbieter(c, n, e, fetchFn) },
      { personId: body.person_id, monat: body.monat, neu: body.neu === true },
    )
    return antwort(200, { ok: true, ...ergebnis })
  } catch (e) {
    if (e instanceof AnalyseFehler) return antwort(e.status, { ok: false, fehler: e.message })
    return antwort(500, { ok: false, fehler: 'Die Analyse konnte nicht erstellt werden.' })
  }
}
