// Tests für die Logik der Edge Function (Node: `node --test supabase/functions/analyse-erstellen/analyse.test.ts`).
// Datenbank und KI-Anbieter sind nachgebaut; es gibt keinen Netzzugriff.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUFGABE_AGENDA, AUFGABE_EINZEL, AUFGABE_GESAMT, AnalyseFehler, MAX_AUFRUFE, NICHT_EINGERICHTET, PAKET_GROESSE, PROMPT_VERSION, PROMPT_VERSION_AGENDA, PROMPT_VERSION_GESAMT,
  STANDARD_WEBHOOK_URL, repariereJson, SYSTEM_PROMPT, SYSTEM_PROMPT_AGENDA, SYSTEM_PROMPT_GESAMT, ZEITBUDGET_MS, anbieterAusUmgebung, arbeiteZiele, baueNachricht, behandleAnfrage,
  erstelleAgenda, erstelleAlle, erstelleAnalyse, erstelleGesamt, parseAgendaAusgabe, parseAusgabe, parseGesamtAusgabe, rufeAnbieter, rufeAnbieterBatch,
  textAusAusgabe, textAusGesamt,
  type Abhaengigkeiten, type AnbieterConfig, type Auftrag, type KiAntwort, type RpcAntwort, type Ziel,
} from './analyse.ts'

const PERSON = '11111111-0000-0000-0000-00000000000a'
const GUT = {
  zusammenfassung: 'Das Fremdbild liegt bei 3,0.',
  staerken: ['Verhalten 1 ist stark'],
  entwicklungsfelder: ['Verhalten 2 braucht Unterstützung'],
  gespraechsfragen: ['Was läuft gut?', 'Was fehlt?', 'Wo hilft das Team?'],
  vereinbarungen_vorschlaege: ['Eine Sache festlegen'],
  kommentar_qualitaet_hinweis: null,
}
const EINGABE = { bewertete_person: 'die bewertete Person', monat: '2026-09', kennzahlen: { fremdbild: 3.0 } }
const CLAUDE: AnbieterConfig = { name: 'claude', modell: 'modell-x', schluessel: 'geheim' }
const WEBHOOK: AnbieterConfig = { name: 'webhook', modell: null, url: 'https://n8n.example/webhook/dawiid', geheimnis: 's3' }
const GESAMT_EINGABE = { bewertet: 'das Team', monat: '2026-09', kennzahlen: { fremdbild: 3.8, selbstbild: 3.3 } }
const GESAMT_GUT = {
  zusammenfassung: 'Das Team liegt beim Fremdbild bei 3,8.',
  staerken: ['Verhalten 1 ist stark'],
  entwicklungsfelder: ['Verhalten 2 braucht Aufmerksamkeit'],
  gespraechsfragen: ['Was läuft gut?', 'Was fehlt?', 'Wo hilft das Team?'],
  vereinbarungen_vorschlaege: ['Eine Sache festlegen'],
  datenlage_hinweis: null,
}
const AGENDA_EINGABE = { aufgabe: 'Agenda für das nächste Teammeeting', monat: '2026-09', team: GESAMT_EINGABE, zeitbudget: { gesamt_min: 15, gesamt_max: 20 } }
const AGENDA_GUT = {
  bloecke: [
    { id: 'einstieg', minuten: 2, punkte: ['Danke an alle. 3 von 4 haben abgegeben.'] },
    { id: 'kennzahlen', minuten: 3, punkte: ['Das Team-Fremdbild liegt bei 3,8.'] },
    { id: 'fokus', minuten: 7, punkte: ['Fokus: Verhalten 1.', 'Größte Differenz bei Verhalten 2.'] },
    { id: 'entwicklung', minuten: 4, punkte: ['Verhalten 2 liegt bei 3,3.'] },
    { id: 'vereinbarungen', minuten: 2, punkte: ['Was nehmen wir uns vor?'] },
  ],
}
const ID = (n: number) => `11111111-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`

/** Antwort von abschluss_uebersicht: Admin, Monat abgeschlossen, Personen mit oder ohne Analyse. */
function uebersicht(over: { ki?: boolean; abschluss?: unknown; personen?: { id: string; name: string; analyse: unknown }[] } = {}) {
  return {
    ki: over.ki ?? true,
    abschluss: 'abschluss' in over ? over.abschluss : { monat: '2026-09' },
    personen: over.personen ?? [
      { id: ID(1), name: 'Person 1', analyse: null },
      { id: ID(2), name: 'Person 2', analyse: null },
    ],
  }
}

/** Nachgebaute Datenbank: protokolliert alle Aufrufe; die Antworten lassen sich je Funktion überschreiben. */
function db(overrides: Record<string, (args: Record<string, unknown>, n: number) => RpcAntwort> = {}) {
  const aufrufe: { name: string; args: Record<string, unknown> }[] = []
  const zaehler: Record<string, number> = {}
  const standard: Record<string, (args: Record<string, unknown>, n: number) => RpcAntwort> = {
    analyse_eingabe: () => ({ data: { eingabe: EINGABE, hash: 'h1' }, error: null }),
    analyse_lesen: () => ({ data: null, error: null }),
    analyse_pruefen: () => ({ data: { geprueft: true, abweichungen: [] }, error: null }),
    analyse_speichern: (a) => ({ data: { status: 'entwurf', text: a.p_text, versuche: a.p_versuche, geprueft: true }, error: null }),
    gesamt_eingabe: () => ({ data: { eingabe: GESAMT_EINGABE, hash: 'g1' }, error: null }),
    gesamt_lesen: () => ({ data: null, error: null }),
    gesamt_pruefen: () => ({ data: { geprueft: true, abweichungen: [] }, error: null }),
    gesamt_speichern: (a) => ({ data: { status: 'entwurf', text: a.p_text, versuche: a.p_versuche, geprueft: true }, error: null }),
    abschluss_uebersicht: () => ({ data: uebersicht(), error: null }),
    agenda_ki_eingabe: () => ({ data: { eingabe: AGENDA_EINGABE, hash: 'a1' }, error: null }),
    agenda_lesen: () => ({ data: null, error: null }),
    agenda_ki_pruefen: () => ({ data: { geprueft: true, abweichungen: [], struktur_fehler: null }, error: null }),
    agenda_ki_speichern: (a) => ({ data: { status: 'entwurf', anbieter: 'claude', versuche: a.p_versuche, geprueft: true }, error: null }),
  }
  const rpc: Abhaengigkeiten['rpc'] = async (name, args) => {
    aufrufe.push({ name, args })
    zaehler[name] = (zaehler[name] ?? 0) + 1
    return (overrides[name] ?? standard[name])(args, zaehler[name])
  }
  return { rpc, aufrufe, anzahl: (n: string) => aufrufe.filter((a) => a.name === n).length }
}

function abh(rpc: Abhaengigkeiten['rpc'], antworten: unknown[], extra: Partial<Abhaengigkeiten> = {}) {
  const nachrichten: string[] = []
  let i = 0
  const d: Abhaengigkeiten = {
    rpc,
    anbieter: () => CLAUDE,
    ki: async (_c, nachricht) => {
      nachrichten.push(nachricht)
      const a = antworten[Math.min(i++, antworten.length - 1)]
      if (a instanceof Error) throw a
      return a
    },
    ...extra,
  }
  return { d, nachrichten, aufrufe: () => i }
}

const P = { personId: PERSON, monat: '2026-09', neu: false }

// ---- Ausgabe lesen --------------------------------------------------------------------------------------------

test('parseAusgabe: Objekt, JSON-Text, Code-Zaun und Text drumherum', () => {
  assert.equal(parseAusgabe(GUT).zusammenfassung, 'Das Fremdbild liegt bei 3,0.')
  assert.equal(parseAusgabe(JSON.stringify(GUT)).staerken[0], 'Verhalten 1 ist stark')
  assert.equal(parseAusgabe('```json\n' + JSON.stringify(GUT) + '\n```').gespraechsfragen.length, 3)
  assert.equal(parseAusgabe('Hier ist die Analyse: ' + JSON.stringify(GUT) + ' Viel Erfolg!').entwicklungsfelder.length, 1)
})

test('parseAusgabe: Klammern und Anführungszeichen im Text stören das Finden nicht', () => {
  const schwierig = { ...GUT, zusammenfassung: 'Wert {3,0} und "Zitat" mit } Klammer' }
  assert.equal(parseAusgabe('Text ' + JSON.stringify(schwierig) + ' Ende').zusammenfassung, 'Wert {3,0} und "Zitat" mit } Klammer')
})

test('parseAusgabe: bereinigt Leerraum, ignoriert „null“ als Hinweis, wirft bei falscher Form', () => {
  const a = parseAusgabe({ ...GUT, zusammenfassung: '  Zwei\n Zeilen ', staerken: ['  a \n b ', ''], kommentar_qualitaet_hinweis: 'null' })
  assert.equal(a.zusammenfassung, 'Zwei Zeilen')
  assert.deepEqual(a.staerken, ['a b'])
  assert.equal(a.kommentar_qualitaet_hinweis, null)
  assert.equal(parseAusgabe({ ...GUT, kommentar_qualitaet_hinweis: 'Kommentare sind kurz.' }).kommentar_qualitaet_hinweis, 'Kommentare sind kurz.')
  for (const kaputt of ['kein json', '{"a":', '[]', null, 42, { ...GUT, zusammenfassung: '' }, { ...GUT, staerken: 'x' }, { ...GUT, gespraechsfragen: [] }, { ...GUT, vereinbarungen_vorschlaege: [1, 2] }]) {
    assert.throws(() => parseAusgabe(kaputt), undefined, `soll ablehnen: ${JSON.stringify(kaputt)}`)
  }
})

test('textAusAusgabe: Überschriften, Aufzählungen, Hinweis nur wenn vorhanden', () => {
  const text = textAusAusgabe(parseAusgabe(GUT))
  assert.match(text, /^## Zusammenfassung\nDas Fremdbild liegt bei 3,0\.\n\n## Stärken\n- Verhalten 1 ist stark\n\n## Entwicklungsfelder/)
  assert.match(text, /## Fragen für das Gespräch\n- Was läuft gut\?\n- Was fehlt\?\n- Wo hilft das Team\?/)
  assert.doesNotMatch(text, /Hinweis zu den Kommentaren/)
  assert.doesNotMatch(text, /^\d+\./m, 'keine nummerierten Listen (Faktencheck)')
  assert.match(textAusAusgabe(parseAusgabe({ ...GUT, kommentar_qualitaet_hinweis: 'Kurz.' })), /## Hinweis zu den Kommentaren\nKurz\.$/)
})

test('baueNachricht: Daten als JSON, Korrektur steht oben', () => {
  assert.equal(baueNachricht(EINGABE), `Daten (JSON):\n${JSON.stringify(EINGABE)}`)
  assert.match(baueNachricht(EINGABE, 'Bitte korrigieren.'), /^Bitte korrigieren\.\n\nDaten \(JSON\):/)
})

test('Prompt: Version, Regeln und kein Name', () => {
  assert.match(PROMPT_VERSION, /^analyse-v\d+$/)
  assert.match(SYSTEM_PROMPT, /Friseursalons/)
  assert.match(SYSTEM_PROMPT, /ausschließlich Zahlen, die in den Daten stehen/)
  assert.match(SYSTEM_PROMPT, /kommentar_qualitaet_hinweis/)
  assert.equal(MAX_AUFRUFE, 3)
})

// ---- Anbieter -------------------------------------------------------------------------------------------------

test('anbieterAusUmgebung: ohne Einrichtung 503 „noch nicht eingerichtet“', () => {
  const fehlt = (env: Record<string, string | undefined>) =>
    assert.throws(() => anbieterAusUmgebung(env), (e: unknown) => e instanceof AnalyseFehler && e.status === 503 && e.message === NICHT_EINGERICHTET)
  fehlt({ AI_PROVIDER: 'claude' })
  fehlt({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: '   ' })
  fehlt({ AI_PROVIDER: 'webhook', AI_WEBHOOK_URL: 'http://unsicher.example/hook' })
  fehlt({ AI_PROVIDER: 'etwas-anderes', ANTHROPIC_API_KEY: 'x' })
})

test('anbieterAusUmgebung: ohne Einstellungen geht alles an den n8n-Webhook im Code', () => {
  assert.equal(STANDARD_WEBHOOK_URL, 'https://tobitest2008.app.n8n.cloud/webhook/dawiid-ki')
  for (const env of [{}, { AI_PROVIDER: '' }, { AI_PROVIDER: 'webhook' }, { AI_WEBHOOK_URL: '   ' }]) {
    const w = anbieterAusUmgebung(env)
    assert.deepEqual([w.name, w.url, w.geheimnis, w.modell], ['webhook', STANDARD_WEBHOOK_URL, undefined, null])
  }
  // das Geheimnis kommt weiter aus den Secrets (nie aus dem Code); eine gesetzte Adresse hat Vorrang
  assert.equal(anbieterAusUmgebung({ AI_WEBHOOK_SECRET: ' s ' }).geheimnis, 's')
  assert.equal(anbieterAusUmgebung({ AI_WEBHOOK_URL: 'https://anders.example/hook' }).url, 'https://anders.example/hook')
  // ein gesetzter Anbieter „claude“ schaltet den Standard ab
  assert.equal(anbieterAusUmgebung({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }).name, 'claude')
})

test('anbieterAusUmgebung: claude und webhook', () => {
  const c = anbieterAusUmgebung({ AI_PROVIDER: 'Claude', ANTHROPIC_API_KEY: ' k ', ANTHROPIC_MODEL: 'm1' })
  assert.deepEqual([c.name, c.modell, c.schluessel], ['claude', 'm1', 'k'])
  assert.equal(anbieterAusUmgebung({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }).modell, 'claude-sonnet-5-5')
  const w = anbieterAusUmgebung({ AI_PROVIDER: 'webhook', AI_WEBHOOK_URL: 'https://n8n.example/hook', AI_WEBHOOK_SECRET: 's' })
  assert.deepEqual([w.name, w.url, w.geheimnis, w.modell], ['webhook', 'https://n8n.example/hook', 's', null])
})

test('Webhook: die Anmeldung der Person geht als Bearer mit (das Geheimnis ist nur ein Zusatz)', async () => {
  const kopfe: Record<string, string>[] = []
  const fetchFn = async (_url: string, init?: RequestInit) => {
    kopfe.push(init?.headers as Record<string, string>)
    return new Response(JSON.stringify({ ergebnisse: [{ ref: '1', code: 200, ausgabe: GUT }] }), { status: 200 })
  }
  const a = [{ ref: '1', system: 's', nachricht: 'n', eingabe: {} }]
  await rufeAnbieterBatch({ name: 'webhook', modell: null, url: 'https://n8n.example/h', token: 'user-jwt' }, AUFGABE_EINZEL, PROMPT_VERSION, a, fetchFn)
  await rufeAnbieterBatch({ name: 'webhook', modell: null, url: 'https://n8n.example/h', token: 'user-jwt', geheimnis: 'geheim' }, AUFGABE_EINZEL, PROMPT_VERSION, a, fetchFn)
  await rufeAnbieterBatch({ name: 'webhook', modell: null, url: 'https://n8n.example/h', geheimnis: 'geheim' }, AUFGABE_EINZEL, PROMPT_VERSION, a, fetchFn)
  await rufeAnbieterBatch({ name: 'webhook', modell: null, url: 'https://n8n.example/h' }, AUFGABE_EINZEL, PROMPT_VERSION, a, fetchFn)
  assert.deepEqual(kopfe[0], { 'content-type': 'application/json', authorization: 'Bearer user-jwt' }, 'im Browser: nur die Anmeldung, kein Geheimnis')
  assert.deepEqual(kopfe[1], { 'content-type': 'application/json', authorization: 'Bearer user-jwt', 'x-webhook-secret': 'geheim' })
  assert.deepEqual(kopfe[2], { 'content-type': 'application/json', authorization: 'Bearer geheim', 'x-webhook-secret': 'geheim' }, 'wie bisher')
  assert.deepEqual(kopfe[3], { 'content-type': 'application/json' })
})

test('Webhook: „netzwerk“ nur, wenn die Verbindung gar nicht zustande kam (nicht bei Zeitüberschreitung oder HTTP-Fehler)', async () => {
  const a = [{ ref: '1', system: 's', nachricht: 'n', eingabe: {} }]
  const cfg = { name: 'webhook' as const, modell: null, url: 'https://n8n.example/h' }
  const mit = async (fetchFn: (u: string, i?: RequestInit) => Promise<Response>) => {
    try {
      await rufeAnbieterBatch(cfg, AUFGABE_EINZEL, PROMPT_VERSION, a, fetchFn)
    } catch (e) {
      return e as AnalyseFehler
    }
    throw new Error('kein Fehler')
  }
  const kein = await mit(async () => { throw new TypeError('Failed to fetch') })
  assert.deepEqual([kein instanceof AnalyseFehler, kein.netzwerk, kein.status], [true, true, 502])
  const zeit = await mit(async () => { throw new DOMException('timeout', 'TimeoutError') })
  assert.deepEqual([zeit.netzwerk, zeit.status], [false, 502])
  const http = await mit(async () => new Response('x', { status: 500 }))
  assert.deepEqual([http.netzwerk, http.status], [false, 502])
  assert.equal((await mit(async () => new Response('x', { status: 401 }))).netzwerk, false)
  assert.equal(new AnalyseFehler('x', 500).netzwerk, false)
})

test('HTTP: an den Webhook geht die Anmeldung der Person, nicht der Header aus den Secrets', async () => {
  const ENV_W = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon' }
  const u = umgebung({}, (url) => (url === STANDARD_WEBHOOK_URL ? new Response(JSON.stringify({ ergebnisse: [{ ref: '1', code: 200, ausgabe: GESAMT_GUT }] }), { status: 200 }) : null))
  const r = await behandleAnfrage(anfrage({ aufgabe: 'gesamt', monat: '2026-09' }), ENV_W, u.fetchFn)
  assert.equal(r.status, 200)
  const w = u.gesehen.find((g) => g.url === STANDARD_WEBHOOK_URL)!
  assert.equal(w.kopf.authorization, 'Bearer jwt', 'dieselbe Anmeldung wie bei den Datenbankaufrufen')
  assert.equal(w.kopf['x-webhook-secret'], undefined)
})

test('rufeAnbieter claude: Anfrage und Antwort', async () => {
  let gesehen: { url: string; init: RequestInit } | null = null
  const fetchFn = async (url: string, init?: RequestInit) => {
    gesehen = { url, init: init ?? {} }
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"a":' }, { type: 'tool_use' }, { type: 'text', text: '1}' }] }), { status: 200 })
  }
  const roh = await rufeAnbieter(CLAUDE, 'Nachricht', EINGABE, fetchFn)
  assert.equal(roh, '{"a":1}')
  assert.equal(gesehen!.url, 'https://api.anthropic.com/v1/messages')
  const h = gesehen!.init.headers as Record<string, string>
  assert.equal(h['x-api-key'], 'geheim')
  assert.equal(h['anthropic-version'], '2023-06-01')
  const body = JSON.parse(String(gesehen!.init.body))
  assert.equal(body.model, 'modell-x')
  assert.equal(body.system, SYSTEM_PROMPT)
  assert.deepEqual(body.messages, [{ role: 'user', content: 'Nachricht' }])
})

test('rufeAnbieter: Fehlerabbildung ohne Details nach außen', async () => {
  const mit = (status: number) => async () => new Response('geheime Details', { status })
  await assert.rejects(rufeAnbieter(CLAUDE, 'n', EINGABE, mit(401)), (e: unknown) => e instanceof AnalyseFehler && e.status === 502 && /Schlüssel/.test(e.message) && !/geheim:/.test(e.message))
  await assert.rejects(rufeAnbieter(CLAUDE, 'n', EINGABE, mit(429)), (e: unknown) => e instanceof AnalyseFehler && e.status === 503 && /ausgelastet/.test(e.message))
  await assert.rejects(rufeAnbieter(CLAUDE, 'n', EINGABE, mit(500)), (e: unknown) => e instanceof AnalyseFehler && e.status === 502 && /nicht geantwortet/.test(e.message))
  await assert.rejects(rufeAnbieter(CLAUDE, 'n', EINGABE, async () => { throw new Error('Netz weg') }), (e: unknown) => e instanceof AnalyseFehler && e.status === 502)
  await assert.rejects(rufeAnbieter(CLAUDE, 'n', EINGABE, async () => new Response(JSON.stringify({ content: [] }), { status: 200 })), (e: unknown) => e instanceof AnalyseFehler && e.status === 502)
})

test('rufeAnbieter webhook: Auftrag mit Aufgabe, Geheimnis im Header, Antwort direkt oder verpackt', async () => {
  const w: AnbieterConfig = { name: 'webhook', modell: null, url: 'https://n8n.example/hook', geheimnis: 's3' }
  let gesehen: RequestInit = {}
  const liefert = (daten: unknown) => async (_u: string, init?: RequestInit) => {
    gesehen = init ?? {}
    return new Response(JSON.stringify(daten), { status: 200 })
  }
  assert.deepEqual(await rufeAnbieter(w, 'n', EINGABE, liefert({ ergebnisse: [{ ref: '1', code: 200, ausgabe: GUT }] })), GUT)
  const h = gesehen.headers as Record<string, string>
  assert.equal(h.authorization, 'Bearer s3')
  assert.equal(h['x-webhook-secret'], 's3')
  const body = JSON.parse(String(gesehen.body))
  assert.deepEqual(Object.keys(body).sort(), ['aufgabe', 'auftraege', 'prompt_version'])
  assert.deepEqual([body.aufgabe, body.prompt_version], [AUFGABE_EINZEL, PROMPT_VERSION])
  assert.deepEqual(body.auftraege, [{ ref: '1', system: SYSTEM_PROMPT, nachricht: 'n', eingabe: EINGABE }])
  // ältere Webhooks antworten direkt oder verpackt (nur bei einem Auftrag)
  assert.deepEqual(await rufeAnbieter(w, 'n', EINGABE, liefert({ ausgabe: GUT })), GUT)
  assert.equal(await rufeAnbieter(w, 'n', EINGABE, liefert({ text: '{"x":1}' })), '{"x":1}')
  assert.deepEqual(await rufeAnbieter(w, 'n', EINGABE, liefert(GUT)), GUT)
  const ohne = { ...w, geheimnis: undefined }
  await rufeAnbieter(ohne, 'n', EINGABE, liefert({ ergebnisse: [{ ref: '1', ausgabe: GUT }] }))
  assert.equal((gesehen.headers as Record<string, string>).authorization, undefined)
  // andere Aufgabe und anderer Prompt für die Gesamtauswertung
  await rufeAnbieter(w, 'n', EINGABE, liefert({ ergebnisse: [{ ref: '1', ausgabe: GESAMT_GUT }] }), {
    system: SYSTEM_PROMPT_GESAMT, promptVersion: PROMPT_VERSION_GESAMT, aufgabe: AUFGABE_GESAMT,
  })
  const gesamt = JSON.parse(String(gesehen.body))
  assert.deepEqual([gesamt.aufgabe, gesamt.prompt_version, gesamt.auftraege[0].system], [AUFGABE_GESAMT, PROMPT_VERSION_GESAMT, SYSTEM_PROMPT_GESAMT])
})

// ---- Ablauf ---------------------------------------------------------------------------------------------------

test('Ablauf: Erfolg beim ersten Mal, genau ein KI-Aufruf, DB bekommt nur das Nötige', async () => {
  const x = db()
  const { d, nachrichten } = abh(x.rpc, [JSON.stringify(GUT)])
  const r = await erstelleAnalyse(d, P)
  assert.deepEqual([r.uebersprungen, r.versuche], [false, 1])
  assert.equal(nachrichten.length, 1)
  assert.equal(nachrichten[0], baueNachricht(EINGABE), 'die KI bekommt genau die Eingabe der Datenbank')
  const speichern = x.aufrufe.find((a) => a.name === 'analyse_speichern')!.args
  assert.deepEqual(Object.keys(speichern).sort(), ['p_anbieter', 'p_ausgabe', 'p_modell', 'p_monat', 'p_person', 'p_prompt_version', 'p_text', 'p_versuche'])
  assert.equal(speichern.p_text, textAusAusgabe(parseAusgabe(GUT)))
  assert.deepEqual([speichern.p_person, speichern.p_monat, speichern.p_prompt_version, speichern.p_anbieter, speichern.p_modell, speichern.p_versuche], [PERSON, '2026-09-01', PROMPT_VERSION, 'claude', 'modell-x', 1])
  assert.ok(!('p_geprueft' in speichern) && !('geprueft' in speichern), 'geprueft kann die Function nicht vorgeben')
})

test('Ablauf: gleiche Eingabe und Prompt-Version = kein neuer KI-Aufruf (auch ohne KI-Einrichtung)', async () => {
  const x = db({ analyse_lesen: () => ({ data: { eingabe_hash: 'h1', prompt_version: PROMPT_VERSION, status: 'freigegeben' }, error: null }) })
  let anbieterGerufen = false
  const { d, aufrufe } = abh(x.rpc, [GUT], { anbieter: () => { anbieterGerufen = true; throw new AnalyseFehler(NICHT_EINGERICHTET, 503) } })
  const r = await erstelleAnalyse(d, P)
  assert.deepEqual([r.uebersprungen, r.versuche, aufrufe(), anbieterGerufen], [true, 0, 0, false])
  assert.equal((r.analyse as { status: string }).status, 'freigegeben')
  assert.equal(x.anzahl('analyse_speichern'), 0)
})

test('Ablauf: geänderte Eingabe, andere Prompt-Version oder „neu“ rufen die KI erneut', async () => {
  for (const [vorhanden, neu] of [
    [{ eingabe_hash: 'anderer', prompt_version: PROMPT_VERSION }, false],
    [{ eingabe_hash: 'h1', prompt_version: 'analyse-v0' }, false],
    [{ eingabe_hash: 'h1', prompt_version: PROMPT_VERSION }, true],
  ] as const) {
    const x = db({ analyse_lesen: () => ({ data: vorhanden, error: null }) })
    const { d, aufrufe } = abh(x.rpc, [GUT])
    const r = await erstelleAnalyse(d, { ...P, neu })
    assert.deepEqual([r.uebersprungen, aufrufe(), x.anzahl('analyse_speichern')], [false, 1, 1], JSON.stringify([vorhanden, neu]))
  }
})

test('Ablauf: Faktencheck nicht bestanden → Wiederholung mit Hinweis auf die Zahl', async () => {
  const x = db({ analyse_pruefen: (_a, n) => (n === 1 ? { data: { geprueft: false, abweichungen: ['4,71', '2,9'] }, error: null } : { data: { geprueft: true, abweichungen: [] }, error: null }) })
  const { d, nachrichten } = abh(x.rpc, [{ ...GUT, zusammenfassung: 'Wert 4,71' }, GUT])
  const r = await erstelleAnalyse(d, P)
  assert.equal(r.versuche, 2)
  assert.equal(nachrichten.length, 2)
  assert.match(nachrichten[1], /^Deine letzte Antwort enthielt Zahlen, die nicht in den Daten stehen: 4,71, 2,9\./)
  assert.equal(x.aufrufe.find((a) => a.name === 'analyse_speichern')!.args.p_text, textAusAusgabe(parseAusgabe(GUT)), 'gespeichert wird die zweite, geprüfte Fassung')
  assert.equal(x.aufrufe.find((a) => a.name === 'analyse_speichern')!.args.p_versuche, 2)
})

test('Ablauf: höchstens drei KI-Aufrufe; die letzte Fassung wird trotzdem als Entwurf gespeichert', async () => {
  const x = db({ analyse_pruefen: () => ({ data: { geprueft: false, abweichungen: ['9,9'] }, error: null }) })
  const { d, aufrufe } = abh(x.rpc, [{ ...GUT, zusammenfassung: 'Wert 9,9' }])
  const r = await erstelleAnalyse(d, P)
  assert.deepEqual([r.versuche, aufrufe(), x.anzahl('analyse_pruefen'), x.anzahl('analyse_speichern')], [3, 3, 3, 1])
  assert.match(String(x.aufrufe.find((a) => a.name === 'analyse_speichern')!.args.p_text), /Wert 9,9/)
})

test('Ablauf: ungültige KI-Antwort wird wiederholt, nach drei Versuchen Fehler und nichts gespeichert', async () => {
  const x = db()
  const { d, aufrufe, nachrichten } = abh(x.rpc, ['kein json'])
  await assert.rejects(erstelleAnalyse(d, P), (e: unknown) => e instanceof AnalyseFehler && e.status === 502 && /keine verwertbare Antwort/.test(e.message))
  assert.equal(aufrufe(), 3)
  assert.match(nachrichten[1], /kein gültiges JSON/)
  assert.deepEqual([x.anzahl('analyse_pruefen'), x.anzahl('analyse_speichern')], [0, 0])
})

test('Ablauf: erst ungültig, dann gültig', async () => {
  const x = db()
  const { d } = abh(x.rpc, ['Entschuldigung, hier ohne JSON', JSON.stringify(GUT)])
  const r = await erstelleAnalyse(d, P)
  assert.equal(r.versuche, 2)
})

test('Ablauf: KI nicht eingerichtet → 503, aber Rechte werden vorher geprüft', async () => {
  const x = db()
  const { d, aufrufe } = abh(x.rpc, [GUT], { anbieter: () => { throw new AnalyseFehler(NICHT_EINGERICHTET, 503) } })
  await assert.rejects(erstelleAnalyse(d, P), (e: unknown) => e instanceof AnalyseFehler && e.status === 503 && e.message === NICHT_EINGERICHTET)
  assert.deepEqual([aufrufe(), x.anzahl('analyse_eingabe')], [0, 1])

  const verboten = db({ analyse_eingabe: () => ({ data: null, error: { code: '42501', message: 'Nur für Verantwortliche und Admins.' } }) })
  await assert.rejects(erstelleAnalyse(abh(verboten.rpc, [GUT], { anbieter: () => { throw new AnalyseFehler(NICHT_EINGERICHTET, 503) } }).d, P), (e: unknown) => e instanceof AnalyseFehler && e.status === 403)
})

test('Ablauf: Fehler der Datenbank → verständliche Meldung und passender Status', async () => {
  const fall = async (code: string | undefined, message: string) => {
    const x = db({ analyse_eingabe: () => ({ data: null, error: { code, message } }) })
    try {
      await erstelleAnalyse(abh(x.rpc, [GUT]).d, P)
    } catch (e) {
      return e as AnalyseFehler
    }
    throw new Error('hätte werfen müssen')
  }
  const monat = await fall('22023', 'Der Monat ist noch nicht abgeschlossen.')
  assert.deepEqual([monat.status, monat.message], [422, 'Der Monat ist noch nicht abgeschlossen.'])
  const person = await fall('42501', 'Person nicht gefunden.')
  assert.deepEqual([person.status, person.message], [403, 'Person nicht gefunden.'])
  const anon = await fall('42501', 'permission denied for function analyse_eingabe')
  assert.deepEqual([anon.status, anon.message], [401, 'Bitte melde dich an.'])
  const sonst = await fall('XX000', 'interner Fehler mit Details ... select * from personen')
  assert.deepEqual([sonst.status, sonst.message], [500, 'Die Analyse konnte nicht erstellt werden.'])
})

// ---- Gesamtauswertung: Ausgabe lesen --------------------------------------------------------------------------

test('Gesamtauswertung: Prompt, Version und Regeln', () => {
  assert.match(PROMPT_VERSION_GESAMT, /^gesamt-v\d+$/)
  assert.match(SYSTEM_PROMPT_GESAMT, /Teamgesprächs/)
  assert.match(SYSTEM_PROMPT_GESAMT, /ausschließlich Zahlen, die in den Daten stehen/)
  assert.match(SYSTEM_PROMPT_GESAMT, /datenlage_hinweis/)
  assert.match(SYSTEM_PROMPT_GESAMT, /keine Namen, keine Einzelpersonen und keine Kommentartexte/)
  assert.notEqual(PROMPT_VERSION_GESAMT, PROMPT_VERSION)
})

test('parseGesamtAusgabe: eigener Hinweis-Schlüssel, sonst wie parseAusgabe', () => {
  assert.equal(parseGesamtAusgabe(GESAMT_GUT).zusammenfassung, 'Das Team liegt beim Fremdbild bei 3,8.')
  assert.equal(parseGesamtAusgabe('```json\n' + JSON.stringify(GESAMT_GUT) + '\n```').gespraechsfragen.length, 3)
  assert.equal(parseGesamtAusgabe({ ...GESAMT_GUT, datenlage_hinweis: 'null' }).datenlage_hinweis, null)
  assert.equal(parseGesamtAusgabe({ ...GESAMT_GUT, datenlage_hinweis: 'Nur 3 von 4 haben abgegeben.' }).datenlage_hinweis, 'Nur 3 von 4 haben abgegeben.')
  assert.equal(parseGesamtAusgabe({ ...GESAMT_GUT, kommentar_qualitaet_hinweis: 'gehört nicht hierher' }).datenlage_hinweis, null, 'der Schlüssel der Einzelanalyse wird nicht gelesen')
  for (const kaputt of ['kein json', [], { ...GESAMT_GUT, zusammenfassung: '' }, { ...GESAMT_GUT, staerken: [] }, { ...GESAMT_GUT, vereinbarungen_vorschlaege: 'x' }]) {
    assert.throws(() => parseGesamtAusgabe(kaputt), undefined, `soll ablehnen: ${JSON.stringify(kaputt)}`)
  }
})

test('textAusGesamt: Überschriften für das Team, Hinweis nur wenn vorhanden, keine nummerierten Listen', () => {
  const text = textAusGesamt(parseGesamtAusgabe(GESAMT_GUT))
  assert.match(text, /^## Zusammenfassung\nDas Team liegt beim Fremdbild bei 3,8\.\n\n## Stärken des Teams\n- Verhalten 1 ist stark\n\n## Entwicklungsfelder des Teams/)
  assert.match(text, /## Fragen für das Teamgespräch\n- Was läuft gut\?/)
  assert.doesNotMatch(text, /Hinweis zur Datenlage/)
  assert.doesNotMatch(text, /^\d+\./m)
  assert.match(textAusGesamt(parseGesamtAusgabe({ ...GESAMT_GUT, datenlage_hinweis: 'Dünn.' })), /## Hinweis zur Datenlage\nDünn\.$/)
})

// ---- Webhook-Protokoll mit mehreren Aufträgen -----------------------------------------------------------------

const auftrag = (ref: string): Auftrag => ({ ref, system: `System ${ref}`, nachricht: `Nachricht ${ref}`, eingabe: { n: ref } })

test('Webhook mit mehreren Aufträgen: EIN Aufruf, Antworten werden über ref zugeordnet', async () => {
  let aufrufe = 0
  let gesehen: { url: string; init: RequestInit } | null = null
  const fetchFn = async (url: string, init?: RequestInit) => {
    aufrufe++
    gesehen = { url, init: init ?? {} }
    return new Response(JSON.stringify({ ergebnisse: [
      { ref: '3', code: 200, ausgabe: { n: 3 } },
      { ref: '1', code: 200, output: '{"n":1}' },
      { ref: '2', code: 502, fehler: 'Anthropic nicht erreichbar' },
    ] }), { status: 200 })
  }
  const r = await rufeAnbieterBatch(WEBHOOK, AUFGABE_EINZEL, PROMPT_VERSION, [auftrag('1'), auftrag('2'), auftrag('3')], fetchFn)
  assert.equal(aufrufe, 1)
  assert.equal(gesehen!.url, WEBHOOK.url)
  const body = JSON.parse(String(gesehen!.init.body))
  assert.deepEqual(body.auftraege.map((a: Auftrag) => a.ref), ['1', '2', '3'])
  assert.deepEqual(body.auftraege[1], { ref: '2', system: 'System 2', nachricht: 'Nachricht 2', eingabe: { n: '2' } })
  assert.deepEqual(r['1'], { roh: '{"n":1}' })
  assert.deepEqual(r['3'], { roh: { n: 3 } })
  assert.ok('fehler' in r['2'] && r['2'].fehler instanceof AnalyseFehler && r['2'].fehler.status === 502)
})

test('Webhook mit mehreren Aufträgen: fehlende, leere und ausgelastete Ergebnisse sind Fehler einzelner Aufträge', async () => {
  const fetchFn = async () => new Response(JSON.stringify({ ergebnisse: [
    { ref: '1', code: 200, ausgabe: { n: 1 } },
    { ref: '2', code: 429, fehler: 'x' },
    { ref: '3', code: 200 },
    { ref: 42, ausgabe: { n: 9 } },
    null,
  ] }), { status: 200 })
  const r = await rufeAnbieterBatch(WEBHOOK, AUFGABE_EINZEL, PROMPT_VERSION, [auftrag('1'), auftrag('2'), auftrag('3'), auftrag('4')], fetchFn)
  assert.ok('roh' in r['1'])
  const status = (k: KiAntwort) => ('fehler' in k ? k.fehler.status : null)
  assert.deepEqual([status(r['2']), status(r['3']), status(r['4'])], [503, 502, 502])
  // ohne ergebnisse-Liste und mit mehreren Aufträgen wird nichts erraten
  const direkt = await rufeAnbieterBatch(WEBHOOK, AUFGABE_EINZEL, PROMPT_VERSION, [auftrag('1'), auftrag('2')], async () => new Response(JSON.stringify({ ausgabe: GUT }), { status: 200 }))
  assert.ok('fehler' in direkt['1'] && 'fehler' in direkt['2'])
})

test('Webhook: Fehler für die ganze Anfrage werden geworfen (Zugang, Auslastung, Zeit, keine Antwort)', async () => {
  const mit = (status: number) => async () => new Response('x', { status })
  await assert.rejects(rufeAnbieterBatch(WEBHOOK, AUFGABE_EINZEL, PROMPT_VERSION, [auftrag('1')], mit(403)), (e: unknown) => e instanceof AnalyseFehler && e.status === 502 && /Schlüssel/.test(e.message))
  await assert.rejects(rufeAnbieterBatch(WEBHOOK, AUFGABE_EINZEL, PROMPT_VERSION, [auftrag('1')], mit(429)), (e: unknown) => e instanceof AnalyseFehler && e.status === 503)
  await assert.rejects(rufeAnbieterBatch(WEBHOOK, AUFGABE_EINZEL, PROMPT_VERSION, [auftrag('1')], async () => { throw new Error('Zeit') }), (e: unknown) => e instanceof AnalyseFehler && e.status === 502)
  await assert.rejects(rufeAnbieterBatch(WEBHOOK, AUFGABE_EINZEL, PROMPT_VERSION, [auftrag('1')], async () => new Response('kein json', { status: 200 })), (e: unknown) => e instanceof AnalyseFehler && e.status === 502)
})

test('Claude mit mehreren Aufträgen: ein Aufruf je Auftrag mit dessen Prompt, ein Fehler stört die anderen nicht', async () => {
  const gesehen: { system: string; nachricht: string }[] = []
  const fetchFn = async (_u: string, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body))
    gesehen.push({ system: b.system, nachricht: b.messages[0].content })
    if (b.system === 'System 2') return new Response('x', { status: 500 })
    return new Response(JSON.stringify({ content: [{ type: 'text', text: `Antwort auf ${b.messages[0].content}` }] }), { status: 200 })
  }
  const r = await rufeAnbieterBatch(CLAUDE, AUFGABE_EINZEL, PROMPT_VERSION, [auftrag('1'), auftrag('2'), auftrag('3')], fetchFn)
  assert.equal(gesehen.length, 3)
  assert.deepEqual(r['1'], { roh: 'Antwort auf Nachricht 1' })
  assert.deepEqual(r['3'], { roh: 'Antwort auf Nachricht 3' })
  assert.ok('fehler' in r['2'])
})

// ---- Runden mit mehreren Zielen -------------------------------------------------------------------------------

/** Ziele mit eigener Antwort-Reihenfolge; `pruefungen[schluessel]` liefert je Runde, ob der Faktencheck besteht. */
function ziele(namen: string[], pruefungen: Record<string, boolean[]> = {}): Ziel[] {
  const zaehler: Record<string, number> = {}
  return namen.map((n) => ({
    schluessel: n,
    system: `System ${n}`,
    eingabe: { name: n },
    parse: (roh) => {
      if (roh === 'kaputt') throw new Error('kein JSON')
      return { ausgabe: { text: String(roh) }, text: `Text ${roh}` }
    },
    pruefen: async () => {
      const i = (zaehler[n] = (zaehler[n] ?? 0) + 1) - 1
      const liste = pruefungen[n] ?? [true]
      return liste[Math.min(i, liste.length - 1)] ? { geprueft: true } : { geprueft: false, abweichungen: ['9,9'] }
    },
  }))
}

function stapel(antwort: (a: Auftrag, runde: number) => KiAntwort, extra: Partial<Abhaengigkeiten> = {}) {
  const runden: { aufgabe: string; version: string; auftraege: Auftrag[]; timeoutMs: number }[] = []
  const d: Abhaengigkeiten = {
    rpc: async () => ({ data: null, error: null }),
    anbieter: () => CLAUDE,
    ki: async () => { throw new Error('ki darf hier nicht gerufen werden') },
    kiBatch: async (_c, aufgabe, version, auftraege, o) => {
      runden.push({ aufgabe, version, auftraege, timeoutMs: o.timeoutMs })
      return Object.fromEntries(auftraege.map((a) => [a.ref, antwort(a, runden.length)]))
    },
    ...extra,
  }
  return { d, runden }
}

test('Runden: alle Ziele gehen in EINEM Aufruf an die KI, nur die offenen kommen in die nächste Runde', async () => {
  const { d, runden } = stapel((a, runde) => ({ roh: `${a.ref}-${runde}` }))
  const r = await arbeiteZiele(d, CLAUDE, AUFGABE_EINZEL, PROMPT_VERSION, ziele(['a', 'b', 'c'], { b: [false, true] }))
  assert.equal(runden.length, 2)
  assert.deepEqual(runden[0].auftraege.map((x) => x.ref), ['1', '2', '3'])
  assert.deepEqual(runden[1].auftraege.map((x) => x.ref), ['2'], 'nur der Auftrag mit nicht bestandenem Faktencheck')
  assert.match(runden[1].auftraege[0].nachricht, /^Deine letzte Antwort enthielt Zahlen, die nicht in den Daten stehen: 9,9\./)
  assert.equal(runden[0].auftraege[1].system, 'System b', 'jedes Ziel bringt seinen Prompt mit')
  assert.deepEqual([runden[0].aufgabe, runden[0].version], [AUFGABE_EINZEL, PROMPT_VERSION])
  const v = (k: string) => { const x = r.get(k)!; return x.ok ? x.versuche : -1 }
  assert.deepEqual([v('a'), v('b'), v('c')], [1, 2, 1])
  assert.equal((r.get('b') as { text: string }).text, 'Text 2-2', 'die zweite, geprüfte Fassung')
})

test('Runden: höchstens drei, die letzte lesbare Fassung zählt; ungültige Antworten ergeben einen Fehler nur für dieses Ziel', async () => {
  const { d, runden } = stapel((a) => ({ roh: a.ref === '2' ? 'kaputt' : 'ok' }))
  const r = await arbeiteZiele(d, CLAUDE, AUFGABE_EINZEL, PROMPT_VERSION, ziele(['a', 'b', 'c'], { c: [false] }))
  assert.equal(runden.length, MAX_AUFRUFE)
  assert.deepEqual(runden.map((x) => x.auftraege.map((y) => y.ref)), [['1', '2', '3'], ['2', '3'], ['2', '3']])
  assert.ok(r.get('a')!.ok)
  assert.deepEqual([r.get('c')!.ok, (r.get('c') as { versuche: number }).versuche], [true, 3])
  const b = r.get('b')!
  assert.ok(!b.ok && b.fehler.status === 502 && /keine verwertbare Antwort/.test(b.fehler.message))
  assert.match(runden[1].auftraege[0].nachricht, /kein gültiges JSON/)
})

/** Wie n8n-Streaming es liefert: Stücke von etwa 13 Zeichen, dazwischen ein Zeilenumbruch — auch mitten in Wörtern und Zahlen. */
const zerstueckelt = (text: string, n = 13) => text.replace(new RegExp(`(.{${n}})`, 'gs'), '$1\n')

test('Antwort in Stücken mit Zeilenumbrüchen mitten in Wörtern wird gelesen (n8n-Streaming)', () => {
  const original = JSON.stringify(AGENDA_GUT, null, 2)
  for (const n of [3, 7, 13, 29]) {
    const kaputt = zerstueckelt(original, n)
    assert.throws(() => JSON.parse(kaputt), 'so wäre es ungültiges JSON')
    assert.deepEqual(parseAgendaAusgabe(kaputt), parseAgendaAusgabe(original), `Stücke zu ${n} Zeichen`)
  }
  // auch mit Code-Zaun und Text davor
  assert.deepEqual(parseAgendaAusgabe('Hier die Agenda:\n```json\n' + zerstueckelt(JSON.stringify(AGENDA_GUT), 11) + '\n```'), parseAgendaAusgabe(JSON.stringify(AGENDA_GUT)))
  // Umbrüche mitten in Wörtern, Zahlen und Schlüsselwörtern fallen weg, Tabs in Texten werden zu Leerzeichen
  assert.equal(repariereJson('{"a":\n"x\ty\nz",\n"b": 1\n2, "c": nul\nl}'), '{"a":"x yz","b": 12, "c": null}')
  assert.equal(repariereJson('{"a": "Zeile\\nzwei"}'), '{"a": "Zeile\\nzwei"}', 'ein maskierter Umbruch (\\n) bleibt')
  // Einzelanalyse und Gesamtauswertung lesen ebenso
  assert.deepEqual(parseGesamtAusgabe(zerstueckelt(JSON.stringify(GESAMT_GUT), 9)), parseGesamtAusgabe(JSON.stringify(GESAMT_GUT)))
  assert.deepEqual(parseAusgabe(zerstueckelt(JSON.stringify(GUT), 9)), parseAusgabe(JSON.stringify(GUT)))
})

test('Abgeschnittene Antwort: „JSON unvollständig“ und bei der Wiederholung der Hinweis, sich kürzer zu fassen', async () => {
  const ganz = JSON.stringify(AGENDA_GUT)
  const abgeschnitten = zerstueckelt(ganz.slice(0, Math.floor(ganz.length * 0.55)), 13)
  assert.throws(() => parseAgendaAusgabe(abgeschnitten), /JSON unvollständig/)
  const { d, runden } = stapel((_a, runde) => ({ roh: runde === 1 ? abgeschnitten : ganz }))
  const ziel: Ziel = {
    schluessel: 'agenda', system: 's', eingabe: {},
    parse: (roh) => ({ ausgabe: parseAgendaAusgabe(roh), text: 't' }),
    pruefen: async () => ({ geprueft: true }),
  }
  const r = (await arbeiteZiele(d, CLAUDE, AUFGABE_AGENDA, PROMPT_VERSION_AGENDA, [ziel])).get('agenda')!
  assert.ok(r.ok && r.versuche === 2)
  assert.match(runden[1].auftraege[0].nachricht, /abgeschnitten/)
  assert.match(runden[1].auftraege[0].nachricht, /Fasse dich kürzer/)
})

test('Runden: ein Fehler des Anbieters bei einem Auftrag wird in der nächsten Runde wiederholt', async () => {
  const { d, runden } = stapel((a, runde) => (a.ref === '2' && runde === 1 ? { fehler: new AnalyseFehler('x', 502) } : { roh: 'ok' }))
  const r = await arbeiteZiele(d, CLAUDE, AUFGABE_EINZEL, PROMPT_VERSION, ziele(['a', 'b']))
  assert.deepEqual(runden.map((x) => x.auftraege.length), [2, 1])
  assert.ok(r.get('a')!.ok && r.get('b')!.ok)
})

test('Runden: scheitert der Anbieter für alle, wird sein Fehler geworfen; mit lesbaren Fassungen zählen diese', async () => {
  const aus = stapel(() => ({ fehler: new AnalyseFehler('Die KI ist gerade ausgelastet. Bitte in ein paar Minuten erneut versuchen.', 503) }))
  await assert.rejects(arbeiteZiele(aus.d, CLAUDE, AUFGABE_EINZEL, PROMPT_VERSION, ziele(['a', 'b'])), (e: unknown) => e instanceof AnalyseFehler && e.status === 503)
  assert.equal(aus.runden.length, 1)

  const spaeter = stapel((_a, runde) => (runde === 1 ? { roh: 'ok' } : { fehler: new AnalyseFehler('x', 502) }))
  const r = await arbeiteZiele(spaeter.d, CLAUDE, AUFGABE_EINZEL, PROMPT_VERSION, ziele(['a'], { a: [false] }))
  assert.deepEqual([r.get('a')!.ok, (r.get('a') as { versuche: number }).versuche], [true, 1], 'die erste Fassung bleibt erhalten')
})

test('Runden: das Zeitbudget begrenzt die Runden und die Zeit je Aufruf', async () => {
  let uhr = 1_000
  const { d, runden } = stapel(() => ({ roh: 'ok' }), { jetzt: () => uhr })
  const mitUhr = { ...d, kiBatch: async (...a: Parameters<NonNullable<Abhaengigkeiten['kiBatch']>>) => { const r = await d.kiBatch!(...a); uhr += 100_000; return r } }
  const r = await arbeiteZiele(mitUhr, CLAUDE, AUFGABE_EINZEL, PROMPT_VERSION, ziele(['a'], { a: [false] }))
  assert.equal(runden.length, 2, 'nach 100 s sind nur noch 35 s übrig: eine zweite Runde ist erlaubt, eine dritte nicht')
  assert.ok(runden[0].timeoutMs <= 120_000 && runden[0].timeoutMs >= 10_000)
  assert.ok(runden[1].timeoutMs <= ZEITBUDGET_MS - 100_000 && runden[1].timeoutMs >= 10_000, `zweite Runde: ${runden[1].timeoutMs}`)
  assert.ok(r.get('a')!.ok, 'die letzte lesbare Fassung zählt')
})

test('Runden: ein Fehler der Datenbank beim Faktencheck beendet nur dieses Ziel', async () => {
  const z = ziele(['a', 'b'])
  z[0].pruefen = async () => { throw new AnalyseFehler('Person nicht gefunden.', 403) }
  const { d, runden } = stapel(() => ({ roh: 'ok' }))
  const r = await arbeiteZiele(d, CLAUDE, AUFGABE_EINZEL, PROMPT_VERSION, z)
  assert.equal(runden.length, 1)
  const a = r.get('a')!
  assert.ok(!a.ok && a.fehler.status === 403 && a.fehler.message === 'Person nicht gefunden.')
  assert.ok(r.get('b')!.ok)
})

// ---- Sammellauf -----------------------------------------------------------------------------------------------

/** Nachgebaute KI für den Sammellauf: eine Antwort je Auftrag, gemeinsam in einem Aufruf. */
function sammelabh(rpc: Abhaengigkeiten['rpc'], antwort: (a: Auftrag, runde: number) => KiAntwort = () => ({ roh: JSON.stringify(GUT) }), extra: Partial<Abhaengigkeiten> = {}) {
  return stapel(antwort, { rpc, ...extra })
}

const mitPersonen = (anzahl: number, ohneAnalyse = anzahl) =>
  uebersicht({ personen: Array.from({ length: anzahl }, (_, i) => ({ id: ID(i + 1), name: `Person ${i + 1}`, analyse: i < anzahl - ohneAnalyse ? { status: 'entwurf' } : null })) })

test('Sammellauf: das Paket geht in EINEM KI-Aufruf an die KI, je Person gespeichert, keine Kennung geht an die KI', async () => {
  const x = db({
    abschluss_uebersicht: () => ({ data: mitPersonen(2), error: null }),
    analyse_eingabe: (a) => ({ data: { eingabe: { ...EINGABE, fuer: a.p_person === ID(2) ? 'zwei' : 'andere' }, hash: 'h' }, error: null }),
  })
  const { d, runden } = sammelabh(x.rpc)
  const r = await erstelleAlle(d, { monat: '2026-09', ausgenommen: [] })
  assert.equal(runden.length, 1, 'ein Aufruf für beide')
  assert.deepEqual(runden[0].auftraege.map((a) => a.ref), ['1', '2'])
  assert.deepEqual([runden[0].aufgabe, runden[0].version], [AUFGABE_EINZEL, PROMPT_VERSION])
  assert.ok(!JSON.stringify(runden[0].auftraege).includes('11111111'), 'keine Personen-Kennung in den Aufträgen')
  assert.ok(runden[0].auftraege.every((a) => a.system === SYSTEM_PROMPT))
  assert.deepEqual(r.erstellt.map((e) => e.person_id), [ID(1), ID(2)])
  assert.deepEqual([r.fehlgeschlagen.length, r.verbleibend], [0, 0])
  assert.ok(r.erstellt.every((e) => e.versuche === 1 && e.geprueft))
  const speichern = x.aufrufe.filter((a) => a.name === 'analyse_speichern').map((a) => a.args.p_person)
  assert.deepEqual(speichern, [ID(1), ID(2)])
  assert.equal(x.anzahl('analyse_pruefen'), 2)
  assert.equal(x.aufrufe.find((a) => a.name === 'abschluss_uebersicht')!.args.p_monat, '2026-09-01')
})

test('Sammellauf: höchstens ein Paket je Aufruf, Personen mit Analyse und ausgenommene werden übersprungen', async () => {
  assert.equal(PAKET_GROESSE, 2)
  const x = db({ abschluss_uebersicht: () => ({ data: mitPersonen(7, 6), error: null }) })   // Person 1 hat schon eine Analyse
  const { d, runden } = sammelabh(x.rpc)
  const erster = await erstelleAlle(d, { monat: '2026-09', ausgenommen: [ID(3)] })
  assert.deepEqual(erster.erstellt.map((e) => e.person_id), [ID(2), ID(4)], 'nicht Person 1 (hat Analyse), nicht Person 3 (ausgenommen)')
  assert.equal(erster.verbleibend, 3)
  assert.equal(runden[0].auftraege.length, 2)
  const x2 = db({ abschluss_uebersicht: () => ({ data: mitPersonen(2), error: null }) })
  const leer = await erstelleAlle(sammelabh(x2.rpc).d, { monat: '2026-09', ausgenommen: [ID(1), ID(2)] })
  assert.deepEqual(leer, { erstellt: [], fehlgeschlagen: [], verbleibend: 0 })
})

test('Sammellauf: nichts zu tun → keine KI, auch wenn sie nicht eingerichtet ist', async () => {
  const x = db({ abschluss_uebersicht: () => ({ data: mitPersonen(2, 0), error: null }) })
  let gerufen = false
  const { d, runden } = sammelabh(x.rpc, undefined, { anbieter: () => { gerufen = true; throw new AnalyseFehler(NICHT_EINGERICHTET, 503) } })
  const r = await erstelleAlle(d, { monat: '2026-09', ausgenommen: [] })
  assert.deepEqual([r.erstellt.length, r.verbleibend, gerufen, runden.length], [0, 0, false, 0])
})

test('Sammellauf: nur für Admins und nur für abgeschlossene Monate, ohne KI-Aufruf', async () => {
  const kein = db({ abschluss_uebersicht: () => ({ data: uebersicht({ ki: false }), error: null }) })
  const a = sammelabh(kein.rpc)
  await assert.rejects(erstelleAlle(a.d, { monat: '2026-09', ausgenommen: [] }), (e: unknown) => e instanceof AnalyseFehler && e.status === 403 && e.message === 'Nur für Admins.')
  assert.deepEqual([a.runden.length, kein.anzahl('analyse_eingabe')], [0, 0])

  const offen = db({ abschluss_uebersicht: () => ({ data: uebersicht({ abschluss: null }), error: null }) })
  await assert.rejects(erstelleAlle(sammelabh(offen.rpc).d, { monat: '2026-09', ausgenommen: [] }), (e: unknown) => e instanceof AnalyseFehler && e.status === 422 && /nicht abgeschlossen/.test(e.message))

  const verboten = db({ abschluss_uebersicht: () => ({ data: null, error: { code: '42501', message: 'Nur für Verantwortliche und Admins.' } }) })
  await assert.rejects(erstelleAlle(sammelabh(verboten.rpc).d, { monat: '2026-09', ausgenommen: [] }), (e: unknown) => e instanceof AnalyseFehler && e.status === 403)

  const ohneKi = db({ abschluss_uebersicht: () => ({ data: mitPersonen(2), error: null }) })
  await assert.rejects(
    erstelleAlle(sammelabh(ohneKi.rpc, undefined, { anbieter: () => { throw new AnalyseFehler(NICHT_EINGERICHTET, 503) } }).d, { monat: '2026-09', ausgenommen: [] }),
    (e: unknown) => e instanceof AnalyseFehler && e.status === 503 && e.message === NICHT_EINGERICHTET,
  )
})

test('Sammellauf: eine ungültige Antwort betrifft nur diese Person, die andere wird gespeichert', async () => {
  const x = db({
    abschluss_uebersicht: () => ({ data: mitPersonen(2), error: null }),
    analyse_speichern: () => ({ data: { geprueft: false }, error: null }),
  })
  // Person 2 (Auftrag 2): immer eine ungültige Antwort
  const { d, runden } = sammelabh(x.rpc, (a) => ({ roh: a.ref === '2' ? 'kein json' : JSON.stringify(GUT) }))
  const r = await erstelleAlle(d, { monat: '2026-09', ausgenommen: [] })
  assert.deepEqual(r.erstellt.map((e) => [e.person_id, e.geprueft]), [[ID(1), false]])
  assert.deepEqual(r.fehlgeschlagen.map((f) => f.person_id), [ID(2)])
  assert.match(r.fehlgeschlagen[0].fehler, /keine verwertbare Antwort/)
  assert.deepEqual(runden.map((x) => x.auftraege.length), [2, 1, 1], 'die ungültige Antwort wird zweimal wiederholt, nur für diesen Auftrag')
  assert.equal(r.verbleibend, 0)
})

test('Sammellauf: scheitert das Speichern bei einer Person, kommen keine internen Details nach außen', async () => {
  const x = db({
    abschluss_uebersicht: () => ({ data: mitPersonen(2), error: null }),
    analyse_speichern: (a) => (a.p_person === ID(1) ? { data: null, error: { code: 'XX000', message: 'interne Details' } } : { data: { geprueft: true }, error: null }),
  })
  const r = await erstelleAlle(sammelabh(x.rpc).d, { monat: '2026-09', ausgenommen: [] })
  assert.deepEqual(r.erstellt.map((e) => e.person_id), [ID(2)])
  assert.deepEqual(r.fehlgeschlagen, [{ person_id: ID(1), fehler: 'Die Analyse konnte nicht erstellt werden.' }])
})

test('Sammellauf: kann die Eingabe einer Person nicht gebaut werden, kommen die anderen trotzdem dran', async () => {
  const x = db({
    abschluss_uebersicht: () => ({ data: mitPersonen(3), error: null }),
    analyse_eingabe: (a) => (a.p_person === ID(1) ? { data: null, error: { code: '22023', message: 'Für diese Person gibt es in diesem Monat keine Auswertung.' } } : { data: { eingabe: EINGABE, hash: 'h' }, error: null }),
  })
  const { d, runden } = sammelabh(x.rpc)
  const r = await erstelleAlle(d, { monat: '2026-09', ausgenommen: [] })
  assert.deepEqual(r.erstellt.map((e) => e.person_id), [ID(2)])
  assert.deepEqual(r.fehlgeschlagen.map((f) => f.person_id), [ID(1)])
  assert.match(r.fehlgeschlagen[0].fehler, /keine Auswertung/)
  assert.equal(r.verbleibend, 1, 'Person 3 kommt im nächsten Aufruf dran')
  assert.deepEqual(runden[0].auftraege.map((a) => a.ref), ['1'])
})

// ---- Gesamtauswertung: Ablauf ---------------------------------------------------------------------------------

test('Gesamtauswertung: eigene Funktionen, eigener Prompt, eigene Aufgabe', async () => {
  const x = db()
  const { d, runden } = stapel(() => ({ roh: JSON.stringify(GESAMT_GUT) }), { rpc: x.rpc })
  const r = await erstelleGesamt(d, { monat: '2026-09', neu: false })
  assert.deepEqual([r.uebersprungen, r.versuche], [false, 1])
  assert.deepEqual(x.aufrufe.map((a) => a.name), ['gesamt_eingabe', 'gesamt_lesen', 'gesamt_pruefen', 'gesamt_speichern'])
  assert.deepEqual([runden[0].aufgabe, runden[0].version, runden[0].auftraege[0].system], [AUFGABE_GESAMT, PROMPT_VERSION_GESAMT, SYSTEM_PROMPT_GESAMT])
  assert.equal(runden[0].auftraege[0].nachricht, baueNachricht(GESAMT_EINGABE))
  const speichern = x.aufrufe.find((a) => a.name === 'gesamt_speichern')!.args
  assert.deepEqual(Object.keys(speichern).sort(), ['p_anbieter', 'p_ausgabe', 'p_modell', 'p_monat', 'p_prompt_version', 'p_text', 'p_versuche'])
  assert.equal(speichern.p_text, textAusGesamt(parseGesamtAusgabe(GESAMT_GUT)))
  assert.deepEqual([speichern.p_monat, speichern.p_prompt_version, speichern.p_anbieter, speichern.p_versuche], ['2026-09-01', PROMPT_VERSION_GESAMT, 'claude', 1])
  assert.ok(!('p_person' in speichern))
})

test('Gesamtauswertung: gleiche Eingabe und Version = kein neuer Aufruf; neue Daten, neue Version oder „neu“ fragen erneut', async () => {
  const gleich = db({ gesamt_lesen: () => ({ data: { eingabe_hash: 'g1', prompt_version: PROMPT_VERSION_GESAMT, status: 'freigegeben' }, error: null }) })
  let gerufen = false
  const a = stapel(() => ({ roh: JSON.stringify(GESAMT_GUT) }), { rpc: gleich.rpc, anbieter: () => { gerufen = true; throw new AnalyseFehler(NICHT_EINGERICHTET, 503) } })
  const r = await erstelleGesamt(a.d, { monat: '2026-09', neu: false })
  assert.deepEqual([r.uebersprungen, r.versuche, gerufen, a.runden.length], [true, 0, false, 0])
  for (const [vorhanden, neu] of [
    [{ eingabe_hash: 'anderer', prompt_version: PROMPT_VERSION_GESAMT }, false],
    [{ eingabe_hash: 'g1', prompt_version: 'gesamt-v0' }, false],
    [{ eingabe_hash: 'g1', prompt_version: PROMPT_VERSION_GESAMT }, true],
    [{ eingabe_hash: 'g1', prompt_version: PROMPT_VERSION }, false],
  ] as const) {
    const x = db({ gesamt_lesen: () => ({ data: vorhanden, error: null }) })
    const s = stapel(() => ({ roh: JSON.stringify(GESAMT_GUT) }), { rpc: x.rpc })
    const e = await erstelleGesamt(s.d, { monat: '2026-09', neu })
    assert.deepEqual([e.uebersprungen, s.runden.length, x.anzahl('gesamt_speichern')], [false, 1, 1], JSON.stringify([vorhanden, neu]))
  }
})

test('Gesamtauswertung: Faktencheck nicht bestanden → Wiederholung; Rechte und Fehler der Datenbank kommen durch', async () => {
  const x = db({ gesamt_pruefen: (_a, n) => (n === 1 ? { data: { geprueft: false, abweichungen: ['4,71'] }, error: null } : { data: { geprueft: true, abweichungen: [] }, error: null }) })
  const s = stapel((_a, runde) => ({ roh: JSON.stringify({ ...GESAMT_GUT, zusammenfassung: runde === 1 ? 'Wert 4,71' : 'Wert 3,8' }) }), { rpc: x.rpc })
  const r = await erstelleGesamt(s.d, { monat: '2026-09', neu: false })
  assert.equal(r.versuche, 2)
  assert.match(s.runden[1].auftraege[0].nachricht, /4,71/)
  assert.match(String(x.aufrufe.find((a) => a.name === 'gesamt_speichern')!.args.p_text), /Wert 3,8/)

  const verboten = db({ gesamt_eingabe: () => ({ data: null, error: { code: '42501', message: 'Nur für Admins.' } }) })
  await assert.rejects(erstelleGesamt(stapel(() => ({ roh: '' }), { rpc: verboten.rpc }).d, { monat: '2026-09', neu: false }), (e: unknown) => e instanceof AnalyseFehler && e.status === 403 && e.message === 'Nur für Admins.')
  const offen = db({ gesamt_eingabe: () => ({ data: null, error: { code: '22023', message: 'Der Monat ist noch nicht abgeschlossen.' } }) })
  await assert.rejects(erstelleGesamt(stapel(() => ({ roh: '' }), { rpc: offen.rpc }).d, { monat: '2026-09', neu: false }), (e: unknown) => e instanceof AnalyseFehler && e.status === 422)
})

// ---- HTTP -----------------------------------------------------------------------------------------------------

const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'm' }
const anfrage = (body: unknown, kopf: Record<string, string> = { authorization: 'Bearer jwt' }, methode = 'POST') =>
  new Request('https://f.example/analyse-erstellen', { method: methode, headers: { 'content-type': 'application/json', ...kopf }, body: methode === 'POST' ? JSON.stringify(body) : undefined })

test('HTTP: OPTIONS, falsche Methode, fehlende Anmeldung, ungültige Eingaben', async () => {
  const nie = async () => { throw new Error('darf nicht aufgerufen werden') }
  const o = await behandleAnfrage(anfrage(null, {}, 'OPTIONS'), ENV, nie)
  assert.equal(o.status, 200)
  assert.match(o.headers.get('access-control-allow-headers') ?? '', /authorization/)
  assert.equal((await behandleAnfrage(anfrage(null, {}, 'GET'), ENV, nie)).status, 405)
  assert.equal((await behandleAnfrage(anfrage({ person_id: PERSON, monat: '2026-09' }, {}), ENV, nie)).status, 401)
  for (const kaputt of [{}, { person_id: 'x', monat: '2026-09' }, { person_id: PERSON, monat: '2026-13' }, { person_id: PERSON, monat: '2026-9-01' }, { person_id: PERSON }]) {
    const r = await behandleAnfrage(anfrage(kaputt), ENV, nie)
    assert.equal(r.status, 400, JSON.stringify(kaputt))
    assert.equal(((await r.json()) as { ok: boolean }).ok, false)
  }
  const ungueltig = await behandleAnfrage(new Request('https://f.example/', { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: 'kein json' }), ENV, nie)
  assert.equal(ungueltig.status, 400)
  assert.equal((await behandleAnfrage(anfrage({ person_id: PERSON, monat: '2026-09' }), { ...ENV, SUPABASE_URL: '' }, nie)).status, 500)
})

test('HTTP: kompletter Durchlauf mit nachgebauter Datenbank und KI; Anmeldung der Leitung wird weitergereicht', async () => {
  const gesehen: { url: string; kopf: Record<string, string> }[] = []
  const fetchFn = async (url: string, init?: RequestInit) => {
    const kopf = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>))
    gesehen.push({ url, kopf })
    if (url === 'https://api.anthropic.com/v1/messages') return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(GUT) }] }), { status: 200 })
    const name = url.split('/rpc/')[1]
    const antworten: Record<string, unknown> = {
      analyse_eingabe: { eingabe: EINGABE, hash: 'h1' },
      analyse_lesen: null,
      analyse_pruefen: { geprueft: true, abweichungen: [] },
      analyse_speichern: { status: 'entwurf', geprueft: true },
    }
    return new Response(JSON.stringify(antworten[name]), { status: 200 })
  }
  const r = await behandleAnfrage(anfrage({ person_id: PERSON, monat: '2026-09' }), ENV, fetchFn)
  assert.equal(r.status, 200)
  const body = (await r.json()) as { ok: boolean; uebersprungen: boolean; versuche: number; analyse: { status: string } }
  assert.deepEqual([body.ok, body.uebersprungen, body.versuche, body.analyse.status], [true, false, 1, 'entwurf'])
  const rpcs = gesehen.filter((g) => g.url.includes('/rest/v1/rpc/'))
  assert.deepEqual(rpcs.map((g) => g.url.split('/rpc/')[1]), ['analyse_eingabe', 'analyse_lesen', 'analyse_pruefen', 'analyse_speichern'])
  for (const g of rpcs) {
    assert.equal(g.kopf.authorization, 'Bearer jwt', 'die Anmeldung der Leitung wird weitergereicht')
    assert.equal(g.kopf.apikey, 'anon', 'nur der anon-Schlüssel, nie ein service_role-Schlüssel')
  }
  const ki = gesehen.find((g) => g.url.startsWith('https://api.anthropic.com'))!
  assert.equal(ki.kopf['x-api-key'], 'k')
  assert.ok(!JSON.stringify(gesehen).includes('service_role'))
})

test('HTTP: Fehler der Datenbank und der KI kommen als deutsche Meldung mit Status an', async () => {
  const dbFehler = async () => new Response(JSON.stringify({ code: '22023', message: 'Der Monat ist noch nicht abgeschlossen.' }), { status: 400 })
  const r = await behandleAnfrage(anfrage({ person_id: PERSON, monat: '2026-09' }), ENV, dbFehler)
  assert.equal(r.status, 422)
  assert.deepEqual(await r.json(), { ok: false, fehler: 'Der Monat ist noch nicht abgeschlossen.' })

  const ohneKi = await behandleAnfrage(anfrage({ person_id: PERSON, monat: '2026-09' }), { ...ENV, ANTHROPIC_API_KEY: '' }, async (url) =>
    new Response(JSON.stringify(url.endsWith('analyse_eingabe') ? { eingabe: EINGABE, hash: 'h1' } : null), { status: 200 }))
  assert.equal(ohneKi.status, 503)
  assert.deepEqual(await ohneKi.json(), { ok: false, fehler: NICHT_EINGERICHTET })

  const netz = await behandleAnfrage(anfrage({ person_id: PERSON, monat: '2026-09' }), ENV, async () => { throw new Error('Netz weg') })
  assert.equal(netz.status, 500)
  assert.deepEqual(await netz.json(), { ok: false, fehler: 'Die Analyse konnte nicht erstellt werden.' })
})

// ---- HTTP: Aufgaben -------------------------------------------------------------------------------------------

test('HTTP: Aufgabe und Eingaben werden geprüft', async () => {
  const nie = async () => { throw new Error('darf nicht aufgerufen werden') }
  const code = async (body: unknown) => (await behandleAnfrage(anfrage(body), ENV, nie)).status
  assert.equal(await code({ aufgabe: 'etwas', monat: '2026-09' }), 400)
  assert.equal(await code({ aufgabe: 'gesamt' }), 400)
  assert.equal(await code({ aufgabe: 'gesamt', monat: '2026-13' }), 400)
  assert.equal(await code({ aufgabe: 'alle', monat: 'September' }), 400)
  assert.equal(await code({ aufgabe: 'alle', monat: '2026-09', ausgenommen: 'x' }), 400)
  assert.equal(await code({ aufgabe: 'alle', monat: '2026-09', ausgenommen: ['kein-uuid'] }), 400)
  assert.equal(await code({ aufgabe: 'alle', monat: '2026-09', ausgenommen: Array.from({ length: 201 }, () => PERSON) }), 400)
  assert.equal(await code({ aufgabe: 'person', monat: '2026-09' }), 400, 'Einzelanalyse braucht eine Person')
  assert.equal(await code({ aufgabe: 'gesamt', monat: '2026-09' }), 500, 'gültig: weiter bis zur (hier fehlenden) Datenbank')
})

/** Datenbank und Anbieter für den kompletten Durchlauf über HTTP. */
function umgebung(zusatz: Record<string, unknown> = {}, ki: (url: string, init?: RequestInit) => Response | null = () => null) {
  const gesehen: { url: string; body: any; kopf: Record<string, string> }[] = []
  const fetchFn = async (url: string, init?: RequestInit) => {
    const kopf = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>))
    const body = init?.body ? JSON.parse(String(init.body)) : null
    gesehen.push({ url, body, kopf })
    if (!url.includes('/rest/v1/rpc/')) return ki(url, init) ?? new Response('{}', { status: 500 })
    const name = url.split('/rpc/')[1]
    const antworten: Record<string, unknown> = {
      agenda_ki_eingabe: { eingabe: AGENDA_EINGABE, hash: 'a1' },
      agenda_lesen: null,
      agenda_ki_pruefen: { geprueft: true, abweichungen: [], struktur_fehler: null },
      agenda_ki_speichern: { status: 'entwurf', geprueft: true },
      gesamt_eingabe: { eingabe: GESAMT_EINGABE, hash: 'g1' },
      gesamt_lesen: null,
      gesamt_pruefen: { geprueft: true, abweichungen: [] },
      gesamt_speichern: { status: 'entwurf', geprueft: true },
      abschluss_uebersicht: uebersicht(),
      analyse_eingabe: { eingabe: EINGABE, hash: 'h1' },
      analyse_pruefen: { geprueft: true, abweichungen: [] },
      analyse_speichern: { status: 'entwurf', geprueft: true },
      ...zusatz,
    }
    return new Response(JSON.stringify(antworten[name]), { status: 200 })
  }
  return { fetchFn, gesehen }
}

test('HTTP: Gesamtauswertung über Claude', async () => {
  const u = umgebung({}, (url) => (url === 'https://api.anthropic.com/v1/messages' ? new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(GESAMT_GUT) }] }), { status: 200 }) : null))
  const r = await behandleAnfrage(anfrage({ aufgabe: 'gesamt', monat: '2026-09' }), ENV, u.fetchFn)
  assert.equal(r.status, 200)
  const body = (await r.json()) as { ok: boolean; uebersprungen: boolean; versuche: number; analyse: { status: string } }
  assert.deepEqual([body.ok, body.uebersprungen, body.versuche, body.analyse.status], [true, false, 1, 'entwurf'])
  assert.deepEqual(u.gesehen.filter((g) => g.url.includes('/rpc/')).map((g) => g.url.split('/rpc/')[1]), ['gesamt_eingabe', 'gesamt_lesen', 'gesamt_pruefen', 'gesamt_speichern'])
  const ki = u.gesehen.find((g) => g.url.startsWith('https://api.anthropic.com'))!
  assert.equal(ki.body.system, SYSTEM_PROMPT_GESAMT)
  assert.ok(u.gesehen.filter((g) => g.url.includes('/rpc/')).every((g) => g.kopf.authorization === 'Bearer jwt' && g.kopf.apikey === 'anon'))
  assert.ok(!JSON.stringify(u.gesehen).includes('service_role'))
})

test('HTTP: Sammellauf über den Webhook — ein Aufruf mit allen Aufträgen, Ergebnisse je Person gespeichert', async () => {
  const ENV_W = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', AI_PROVIDER: 'webhook', AI_WEBHOOK_URL: 'https://n8n.example/webhook/dawiid', AI_WEBHOOK_SECRET: 'geheim' }
  const u = umgebung(
    { abschluss_uebersicht: mitPersonen(2) },
    (url) => (url === ENV_W.AI_WEBHOOK_URL ? new Response(JSON.stringify({ ergebnisse: [{ ref: '2', code: 200, ausgabe: GUT }, { ref: '1', code: 200, ausgabe: GUT }] }), { status: 200 }) : null),
  )
  const r = await behandleAnfrage(anfrage({ aufgabe: 'alle', monat: '2026-09', ausgenommen: [] }), ENV_W, u.fetchFn)
  assert.equal(r.status, 200)
  const body = (await r.json()) as { ok: boolean; aufgabe: string; erstellt: { person_id: string }[]; fehlgeschlagen: unknown[]; verbleibend: number }
  assert.deepEqual([body.ok, body.aufgabe, body.erstellt.map((e) => e.person_id), body.fehlgeschlagen.length, body.verbleibend], [true, 'alle', [ID(1), ID(2)], 0, 0])
  const webhooks = u.gesehen.filter((g) => g.url === ENV_W.AI_WEBHOOK_URL)
  assert.equal(webhooks.length, 1)
  assert.equal(webhooks[0].kopf['x-webhook-secret'], 'geheim')
  assert.deepEqual([webhooks[0].body.aufgabe, webhooks[0].body.prompt_version, webhooks[0].body.auftraege.map((a: Auftrag) => a.ref)], [AUFGABE_EINZEL, PROMPT_VERSION, ['1', '2']])
  assert.ok(!JSON.stringify(webhooks[0].body).includes(ID(1)), 'keine Personen-Kennung im Webhook')
  assert.deepEqual(u.gesehen.filter((g) => g.url.endsWith('/analyse_speichern')).map((g) => g.body.p_person), [ID(1), ID(2)])
})

test('HTTP: Sammellauf — Verantwortliche ohne KI-Recht bekommen 403 und die KI wird nicht gefragt', async () => {
  const u = umgebung({ abschluss_uebersicht: uebersicht({ ki: false }) })
  const r = await behandleAnfrage(anfrage({ aufgabe: 'alle', monat: '2026-09' }), ENV, u.fetchFn)
  assert.equal(r.status, 403)
  assert.deepEqual(await r.json(), { ok: false, fehler: 'Nur für Admins.' })
  assert.ok(!u.gesehen.some((g) => g.url.startsWith('https://api.anthropic.com')))
})

test('HTTP: Einzelanalyse ohne Aufgabe wie bisher (aufgabe = person)', async () => {
  const u = umgebung({}, (url) => (url === 'https://api.anthropic.com/v1/messages' ? new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(GUT) }] }), { status: 200 }) : null))
  const r = await behandleAnfrage(anfrage({ aufgabe: 'person', person_id: PERSON, monat: '2026-09' }), ENV, u.fetchFn)
  assert.equal(r.status, 200)
  assert.equal(u.gesehen.find((g) => g.url.startsWith('https://api.anthropic.com'))!.body.system, SYSTEM_PROMPT)
})

// ---- Agenda mit KI --------------------------------------------------------------------------------------------

test('Agenda: Prompt, Version und Aufbau der Antwort', () => {
  assert.match(PROMPT_VERSION_AGENDA, /^agenda-ki-v\d+$/)
  assert.equal(AUFGABE_AGENDA, 'agenda')
  assert.match(SYSTEM_PROMPT_AGENDA, /genau fünf Blöcken/)
  assert.match(SYSTEM_PROMPT_AGENDA, /einstieg, kennzahlen, fokus, entwicklung, vereinbarungen/)
  assert.match(SYSTEM_PROMPT_AGENDA, /ausschließlich Zahlen, die in den Daten stehen/)
  assert.match(SYSTEM_PROMPT_AGENDA, /keine Namen, keine Einzelpersonen und keine Kommentartexte/)
})

test('parseAgendaAusgabe: Objekt, JSON-Text, Code-Zaun; Punkte als Text oder { text }; Zahlen als Text', () => {
  assert.equal(parseAgendaAusgabe(AGENDA_GUT).bloecke.length, 5)
  assert.deepEqual(parseAgendaAusgabe('```json\n' + JSON.stringify(AGENDA_GUT) + '\n```').bloecke[2].punkte, ['Fokus: Verhalten 1.', 'Größte Differenz bei Verhalten 2.'])
  const gemischt = { bloecke: AGENDA_GUT.bloecke.map((b, i) => (i === 0 ? { ...b, minuten: '2', punkte: [{ text: '  Danke \n an alle  ' }, ''] } : b)) }
  const a = parseAgendaAusgabe(gemischt)
  assert.deepEqual([a.bloecke[0].minuten, a.bloecke[0].punkte], [2, ['Danke an alle']])
})

test('parseAgendaAusgabe: falsche Form wird abgelehnt (Anzahl, Reihenfolge, Minuten, Punkte)', () => {
  const mit = (f: (b: typeof AGENDA_GUT.bloecke) => unknown) => ({ bloecke: f(structuredClone(AGENDA_GUT.bloecke)) })
  for (const kaputt of [
    'kein json', [], { bloecke: 'x' }, mit((b) => b.slice(0, 4)),
    mit((b) => [b[1], b[0], ...b.slice(2)]),
    mit((b) => b.map((x, i) => (i === 0 ? { ...x, minuten: null } : x))),
    mit((b) => b.map((x, i) => (i === 0 ? { ...x, minuten: 'zwei' } : x))),
    mit((b) => b.map((x, i) => (i === 1 ? { ...x, punkte: [] } : x))),
    mit((b) => b.map((x, i) => (i === 1 ? { ...x, punkte: [1, null] } : x))),
    mit((b) => b.map((x, i) => (i === 1 ? 'x' : x))),
  ]) {
    assert.throws(() => parseAgendaAusgabe(kaputt), undefined, `soll ablehnen: ${JSON.stringify(kaputt)}`)
  }
})

test('Agenda: eigene Funktionen, eigener Prompt, eigene Aufgabe; die Datenbank setzt den Rest', async () => {
  const x = db()
  const { d, runden } = stapel(() => ({ roh: JSON.stringify(AGENDA_GUT) }), { rpc: x.rpc })
  const r = await erstelleAgenda(d, { monat: '2026-09', neu: false })
  assert.deepEqual([r.uebersprungen, r.versuche], [false, 1])
  assert.deepEqual(x.aufrufe.map((a) => a.name), ['agenda_ki_eingabe', 'agenda_lesen', 'agenda_ki_pruefen', 'agenda_ki_speichern'])
  assert.deepEqual([runden[0].aufgabe, runden[0].version, runden[0].auftraege[0].system], [AUFGABE_AGENDA, PROMPT_VERSION_AGENDA, SYSTEM_PROMPT_AGENDA])
  assert.equal(runden[0].auftraege[0].nachricht, baueNachricht(AGENDA_EINGABE))
  const pruefen = x.aufrufe.find((a) => a.name === 'agenda_ki_pruefen')!.args
  assert.deepEqual(Object.keys(pruefen).sort(), ['p_bloecke', 'p_monat'])
  assert.equal((pruefen.p_bloecke as unknown[]).length, 5)
  const speichern = x.aufrufe.find((a) => a.name === 'agenda_ki_speichern')!.args
  assert.deepEqual(Object.keys(speichern).sort(), ['p_anbieter', 'p_bloecke', 'p_modell', 'p_monat', 'p_prompt_version', 'p_versuche'])
  assert.deepEqual([speichern.p_monat, speichern.p_prompt_version, speichern.p_anbieter, speichern.p_versuche], ['2026-09-01', PROMPT_VERSION_AGENDA, 'claude', 1])
  assert.deepEqual(speichern.p_bloecke, AGENDA_GUT.bloecke, 'nur Blöcke, Minuten und Punkte: Überschriften und Hinweise setzt die Datenbank')
  assert.ok(!('p_geprueft' in speichern) && !('geprueft' in speichern))
})

test('Agenda: ein Fehler im Aufbau geht mit der Meldung der Datenbank an die KI zurück', async () => {
  const x = db({
    agenda_ki_pruefen: (_a, n) => (n === 1
      ? { data: { geprueft: false, abweichungen: [], struktur_fehler: 'Der Block „Einstieg und Beteiligung“ dauert genau 2 Minuten.' }, error: null }
      : { data: { geprueft: true, abweichungen: [], struktur_fehler: null }, error: null }),
  })
  const { d, runden } = stapel((_a, runde) => ({ roh: JSON.stringify(runde === 1 ? { bloecke: AGENDA_GUT.bloecke.map((b, i) => (i === 0 ? { ...b, minuten: 5 } : b)) } : AGENDA_GUT) }), { rpc: x.rpc })
  const r = await erstelleAgenda(d, { monat: '2026-09', neu: false })
  assert.equal(r.versuche, 2)
  assert.match(runden[1].auftraege[0].nachricht, /^Deine letzte Antwort passt nicht zur Vorgabe: Der Block „Einstieg und Beteiligung“ dauert genau 2 Minuten\. Halte dich genau an die fünf Blöcke/)
  assert.deepEqual((x.aufrufe.find((a) => a.name === 'agenda_ki_speichern')!.args.p_bloecke as { minuten: number }[])[0].minuten, 2, 'gespeichert wird die zweite Fassung')
})

test('Agenda: erfundene Zahlen führen zur Wiederholung wie bei den Analysen; bleibt der Aufbau falsch, lehnt die Datenbank ab', async () => {
  const x = db({ agenda_ki_pruefen: (_a, n) => (n === 1 ? { data: { geprueft: false, abweichungen: ['4,71'], struktur_fehler: null }, error: null } : { data: { geprueft: true, abweichungen: [], struktur_fehler: null }, error: null }) })
  const { d, runden } = stapel(() => ({ roh: JSON.stringify(AGENDA_GUT) }), { rpc: x.rpc })
  await erstelleAgenda(d, { monat: '2026-09', neu: false })
  assert.match(runden[1].auftraege[0].nachricht, /^Deine letzte Antwort enthielt Zahlen, die nicht in den Daten stehen: 4,71\./)

  const falsch = db({
    agenda_ki_pruefen: () => ({ data: { geprueft: false, abweichungen: [], struktur_fehler: 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.' }, error: null }),
    agenda_ki_speichern: () => ({ data: null, error: { code: '22023', message: 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.' } }),
  })
  const s = stapel(() => ({ roh: JSON.stringify(AGENDA_GUT) }), { rpc: falsch.rpc })
  await assert.rejects(erstelleAgenda(s.d, { monat: '2026-09', neu: false }), (e: unknown) => e instanceof AnalyseFehler && e.status === 422 && /fünf Blöcke/.test(e.message))
  assert.equal(s.runden.length, MAX_AUFRUFE)
})

test('Agenda: gleiche Eingabe und Version = kein neuer Aufruf; die Vorlage zählt nicht als KI-Agenda; Rechte kommen durch', async () => {
  const vorhanden = (anbieter: string, hash = 'a1', version = PROMPT_VERSION_AGENDA) => db({ agenda_lesen: () => ({ data: { eingabe_hash: hash, prompt_version: version, anbieter, status: 'freigegeben' }, error: null }) })
  let gerufen = false
  const gleich = vorhanden('webhook')
  const a = stapel(() => ({ roh: JSON.stringify(AGENDA_GUT) }), { rpc: gleich.rpc, anbieter: () => { gerufen = true; throw new AnalyseFehler(NICHT_EINGERICHTET, 503) } })
  const r = await erstelleAgenda(a.d, { monat: '2026-09', neu: false })
  assert.deepEqual([r.uebersprungen, r.versuche, gerufen, a.runden.length], [true, 0, false, 0])
  for (const [x, neu] of [[vorhanden('vorlage'), false], [vorhanden('webhook', 'anderer'), false], [vorhanden('webhook', 'a1', 'agenda-ki-v0'), false], [vorhanden('webhook'), true]] as const) {
    const s = stapel(() => ({ roh: JSON.stringify(AGENDA_GUT) }), { rpc: x.rpc })
    const e = await erstelleAgenda(s.d, { monat: '2026-09', neu })
    assert.deepEqual([e.uebersprungen, s.runden.length, x.anzahl('agenda_ki_speichern')], [false, 1, 1])
  }
  const verboten = db({ agenda_ki_eingabe: () => ({ data: null, error: { code: '42501', message: 'Nur für Admins.' } }) })
  await assert.rejects(erstelleAgenda(stapel(() => ({ roh: '' }), { rpc: verboten.rpc }).d, { monat: '2026-09', neu: false }), (e: unknown) => e instanceof AnalyseFehler && e.status === 403 && e.message === 'Nur für Admins.')
})

test('Agenda: über den Webhook geht die Anfrage mit aufgabe = agenda an den einen Webhook', async () => {
  const ENV_W = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', AI_PROVIDER: 'webhook', AI_WEBHOOK_URL: 'https://tobitest2008.app.n8n.cloud/webhook/dawiid-ki', AI_WEBHOOK_SECRET: 'geheim' }
  const u = umgebung({}, (url) => (url === ENV_W.AI_WEBHOOK_URL ? new Response(JSON.stringify({ ergebnisse: [{ ref: '1', code: 200, ausgabe: AGENDA_GUT }] }), { status: 200 }) : null))
  const r = await behandleAnfrage(anfrage({ aufgabe: 'agenda', monat: '2026-09' }), ENV_W, u.fetchFn)
  assert.equal(r.status, 200)
  const body = (await r.json()) as { ok: boolean; uebersprungen: boolean; versuche: number }
  assert.deepEqual([body.ok, body.uebersprungen, body.versuche], [true, false, 1])
  const w = u.gesehen.find((g) => g.url === ENV_W.AI_WEBHOOK_URL)!
  assert.deepEqual([w.body.aufgabe, w.body.prompt_version, w.body.auftraege[0].system === SYSTEM_PROMPT_AGENDA, w.kopf['x-webhook-secret']], [AUFGABE_AGENDA, PROMPT_VERSION_AGENDA, true, 'geheim'])
  assert.deepEqual(u.gesehen.filter((g) => g.url.includes('/rpc/')).map((g) => g.url.split('/rpc/')[1]), ['agenda_ki_eingabe', 'agenda_lesen', 'agenda_ki_pruefen', 'agenda_ki_speichern'])
})
