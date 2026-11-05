// Prüft den n8n-Workflow `dawiid-analyse.workflow.json`: Aufbau, die Code-Knoten (mit nachgebautem n8n-Kontext) und das
// Zusammenspiel mit der Edge Function (rufeAnbieter und parseAusgabe lesen die Antwort des Workflows).
// Ausführen: npm run test:n8n
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PROMPT_VERSION, SYSTEM_PROMPT, parseAusgabe, rufeAnbieter } from '../supabase/functions/analyse-erstellen/analyse.ts'

const lies = (pfad) => JSON.parse(readFileSync(new URL(pfad, import.meta.url), 'utf8'))
const workflow = lies('./dawiid-analyse.workflow.json')
const anfragen = Object.fromEntries(
  readdirSync(new URL('./testanfragen/', import.meta.url)).filter((d) => d.endsWith('.json')).map((d) => [d.replace('.json', ''), lies(`./testanfragen/${d}`)]),
)
const knoten = (name) => {
  const k = workflow.nodes.find((n) => n.name === name)
  assert.ok(k, `Knoten fehlt: ${name}`)
  return k
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
/** Führt einen Code-Knoten aus, mit nachgebautem $input und $('Knoten'). */
async function laufe(name, eingang, andere = {}) {
  const f = new AsyncFunction('$input', '$', knoten(name).parameters.jsCode)
  const ergebnis = await f({ first: () => ({ json: eingang }) }, (n) => ({ first: () => ({ json: andere[n] }) }))
  assert.equal(ergebnis.length, 1)
  return ergebnis[0].json
}

const webhookEingang = (body) => ({ headers: {}, params: {}, query: {}, body })
const anthropic = (text, extra = {}) => ({
  statusCode: 200,
  body: { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 400 }, content: [{ type: 'text', text }], ...extra },
})

// Eine Antwort, die zu den Daten von anna.json passt (alle Zahlen stehen in der Eingabe)
const GUTE_AUSGABE = {
  zusammenfassung: 'Im September 2026 liegt das Selbstbild bei 4,0 und das Fremdbild bei 3,0. Die Differenz beträgt 1,0.',
  staerken: ['Beim ersten Verhalten liegt das Fremdbild bei 3,5, ein Plus von 1,5 zum Vormonat.', 'Die Person bemüht sich erkennbar.'],
  entwicklungsfelder: ['Beim zweiten Verhalten liegt das Fremdbild bei 2,5 bei einem Selbstbild von 4.', 'Kunden warten teils zu lange.'],
  gespraechsfragen: ['Was läuft gut?', 'Wo siehst du die Differenz?', 'Was brauchst du?'],
  vereinbarungen_vorschlaege: ['Pünktlichkeit besprechen.', 'Nach vier Wochen erneut ansehen.'],
  kommentar_qualitaet_hinweis: null,
}

// ---- Aufbau -----------------------------------------------------------------------------------------------------

test('Aufbau: eindeutige Namen, alle Verbindungen zeigen auf vorhandene Knoten', () => {
  const namen = workflow.nodes.map((n) => n.name)
  assert.equal(new Set(namen).size, namen.length)
  assert.equal(new Set(workflow.nodes.map((n) => n.id)).size, namen.length)
  for (const [von, ausgaenge] of Object.entries(workflow.connections)) {
    assert.ok(namen.includes(von), `Quelle fehlt: ${von}`)
    for (const liste of ausgaenge.main) for (const ziel of liste) assert.ok(namen.includes(ziel.node), `Ziel fehlt: ${ziel.node}`)
  }
  assert.equal(workflow.active, false, 'wird erst nach dem Einrichten aktiviert')
})

test('Aufbau: Webhook mit Header-Prüfung, Antwort über „Respond to Webhook“, keine Zugangsdaten im Export', () => {
  const w = knoten('Webhook').parameters
  assert.deepEqual([w.httpMethod, w.authentication, w.responseMode], ['POST', 'headerAuth', 'responseNode'])
  assert.ok(workflow.nodes.every((n) => !('credentials' in n)), 'Zugangsdaten gehören nicht in den Export')
  assert.ok(!/sk-ant-/.test(JSON.stringify(workflow)))
  const c = knoten('Bei Claude anfragen')
  assert.equal(c.parameters.url, 'https://api.anthropic.com/v1/messages')
  assert.deepEqual(c.parameters.headerParameters.parameters, [{ name: 'anthropic-version', value: '2023-06-01' }])
  assert.equal(c.onError, 'continueRegularOutput')
  assert.ok(c.parameters.options.timeout < 90_000, 'muss vor der Zeitgrenze der Edge Function (90 s) antworten')
})

test('Aufbau: angeheftete Beispielanfrage entspricht anna.json und dem aktuellen Prompt', () => {
  const pin = workflow.pinData.Webhook[0].json.body
  assert.deepEqual(pin, anfragen.anna)
})

test('Testanfragen passen zur Edge Function (sonst: node n8n/testanfragen-erzeugen.mjs)', () => {
  assert.ok(Object.keys(anfragen).length >= 3)
  for (const [name, a] of Object.entries(anfragen)) {
    assert.equal(a.prompt_version, PROMPT_VERSION, `${name}: prompt_version`)
    assert.equal(a.system, SYSTEM_PROMPT, `${name}: system`)
    assert.ok(a.nachricht.startsWith('Daten (JSON):\n'), `${name}: nachricht`)
    assert.deepEqual(JSON.parse(a.nachricht.slice('Daten (JSON):\n'.length)), a.eingabe, `${name}: nachricht enthält die eingabe`)
    assert.ok(!/@/.test(JSON.stringify(a.eingabe)), `${name}: keine E-Mail-Adresse in den Daten`)
    assert.ok(!/Anna|Berta|Ludwig|Cora|Dietrich|Hollmann/.test(JSON.stringify(a.eingabe)), `${name}: keine Namen in den Daten`)
  }
})

test('Anfrage an Claude: der Body enthält Modell, Token-Grenze, Prompt und Nachricht', async () => {
  const geprueft = await laufe('Anfrage prüfen', webhookEingang(anfragen.anna))
  const ausdruck = knoten('Bei Claude anfragen').parameters.jsonBody
  assert.match(ausdruck, /^=\{\{ .* \}\}$/s)
  const body = JSON.parse(new Function('$json', 'return ' + ausdruck.slice(3, -2))(geprueft))
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'system'])
  assert.equal(body.model, 'claude-sonnet-5-5')
  assert.equal(body.max_tokens, 2000)
  assert.equal(body.system, SYSTEM_PROMPT)
  assert.deepEqual(body.messages, [{ role: 'user', content: anfragen.anna.nachricht }])
})

// ---- Anfrage prüfen ---------------------------------------------------------------------------------------------

test('Anfrage prüfen: gültige Anfrage geht unverändert weiter', async () => {
  const r = await laufe('Anfrage prüfen', webhookEingang(anfragen.berta))
  assert.equal(r.gueltig, true)
  assert.deepEqual(r.fehler, [])
  assert.equal(r.system, SYSTEM_PROMPT)
  assert.equal(r.nachricht, anfragen.berta.nachricht)
  assert.equal(r.prompt_version, PROMPT_VERSION)
})

test('Anfrage prüfen: fehlende Felder werden benannt', async () => {
  const r = await laufe('Anfrage prüfen', webhookEingang({ prompt_version: 'x' }))
  assert.equal(r.gueltig, false)
  assert.deepEqual(r.fehler, ['nachricht fehlt', 'system fehlt', 'eingabe fehlt'])
  const leer = await laufe('Anfrage prüfen', { headers: {}, params: {}, query: {} })
  assert.equal(leer.gueltig, false)
  const lang = await laufe('Anfrage prüfen', webhookEingang({ ...anfragen.anna, nachricht: 'x'.repeat(60001) }))
  assert.deepEqual(lang.fehler, ['nachricht ist zu lang'])
})

// ---- Antwort lesen ----------------------------------------------------------------------------------------------

async function lesen(antwort, anfrageBody = anfragen.anna) {
  const geprueft = await laufe('Anfrage prüfen', webhookEingang(anfrageBody))
  return laufe('Antwort lesen', antwort, { 'Anfrage prüfen': geprueft })
}

test('Antwort lesen: reines JSON, mit Code-Zaun und mit Text davor und danach', async () => {
  const text = JSON.stringify(GUTE_AUSGABE)
  for (const roh of [text, '```json\n' + text + '\n```', 'Hier ist die Analyse:\n' + text + '\nViel Erfolg!']) {
    const r = await lesen(anthropic(roh))
    assert.equal(r.code, 200)
    assert.deepEqual(r.body.ausgabe, GUTE_AUSGABE)
    assert.deepEqual(r.body.meta.hinweise, [])
    assert.deepEqual(r.body.meta.tokens, { eingabe: 900, ausgabe: 400 })
    assert.equal(r.body.meta.prompt_version, PROMPT_VERSION)
  }
})

test('Antwort lesen: Hinweise zu Anzahl, Buchstaben-Bezeichnung und fehlendem Schlüssel', async () => {
  const zuViel = { ...GUTE_AUSGABE, staerken: ['a', 'b', 'c', 'd', 'e'], gespraechsfragen: ['nur eine'] }
  delete zuViel.kommentar_qualitaet_hinweis
  zuViel.zusammenfassung = 'Kollege B sieht das auch.'
  const r = await lesen(anthropic(JSON.stringify(zuViel)))
  assert.equal(r.code, 200)
  assert.deepEqual(r.body.meta.hinweise, [
    'staerken: 5 Punkte (erwartet 2 bis 4)',
    'gespraechsfragen: 1 Punkte (erwartet 3 bis 4)',
    'kommentar_qualitaet_hinweis fehlt (wird als leer gewertet)',
    'Enthält eine Buchstaben-Bezeichnung wie „Kollege A“ (laut Prompt nicht erlaubt)',
  ])
})

test('Antwort lesen: kein JSON → Text geht weiter, die Plattform fragt selbst erneut', async () => {
  const r = await lesen(anthropic('Das kann ich leider nicht.'))
  assert.equal(r.code, 200)
  assert.equal(r.body.ausgabe, 'Das kann ich leider nicht.')
  assert.match(r.body.meta.hinweise[0], /kein gültiges JSON/)
  const abgeschnitten = await lesen(anthropic('{"zusammenfassung": "Im Sep', { stop_reason: 'max_tokens' }))
  assert.equal(abgeschnitten.code, 200)
  assert.match(abgeschnitten.body.meta.hinweise.join(' '), /abgeschnitten/)
})

test('Antwort lesen: Fehler von Anthropic und Netzwerkfehler', async () => {
  const ausgelastet = await lesen({ statusCode: 429, body: { error: { type: 'rate_limit_error', message: 'Slow down' } } })
  assert.equal(ausgelastet.code, 429)
  assert.equal(ausgelastet.body.fehler, 'Die KI ist gerade ausgelastet.')
  const abgelehnt = await lesen({ statusCode: 401, body: { error: { message: 'invalid x-api-key' } } })
  assert.equal(abgelehnt.code, 502, '401 von Anthropic darf nicht als 401 an die Plattform gehen (sie würde auf die Supabase-Secrets verweisen)')
  assert.equal(abgelehnt.body.detail, 'invalid x-api-key')
  const netz = await lesen({ error: { message: 'timeout of 75000ms exceeded' } })
  assert.equal(netz.code, 502)
  assert.equal(netz.body.detail, 'timeout of 75000ms exceeded')
  const leer = await lesen({ statusCode: 200, body: { content: [], stop_reason: 'end_turn' } })
  assert.equal(leer.code, 502)
})

// ---- Zahlencheck ------------------------------------------------------------------------------------------------

async function zahlen(ausgabe, body = anfragen.anna) {
  const geprueft = await laufe('Anfrage prüfen', webhookEingang(body))
  const gelesen = await laufe('Antwort lesen', anthropic(typeof ausgabe === 'string' ? ausgabe : JSON.stringify(ausgabe)), { 'Anfrage prüfen': geprueft })
  return laufe('Zahlencheck (Orientierung)', gelesen, { 'Anfrage prüfen': geprueft })
}

test('Zahlencheck: Zahlen aus den Daten bestehen (3,5 = 3.5, 1 bis 5 immer, Listennummern zählen nicht)', async () => {
  const mitListe = { ...GUTE_AUSGABE, gespraechsfragen: ['1. Was läuft gut?', '2) Wo siehst du die Differenz?', '3. Was brauchst du?'] }
  const r = await zahlen(mitListe)
  assert.deepEqual(r.body.meta.zahlen_nicht_in_daten, [])
  assert.equal(r.body.meta.faktencheck_orientierung, 'bestanden')
})

test('Zahlencheck: erfundene Zahlen werden genannt, Vorzeichen zählt nicht, 3,50 = 3,5', async () => {
  // Gegenprobe gegen die Datenbank (analyse_pruefen, lokal, gleiche Daten): „2,9, 4,71 und 12 stehen nicht in den Daten“
  const erfunden = {
    ...GUTE_AUSGABE,
    zusammenfassung: 'Das Fremdbild liegt bei 4,71, eine Steigerung von 2,9. Ein Minus von 1,5 zum Vormonat.',
    staerken: ['Stark, 3,50 im ersten Verhalten.', 'Zweiter Punkt'],
    kommentar_qualitaet_hinweis: 'Die 12 Kommentare sind kurz.',
  }
  const r = await zahlen(erfunden)
  assert.deepEqual([...r.body.meta.zahlen_nicht_in_daten].sort(), ['12', '2,9', '4,71'])
  assert.equal(r.body.meta.faktencheck_orientierung, 'Abweichung')
})

test('Zahlencheck: Fehlerantworten und Text-Antworten gehen unverändert durch', async () => {
  const r = await zahlen('Das kann ich leider nicht.')
  assert.equal(r.code, 200)
  assert.equal(r.body.meta.faktencheck_orientierung, undefined)
})

test('Zahlencheck: alle drei Testanfragen mit passender Antwort bestehen', async () => {
  for (const [name, a] of Object.entries(anfragen)) {
    const ausgabe = { ...GUTE_AUSGABE, zusammenfassung: `Im September 2026 haben ${a.eingabe.beteiligung.abgegeben} von ${a.eingabe.beteiligung.erwartet} abgegeben.` }
    const r = await zahlen(ausgabe, a)
    assert.deepEqual(r.body.meta.zahlen_nicht_in_daten, ['3,5', '2,5', '1,5'].filter((z) => !JSON.stringify(a.eingabe).includes(z.replace(',', '.'))), name)
  }
})

// ---- Zusammenspiel mit der Edge Function ------------------------------------------------------------------------

test('Edge Function liest die Antwort des Workflows (Header, Body, parseAusgabe)', async () => {
  const geprueft = await laufe('Anfrage prüfen', webhookEingang(anfragen.anna))
  const gelesen = await laufe('Antwort lesen', anthropic(JSON.stringify(GUTE_AUSGABE)), { 'Anfrage prüfen': geprueft })
  const fertig = await laufe('Zahlencheck (Orientierung)', gelesen, { 'Anfrage prüfen': geprueft })
  assert.equal(fertig.code, 200)

  let aufruf
  const fetchFn = async (url, init) => {
    aufruf = { url, init }
    return new Response(JSON.stringify(fertig.body), { status: fertig.code, headers: { 'content-type': 'application/json' } })
  }
  const config = { name: 'webhook', modell: null, url: 'https://n8n.example/webhook/dawiid-analyse', geheimnis: 'geheim' }
  const roh = await rufeAnbieter(config, anfragen.anna.nachricht, anfragen.anna.eingabe, fetchFn)
  // die Anfrage der Edge Function hat genau die Form, die der Workflow erwartet
  const gesendet = JSON.parse(aufruf.init.body)
  assert.deepEqual(Object.keys(gesendet).sort(), ['eingabe', 'nachricht', 'prompt_version', 'system'])
  assert.equal(aufruf.init.headers['x-webhook-secret'], 'geheim')
  assert.equal((await laufe('Anfrage prüfen', webhookEingang(gesendet))).gueltig, true)
  // und ihre Auswertung der Antwort
  const a = parseAusgabe(roh)
  assert.equal(a.zusammenfassung, GUTE_AUSGABE.zusammenfassung)
  assert.equal(a.kommentar_qualitaet_hinweis, null)
  assert.equal(a.staerken.length, 2)
})

test('Edge Function: Antwort ohne gültiges JSON wird abgelehnt (löst dort die Wiederholung aus)', async () => {
  const gelesen = await lesen(anthropic('Das kann ich leider nicht.'))
  assert.throws(() => parseAusgabe(gelesen.body.ausgabe))
})
