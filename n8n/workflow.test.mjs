// Prüft die zum Import bereitliegende JSON. Ausführen: node --test n8n/*.test.mjs
// Die JSON wird aus dem Code-Node gebaut (node n8n/workflow-bauen.mjs); dieser Test stellt sicher,
// dass sie dazu passt und in sich stimmig ist. Das Verhalten im Betrieb prüfen die Tests in
// anfrage-entscheiden.test.mjs und der Lauf in einem echten n8n (siehe n8n/README.md).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { CHAT_ID_PLATZHALTER, schreibeWorkflow, WEBHOOK_PFAD } from './workflow-bauen.mjs'

const datei = readFileSync(new URL('./anfragen-workflow.json', import.meta.url), 'utf8')
const workflow = JSON.parse(datei)
const knoten = (name) => workflow.nodes.find((n) => n.name === name)

describe('Workflow-JSON', () => {
  it('ist aktuell: entspricht dem, was workflow-bauen.mjs aus dem Code-Node erzeugt', () => {
    assert.equal(datei, schreibeWorkflow(), 'Bitte `node n8n/workflow-bauen.mjs` ausführen und die JSON einchecken')
  })

  it('der Code-Node in der JSON ist exakt anfrage-entscheiden.cjs', () => {
    const quelle = readFileSync(new URL('./anfrage-entscheiden.cjs', import.meta.url), 'utf8')
    assert.equal(knoten('Entscheiden').parameters.jsCode, quelle)
  })

  it('Knotennamen sind eindeutig', () => {
    const namen = workflow.nodes.map((n) => n.name)
    assert.equal(new Set(namen).size, namen.length)
  })

  it('alle Verbindungen verweisen auf vorhandene Knoten', () => {
    const namen = new Set(workflow.nodes.map((n) => n.name))
    for (const [von, ausgaenge] of Object.entries(workflow.connections)) {
      assert.ok(namen.has(von), `Quelle ${von} fehlt`)
      for (const ziele of ausgaenge.main) for (const ziel of ziele) assert.ok(namen.has(ziel.node), `Ziel ${ziel.node} fehlt`)
    }
  })

  it('jeder Knoten außer der Anleitung ist erreichbar und der Webhook ist der Einstieg', () => {
    const erreicht = new Set(['Webhook'])
    for (let i = 0; i < workflow.nodes.length; i++) {
      for (const [von, ausgaenge] of Object.entries(workflow.connections)) {
        if (erreicht.has(von)) for (const ziele of ausgaenge.main) for (const z of ziele) erreicht.add(z.node)
      }
    }
    const nichtErreicht = workflow.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote' && !erreicht.has(n.name))
    assert.deepEqual(nichtErreicht.map((n) => n.name), [])
  })

  it('der Code-Node findet alle Knoten, die er per Namen liest', () => {
    const code = knoten('Entscheiden').parameters.jsCode
    const gelesen = [...code.matchAll(/(?:\$\(|lies\()'([^']+)'\)/g)].map((m) => m[1])
    assert.ok(gelesen.length >= 5, 'Namen gefunden: ' + gelesen.join(', '))
    for (const name of gelesen) assert.ok(knoten(name), `Knoten „${name}“ fehlt, wird aber im Code gelesen`)
    for (const n of workflow.nodes) {
      const ausdruecke = JSON.stringify(n.parameters).matchAll(/\$\(\\?'([^'\\]+)\\?'\)/g)
      for (const [, name] of ausdruecke) assert.ok(knoten(name), `${n.name}: Knoten „${name}“ fehlt`)
    }
  })

  it('Ausdrücke beginnen mit „=“ (sonst schickt n8n {{ … }} wörtlich weiter)', () => {
    const pruefe = (wert, ort) => {
      if (typeof wert === 'string' && wert.includes('{{')) assert.ok(wert.startsWith('='), `${ort}: Ausdruck ohne „=“: ${wert.slice(0, 60)}`)
      else if (wert && typeof wert === 'object') for (const [k, v] of Object.entries(wert)) pruefe(v, `${ort}.${k}`)
    }
    for (const n of workflow.nodes) if (n.type !== 'n8n-nodes-base.stickyNote') pruefe(n.parameters, n.name)
  })

  it('Webhook: POST, richtiger Pfad, Antwort über den Respond-Node', () => {
    const w = knoten('Webhook').parameters
    assert.equal(w.httpMethod, 'POST')
    assert.equal(w.path, WEBHOOK_PFAD)
    assert.equal(w.responseMode, 'responseNode')
  })

  it('Telegram steht oben vor dem Speichern (Execution Order v1 arbeitet von oben nach unten)', () => {
    assert.equal(workflow.settings.executionOrder, 'v1')
    assert.ok(knoten('Telegram senden').position[1] < knoten('Anfrage speichern').position[1])
    const ja = workflow.connections['Senden?'].main[0].map((z) => z.node)
    assert.deepEqual(ja, ['Telegram senden', 'Anfrage speichern'])
  })

  it('Abfragen laufen bei Fehlern weiter, liefern auch leer ein Item und laufen nur einmal', () => {
    for (const name of ['Plaetze laden', 'Artikel laden', 'Letzte Anfrage am Platz', 'Doppelte Anfrage pruefen']) {
      const k = knoten(name)
      assert.equal(k.onError, 'continueRegularOutput', name)
      assert.equal(k.alwaysOutputData, true, name)
      assert.equal(k.executeOnce, true, name)
    }
  })

  it('Telegram scheitert NICHT still (Gast soll dann eine Fehlermeldung sehen)', () => {
    assert.equal(knoten('Telegram senden').onError, undefined)
  })

  it('enthält keine Zugangsdaten: keine Credentials, kein Token, keine Chat-ID, kein JWT', () => {
    assert.ok(workflow.nodes.every((n) => n.credentials === undefined))
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\./.test(datei), 'JWT gefunden')
    assert.ok(!/sb_secret_|service_role/.test(datei.replace(/Service-Key|Service Role/g, '')), 'Schlüssel gefunden')
    assert.equal(knoten('Telegram senden').parameters.chatId, CHAT_ID_PLATZHALTER)
  })
})
