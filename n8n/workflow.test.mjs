// Prüft den n8n-Workflow `dawiid-ki.workflow.json`: Aufbau (ein Webhook, Stränge), die Code-Knoten (mit nachgebautem
// n8n-Kontext), den ganzen Durchlauf mit nachgebautem Agenten und das Zusammenspiel mit der Edge Function.
// Ausführen: npm run test:n8n
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  AUFGABE_AGENDA, AUFGABE_EINZEL, AUFGABE_GESAMT, PROMPT_VERSION, PROMPT_VERSION_AGENDA, PROMPT_VERSION_GESAMT, SYSTEM_PROMPT,
  SYSTEM_PROMPT_AGENDA, SYSTEM_PROMPT_GESAMT, baueNachricht, erstelleAgenda, erstelleAlle, erstelleGesamt, parseAgendaAusgabe,
  parseAusgabe, parseGesamtAusgabe, rufeAnbieterBatch,
} from '../supabase/functions/analyse-erstellen/analyse.ts'

const lies = (pfad) => JSON.parse(readFileSync(new URL(pfad, import.meta.url), 'utf8'))
const workflow = lies('./dawiid-ki.workflow.json')
const anfragen = Object.fromEntries(
  readdirSync(new URL('./testanfragen/', import.meta.url)).filter((d) => d.endsWith('.json')).map((d) => [d.replace('.json', ''), lies(`./testanfragen/${d}`)]),
)
const knoten = (name) => {
  const k = workflow.nodes.find((n) => n.name === name)
  assert.ok(k, `Knoten fehlt: ${name}`)
  return k
}

// ---- nachgebauter n8n-Kontext ---------------------------------------------------------------------------------

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const kontextFn = (kontext, i) => (n) => ({
  item: { json: kontext[n][i] },
  first: () => ({ json: kontext[n][0] }),
  all: () => kontext[n].map((json) => ({ json })),
})

/** Code-Knoten im Modus „einmal für alle Items“ */
async function laufeAlle(name, eingaben, kontext = {}, codeAendern = (c) => c) {
  const f = new AsyncFunction('$input', '$', '$itemIndex', codeAendern(knoten(name).parameters.jsCode))
  const $input = { first: () => ({ json: eingaben[0] }), all: () => eingaben.map((json) => ({ json })) }
  return (await f($input, kontextFn(kontext, 0), 0)).map((x) => x.json)
}

/** Code-Knoten im Modus „einmal für jedes Item“ */
async function laufeJe(name, eingaben, kontext = {}) {
  assert.equal(knoten(name).parameters.mode, 'runOnceForEachItem')
  const f = new AsyncFunction('$input', '$', '$itemIndex', knoten(name).parameters.jsCode)
  const aus = []
  for (let i = 0; i < eingaben.length; i++) aus.push((await f({ item: { json: eingaben[i] } }, kontextFn(kontext, i), i)).json)
  return aus
}

const eingang = (body) => ({ headers: {}, params: {}, query: {}, body })

/** Der ganze Durchlauf: Anfrage prüfen → Strang nach der Aufgabe → Agent (nachgebaut) → lesen → Zahlencheck → bündeln. */
async function simuliere(body, agentFn) {
  const geprueft = await laufeAlle('Anfrage prüfen', [eingang(body)])
  if (!geprueft[0].gueltig) return { status: 400, body: { fehler: 'Die Anfrage ist unvollständig.', details: geprueft[0].fehler } }
  const regeln = knoten('Aufgabe wählen').parameters.rules.values
  const agentFuer = (aufgabe) => {
    const i = regeln.findIndex((r) => r.conditions.conditions[0].rightValue === aufgabe)
    assert.ok(i >= 0, `kein Strang für ${aufgabe}`)
    return workflow.connections['Aufgabe wählen'].main[i][0].node
  }
  const agentAusgaben = geprueft.map((k) => agentFn(k, agentFuer(k.aufgabe)))
  const gelesen = await laufeJe('Antwort lesen', agentAusgaben, { 'Anfrage prüfen': geprueft })
  const gezaehlt = await laufeJe('Zahlencheck (Orientierung)', gelesen, { 'Anfrage prüfen': geprueft })
  const [fertig] = await laufeAlle('Antwort bündeln', gezaehlt)
  return { status: fertig.code, body: fertig.body }
}

// Antworten, die zu den Daten der Testanfragen passen (alle Zahlen stehen in der Eingabe)
const EINZEL_AUSGABE = {
  zusammenfassung: 'Im September 2026 liegt das Fremdbild bei 3,0 und das Selbstbild bei 4,0.',
  staerken: ['Beim ersten Verhalten liegt das Fremdbild bei 3,5.', 'Die Person bemüht sich erkennbar.'],
  entwicklungsfelder: ['Beim zweiten Verhalten liegt das Fremdbild bei 2,5.', 'Kunden warten teils zu lange.'],
  gespraechsfragen: ['Was läuft gut?', 'Wo siehst du die Differenz?', 'Was brauchst du?'],
  vereinbarungen_vorschlaege: ['Pünktlichkeit besprechen.', 'Nach vier Wochen erneut ansehen.'],
  kommentar_qualitaet_hinweis: null,
}
const GESAMT_AUSGABE = {
  zusammenfassung: 'Im September 2026 liegt das Fremdbild des Teams bei 3,8 und das Selbstbild bei 3,3.',
  staerken: ['Das erste Verhalten liegt beim Fremdbild bei 4,0.', 'Die Beteiligung ist hoch.'],
  entwicklungsfelder: ['Das zweite Verhalten liegt beim Fremdbild bei 3,3.', 'Die Differenz liegt bei −0,5.'],
  gespraechsfragen: ['Was läuft gut?', 'Wo sehen wir Unterschiede?', 'Was brauchen wir?'],
  vereinbarungen_vorschlaege: ['Ein Verhalten gemeinsam üben.', 'Im nächsten Monat erneut ansehen.'],
  datenlage_hinweis: null,
}
const AGENDA_AUSGABE = {
  bloecke: [
    { id: 'einstieg', minuten: 2, punkte: ['Danke an alle. 3 von 4 haben abgegeben.', 'Die Zahlen gelten für September 2026.'] },
    { id: 'kennzahlen', minuten: 3, punkte: ['Das Fremdbild des Teams liegt bei 3,8, das Selbstbild bei 3,3.', 'Die Differenz beträgt −0,5.'] },
    { id: 'fokus', minuten: 7, punkte: ['Fokus-Verhalten 1: das Fremdbild liegt bei 4,0.', 'Die größte Veränderung zum Vormonat zeigt Verhalten 1 mit +2,0.'] },
    { id: 'entwicklung', minuten: 4, punkte: ['Verhalten 2 hat mit 3,3 das niedrigste Fremdbild.', 'Gemeinsam überlegen, was hilft.'] },
    { id: 'vereinbarungen', minuten: 2, punkte: ['Was nehmen wir uns vor?', 'Wer übernimmt welchen Schritt?'] },
  ],
}
const guterAgent = (k) => ({
  output: JSON.stringify(k.aufgabe === AUFGABE_GESAMT ? GESAMT_AUSGABE : k.aufgabe === AUFGABE_AGENDA ? AGENDA_AUSGABE : EINZEL_AUSGABE),
})

// ---- Aufbau -----------------------------------------------------------------------------------------------------

test('Aufbau: eindeutige Namen, alle Verbindungen zeigen auf vorhandene Knoten, nicht aktiv', () => {
  const namen = workflow.nodes.map((n) => n.name)
  assert.equal(new Set(namen).size, namen.length)
  assert.equal(new Set(workflow.nodes.map((n) => n.id)).size, namen.length)
  for (const [von, arten] of Object.entries(workflow.connections)) {
    assert.ok(namen.includes(von), `Quelle fehlt: ${von}`)
    for (const liste of Object.values(arten)) for (const ausgang of liste) for (const ziel of ausgang) assert.ok(namen.includes(ziel.node), `Ziel fehlt: ${ziel.node}`)
  }
  assert.equal(workflow.active, false, 'wird erst nach dem Einrichten aktiviert')
})

test('Aufbau: ein Webhook mit Header-Prüfung, Antwort über „Respond to Webhook“, keine Zugangsdaten im Export', () => {
  const trigger = workflow.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook')
  assert.deepEqual(trigger.map((n) => n.name), ['Webhook'], 'genau ein Webhook')
  const w = knoten('Webhook').parameters
  assert.deepEqual([w.httpMethod, w.authentication, w.responseMode, w.path], ['POST', 'headerAuth', 'responseNode', 'dawiid-ki'])
  assert.ok(workflow.nodes.every((n) => !('credentials' in n)), 'Zugangsdaten gehören nicht in den Export')
  assert.ok(!/sk-ant-/.test(JSON.stringify(workflow)))
  assert.equal(knoten('Antwort senden').parameters.responseBody, '={{ $json.body }}')
  assert.equal(knoten('Anfrage ungültig').parameters.options.responseCode, 400)
})

test('Aufbau: Stränge — der Schalter leitet jede Aufgabe an ihren Agenten, jeder Agent hat sein Claude-Modell', () => {
  const regeln = knoten('Aufgabe wählen').parameters.rules.values
  assert.deepEqual(regeln.map((r) => r.conditions.conditions[0].rightValue), [AUFGABE_EINZEL, AUFGABE_GESAMT, AUFGABE_AGENDA], 'Namen wie in der Edge Function')
  assert.ok(regeln.every((r) => r.conditions.conditions[0].leftValue === '={{ $json.aufgabe }}'))
  const ausgaenge = workflow.connections['Aufgabe wählen'].main
  assert.deepEqual(ausgaenge.map((a) => a.map((z) => z.node)), [['Agent Einzelanalyse'], ['Agent Gesamtauswertung'], ['Agent Agenda']])
  for (const [agent, modell] of [['Agent Einzelanalyse', 'Claude Einzelanalyse'], ['Agent Gesamtauswertung', 'Claude Gesamtauswertung'], ['Agent Agenda', 'Claude Agenda']]) {
    const a = knoten(agent)
    assert.equal(a.type, '@n8n/n8n-nodes-langchain.agent')
    assert.equal(a.parameters.text, '={{ $json.nachricht }}')
    assert.equal(a.parameters.options.systemMessage, '={{ $json.system }}', 'der Prompt kommt aus der Plattform')
    assert.equal(a.onError, 'continueRegularOutput', 'ein Fehler bei einem Auftrag stoppt die anderen nicht')
    const m = knoten(modell)
    assert.equal(m.type, '@n8n/n8n-nodes-langchain.lmChatAnthropic')
    assert.equal(m.parameters.model.value, 'claude-sonnet-5-5')
    assert.deepEqual(workflow.connections[modell].ai_languageModel[0].map((z) => z.node), [agent])
    assert.deepEqual(workflow.connections[agent].main[0].map((z) => z.node), ['Antwort lesen'])
  }
  const danach = (n) => workflow.connections[n].main[0].map((z) => z.node)
  assert.deepEqual([danach('Webhook'), danach('Anfrage prüfen'), danach('Antwort lesen'), danach('Zahlencheck (Orientierung)'), danach('Antwort bündeln')], [
    ['Anfrage prüfen'], ['Gültig?'], ['Zahlencheck (Orientierung)'], ['Antwort bündeln'], ['Antwort senden'],
  ])
  assert.deepEqual([workflow.connections['Gültig?'].main[0][0].node, workflow.connections['Gültig?'].main[1][0].node], ['Aufgabe wählen', 'Anfrage ungültig'])
})

test('Aufbau: angeheftete Beispielanfrage entspricht einzelanalyse-anna.json', () => {
  assert.deepEqual(workflow.pinData.Webhook[0].json.body, anfragen['einzelanalyse-anna'])
})

test('Testanfragen passen zur Edge Function (sonst: node n8n/testanfragen-erzeugen.mjs)', () => {
  assert.deepEqual(Object.keys(anfragen).sort(), ['agenda', 'einzelanalyse-anna', 'einzelanalyse-berta', 'einzelanalyse-ludwig', 'gesamtauswertung', 'sammellauf'])
  assert.equal(anfragen.sammellauf.auftraege.length, 3)
  assert.equal(anfragen.gesamtauswertung.auftraege.length, 1)
  for (const [name, a] of Object.entries(anfragen)) {
    const soll = { [AUFGABE_GESAMT]: [PROMPT_VERSION_GESAMT, SYSTEM_PROMPT_GESAMT], [AUFGABE_AGENDA]: [PROMPT_VERSION_AGENDA, SYSTEM_PROMPT_AGENDA], [AUFGABE_EINZEL]: [PROMPT_VERSION, SYSTEM_PROMPT] }[a.aufgabe]
    assert.ok(soll, `${name}: Aufgabe`)
    assert.equal(a.prompt_version, soll[0], `${name}: prompt_version`)
    assert.equal(new Set(a.auftraege.map((x) => x.ref)).size, a.auftraege.length, `${name}: eindeutige ref`)
    for (const x of a.auftraege) {
      assert.equal(x.system, soll[1], `${name}: system`)
      assert.equal(x.nachricht, baueNachricht(x.eingabe), `${name}: nachricht enthält die eingabe`)
      assert.ok(!/@/.test(JSON.stringify(x.eingabe)), `${name}: keine E-Mail-Adresse in den Daten`)
      assert.ok(!/Anna|Berta|Ludwig|Cora|Dietrich|Hollmann|Admin/.test(JSON.stringify(x.eingabe)), `${name}: keine Namen in den Daten`)
      assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(JSON.stringify(x)), `${name}: keine Kennungen`)
    }
  }
  assert.equal(anfragen.gesamtauswertung.auftraege[0].eingabe.bewertet, 'das Team')
  assert.equal(anfragen.agenda.auftraege[0].eingabe.team.bewertet, 'das Team')
  assert.equal(anfragen.agenda.auftraege[0].eingabe.zeitbudget.bloecke.length, 5)
})

// ---- Anfrage prüfen ---------------------------------------------------------------------------------------------

test('Anfrage prüfen: ein Item je Auftrag, mit Strang, Prompt und Einstellungen der Aufgabe', async () => {
  const items = await laufeAlle('Anfrage prüfen', [eingang(anfragen.sammellauf)])
  assert.equal(items.length, 3)
  assert.deepEqual(items.map((i) => i.ref), ['1', '2', '3'])
  assert.ok(items.every((i) => i.gueltig && i.aufgabe === AUFGABE_EINZEL && i.strang === 'Einzelanalyse' && i.system === SYSTEM_PROMPT && i.prompt_version === PROMPT_VERSION))
  assert.deepEqual(items[1].eingabe, anfragen.sammellauf.auftraege[1].eingabe)
  assert.equal(items[0].hinweisSchluessel, 'kommentar_qualitaet_hinweis')
  const gesamt = await laufeAlle('Anfrage prüfen', [eingang(anfragen.gesamtauswertung)])
  assert.deepEqual([gesamt.length, gesamt[0].strang, gesamt[0].hinweisSchluessel, gesamt[0].system === SYSTEM_PROMPT_GESAMT], [1, 'Gesamtauswertung', 'datenlage_hinweis', true])
  const agenda = await laufeAlle('Anfrage prüfen', [eingang(anfragen.agenda)])
  assert.deepEqual([agenda.length, agenda[0].strang, agenda[0].form, agenda[0].system === SYSTEM_PROMPT_AGENDA, agenda[0].prompt_version], [1, 'Agenda', 'agenda', true, PROMPT_VERSION_AGENDA])
  assert.deepEqual([agenda[0].bloecke.map((b) => b[0]), agenda[0].gesamt], [['einstieg', 'kennzahlen', 'fokus', 'entwicklung', 'vvereinbarungen'.slice(1)], [15, 20]])
})

test('Anfrage prüfen: auch der reine Inhalt einer Testanfrage (ohne „body“) wird angenommen', async () => {
  for (const name of Object.keys(anfragen)) {
    const direkt = await laufeAlle('Anfrage prüfen', [anfragen[name]])
    const verpackt = await laufeAlle('Anfrage prüfen', [eingang(anfragen[name])])
    assert.deepEqual(direkt, verpackt, name)
    assert.ok(direkt.every((i) => i.gueltig), name)
  }
})

test('Anfrage prüfen: der Zusatzkontext der Aufgabe wird dem Prompt angehängt', async () => {
  const mit = await laufeAlle('Anfrage prüfen', [eingang(anfragen['einzelanalyse-anna'])], {}, (c) => c.replace("zusatzkontext: ''", "zusatzkontext: 'Der Salon legt Wert auf Ruhe am Waschplatz.'"))
  assert.equal(mit[0].system, SYSTEM_PROMPT + '\n\nZusätzlicher Kontext:\nDer Salon legt Wert auf Ruhe am Waschplatz.')
  const ohne = await laufeAlle('Anfrage prüfen', [eingang(anfragen['einzelanalyse-anna'])])
  assert.equal(ohne[0].system, SYSTEM_PROMPT)
})

test('Anfrage prüfen: unvollständige Anfragen werden mit Grund abgelehnt', async () => {
  const fehler = async (body) => {
    const r = await laufeAlle('Anfrage prüfen', [eingang(body)])
    assert.equal(r.length, 1)
    assert.equal(r[0].gueltig, false)
    return r[0].fehler
  }
  const a = anfragen['einzelanalyse-anna']
  assert.match((await fehler({ ...a, aufgabe: 'etwas' }))[0], /aufgabe ist unbekannt \(erlaubt: einzelanalyse, gesamtauswertung, agenda\)/)
  assert.match((await fehler({ prompt_version: 'x' }))[0], /aufgabe ist unbekannt/)
  assert.deepEqual(await fehler({ ...a, auftraege: [] }), ['auftraege fehlt oder ist leer'])
  assert.deepEqual(await fehler({ ...a, auftraege: Array.from({ length: 11 }, (_, i) => ({ ...a.auftraege[0], ref: String(i) })) }), ['auftraege: höchstens 10'])
  assert.deepEqual(await fehler({ ...a, auftraege: [a.auftraege[0], a.auftraege[0]] }), ['auftraege[1]: ref ist doppelt'])
  assert.deepEqual(await fehler({ ...a, auftraege: [{ ref: '1' }] }), ['auftraege[0]: nachricht fehlt', 'auftraege[0]: system fehlt', 'auftraege[0]: eingabe fehlt'])
  assert.deepEqual(await fehler({ ...a, auftraege: [{ ...a.auftraege[0], nachricht: 'x'.repeat(60001) }] }), ['auftraege[0]: nachricht ist zu lang'])
  const leer = await laufeAlle('Anfrage prüfen', [{ headers: {}, params: {}, query: {} }])
  assert.equal(leer[0].gueltig, false)
})

// ---- Antwort lesen ----------------------------------------------------------------------------------------------

async function lesen(agentAusgabe, anfrageBody = anfragen['einzelanalyse-anna']) {
  const geprueft = await laufeAlle('Anfrage prüfen', [eingang(anfrageBody)])
  return (await laufeJe('Antwort lesen', [agentAusgabe], { 'Anfrage prüfen': geprueft }))[0]
}

test('Antwort lesen: reines JSON, mit Code-Zaun und mit Text davor und danach', async () => {
  const text = JSON.stringify(EINZEL_AUSGABE)
  for (const roh of [text, '```json\n' + text + '\n```', 'Hier ist die Analyse:\n' + text + '\nViel Erfolg!']) {
    const r = await lesen({ output: roh })
    assert.deepEqual([r.code, r.ref, r.aufgabe], [200, '1', AUFGABE_EINZEL])
    assert.deepEqual(r.ausgabe, EINZEL_AUSGABE)
    assert.deepEqual(r.meta, { strang: 'Einzelanalyse', prompt_version: PROMPT_VERSION, hinweise: [] })
  }
})

test('Antwort lesen: Hinweise je Aufgabe (Anzahl, Buchstaben-Bezeichnung, fehlender Schlüssel)', async () => {
  const zuViel = { ...EINZEL_AUSGABE, staerken: ['a', 'b', 'c', 'd', 'e'], gespraechsfragen: ['nur eine'], zusammenfassung: 'Kollege B sieht das auch.' }
  delete zuViel.kommentar_qualitaet_hinweis
  assert.deepEqual((await lesen({ output: JSON.stringify(zuViel) })).meta.hinweise, [
    'staerken: 5 Punkte (erwartet 2 bis 4)',
    'gespraechsfragen: 1 Punkte (erwartet 3 bis 4)',
    'kommentar_qualitaet_hinweis fehlt (wird als leer gewertet)',
    'Enthält eine Buchstaben-Bezeichnung wie „Kollege A“ (laut Prompt nicht erlaubt)',
  ])
  const gesamt = { ...GESAMT_AUSGABE }
  delete gesamt.datenlage_hinweis
  const g = await lesen({ output: JSON.stringify(gesamt) }, anfragen.gesamtauswertung)
  assert.deepEqual([g.aufgabe, g.meta.strang, g.meta.hinweise], [AUFGABE_GESAMT, 'Gesamtauswertung', ['datenlage_hinweis fehlt (wird als leer gewertet)']])
  const kollege = await lesen({ output: JSON.stringify({ ...GESAMT_AUSGABE, zusammenfassung: 'Kollege B' }) }, anfragen.gesamtauswertung)
  assert.deepEqual(kollege.meta.hinweise, [], 'für die Gesamtauswertung gilt die Regel zu Buchstaben nicht')
})

test('Antwort lesen: Agenda — Blöcke, Reihenfolge, Minuten und Summe werden zur Orientierung geprüft', async () => {
  const gut = await lesen({ output: JSON.stringify(AGENDA_AUSGABE) }, anfragen.agenda)
  assert.deepEqual([gut.aufgabe, gut.meta.strang, gut.meta.hinweise], [AUFGABE_AGENDA, 'Agenda', []])
  assert.deepEqual(gut.ausgabe, AGENDA_AUSGABE)
  const mit = (f) => lesen({ output: JSON.stringify({ bloecke: f(structuredClone(AGENDA_AUSGABE.bloecke)) }) }, anfragen.agenda).then((r) => r.meta.hinweise)
  assert.deepEqual(await mit((b) => b.map((x, i) => (i === 0 ? { ...x, minuten: 3 } : x))), ['einstieg: 3 Minuten (erlaubt 2 bis 2)'])
  assert.deepEqual(await mit((b) => b.map((x, i) => (i === 2 ? { ...x, minuten: 8 } : i === 3 ? { ...x, minuten: 3 } : x))), [], '2 + 3 + 8 + 3 + 2 = 18: in Ordnung')
  assert.deepEqual(await mit((b) => b.map((x, i) => (i === 1 ? { ...x, minuten: 2.5 } : x))), ['kennzahlen: minuten ist keine ganze Zahl'])
  assert.deepEqual(await mit((b) => b.map((x, i) => (i === 4 ? { ...x, minuten: 3 } : i === 3 ? { ...x, minuten: 4 } : i === 2 ? { ...x, minuten: 8 } : x))).then((h) => h.length), 0, '2 + 3 + 8 + 4 + 3 = 20: gerade noch in Ordnung')
  assert.deepEqual(await mit((b) => b.slice(0, 4)), ['bloecke: 5 Blöcke erwartet'])
  assert.deepEqual(await mit((b) => [b[1], b[0], ...b.slice(2)]), ['Block 1: id „einstieg“ erwartet', 'Block 2: id „kennzahlen“ erwartet'])
  assert.deepEqual(await mit((b) => b.map((x, i) => (i === 4 ? { ...x, punkte: [] } : x))), ['vereinbarungen: punkte fehlt oder ist leer'])
  assert.deepEqual(await mit((b) => b.map((x, i) => (i === 4 ? { ...x, punkte: ['a', 'b', 'c', 'd', 'e'] } : x))), ['vereinbarungen: 5 Punkte (erwartet 2 bis 4)'])
  const analyseFormat = await lesen({ output: JSON.stringify(EINZEL_AUSGABE) }, anfragen.agenda)
  assert.deepEqual(analyseFormat.meta.hinweise, ['bloecke: 5 Blöcke erwartet'], 'eine Analyse statt einer Agenda fällt auf')
})

test('Antwort lesen: kein JSON → Text geht weiter, die Plattform fragt selbst erneut', async () => {
  const r = await lesen({ output: 'Das kann ich leider nicht.' })
  assert.equal(r.code, 200)
  assert.equal(r.ausgabe, 'Das kann ich leider nicht.')
  assert.match(r.meta.hinweise[0], /kein gültiges JSON/)
})

test('Antwort lesen: Fehler des Agenten', async () => {
  const ausgelastet = await lesen({ error: 'Request failed with status code 429: rate_limit_error' })
  assert.deepEqual([ausgelastet.code, ausgelastet.fehler], [429, 'Die KI ist gerade ausgelastet.'])
  const ueberlastet = await lesen({ error: { message: 'Overloaded' } })
  assert.equal(ueberlastet.code, 429)
  const netz = await lesen({ error: 'timeout of 120000ms exceeded' })
  assert.deepEqual([netz.code, netz.detail], [502, 'timeout of 120000ms exceeded'])
  assert.equal((await lesen({})).code, 502)
  assert.equal((await lesen({ output: '   ' })).code, 502)
  assert.equal((await lesen({ error: 'x' })).ref, '1', 'auch ein Fehler gehört zu seinem Auftrag')
})

// ---- Zahlencheck ------------------------------------------------------------------------------------------------

async function zahlen(ausgabe, body = anfragen['einzelanalyse-anna']) {
  const geprueft = await laufeAlle('Anfrage prüfen', [eingang(body)])
  const [gelesen] = await laufeJe('Antwort lesen', [{ output: typeof ausgabe === 'string' ? ausgabe : JSON.stringify(ausgabe) }], { 'Anfrage prüfen': geprueft })
  return (await laufeJe('Zahlencheck (Orientierung)', [gelesen], { 'Anfrage prüfen': geprueft }))[0]
}

test('Zahlencheck: Zahlen aus den Daten bestehen (3,5 = 3.5, 1 bis 5 immer, Listennummern zählen nicht)', async () => {
  const mitListe = { ...EINZEL_AUSGABE, gespraechsfragen: ['1. Was läuft gut?', '2) Wo siehst du die Differenz?', '3. Was brauchst du?'] }
  const r = await zahlen(mitListe)
  assert.deepEqual(r.meta.zahlen_nicht_in_daten, [])
  assert.equal(r.meta.faktencheck_orientierung, 'bestanden')
  const g = await zahlen(GESAMT_AUSGABE, anfragen.gesamtauswertung)
  assert.deepEqual(g.meta.zahlen_nicht_in_daten, [], 'Gesamtauswertung: Zahlen aus den Teamdaten')
})

test('Zahlencheck: erfundene Zahlen werden genannt, Vorzeichen zählt nicht, 3,50 = 3,5', async () => {
  // Gegenprobe gegen die Datenbank (analyse_pruefen, lokal, gleiche Daten): „2,9, 4,71 und 12 stehen nicht in den Daten“
  const erfunden = {
    ...EINZEL_AUSGABE,
    zusammenfassung: 'Das Fremdbild liegt bei 4,71, eine Steigerung von 2,9. Ein Minus von 1,5 zum Vormonat.',
    staerken: ['Stark, 3,50 im ersten Verhalten.', 'Zweiter Punkt'],
    kommentar_qualitaet_hinweis: 'Die 12 Kommentare sind kurz.',
  }
  const r = await zahlen(erfunden)
  assert.deepEqual([...r.meta.zahlen_nicht_in_daten].sort(), ['12', '2,9', '4,71'])
  assert.equal(r.meta.faktencheck_orientierung, 'Abweichung')
  const g = await zahlen({ ...GESAMT_AUSGABE, zusammenfassung: 'Das Team liegt bei 4,71.' }, anfragen.gesamtauswertung)
  assert.deepEqual(g.meta.zahlen_nicht_in_daten, ['4,71'])
})

test('Zahlencheck: Agenda — Zahlen aus den Teamdaten und dem Zeitbudget bestehen, erfundene werden genannt, Minuten-Felder zählen nicht', async () => {
  const gut = await zahlen(AGENDA_AUSGABE, anfragen.agenda)
  assert.deepEqual(gut.meta.zahlen_nicht_in_daten, [])
  assert.equal(gut.meta.faktencheck_orientierung, 'bestanden')
  const erfunden = { bloecke: AGENDA_AUSGABE.bloecke.map((b, i) => (i === 1 ? { ...b, punkte: ['Das Fremdbild liegt bei 4,71.', 'Es waren 12 Personen da.'] } : b)) }
  const r = await zahlen(erfunden, anfragen.agenda)
  assert.deepEqual([...r.meta.zahlen_nicht_in_daten].sort(), ['12', '4,71'])
  const minuten = { bloecke: AGENDA_AUSGABE.bloecke.map((b, i) => (i === 2 ? { ...b, minuten: 9, punkte: ['Dafür sind 6 bis 8 Minuten vorgesehen.'] } : b)) }
  assert.deepEqual((await zahlen(minuten, anfragen.agenda)).meta.zahlen_nicht_in_daten, [], 'das Feld minuten ist keine Zahl im Text; „6 bis 8“ steht im Zeitbudget')
})

test('Zahlencheck: Fehler und Text-Antworten gehen unverändert durch', async () => {
  assert.equal((await zahlen('Das kann ich leider nicht.')).meta.faktencheck_orientierung, undefined)
  const geprueft = await laufeAlle('Anfrage prüfen', [eingang(anfragen['einzelanalyse-anna'])])
  const [fehler] = await laufeJe('Zahlencheck (Orientierung)', [{ ref: '1', aufgabe: AUFGABE_EINZEL, code: 502, fehler: 'x' }], { 'Anfrage prüfen': geprueft })
  assert.deepEqual(fehler, { ref: '1', aufgabe: AUFGABE_EINZEL, code: 502, fehler: 'x' })
})

// ---- Ganzer Durchlauf --------------------------------------------------------------------------------------------

test('Durchlauf: Einzelanalyse läuft durch den Strang Einzelanalyse', async () => {
  const gesehen = []
  const r = await simuliere(anfragen['einzelanalyse-anna'], (k, agent) => { gesehen.push([agent, k.system, k.nachricht]); return guterAgent(k) })
  assert.equal(r.status, 200)
  assert.deepEqual(gesehen, [['Agent Einzelanalyse', SYSTEM_PROMPT, anfragen['einzelanalyse-anna'].auftraege[0].nachricht]])
  assert.deepEqual(r.body.aufgabe, AUFGABE_EINZEL)
  assert.equal(r.body.ergebnisse.length, 1)
  assert.deepEqual(r.body.ergebnisse[0].ausgabe, EINZEL_AUSGABE)
})

test('Durchlauf: Sammellauf — jeder Auftrag wird für sich bearbeitet, die Antwort ordnet sie über ref zu', async () => {
  const agenten = []
  const r = await simuliere(anfragen.sammellauf, (k, agent) => {
    agenten.push(`${k.ref}:${agent}`)
    return { output: JSON.stringify({ ...EINZEL_AUSGABE, zusammenfassung: `Antwort für Auftrag ${k.ref}` }) }
  })
  assert.equal(r.status, 200)
  assert.deepEqual(agenten, ['1:Agent Einzelanalyse', '2:Agent Einzelanalyse', '3:Agent Einzelanalyse'])
  assert.deepEqual(r.body.ergebnisse.map((e) => [e.ref, e.code, e.ausgabe.zusammenfassung]), [
    ['1', 200, 'Antwort für Auftrag 1'], ['2', 200, 'Antwort für Auftrag 2'], ['3', 200, 'Antwort für Auftrag 3'],
  ])
})

test('Durchlauf: Gesamtauswertung läuft durch den Strang Gesamtauswertung', async () => {
  const gesehen = []
  const r = await simuliere(anfragen.gesamtauswertung, (k, agent) => { gesehen.push([agent, k.system === SYSTEM_PROMPT_GESAMT]); return guterAgent(k) })
  assert.deepEqual(gesehen, [['Agent Gesamtauswertung', true]])
  assert.equal(r.status, 200)
  assert.equal(r.body.aufgabe, AUFGABE_GESAMT)
  assert.deepEqual(r.body.ergebnisse[0].ausgabe, GESAMT_AUSGABE)
  assert.deepEqual(r.body.ergebnisse[0].meta.zahlen_nicht_in_daten, [])
})

test('Durchlauf: Agenda läuft durch den Strang Agenda', async () => {
  const gesehen = []
  const r = await simuliere(anfragen.agenda, (k, agent) => { gesehen.push([agent, k.system === SYSTEM_PROMPT_AGENDA]); return guterAgent(k) })
  assert.deepEqual(gesehen, [['Agent Agenda', true]])
  assert.equal(r.status, 200)
  assert.equal(r.body.aufgabe, AUFGABE_AGENDA)
  assert.deepEqual(r.body.ergebnisse[0].ausgabe, AGENDA_AUSGABE)
  assert.deepEqual([r.body.ergebnisse[0].meta.hinweise, r.body.ergebnisse[0].meta.zahlen_nicht_in_daten], [[], []])
  assert.equal(parseAgendaAusgabe(r.body.ergebnisse[0].ausgabe).bloecke.length, 5, 'die Edge Function liest sie')
})

test('Durchlauf: scheitert ein Auftrag, kommen die anderen trotzdem zurück (Status 200); scheitern alle, steht es im Status', async () => {
  const teils = await simuliere(anfragen.sammellauf, (k) => (k.ref === '2' ? { error: 'timeout of 120000ms exceeded' } : guterAgent(k)))
  assert.equal(teils.status, 200)
  assert.deepEqual(teils.body.ergebnisse.map((e) => [e.ref, e.code]), [['1', 200], ['2', 502], ['3', 200]])
  assert.equal(teils.body.ergebnisse[1].detail, 'timeout of 120000ms exceeded')
  assert.ok(!('ausgabe' in teils.body.ergebnisse[1]))
  const alle = await simuliere(anfragen.sammellauf, () => ({ error: 'Request failed with status code 429' }))
  assert.equal(alle.status, 429)
  const netz = await simuliere(anfragen.sammellauf, () => ({ error: 'ECONNRESET' }))
  assert.equal(netz.status, 502)
})

test('Durchlauf: ungültige Anfrage → 400 mit Gründen, der Agent wird nicht gefragt', async () => {
  let gefragt = false
  const r = await simuliere({ aufgabe: 'unbekannt', auftraege: [] }, () => { gefragt = true; return {} })
  assert.equal(r.status, 400)
  assert.equal(r.body.fehler, 'Die Anfrage ist unvollständig.')
  assert.equal(r.body.details.length, 2)
  assert.equal(gefragt, false)
})

// ---- Zusammenspiel mit der Edge Function ------------------------------------------------------------------------

const WEBHOOK = { name: 'webhook', modell: null, url: 'https://n8n.example/webhook/dawiid-ki', geheimnis: 'geheim' }

/** Der Workflow als Webhook: nimmt die Anfrage der Edge Function an und antwortet wie n8n. */
function webhookFetch(agentFn, protokoll = []) {
  return async (url, init) => {
    assert.equal(url, WEBHOOK.url)
    const body = JSON.parse(String(init.body))
    protokoll.push(body)
    const r = await simuliere(body, agentFn)
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
  }
}

test('Edge Function ↔ Workflow: die Anfrage der Edge Function ist gültig, die Antwort wird je Auftrag gelesen', async () => {
  const protokoll = []
  const auftraege = anfragen.sammellauf.auftraege.map(({ ref, system, nachricht, eingabe }) => ({ ref, system, nachricht, eingabe }))
  const r = await rufeAnbieterBatch(
    WEBHOOK, AUFGABE_EINZEL, PROMPT_VERSION, auftraege,
    webhookFetch((k) => (k.ref === '3' ? { error: 'ECONNRESET' } : guterAgent(k)), protokoll),
  )
  assert.equal(protokoll.length, 1, 'ein Aufruf für alle Aufträge')
  assert.deepEqual(Object.keys(protokoll[0]).sort(), ['aufgabe', 'auftraege', 'prompt_version'])
  assert.deepEqual(parseAusgabe(r['1'].roh).staerken, EINZEL_AUSGABE.staerken)
  assert.ok('roh' in r['2'])
  assert.ok('fehler' in r['3'] && r['3'].fehler.status === 502)
})

test('Edge Function ↔ Workflow: die Agenda wird über den Strang formuliert und mit Aufbau und Zahlen geprüft gespeichert', async () => {
  const gespeichert = []
  const pruefungen = []
  const rpc = async (name, a) => {
    const antworten = {
      agenda_ki_eingabe: { eingabe: anfragen.agenda.auftraege[0].eingabe, hash: 'a' },
      agenda_lesen: null,
      agenda_ki_pruefen: { geprueft: true, abweichungen: [], struktur_fehler: null },
      agenda_ki_speichern: { status: 'entwurf', geprueft: true },
    }
    if (name === 'agenda_ki_speichern') gespeichert.push(a)
    if (name === 'agenda_ki_pruefen') pruefungen.push(a)
    return { data: antworten[name], error: null }
  }
  const protokoll = []
  const fetchFn = webhookFetch(guterAgent, protokoll)
  const d = { rpc, anbieter: () => WEBHOOK, ki: async () => { throw new Error('nicht benutzt') }, kiBatch: (c, a, v, auftraege, o) => rufeAnbieterBatch(c, a, v, auftraege, fetchFn, o) }
  const r = await erstelleAgenda(d, { monat: '2026-09', neu: false })
  assert.deepEqual([r.uebersprungen, r.versuche], [false, 1])
  assert.equal(protokoll.length, 1)
  assert.deepEqual([protokoll[0].aufgabe, protokoll[0].prompt_version, protokoll[0].auftraege[0].system === SYSTEM_PROMPT_AGENDA], [AUFGABE_AGENDA, PROMPT_VERSION_AGENDA, true])
  assert.deepEqual(pruefungen[0].p_bloecke, AGENDA_AUSGABE.bloecke)
  assert.deepEqual(gespeichert[0].p_bloecke, AGENDA_AUSGABE.bloecke)
  assert.deepEqual([gespeichert[0].p_prompt_version, gespeichert[0].p_anbieter], [PROMPT_VERSION_AGENDA, 'webhook'])
})

test('Edge Function ↔ Workflow: Sammellauf und Gesamtauswertung speichern über die Datenbank-Funktionen', async () => {
  const gespeichert = []
  const personen = ['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003']
  const rpc = async (name, a) => {
    const antworten = {
      abschluss_uebersicht: { ki: true, abschluss: { monat: '2026-09' }, personen: personen.map((id, i) => ({ id, name: `Person ${i + 1}`, analyse: null })) },
      analyse_eingabe: { eingabe: anfragen.sammellauf.auftraege[personen.indexOf(a.p_person)]?.eingabe, hash: 'h' },
      analyse_pruefen: { geprueft: true, abweichungen: [] },
      analyse_speichern: { status: 'entwurf', geprueft: true },
      gesamt_eingabe: { eingabe: anfragen.gesamtauswertung.auftraege[0].eingabe, hash: 'g' },
      gesamt_lesen: null,
      gesamt_pruefen: { geprueft: true, abweichungen: [] },
      gesamt_speichern: { status: 'entwurf', geprueft: true },
    }
    if (name.endsWith('speichern')) gespeichert.push([name, a])
    return { data: antworten[name], error: null }
  }
  const protokoll = []
  const fetchFn = webhookFetch(guterAgent, protokoll)
  const d = {
    rpc,
    anbieter: () => WEBHOOK,
    ki: async () => { throw new Error('nicht benutzt') },
    kiBatch: (c, a, v, auftraege, o) => rufeAnbieterBatch(c, a, v, auftraege, fetchFn, o),
  }

  // Der Sammellauf bearbeitet je Aufruf ein Paket von zwei Personen; die Oberfläche ruft erneut auf
  const erster = await erstelleAlle(d, { monat: '2026-09', ausgenommen: [] })
  assert.deepEqual(erster.erstellt.map((e) => e.person_id), personen.slice(0, 2))
  assert.deepEqual([erster.fehlgeschlagen.length, erster.verbleibend], [0, 1])
  assert.equal(protokoll.length, 1, 'ein Aufruf für das ganze Paket')
  assert.deepEqual(protokoll[0].auftraege.map((a) => a.ref), ['1', '2'])
  const zweiter = await erstelleAlle(d, { monat: '2026-09', ausgenommen: personen.slice(0, 2) })
  assert.deepEqual(zweiter.erstellt.map((e) => e.person_id), personen.slice(2))
  assert.deepEqual([zweiter.fehlgeschlagen.length, zweiter.verbleibend], [0, 0])
  assert.equal(protokoll.length, 2)
  assert.deepEqual(gespeichert.map(([n, a]) => [n, a.p_person]), personen.map((p) => ['analyse_speichern', p]))
  assert.ok(gespeichert.every(([, a]) => a.p_prompt_version === PROMPT_VERSION && a.p_anbieter === 'webhook'))

  gespeichert.length = 0
  const gesamt = await erstelleGesamt(d, { monat: '2026-09', neu: false })
  assert.deepEqual([gesamt.uebersprungen, gesamt.versuche], [false, 1])
  assert.equal(protokoll[2].aufgabe, AUFGABE_GESAMT)
  assert.equal(gespeichert[0][0], 'gesamt_speichern')
  assert.equal(gespeichert[0][1].p_prompt_version, PROMPT_VERSION_GESAMT)
  assert.equal(gespeichert[0][1].p_ausgabe.zusammenfassung, GESAMT_AUSGABE.zusammenfassung)
  assert.equal(parseGesamtAusgabe(gespeichert[0][1].p_ausgabe).datenlage_hinweis, null)
})
