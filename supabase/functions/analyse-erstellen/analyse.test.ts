// Tests für die Logik der Edge Function (Node: `node --test supabase/functions/analyse-erstellen/analyse.test.ts`).
// Datenbank und KI-Anbieter sind nachgebaut; es gibt keinen Netzzugriff.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AnalyseFehler, MAX_AUFRUFE, NICHT_EINGERICHTET, PROMPT_VERSION, SYSTEM_PROMPT, anbieterAusUmgebung, baueNachricht,
  behandleAnfrage, erstelleAnalyse, parseAusgabe, rufeAnbieter, textAusAusgabe,
  type Abhaengigkeiten, type AnbieterConfig, type RpcAntwort,
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

/** Nachgebaute Datenbank: protokolliert alle Aufrufe; die Antworten lassen sich je Funktion überschreiben. */
function db(overrides: Record<string, (args: Record<string, unknown>, n: number) => RpcAntwort> = {}) {
  const aufrufe: { name: string; args: Record<string, unknown> }[] = []
  const zaehler: Record<string, number> = {}
  const standard: Record<string, (args: Record<string, unknown>, n: number) => RpcAntwort> = {
    analyse_eingabe: () => ({ data: { eingabe: EINGABE, hash: 'h1' }, error: null }),
    analyse_lesen: () => ({ data: null, error: null }),
    analyse_pruefen: () => ({ data: { geprueft: true, abweichungen: [] }, error: null }),
    analyse_speichern: (a) => ({ data: { status: 'entwurf', text: a.p_text, versuche: a.p_versuche }, error: null }),
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
  fehlt({})
  fehlt({ AI_PROVIDER: '' })
  fehlt({ AI_PROVIDER: 'claude' })
  fehlt({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: '   ' })
  fehlt({ AI_PROVIDER: 'webhook' })
  fehlt({ AI_PROVIDER: 'webhook', AI_WEBHOOK_URL: 'http://unsicher.example/hook' })
  fehlt({ AI_PROVIDER: 'etwas-anderes', ANTHROPIC_API_KEY: 'x' })
})

test('anbieterAusUmgebung: claude und webhook', () => {
  const c = anbieterAusUmgebung({ AI_PROVIDER: 'Claude', ANTHROPIC_API_KEY: ' k ', ANTHROPIC_MODEL: 'm1' })
  assert.deepEqual([c.name, c.modell, c.schluessel], ['claude', 'm1', 'k'])
  assert.equal(anbieterAusUmgebung({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }).modell, 'claude-sonnet-5-5')
  const w = anbieterAusUmgebung({ AI_PROVIDER: 'webhook', AI_WEBHOOK_URL: 'https://n8n.example/hook', AI_WEBHOOK_SECRET: 's' })
  assert.deepEqual([w.name, w.url, w.geheimnis, w.modell], ['webhook', 'https://n8n.example/hook', 's', null])
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

test('rufeAnbieter webhook: Geheimnis im Header, Antwort direkt oder verpackt', async () => {
  const w: AnbieterConfig = { name: 'webhook', modell: null, url: 'https://n8n.example/hook', geheimnis: 's3' }
  let gesehen: RequestInit = {}
  const liefert = (daten: unknown) => async (_u: string, init?: RequestInit) => {
    gesehen = init ?? {}
    return new Response(JSON.stringify(daten), { status: 200 })
  }
  assert.deepEqual(await rufeAnbieter(w, 'n', EINGABE, liefert({ ausgabe: GUT })), GUT)
  const h = gesehen.headers as Record<string, string>
  assert.equal(h.authorization, 'Bearer s3')
  assert.equal(h['x-webhook-secret'], 's3')
  const body = JSON.parse(String(gesehen.body))
  assert.deepEqual([body.prompt_version, body.nachricht, body.system === SYSTEM_PROMPT], [PROMPT_VERSION, 'n', true])
  assert.deepEqual(body.eingabe, EINGABE)
  assert.equal(await rufeAnbieter(w, 'n', EINGABE, liefert({ text: '{"x":1}' })), '{"x":1}')
  assert.deepEqual(await rufeAnbieter(w, 'n', EINGABE, liefert(GUT)), GUT)
  const ohne = { ...w, geheimnis: undefined }
  await rufeAnbieter(ohne, 'n', EINGABE, liefert({ ausgabe: GUT }))
  assert.equal((gesehen.headers as Record<string, string>).authorization, undefined)
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

  const ohneKi = await behandleAnfrage(anfrage({ person_id: PERSON, monat: '2026-09' }), { ...ENV, AI_PROVIDER: '' }, async (url) =>
    new Response(JSON.stringify(url.endsWith('analyse_eingabe') ? { eingabe: EINGABE, hash: 'h1' } : null), { status: 200 }))
  assert.equal(ohneKi.status, 503)
  assert.deepEqual(await ohneKi.json(), { ok: false, fehler: NICHT_EINGERICHTET })

  const netz = await behandleAnfrage(anfrage({ person_id: PERSON, monat: '2026-09' }), ENV, async () => { throw new Error('Netz weg') })
  assert.equal(netz.status, 500)
  assert.deepEqual(await netz.json(), { ok: false, fehler: 'Die Analyse konnte nicht erstellt werden.' })
})
